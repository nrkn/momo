// Momo emitter: typed AST -> commented NASM source for a .COM.
//
// Accumulator codegen, per DESIGN.md: AX is the accumulator, BX is the second
// operand / index, DX is scratch (clobbered by mul/div, never live), CL carries
// shift counts. SI, DI and BP are never touched.
//
// Every expression leaves its result in AX, promoted to 16 bits. Narrowing
// happens only on store.
//
// Two things here are not optimisations but requirements of the 8086:
//
//   - Conditions compile in CONTROL-FLOW context (emitJumpIfFalse / IfTrue)
//     rather than by materialising a bool, because there is no `setcc` until
//     the 386. Value context exists as a fallback and costs a branch.
//   - Every conditional jump is emitted inverted, over an unconditional `jmp`,
//     because 8086 `jcc` is +/-127 only with no near form. See `jumpIf`.

import type {
  Expression,
  IndexExpression,
  LValue,
  Statement,
} from './ast.js'
import { entryName, interruptReserve, stackBytes } from './analysis.js'
import type { MomoSymbol, ResolveResult } from './resolver.js'
import { isSigned, widthOf, type ValueType } from './types.js'

type Loop = { breakLabel: string; continueLabel: string }

const signedJumps: Record<string, string> = {
  '<': 'jl', '<=': 'jle', '>': 'jg', '>=': 'jge', '==': 'je', '!=': 'jne',
}

const unsignedJumps: Record<string, string> = {
  '<': 'jb', '<=': 'jbe', '>': 'ja', '>=': 'jae', '==': 'je', '!=': 'jne',
}

const invertedJump: Record<string, string> = {
  jl: 'jge', jge: 'jl', jg: 'jle', jle: 'jg',
  jb: 'jae', jae: 'jb', ja: 'jbe', jbe: 'ja',
  je: 'jne', jne: 'je', jz: 'jnz', jnz: 'jz',
}

const arithmeticOps: Record<string, string> = {
  '+': 'add', '-': 'sub', '&': 'and', '|': 'or', '^': 'xor',
}

const constOf = (node: Expression): number | null =>
  node.constValue === undefined || node.constValue === null ? null : node.constValue

const typeOf = (node: Expression): ValueType => node.resolvedType ?? 'u16'

export type EmitResult = {
  assembly: string
  // Sub name -> most expression temporaries live at once, counted from the
  // pushes actually emitted rather than from a model of them.
  temporaries: Map<string, number>
}

export const emit = (result: ResolveResult, sources: Map<string, string>): EmitResult => {
  const lines: string[] = []

  const byLabel = new Map<string, MomoSymbol>()
  for (const symbol of result.symbols) byLabel.set(symbol.label, symbol)

  const interrupts = new Set<number>()
  const loops: Loop[] = []
  let labelSeq = 0
  let pushDepth = 0
  let maxPushDepth = 0
  const temporaries = new Map<string, number>()
  // The init and update clauses of a `for` live on the header line, which the
  // loop has already quoted - re-quoting it for each clause just adds noise.
  let quoting = true
  // Last `file:line` written as a source comment, to suppress an immediate
  // repeat. See quoteSource.
  let lastQuoted: string | null = null
  let currentRet: { label: string; type: ValueType } | null = null

  // ---- output helpers -------------------------------------------------------

  const blank = () => lines.push('')
  const note = (text: string) => lines.push(`; ${text}`)
  const label = (name: string) => lines.push(`${name}:`)

  const ins = (mnemonic: string, operands = '', comment = '') => {
    if (mnemonic === 'push') {
      pushDepth += 1
      if (pushDepth > maxPushDepth) maxPushDepth = pushDepth
    }
    if (mnemonic === 'pop') pushDepth -= 1

    const body = operands ? `        ${mnemonic.padEnd(7)} ${operands}` : `        ${mnemonic}`
    lines.push(comment ? `${body.padEnd(44)}; ${comment}` : body)
  }

  const nextLabel = (): string => {
    labelSeq += 1
    return `.L${labelSeq}`
  }

  // Quote the original source, so the assembly reads like the program.
  // Quoted from the statement's OWN file - included code must not be quoted
  // against the entry file's lines.
  //
  // A statement sharing a line with the header that encloses it - `if (x) y()`,
  // `while (x) y()` - would otherwise quote that line twice, once for the
  // header and once for the statement. Suppressing an immediate repeat is
  // enough: emission is linear, so the only way to see the same line twice in a
  // row is that nesting. `lastQuoted` resets per routine so the suppression can
  // never reach across one.
  const quoteSource = (file: string, from: number, to: number) => {
    if (!quoting) return
    const sourceLines = (sources.get(file) ?? '').split('\n')
    for (let n = from; n <= to && n <= sourceLines.length; n++) {
      const text = (sourceLines[n - 1] ?? '').replace(/\r$/, '').trim()
      if (!text) continue
      const at = `${file}:${n}`
      if (at === lastQuoted) continue
      lastQuoted = at
      note(`---- ${text}`)
    }
  }

  // Declarations know their Momo name; the symbol table is keyed by label.
  const byName = new Map<string, string>()
  for (const symbol of result.symbols) byName.set(symbol.name, symbol.label)
  const safeName = (name: string): string => byName.get(name) ?? name

  const symbolFor = (name: string | undefined): MomoSymbol => {
    const symbol = name === undefined ? undefined : byLabel.get(name)
    if (!symbol) throw new Error(`internal: unresolved symbol "${name}"`)
    return symbol
  }

  // Every jcc is emitted inverted over a near jmp: 8086 conditional jumps reach
  // only +/-127 bytes and there is no near form until the 386.
  const jumpIf = (condition: string, target: string, comment = '') => {
    const over = nextLabel()
    ins(invertedJump[condition] ?? condition, over, comment)
    ins('jmp', target)
    label(over)
  }

  // ---- loading values -------------------------------------------------------

  const widen = (type: ValueType) => {
    if (type === 'i8') ins('cbw', '', 'i8 -> i16')
    else ins('xor', 'ah, ah', `${type} -> u16`)
  }

  const loadVariable = (symbol: MomoSymbol) => {
    if (symbol.kind !== 'var' && symbol.kind !== 'const') return
    if (symbol.kind === 'const') {
      ins('mov', `ax, ${symbol.value}`)
      return
    }
    if (widthOf(symbol.type) === 2) {
      ins('mov', `ax, [${symbol.label}]`)
      return
    }
    ins('mov', `al, [${symbol.label}]`)
    widen(symbol.type)
  }

  const emitIndexLoad = (node: IndexExpression) => {
    const symbol = symbolFor(node.array.label)
    if (symbol.kind !== 'array') return

    const width = widthOf(symbol.elementType)
    const fixed = constOf(node.index)

    if (fixed !== null) {
      const offset = fixed * width
      const at = offset === 0 ? symbol.label : `${symbol.label} + ${offset}`
      if (width === 2) ins('mov', `ax, [${at}]`)
      else {
        ins('mov', `al, [${at}]`)
        widen(symbol.elementType)
      }
      return
    }

    emitExpression(node.index)
    if (width === 2) ins('shl', 'ax, 1', 'word elements')
    ins('mov', 'bx, ax')
    if (width === 2) ins('mov', `ax, [${symbol.label} + bx]`)
    else {
      ins('mov', `al, [${symbol.label} + bx]`)
      widen(symbol.elementType)
    }
  }

  // A leaf is something we can load straight into BX without touching AX.
  //
  // i8 is deliberately excluded: sign-extending a byte into BX has no one-
  // instruction form on the 8086 (`cbw` only does AL -> AX), and faking it would
  // clobber AX, which is holding the left operand. i8 operands take the
  // push/pop path instead, where `cbw` works on AL as intended.
  const isLeaf = (node: Expression): boolean => {
    if (constOf(node) !== null) return true
    if (node.type !== 'Identifier') return false
    const symbol = symbolFor(node.label)
    return symbol.kind === 'var' && symbol.type !== 'i8'
  }

  const loadIntoBx = (node: Expression) => {
    const fixed = constOf(node)
    if (fixed !== null) {
      ins('mov', `bx, ${fixed}`)
      return
    }

    const symbol = symbolFor((node as { label?: string }).label)
    if (symbol.kind !== 'var') return

    if (widthOf(symbol.type) === 2) {
      ins('mov', `bx, [${symbol.label}]`)
      return
    }
    ins('mov', `bl, [${symbol.label}]`)
    ins('xor', 'bh, bh', `${symbol.type} -> u16`)
  }

  // Leaves the left operand in AX and returns the operand string to use for the
  // right - an immediate where possible, otherwise BX.
  const emitOperands = (left: Expression, right: Expression, needRegister: boolean): string => {
    const fixed = constOf(right)

    if (fixed !== null && !needRegister) {
      emitExpression(left)
      return `${fixed}`
    }

    if (isLeaf(right)) {
      emitExpression(left)
      loadIntoBx(right)
      return 'bx'
    }

    emitExpression(left)
    ins('push', 'ax', 'save lhs: rhs is not a leaf')
    emitExpression(right)
    ins('mov', 'bx, ax')
    ins('pop', 'ax')
    return 'bx'
  }

  // Arguments are stored into the fn's parameter globals, then it is called.
  //
  // When there are SEVERAL arguments and any of them contains a call, every
  // argument is evaluated onto the stack first and stored afterwards. Otherwise
  // `outer(f(), g())` where `g` also calls `outer` would have `g` overwrite a
  // slot already filled for the outer call.
  //
  // One argument needs none of that: no slot has been filled yet when it is
  // evaluated, so there is nothing for an inner call to clobber. Parameter
  // globals are mangled and never in scope, so an argument cannot name one
  // either. Skipping the round trip saves a push/pop at every such call site.
  const emitCall = (label: string | undefined, args: Expression[]) => {
    const symbol = symbolFor(label)

    if (symbol.kind !== 'routine') {
      ins('call', symbol.label)
      return
    }

    const viaStack = args.length > 1 && args.some(containsCall)

    if (viaStack) {
      for (const argument of args) {
        emitExpression(argument)
        ins('push', 'ax', 'argument evaluated before any is stored')
      }
      for (let i = args.length - 1; i >= 0; i--) {
        ins('pop', 'ax')
        storeToLabel(symbol.params[i].label, symbol.params[i].type)
      }
    } else {
      for (let i = 0; i < args.length; i++) {
        emitExpression(args[i])
        storeToLabel(symbol.params[i].label, symbol.params[i].type)
      }
    }

    ins('call', symbol.label)
  }

  const containsCall = (node: Expression): boolean => {
    if (node.type === 'CallExpression' && !node.expansion) return true

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && containsCall(item as Expression)) return true
        }
        continue
      }
      if (value && typeof value === 'object' && 'type' in value) {
        if (containsCall(value as Expression)) return true
      }
    }
    return false
  }

  const storeToLabel = (label: string, type: ValueType) => {
    if (widthOf(type) === 2) ins('mov', `[${label}], ax`)
    else ins('mov', `[${label}], al`, `narrowed to ${type}`)
  }

  // ---- expressions ----------------------------------------------------------

  const emitBoolFromJump = (emitTest: (falseLabel: string) => void) => {
    const falseLabel = nextLabel()
    const endLabel = nextLabel()

    emitTest(falseLabel)
    ins('mov', 'ax, 1')
    ins('jmp', endLabel)
    label(falseLabel)
    ins('xor', 'ax, ax')
    label(endLabel)
  }

  const emitShift = (node: Expression) => {
    if (node.type !== 'BinaryExpression') return

    const signed = isSigned(typeOf(node))
    const mnemonic = node.operator === '<<' ? 'shl' : signed ? 'sar' : 'shr'
    const why = node.operator === '>>' ? (signed ? 'signed >>' : 'unsigned >>') : ''

    const count = constOf(node.right)
    emitExpression(node.left)

    if (count !== null && count <= 2) {
      // Two `shl ax,1` is the same size as loading CL, and leaves CX alone.
      for (let i = 0; i < count; i++) ins(mnemonic, 'ax, 1', i === 0 ? why : '')
      return
    }

    if (count !== null) {
      ins('mov', `cl, ${count}`, '8086 has no shift-by-immediate')
      ins(mnemonic, 'ax, cl', why)
      return
    }

    ins('push', 'ax')
    emitExpression(node.right)
    ins('mov', 'cl, al')
    ins('pop', 'ax')
    ins(mnemonic, 'ax, cl', why)
  }

  const emitDivide = (node: Expression) => {
    if (node.type !== 'BinaryExpression') return

    const signed = isSigned(typeOf(node))
    emitOperands(node.left, node.right, true)

    if (signed) {
      ins('cwd', '', 'sign-extend AX into DX:AX')
      ins('idiv', 'bx')
    } else {
      ins('xor', 'dx, dx', 'clear high half for div')
      ins('div', 'bx')
    }

    if (node.operator === '%') ins('mov', 'ax, dx', 'remainder')
  }

  const emitExpression = (node: Expression) => {
    const fixed = constOf(node)
    if (fixed !== null) {
      ins('mov', `ax, ${fixed}`)
      return
    }

    if (node.type === 'Identifier') {
      loadVariable(symbolFor(node.label))
      return
    }

    if (node.type === 'IndexExpression') {
      emitIndexLoad(node)
      return
    }

    if (node.type === 'CallExpression') {
      // Parameterised consts are substituted; fns are actually called.
      if (node.expansion) {
        emitExpression(node.expansion)
        return
      }
      emitCall(node.callee.label, node.args)
      const symbol = symbolFor(node.callee.label)
      if (symbol.kind === 'routine' && symbol.retLabel && symbol.returnType) {
        loadVariable({
          kind: 'var',
          name: symbol.retLabel,
          label: symbol.retLabel,
          type: symbol.returnType,
          builtin: false,
          init: 0,
        })
      }
      return
    }

    if (node.type === 'AddrExpression') {
      ins('mov', `ax, ${symbolFor(node.target.label).label}`, 'link-time constant')
      return
    }

    if (node.type === 'CastExpression') {
      emitExpression(node.argument)
      if (node.to === 'u8') ins('xor', 'ah, ah', 'cast to u8')
      else if (node.to === 'i8') ins('cbw', '', 'cast to i8')
      else if (node.to === 'bool') {
        ins('test', 'ax, ax')
        emitBoolFromJump((falseLabel) => jumpIf('jz', falseLabel, 'cast to bool'))
      }
      return
    }

    if (node.type === 'UnaryExpression') {
      if (node.operator === '!') {
        emitJumpValue(node)
        return
      }
      emitExpression(node.argument)
      ins(node.operator === '-' ? 'neg' : 'not', 'ax')
      return
    }

    if (node.type === 'LogicalExpression') {
      emitJumpValue(node)
      return
    }

    if (node.type === 'ConditionalExpression') {
      const elseLabel = nextLabel()
      const endLabel = nextLabel()

      emitJumpIfFalse(node.test, elseLabel)
      emitExpression(node.consequent)
      ins('jmp', endLabel)
      label(elseLabel)
      emitExpression(node.alternate)
      label(endLabel)
      return
    }

    if (node.type !== 'BinaryExpression') return

    if (node.operator === '<<' || node.operator === '>>') return emitShift(node)
    if (node.operator === '/' || node.operator === '%') return emitDivide(node)

    if (node.operator in signedJumps) {
      emitJumpValue(node)
      return
    }

    if (node.operator === '*') {
      emitOperands(node.left, node.right, true)
      ins('mul', 'bx', 'low 16 bits are sign-agnostic')
      return
    }

    const operand = emitOperands(node.left, node.right, false)
    ins(arithmeticOps[node.operator] ?? 'add', `ax, ${operand}`)
  }

  // Materialise a condition as 0/1 in AX. Costs a branch - the 8086 has no setcc.
  const emitJumpValue = (node: Expression) => {
    emitBoolFromJump((falseLabel) => emitJumpIfFalse(node, falseLabel))
  }

  // ---- conditions in control-flow context -----------------------------------

  const emitJumpIfFalse = (node: Expression, target: string) => {
    if (node.type === 'UnaryExpression' && node.operator === '!') {
      emitJumpIfTrue(node.argument, target)
      return
    }

    if (node.type === 'LogicalExpression') {
      if (node.operator === '&&') {
        // Both operands jump to the same false target; true falls through.
        emitJumpIfFalse(node.left, target)
        emitJumpIfFalse(node.right, target)
        return
      }
      const skip = nextLabel()
      emitJumpIfTrue(node.left, skip)
      emitJumpIfFalse(node.right, target)
      label(skip)
      return
    }

    if (node.type === 'BinaryExpression' && node.operator in signedJumps) {
      emitCompare(node)
      const table = isSigned(node.operandType ?? 'u16') ? signedJumps : unsignedJumps
      const taken = table[node.operator]
      jumpIf(invertedJump[taken], target, describeCompare(node))
      return
    }

    emitExpression(node)
    ins('test', 'ax, ax')
    jumpIf('jz', target)
  }

  const emitJumpIfTrue = (node: Expression, target: string) => {
    if (node.type === 'UnaryExpression' && node.operator === '!') {
      emitJumpIfFalse(node.argument, target)
      return
    }

    if (node.type === 'LogicalExpression') {
      if (node.operator === '||') {
        emitJumpIfTrue(node.left, target)
        emitJumpIfTrue(node.right, target)
        return
      }
      const skip = nextLabel()
      emitJumpIfFalse(node.left, skip)
      emitJumpIfTrue(node.right, target)
      label(skip)
      return
    }

    if (node.type === 'BinaryExpression' && node.operator in signedJumps) {
      emitCompare(node)
      const table = isSigned(node.operandType ?? 'u16') ? signedJumps : unsignedJumps
      jumpIf(table[node.operator], target, describeCompare(node))
      return
    }

    emitExpression(node)
    ins('test', 'ax, ax')
    jumpIf('jnz', target)
  }

  const describeCompare = (node: Expression): string => {
    if (node.type !== 'BinaryExpression') return ''
    const kind = isSigned(node.operandType ?? 'u16') ? 'signed' : 'unsigned'
    return `${kind} ${node.operator}`
  }

  const emitCompare = (node: Expression) => {
    if (node.type !== 'BinaryExpression') return
    const operand = emitOperands(node.left, node.right, false)
    ins('cmp', `ax, ${operand}`)
  }

  // ---- statements -----------------------------------------------------------

  // Store AX (or AL) into an lvalue. The caller has already put the value in AX.
  const storeTo = (target: LValue) => {
    if (target.type === 'Identifier') {
      const symbol = symbolFor(target.label)
      if (symbol.kind !== 'var') return
      if (widthOf(symbol.type) === 2) ins('mov', `[${symbol.label}], ax`)
      else ins('mov', `[${symbol.label}], al`, `narrowed to ${symbol.type}`)
      return
    }

    const symbol = symbolFor(target.array.label)
    if (symbol.kind !== 'array') return

    const width = widthOf(symbol.elementType)
    const fixed = constOf(target.index)

    if (fixed !== null) {
      const offset = fixed * width
      const at = offset === 0 ? symbol.label : `${symbol.label} + ${offset}`
      ins('mov', width === 2 ? `[${at}], ax` : `[${at}], al`)
      return
    }

    ins('push', 'ax', 'save value while computing the index')
    emitExpression(target.index)
    if (width === 2) ins('shl', 'ax, 1', 'word elements')
    ins('mov', 'bx, ax')
    ins('pop', 'ax')
    ins('mov', width === 2 ? `[${symbol.label} + bx], ax` : `[${symbol.label} + bx], al`)
  }

  // `x = 0` is `mov byte [x], 0` - no round trip through AX.
  const storeConstant = (target: LValue, value: number | null): boolean => {
    if (value === null) return false

    let symbol: MomoSymbol
    let at: string
    let width: number

    if (target.type === 'Identifier') {
      symbol = symbolFor(target.label)
      if (symbol.kind !== 'var') return false
      width = widthOf(symbol.type)
      at = symbol.label
    } else {
      symbol = symbolFor(target.array.label)
      if (symbol.kind !== 'array') return false
      const fixed = constOf(target.index)
      if (fixed === null) return false
      width = widthOf(symbol.elementType)
      const offset = fixed * width
      at = offset === 0 ? symbol.label : `${symbol.label} + ${offset}`
    }

    const mask = width === 2 ? 0xffff : 0xff
    ins('mov', `${width === 2 ? 'word' : 'byte'} [${at}], ${value & mask}`)
    return true
  }

  const loadFrom = (target: LValue) => {
    if (target.type === 'Identifier') loadVariable(symbolFor(target.label))
    else emitIndexLoad(target)
  }

  const emitAssignment = (node: Statement) => {
    if (node.type !== 'AssignmentStatement') return

    if (node.operator === '=') {
      if (storeConstant(node.target, constOf(node.value))) return
      emitExpression(node.value)
      storeTo(node.target)
      return
    }

    // `x op= e` is `x = x op e`. Building a synthetic BinaryExpression keeps
    // one code path for the arithmetic, and the lvalue is still evaluated once.
    const operator = node.operator.slice(0, -1)
    const synthetic: Expression = {
      type: 'BinaryExpression',
      operator,
      left: node.target,
      right: node.value,
      file: node.file,
      line: node.line,
      col: node.col,
      resolvedType: node.target.resolvedType,
      operandType: node.target.resolvedType,
      constValue: null,
    }

    emitExpression(synthetic)
    storeTo(node.target)
  }

  const emitUpdate = (node: Statement) => {
    if (node.type !== 'UpdateStatement') return

    const mnemonic = node.operator === '++' ? 'inc' : 'dec'

    if (node.target.type === 'Identifier') {
      const symbol = symbolFor(node.target.label)
      if (symbol.kind !== 'var') return
      ins(mnemonic, `${widthOf(symbol.type) === 2 ? 'word' : 'byte'} [${symbol.label}]`)
      return
    }

    const symbol = symbolFor(node.target.array.label)
    if (symbol.kind !== 'array') return

    const width = widthOf(symbol.elementType)
    const size = width === 2 ? 'word' : 'byte'
    const fixed = constOf(node.target.index)

    if (fixed !== null) {
      const offset = fixed * width
      const at = offset === 0 ? symbol.label : `${symbol.label} + ${offset}`
      ins(mnemonic, `${size} [${at}]`)
      return
    }

    emitExpression(node.target.index)
    if (width === 2) ins('shl', 'ax, 1', 'word elements')
    ins('mov', 'bx, ax')
    ins(mnemonic, `${size} [${symbol.label} + bx]`)
  }

  const emitLoop = (
    init: Statement | null,
    test: Expression | null,
    update: Statement | null,
    body: Statement,
    testAtEnd: boolean,
  ) => {
    const topLabel = nextLabel()
    const continueLabel = nextLabel()
    const breakLabel = nextLabel()

    if (init) {
      quoting = false
      emitStatement(init)
      quoting = true
    }
    label(topLabel)

    if (test && !testAtEnd) emitJumpIfFalse(test, breakLabel)

    loops.push({ breakLabel, continueLabel })
    emitStatement(body)
    loops.pop()

    label(continueLabel)
    if (update) {
      quoting = false
      emitStatement(update)
      quoting = true
    }

    if (test && testAtEnd) emitJumpIfTrue(test, topLabel)
    else ins('jmp', topLabel)

    label(breakLabel)
  }

  const emitStatement = (node: Statement) => {
    if (node.type === 'ConstDeclaration') return
    if (node.type === 'RoutineDeclaration') return

    if (node.type === 'BlockStatement') {
      for (const statement of node.body) emitStatement(statement)
      return
    }

    if (node.type === 'VariableDeclaration') {
      // Storage is emitted in the data section, already initialised. Only a
      // non-constant initialiser needs code here.
      if (!node.init || node.typeNode.array) return
      if (constOf(node.init) !== null) return
      quoteSource(node.file, node.line, node.endLine)
      emitExpression(node.init)
      const symbol = symbolFor(node.label)
      if (symbol.kind === 'var') {
        if (widthOf(symbol.type) === 2) ins('mov', `[${symbol.label}], ax`)
        else ins('mov', `[${symbol.label}], al`)
      }
      return
    }

    if (node.type === 'AssignmentStatement') {
      quoteSource(node.file, node.line, node.endLine)
      emitAssignment(node)
      return
    }

    if (node.type === 'UpdateStatement') {
      quoteSource(node.file, node.line, node.endLine)
      emitUpdate(node)
      return
    }

    if (node.type === 'CallStatement') {
      quoteSource(node.file, node.line, node.endLine)
      emitCall(node.callee.label, node.args)
      return
    }

    if (node.type === 'IntStatement') {
      quoteSource(node.file, node.line, node.endLine)
      interrupts.add(node.interrupt)
      ins('call', intHelperName(node.interrupt))
      return
    }

    if (node.type === 'IfStatement') {
      quoteSource(node.file, node.line, Math.max(node.line, node.consequent.line - 1))
      const elseLabel = nextLabel()
      const endLabel = nextLabel()

      emitJumpIfFalse(node.test, elseLabel)
      emitStatement(node.consequent)

      if (node.alternate) {
        ins('jmp', endLabel)
        label(elseLabel)
        emitStatement(node.alternate)
        label(endLabel)
      } else {
        label(elseLabel)
      }
      return
    }

    if (node.type === 'ForStatement') {
      quoteSource(node.file, node.line, Math.max(node.line, node.body.line - 1))
      emitLoop(node.init, node.test, node.update, node.body, false)
      return
    }

    if (node.type === 'WhileStatement') {
      quoteSource(node.file, node.line, Math.max(node.line, node.body.line - 1))
      emitLoop(null, node.test, null, node.body, false)
      return
    }

    if (node.type === 'DoWhileStatement') {
      quoteSource(node.file, node.line, node.line)
      emitLoop(null, node.test, null, node.body, true)
      return
    }

    if (node.type === 'BreakStatement' || node.type === 'ContinueStatement') {
      quoteSource(node.file, node.line, node.endLine)
      const loop = loops[loops.length - 1]
      ins('jmp', node.type === 'BreakStatement' ? loop.breakLabel : loop.continueLabel)
      return
    }

    if (node.type === 'ReturnStatement') {
      quoteSource(node.file, node.line, node.endLine)
      if (node.argument && currentRet) {
        emitExpression(node.argument)
        storeToLabel(currentRet.label, currentRet.type)
      }
      ins('ret')
    }
  }

  const intHelperName = (interrupt: number): string =>
    `int${interrupt.toString(16).padStart(2, '0')}`

  // ---- data -----------------------------------------------------------------

  // Group printable runs into quoted strings so data reads as what it is.
  const formatBytes = (values: number[]): string => {
    const parts: string[] = []
    let run = ''

    for (const value of values) {
      const printable = value >= 32 && value <= 126 && value !== 39
      if (printable) {
        run += String.fromCharCode(value)
        continue
      }
      if (run) {
        parts.push(`'${run}'`)
        run = ''
      }
      parts.push(String(value))
    }

    if (run) parts.push(`'${run}'`)
    return parts.length ? parts.join(', ') : '0'
  }

  const emitData = () => {
    blank()
    note('============================================================ data ====')
    blank()
    note('---- reserved globals: the machine registers ----')

    for (const symbol of result.symbols) {
      if (symbol.kind !== 'var' || !symbol.builtin) continue
      if (symbol.label === '_hsize') continue // emitted with the heap block
      if (widthOf(symbol.type) === 2) {
        lines.push(`${symbol.label.padEnd(15)} dw      0`)
      } else if (symbol.type === 'bool') {
        // Real storage, not a view of a register. `bool` is what distinguishes
        // the two: every u8 reserved global is a byte alias by construction, so
        // without this `_cf` would silently come out as `equ _cx + 1`.
        lines.push(`${symbol.label.padEnd(15)} db      0`)
      } else {
        // Byte aliases index into the word storage; little-endian, low first.
        const parent = `_${symbol.label[1]}x`
        const offset = symbol.label.endsWith('l') ? '' : ' + 1'
        lines.push(`${symbol.label.padEnd(15)} equ     ${parent}${offset}`)
      }
    }

    const vars = result.symbols.filter(
      (symbol) => symbol.kind === 'var' && !symbol.builtin,
    )
    if (vars.length) {
      blank()
      note('---- variables ----')
      for (const symbol of vars) {
        if (symbol.kind !== 'var') continue
        const word = widthOf(symbol.type) === 2
        const directive = word ? 'dw' : 'db'
        const value = symbol.init & (word ? 0xffff : 0xff)
        lines.push(
          `${symbol.label.padEnd(15)} ${directive.padEnd(7)} ${value}` +
            `        ; ${symbol.type}${symbol.init === 0 ? '' : ` = ${symbol.init}`}`,
        )
      }
    }

    const arrays = result.symbols.filter(
      (symbol) => symbol.kind === 'array' && !symbol.dynamic,
    )
    if (arrays.length) {
      blank()
      note('---- arrays ----')
      for (const symbol of arrays) {
        if (symbol.kind !== 'array') continue
        const directive = widthOf(symbol.elementType) === 2 ? 'dw' : 'db'
        const allZero = symbol.values.every((value) => value === 0)

        if (allZero) {
          lines.push(
            `${symbol.label.padEnd(15)} times ${symbol.length} ${directive} 0` +
              `        ; ${symbol.elementType}[${symbol.length}]`,
          )
          continue
        }

        const body =
          directive === 'db' ? formatBytes(symbol.values) : symbol.values.join(', ')
        lines.push(
          `${symbol.label.padEnd(15)} ${directive.padEnd(7)} ${body}` +
            `        ; ${symbol.elementType}[${symbol.length}]${symbol.readonly ? ' const' : ''}`,
        )
      }
    }
  }

  // The heap is everything between the end of the image and the bottom of the
  // stack. No storage is emitted: `_heap` is just a label, so the .COM file does
  // not grow by a single byte, and NASM computes `_hsize` from the addresses.
  const emitHeap = () => {
    const stack = stackBytes(result.callGraph, temporaries)

    blank()
    note('============================================================ heap ====')
    note('No storage is emitted - a .COM owns everything past its image, so')
    note('these are addresses and NASM does the arithmetic.')
    blank()
    lines.push(`_hstack         equ     ${stack + interruptReserve}` +
      `        ; ${stack} worst-case + ${interruptReserve} interrupt reserve`)
    lines.push('_htop           equ     0FFFEh - _hstack')
    blank()
    // Deliberately `dw` and not `equ`. With -f bin + org, NASM resolves a label
    // correctly inside a data expression but SECTION-RELATIVE inside an equ, so
    // `_hsize equ _htop - _heap` comes out 100h too large. Verified empirically.
    lines.push('_hsize          dw      _htop - _heap        ; NASM computes this')
    ins('align', '2', 'keep the u16 view aligned')
    label('_heap')
    lines.push('_heapw          equ     _heap        ; same bytes, u16 view')
  }

  // ---- assemble the file ----------------------------------------------------

  note('generated by momo - do not edit')
  blank()
  ins('cpu', '8086', 'enforce the strict-8086 subset')
  ins('org', '100h')

  const consts = result.symbols.filter((symbol) => symbol.kind === 'const')
  if (consts.length) {
    blank()
    note('---- constants: no storage, folded at assembly time ----')
    for (const symbol of consts) {
      if (symbol.kind !== 'const') continue
      lines.push(`${symbol.label.padEnd(15)} equ     ${symbol.value}`)
    }
  }

  blank()
  note('=========================================================== entry ====')
  blank()
  label(entryName)

  pushDepth = 0
  maxPushDepth = 0
  lastQuoted = null
  for (const statement of result.program.body) {
    if (statement.type === 'RoutineDeclaration') continue
    emitStatement(statement)
  }
  temporaries.set(entryName, maxPushDepth)

  blank()
  note('---- implicit exit ----')
  ins('mov', 'word [_ax], 0x4C00', 'DOS terminate, exit code 0')
  interrupts.add(0x21)
  ins('call', intHelperName(0x21))

  for (const statement of result.program.body) {
    if (statement.type !== 'RoutineDeclaration') continue

    const kind = statement.returnType ? statement.returnType : 'sub'
    blank()
    note(`============================================== ${kind} ${statement.name} ====`)
    blank()
    const symbol = symbolFor(safeName(statement.name))
    label(symbol.label)
    currentRet =
      symbol.kind === 'routine' && symbol.retLabel && symbol.returnType
        ? { label: symbol.retLabel, type: symbol.returnType }
        : null

    pushDepth = 0
    maxPushDepth = 0
    lastQuoted = null
    emitStatement(statement.body)
    temporaries.set(statement.name, maxPushDepth)

    currentRet = null
    // A body ending in `return` has already emitted one.
    if (lines[lines.length - 1]?.trim() !== 'ret') ins('ret')
  }

  blank()
  note('==================================================== int helpers ====')
  note('One per distinct interrupt: the literal is baked in, so the register')
  note('sync is emitted once rather than at every call site.')

  // Only when something reads it - see the `onlyIfUsed` rule in prune.
  const capturesCarry = result.symbols.some(
    (symbol) => symbol.kind === 'var' && symbol.label === '_cf',
  )

  const registers = ['ax', 'bx', 'cx', 'dx', 'si', 'di']
  for (const interrupt of [...interrupts].sort((a, b) => a - b)) {
    blank()
    label(intHelperName(interrupt))
    for (const register of registers) ins('mov', `${register}, [_${register}]`)
    ins('int', `0x${interrupt.toString(16).toUpperCase()}`)
    for (const register of registers) ins('mov', `[_${register}], ${register}`)

    // Carry is how DOS and BIOS report failure. Captured last, once AX is free
    // again: no `mov` disturbs the flags, so CF is still the handler's.
    //
    // (These helpers are emitted after every routine's temporaries have been
    // recorded, so the pop below cannot disturb the stack figure.)
    if (capturesCarry) {
      ins('pushf')
      ins('pop', 'ax')
      ins('and', 'al, 1', 'carry is bit 0')
      ins('mov', '[_cf], al')
    }

    ins('ret')
  }

  emitData()
  emitHeap()
  blank()

  return { assembly: lines.join('\r\n'), temporaries }
}
