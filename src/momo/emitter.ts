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
//     because 8086 `jcc` is +/-127 only with no near form. See `jumpIf` - and
//     `tightenBranches`, which takes that back afterwards wherever the target
//     turns out to be within reach.

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
  // Set the first time a far region is addressed. The int helpers only bother
  // preserving ES if something actually put a segment in it.
  let touchedEs = false

  // ---- output helpers -------------------------------------------------------

  const blank = () => lines.push('')
  const note = (text: string) => lines.push(`; ${text}`)
  const label = (name: string) => lines.push(`${name}:`)

  // A data label carries its colon too, and the colon is load-bearing: without
  // one NASM reads the leading token as an instruction, so `add dw 0` is parsed
  // as an ADD whose operands are `dw 0`. Padded so the directive still lines up.
  // See DESIGN §7.
  const dataLabel = (name: string) => `${name}:`.padEnd(15)

  // Peephole 14: a load of what the line above just stored is dead work.
  //
  //     mov     [handle], ax
  //     mov     ax, [handle]        <- AX already holds this
  //
  // The two are adjacent, so nothing can have touched the register in between -
  // that is the whole safety argument, and it is why this reads the previous
  // instruction rather than tracking liveness. `handle = _ax` followed by
  // `closeFile( handle )` is the shape, so it is a statement-boundary artefact
  // rather than a hole in any of 1-13.
  //
  // Source quotes and blank lines are skipped because they emit nothing. A LABEL
  // is not skipped: another path can arrive there with the register holding
  // anything at all, and the scan stops at the first line that is neither.
  //
  // `far` is excluded. An `es:` operand may be video memory or the BIOS data
  // area, where the bytes can change between two instructions without this
  // program writing them - the 8086 takes interrupts between instructions, so a
  // reload from there is not provably the same value. Our own segment has no
  // other writer while §24's handlers stay unbuilt.
  const previousInstruction = (): string | null => {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i]
      if (line === '' || line.startsWith(';')) continue
      return line
    }

    return null
  }

  const isDeadReload = (operands: string): boolean => {
    const load = operands.match(/^(a[lx]), (\[[^\]]+\])$/)
    if (!load) return false
    if (load[2].includes('es:')) return false

    const previous = previousInstruction()
    if (previous === null) return false

    const store = previous
      .replace(/;.*$/, '')
      .trim()
      .match(/^mov\s+(?:(?:byte|word)\s+)?(\[[^\]]+\]), (a[lx])$/)
    if (!store) return false

    return store[1] === load[2] && store[2] === load[1]
  }

  const ins = (mnemonic: string, operands = '', comment = '') => {
    if (mnemonic === 'mov' && isDeadReload(operands)) return

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

  const symbolFor = (name: string | undefined): MomoSymbol => {
    const symbol = name === undefined ? undefined : byLabel.get(name)
    if (!symbol) throw new Error(`internal: unresolved symbol "${name}"`)
    return symbol
  }

  // Every jcc is emitted inverted over a near jmp: 8086 conditional jumps reach
  // only +/-127 bytes and there is no near form until the 386.
  //
  // This cannot decide to use the tight single-jump form, because at the moment
  // a FORWARD branch is emitted there is nothing yet between it and its target
  // to measure. So it always emits the safe three-line shape, and
  // `tightenBranches` collapses the ones that turn out to be in reach - see
  // peephole 15.
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

  // `widening` is false only where the caller can prove the high half is about
  // to be discarded - a byte stored straight back to a byte, or a truthiness
  // test. See emitByteLoad.
  // Load ES for a far region.
  //
  // Goes through DX, which §9 has always documented as scratch and never live.
  // That is what makes this cost nothing beyond the two instructions: it
  // disturbs neither AX (which may hold a value being stored) nor BX (which may
  // hold a computed index), so no push/pop is needed around it.
  //
  // Always emitted per access in v1. §16's hoisting is a later refinement, and
  // it must key on the segment SOURCE rather than on "ES has been loaded" -
  // `textCells[i] = pixels[j]` names two segments and must reload between them.
  const loadSegment = (symbol: MomoSymbol) => {
    if (symbol.kind !== 'far') return
    touchedEs = true

    if (symbol.segment.from === 'const') {
      const hex = symbol.segment.value.toString(16).toUpperCase()
      ins('mov', `dx, 0x${hex}`, `segment of ${symbol.name}`)
    } else {
      ins('mov', `dx, [${symbol.segment.label}]`, `segment of ${symbol.name}`)
    }
    ins('mov', 'es, dx')
  }

  // The memory operand for a far access. A far region has no label - the segment
  // and offset bake into the instruction - so a constant index folds all the way
  // into a displacement and needs no register at all.
  const farOperand = (symbol: MomoSymbol, fixedByteOffset: number | null): string => {
    if (symbol.kind !== 'far') return ''
    if (fixedByteOffset !== null) return `es:${symbol.offset + fixedByteOffset}`
    return symbol.offset === 0 ? 'es:bx' : `es:bx + ${symbol.offset}`
  }

  const loadVariable = (symbol: MomoSymbol, widening = true) => {
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
    if (widening) widen(symbol.type)
  }

  // The address goes through BX because that is the only register the 8086 will
  // index memory through here - no `lea`, and no choice of base register. Nothing
  // else in the expression can be live in BX at this point: the accumulator model
  // (§9) keeps values in AX and treats BX as the index scratch.
  const emitPeek = (node: Expression, widening = true) => {
    if (node.type !== 'PeekExpression') return
    emitExpression(node.address)
    ins('mov', 'bx, ax')
    if (node.width === 2) {
      ins('mov', 'ax, [bx]', 'peek16 - unchecked, by design')
      return
    }
    ins('mov', 'al, [bx]', 'peek8 - unchecked, by design')
    if (widening) widen('u8')
  }

  // The port goes in DX, which is the only register `in` and `out` will take it
  // in - the imm8 form reaches ports 0-255 only, and §22 skips it because every
  // port a Momo program has wanted so far is above 0xFF.
  const emitIn = (node: Expression, widening = true) => {
    if (node.type !== 'InExpression') return

    const fixed = constOf(node.port)
    if (fixed !== null) ins('mov', `dx, ${fixed}`)
    else {
      emitExpression(node.port)
      ins('mov', 'dx, ax')
    }

    if (node.width === 2) {
      ins('in', 'ax, dx')
      return
    }
    ins('in', 'al, dx')
    if (widening) widen('u8')
  }

  const emitIndexLoad = (node: IndexExpression, widening = true) => {
    const symbol = symbolFor(node.array.label)

    if (symbol.kind === 'far') {
      const width = widthOf(symbol.elementType)
      const fixed = constOf(node.index)

      if (fixed !== null) {
        loadSegment(symbol)
        const at = farOperand(symbol, fixed * width)
        if (width === 2) ins('mov', `ax, [${at}]`)
        else {
          ins('mov', `al, [${at}]`)
          if (widening) widen(symbol.elementType)
        }
        return
      }

      emitExpression(node.index)
      if (width === 2) ins('shl', 'ax, 1', 'word elements')
      ins('mov', 'bx, ax')
      // ES after the index, never before: the index expression may itself have
      // read a different far region and left its segment in ES.
      loadSegment(symbol)
      const at = farOperand(symbol, null)
      if (width === 2) ins('mov', `ax, [${at}]`)
      else {
        ins('mov', `al, [${at}]`)
        if (widening) widen(symbol.elementType)
      }
      return
    }

    if (symbol.kind !== 'array') return

    const width = widthOf(symbol.elementType)
    const fixed = constOf(node.index)

    if (fixed !== null) {
      const offset = fixed * width
      const at = offset === 0 ? symbol.label : `${symbol.label} + ${offset}`
      if (width === 2) ins('mov', `ax, [${at}]`)
      else {
        ins('mov', `al, [${at}]`)
        if (widening) widen(symbol.elementType)
      }
      return
    }

    emitExpression(node.index)
    if (width === 2) ins('shl', 'ax, 1', 'word elements')
    ins('mov', 'bx, ax')
    if (width === 2) ins('mov', `ax, [${symbol.label} + bx]`)
    else {
      ins('mov', `al, [${symbol.label} + bx]`)
      if (widening) widen(symbol.elementType)
    }
  }

  // The type of a bare byte load - a byte variable, or an element of a byte
  // array - or null for anything else. Only a bare load qualifies: `x + 1`
  // needs the widening, because arithmetic happens in 16 bits.
  const byteTypeOf = (node: Expression): ValueType | null => {
    if (constOf(node) !== null) return null

    if (node.type === 'Identifier') {
      const symbol = symbolFor(node.label)
      return symbol.kind === 'var' && widthOf(symbol.type) === 1 ? symbol.type : null
    }

    // A far element is a bare byte load too. Excluding it cost a dead `xor ah, ah`
    // in every byte copy through video memory - which is the inner loop of a
    // blitter, and the one place it is least affordable.
    if (node.type === 'IndexExpression') {
      const symbol = symbolFor(node.array.label)
      if (symbol.kind !== 'array' && symbol.kind !== 'far') return null
      return widthOf(symbol.elementType) === 1 ? symbol.elementType : null
    }

    // peek8 is a bare byte load like any other, which is what makes
    // `poke8( to, peek8( from ) )` - the memcpy inner loop - cost no widening.
    if (node.type === 'PeekExpression') return node.width === 1 ? 'u8' : null

    // in8 lands in AL exactly as a byte load does. It is not a load and it can
    // have an effect on the hardware, but neither matters here: this only ever
    // decides whether the widening after it is emitted, and it is reached once.
    if (node.type === 'InExpression') return node.width === 1 ? 'u8' : null

    return null
  }

  // Loads a plain byte from memory into AL WITHOUT widening, and reports the
  // type it loaded. Returns null - having emitted nothing - when the operand is
  // anything else, so callers fall back to the ordinary widened path.
  const emitByteLoad = (node: Expression): ValueType | null => {
    const type = byteTypeOf(node)
    if (type === null) return null

    if (node.type === 'Identifier') loadVariable(symbolFor(node.label), false)
    else if (node.type === 'IndexExpression') emitIndexLoad(node, false)
    else if (node.type === 'PeekExpression') emitPeek(node, false)
    else if (node.type === 'InExpression') emitIn(node, false)
    return type
  }

  // Leaves the operand's truth in ZF. A byte is zero exactly when its widening
  // is - `xor ah, ah` cannot change that and `cbw` cannot either - and only ZF
  // is read here, so the widening is dead work.
  const emitTruthTest = (node: Expression) => {
    if (emitByteLoad(node)) {
      ins('test', 'al, al')
      return
    }
    emitExpression(node)
    ins('test', 'ax, ax')
  }

  const lvalueType = (target: LValue): ValueType | null => {
    if (target.type === 'Identifier') {
      const symbol = symbolFor(target.label)
      return symbol.kind === 'var' ? symbol.type : null
    }
    const symbol = symbolFor(target.array.label)
    if (symbol.kind === 'array' || symbol.kind === 'far') return symbol.elementType
    return null
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
        emitValueToLabel(symbol.params[i].label, symbol.params[i].type, args[i])
      }
    }

    ins('call', symbol.label)
  }

  const containsCall = (node: Expression): boolean => {
    if (node.type === 'CallExpression' && !node.expansion) return true
    // A lowered fixed multiply IS a call, and the operands it wraps are reached by
    // the generic walk below.
    if (node.type === 'BinaryExpression' && node.lowered) return true

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

  // A constant straight into memory, with no round trip through AX. Shared with
  // storeConstant below so the assignment path and the slots here cannot drift
  // into two spellings of one store.
  const storeImmediateTo = (label: string, type: ValueType, value: number) => {
    const width = widthOf(type)
    const mask = width === 2 ? 0xffff : 0xff
    ins('mov', `${width === 2 ? 'word' : 'byte'} [${label}], ${value & mask}`)
  }

  const storeToLabel = (label: string, type: ValueType) => {
    if (widthOf(type) === 2) ins('mov', `[${label}], ax`)
    else ins('mov', `[${label}], al`, `narrowed to ${type}`)
  }

  // Evaluate a value into a manufactured slot - a parameter, or a return slot.
  //
  // The two shortcuts are the ones emitAssignment already applies to an ordinary
  // lvalue, and this path had neither for as long as both existed: a constant
  // goes straight to memory, and a byte load into a byte slot keeps only AL, so
  // any widening between them is computed and then thrown away. There is nothing
  // special about a slot - it is a label and a type, exactly like a variable.
  //
  // The via-stack path in emitCall cannot use this: by the time an argument is
  // popped it is already in AX and there is nothing left to look at. That is what
  // storeToLabel is still for.
  const emitValueToLabel = (label: string, type: ValueType, value: Expression) => {
    const fixed = constOf(value)
    if (fixed !== null) {
      storeImmediateTo(label, type, fixed)
      return
    }

    if (widthOf(type) === 1) {
      const loaded = emitByteLoad(value)
      if (loaded) {
        ins('mov', `[${label}], al`, `${loaded} -> ${type}, no widening`)
        return
      }
    }

    emitExpression(value)
    storeToLabel(label, type)
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

  const emitShift = (node: Expression, reason = '') => {
    if (node.type !== 'BinaryExpression') return

    const signed = isSigned(typeOf(node))
    const mnemonic = node.operator === '<<' ? 'shl' : signed ? 'sar' : 'shr'
    const why = reason || (node.operator === '>>' ? (signed ? 'signed >>' : 'unsigned >>') : '')

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

  // ---- strength reduction ---------------------------------------------------
  //
  // §21's unconditional tier: powers of two for `*`, and for unsigned `/` and
  // `%`. Faster *and* smaller in every case, so it belongs in the ordinary
  // emitter rather than behind a flag - `mov bx, n` + `mul bx` is 5 bytes and
  // ~125 cycles, while `mov cl, k` + `shl ax, cl` is 4 bytes and at worst 68.
  //
  // §21 caps `*` at eight, which was more conservative than the numbers need:
  // even a shift of fifteen through CL beats a multiply on both counts, so every
  // power of two is reduced.

  // The shift equivalent of multiplying or dividing by `value`, or null when it
  // is not a power of two. Zero and negatives fall through to `mul`; 1 gives a
  // shift of nothing, which is exactly right.
  const powerOfTwo = (value: number | null): number | null => {
    if (value === null || value < 1) return null
    if ((value & (value - 1)) !== 0) return null

    let shift = 0
    for (let n = value; n > 1; n >>= 1) shift += 1
    return shift
  }

  // A synthetic shift over the same operand, so the existing unroll-or-CL
  // decision in emitShift is reused rather than duplicated. The same trick as
  // compound assignment.
  const asShift = (
    node: Expression & { type: 'BinaryExpression' },
    operator: '<<' | '>>',
    operand: Expression,
    shift: number,
  ): Expression => ({
    type: 'BinaryExpression',
    operator,
    left: operand,
    right: {
      type: 'NumberLiteral',
      value: shift,
      text: String(shift),
      file: node.file,
      line: node.line,
      col: node.col,
      resolvedType: 'untyped',
      constValue: shift,
    },
    file: node.file,
    line: node.line,
    col: node.col,
    resolvedType: node.resolvedType,
    operandType: node.operandType,
    constValue: null,
  })

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
      // The classic zero idiom: one byte shorter than `mov ax, 0`, and nothing
      // here has flags to preserve.
      if (fixed === 0) ins('xor', 'ax, ax', '0')
      else ins('mov', `ax, ${fixed}`)
      return
    }

    // A fixed multiply became a call, so emit that instead. Same shape as a
    // parameterised const's expansion just below.
    if (node.type === 'BinaryExpression' && node.lowered) {
      emitExpression(node.lowered)
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

    if (node.type === 'PeekExpression') {
      emitPeek(node, true)
      return
    }

    if (node.type === 'InExpression') {
      emitIn(node, true)
      return
    }

    if (node.type === 'CastExpression') {
      emitExpression(node.argument)

      // A cast to the form the value is already in cannot change a bit, so it
      // emits nothing. Provable rather than hopeful: arithmetic is always
      // 16-bit (§4), so nothing typed narrower can arrive here un-widened -
      // every route to a byte type (a variable, an array element, a fn's return
      // slot, another cast) ends in the widening instruction, and a cast that
      // folds to a constant never reaches this branch at all.
      //
      // `const u8 lo(u16 w) = u8(w)` is what makes it worth doing. A declared
      // return type wraps the expansion in a cast to that type, and lo's body
      // already ends in the same one, so every call emitted `xor ah, ah` twice.
      const from = typeOf(node.argument)
      if (node.to === from) return
      // A bool is 0 or 1, so AH is clear and the byte is already the value.
      if (node.to === 'u8' && from === 'bool') return

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

    if (node.operator === '/' || node.operator === '%') {
      // Signed is left alone deliberately. `sar` rounds toward minus infinity
      // where division rounds toward zero, so -7 / 2 would give -4 rather than
      // -3; correcting it needs a bias when the value is negative, and that is a
      // separate decision (§21). Unsigned has no such trap.
      const by = powerOfTwo(constOf(node.right))
      if (by !== null && !isSigned(typeOf(node))) {
        if (node.operator === '/') {
          return emitShift(asShift(node, '>>', node.left, by), `/ ${1 << by} is >> ${by}`)
        }
        emitExpression(node.left)
        // x % 2^k keeps the low k bits, and nothing else does.
        ins('and', `ax, ${(1 << by) - 1}`, `% ${1 << by} is a mask`)
        return
      }
      return emitDivide(node)
    }

    if (node.operator in signedJumps) {
      emitJumpValue(node)
      return
    }

    if (node.operator === '*') {
      // Commutative, so either side may be the constant. Both cannot be: the
      // resolver would have folded that before we got here.
      const byRight = powerOfTwo(constOf(node.right))
      if (byRight !== null) {
        return emitShift(asShift(node, '<<', node.left, byRight), `* ${1 << byRight} is << ${byRight}`)
      }
      const byLeft = powerOfTwo(constOf(node.left))
      if (byLeft !== null) {
        return emitShift(asShift(node, '<<', node.right, byLeft), `* ${1 << byLeft} is << ${byLeft}`)
      }

      emitOperands(node.left, node.right, true)
      ins('mul', 'bx', 'low 16 bits are sign-agnostic')
      return
    }

    const operand = emitOperands(node.left, node.right, false)

    // `inc`/`dec` are a third the size of `add ax, 1` and twice as fast. They
    // leave CF alone where `add` would set it, but nothing reads CF between
    // expressions - `_cf` is captured inside the int helpers only.
    if (operand === '1' && (node.operator === '+' || node.operator === '-')) {
      ins(node.operator === '+' ? 'inc' : 'dec', 'ax')
      return
    }

    ins(arithmeticOps[node.operator] ?? 'add', `ax, ${operand}`)
  }

  // Materialise a condition as 0/1 in AX. Costs a branch - the 8086 has no setcc.
  const emitJumpValue = (node: Expression) => {
    emitBoolFromJump((falseLabel) => emitJumpIfFalse(node, falseLabel))
  }

  // ---- conditions in control-flow context -----------------------------------

  const emitJumpIfFalse = (node: Expression, target: string) => {
    // A test that folded to a constant needs no code. `while (true)` lands here
    // as 1: never false, so no jump and no dead `mov ax, 1` / `test`.
    const fixed = constOf(node)
    if (fixed !== null) {
      if (fixed === 0) ins('jmp', target)
      return
    }

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

    emitTruthTest(node)
    jumpIf('jz', target)
  }

  const emitJumpIfTrue = (node: Expression, target: string) => {
    // Mirror of emitJumpIfFalse: `do { } while (true)` is an unconditional
    // jump back, not a test of a constant.
    const fixed = constOf(node)
    if (fixed !== null) {
      if (fixed !== 0) ins('jmp', target)
      return
    }

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

    emitTruthTest(node)
    jumpIf('jnz', target)
  }

  const describeCompare = (node: Expression): string => {
    if (node.type !== 'BinaryExpression') return ''
    const kind = isSigned(node.operandType ?? 'u16') ? 'signed' : 'unsigned'
    return `${kind} ${node.operator}`
  }

  // The right-hand operand for a byte-width compare, or null when the compare
  // must widen. Both operands have to be byte loads of the SAME signedness - or
  // a constant the byte's own range holds - and that signedness must agree with
  // the jump table the comparison already chose. Mixed u8/i8 stays widened:
  // 0xC8 is 200 as a u8 and -56 as an i8, so the bytes comparing equal would be
  // the wrong answer even for `==`.
  const byteCompareOperand = (node: Expression & { type: 'BinaryExpression' }): string | null => {
    const leftType = byteTypeOf(node.left)
    if (leftType === null) return null

    const signed = isSigned(node.operandType ?? 'u16')
    if ((leftType === 'i8') !== signed) return null

    const fixed = constOf(node.right)
    if (fixed !== null) {
      const holds = signed ? fixed >= -128 && fixed <= 127 : fixed >= 0 && fixed <= 255
      return holds ? `${fixed}` : null
    }

    // Only a plain byte variable: an array element on the right would need AX
    // for its index while AL holds the left operand.
    if (node.right.type !== 'Identifier') return null
    const symbol = symbolFor(node.right.label)
    if (symbol.kind !== 'var' || widthOf(symbol.type) !== 1) return null
    if ((symbol.type === 'i8') !== signed) return null
    return `[${symbol.label}]`
  }

  const emitCompare = (node: Expression) => {
    if (node.type !== 'BinaryExpression') return

    // Byte operands compare in AL, skipping the widening: an 8-bit cmp leaves
    // the same flags the widened 16-bit cmp would, provided the signedness
    // matches - which byteCompareOperand has checked.
    const byteOperand = byteCompareOperand(node)
    if (byteOperand !== null) {
      emitByteLoad(node.left)
      // Against zero, `test` is the idiom: same flags as cmp with 0 (OF and CF
      // clear either way), one byte shorter.
      if (byteOperand === '0') ins('test', 'al, al')
      else ins('cmp', `al, ${byteOperand}`, 'byte operands, no widening')
      return
    }

    if (constOf(node.right) === 0) {
      emitExpression(node.left)
      ins('test', 'ax, ax')
      return
    }

    const operand = emitOperands(node.left, node.right, false)
    ins('cmp', `ax, ${operand}`)
  }

  // ---- statements -----------------------------------------------------------

  // Store AX (or AL) into an lvalue. The caller has already put the value in AX.
  const storeTo = (target: LValue, byteNote?: string) => {
    if (target.type === 'Identifier') {
      const symbol = symbolFor(target.label)
      if (symbol.kind !== 'var') return
      if (widthOf(symbol.type) === 2) ins('mov', `[${symbol.label}], ax`)
      else ins('mov', `[${symbol.label}], al`, byteNote ?? `narrowed to ${symbol.type}`)
      return
    }

    const symbol = symbolFor(target.array.label)

    if (symbol.kind === 'far') {
      const width = widthOf(symbol.elementType)
      const fixed = constOf(target.index)

      if (fixed !== null) {
        // The value is already in AX and the segment goes through DX, so nothing
        // needs saving here - unlike the near path, which has no spare register.
        loadSegment(symbol)
        const at = farOperand(symbol, fixed * width)
        ins('mov', width === 2 ? `[${at}], ax` : `[${at}], al`)
        return
      }

      ins('push', 'ax', 'save value while computing the index')
      emitExpression(target.index)
      if (width === 2) ins('shl', 'ax, 1', 'word elements')
      ins('mov', 'bx, ax')
      loadSegment(symbol)
      ins('pop', 'ax')
      const at = farOperand(symbol, null)
      ins('mov', width === 2 ? `[${at}], ax` : `[${at}], al`)
      return
    }

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

  // `x = 0` is `mov byte [x], 0` - no round trip through AX. A constant value
  // also never needs saving while an index is computed - it is an immediate in
  // the store itself - so the push/pop the general path pays disappears too.
  const storeConstant = (target: LValue, value: number | null): boolean => {
    if (value === null) return false

    if (target.type === 'Identifier') {
      const symbol = symbolFor(target.label)
      if (symbol.kind !== 'var') return false
      storeImmediateTo(symbol.label, symbol.type, value)
      return true
    }

    const symbol = symbolFor(target.array.label)
    if (symbol.kind !== 'array' && symbol.kind !== 'far') return false

    const width = widthOf(symbol.elementType)
    const size = width === 2 ? 'word' : 'byte'
    const masked = value & (width === 2 ? 0xffff : 0xff)
    const fixed = constOf(target.index)

    if (fixed !== null) {
      if (symbol.kind === 'far') {
        loadSegment(symbol)
        ins('mov', `${size} [${farOperand(symbol, fixed * width)}], ${masked}`)
        return true
      }
      const offset = fixed * width
      const at = offset === 0 ? symbol.label : `${symbol.label} + ${offset}`
      ins('mov', `${size} [${at}], ${masked}`)
      return true
    }

    emitExpression(target.index)
    if (width === 2) ins('shl', 'ax, 1', 'word elements')
    ins('mov', 'bx, ax')
    if (symbol.kind === 'far') {
      loadSegment(symbol)
      ins('mov', `${size} [${farOperand(symbol, null)}], ${masked}`)
      return true
    }
    ins('mov', `${size} [${symbol.label} + bx], ${masked}`)
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

      // Byte to byte: the store keeps only AL, so widening the source would be
      // computed and then discarded.
      const targetType = lvalueType(node.target)
      if (targetType && widthOf(targetType) === 1) {
        const loaded = emitByteLoad(node.value)
        if (loaded) {
          storeTo(node.target, `${loaded} -> ${targetType}, no widening`)
          return
        }
      }

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

    if (symbol.kind === 'far') {
      const width = widthOf(symbol.elementType)
      const size = width === 2 ? 'word' : 'byte'
      const fixed = constOf(node.target.index)

      if (fixed !== null) {
        loadSegment(symbol)
        ins(mnemonic, `${size} [${farOperand(symbol, fixed * width)}]`)
        return
      }

      emitExpression(node.target.index)
      if (width === 2) ins('shl', 'ax, 1', 'word elements')
      ins('mov', 'bx, ax')
      loadSegment(symbol)
      ins(mnemonic, `${size} [${farOperand(symbol, null)}]`)
      return
    }

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

      // Exactly an assignment, so take that path rather than keep a second
      // store here that has to remember the same widening rules.
      emitAssignment({
        type: 'AssignmentStatement',
        operator: '=',
        target: {
          type: 'Identifier',
          name: node.name,
          label: node.label,
          file: node.file,
          line: node.line,
          col: node.col,
        },
        value: node.init,
        file: node.file,
        line: node.line,
        col: node.col,
        endLine: node.endLine,
      })
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

    if (node.type === 'PokeStatement') {
      quoteSource(node.file, node.line, node.endLine)

      const size = node.width === 2 ? 'word' : 'byte'
      const fixed = constOf(node.value)

      // A constant value is an immediate in the store itself, so the address can
      // have BX to itself and the save disappears - peephole 9, through a runtime
      // address this time.
      if (fixed !== null) {
        emitExpression(node.address)
        ins('mov', 'bx, ax')
        ins('mov', `${size} [bx], ${fixed & (node.width === 2 ? 0xffff : 0xff)}`)
        return
      }

      // Address first: §7 evaluates arguments left to right, and either side may
      // call a fn. It is pushed rather than parked in BX because evaluating the
      // value needs BX itself for any indexing it does.
      emitExpression(node.address)
      ins('push', 'ax', 'save the address while the value is computed')

      // poke8 keeps only AL, so widening a byte source would be computed and then
      // thrown away - the same rule as a byte-to-byte assignment. This is what
      // makes `poke8( to, peek8( from ) )` two instructions of actual work.
      if (node.width === 2 || !emitByteLoad(node.value)) {
        emitExpression(node.value)
      }

      ins('pop', 'bx')
      ins('mov', node.width === 2 ? '[bx], ax' : '[bx], al')
      return
    }

    if (node.type === 'OutStatement') {
      quoteSource(node.file, node.line, node.endLine)

      const operand = node.width === 2 ? 'dx, ax' : 'dx, al'
      const fixed = constOf(node.port)

      // A constant port is loaded AFTER the value, because `mov dx, imm` cannot
      // disturb what the value left in AX. That is the common case - every port
      // in §22's table is a literal.
      if (fixed !== null) {
        if (node.width === 2 || !emitByteLoad(node.value)) emitExpression(node.value)
        ins('mov', `dx, ${fixed}`)
        ins('out', operand)
        return
      }

      // A computed port cannot simply sit in DX while the value is worked out:
      // `mul` and `div` both clobber DX (§9), so a value containing either would
      // destroy the port. Pushed instead, which is what poke does with BX and
      // for the same reason.
      emitExpression(node.port)
      ins('push', 'ax', 'save the port while the value is computed')
      if (node.width === 2 || !emitByteLoad(node.value)) emitExpression(node.value)
      ins('pop', 'dx')
      ins('out', operand)
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
        emitValueToLabel(currentRet.label, currentRet.type, node.argument)
      }
      ins('ret')
    }
  }

  const intHelperName = (interrupt: number): string =>
    `int${interrupt.toString(16).padStart(2, '0')}`

  // ---- data -----------------------------------------------------------------

  // Group printable runs into quoted strings so data reads as what it is.
  const formatByteParts = (values: number[]): string[] => {
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
    return parts.length ? parts : ['0']
  }

  // Data wraps rather than running to one enormous line.
  //
  // This used to join every element with a comma and push one line, which is fine
  // at momolo's 64 elements and not fine at the vector study's: 8,014 `i16` points
  // came out as a single 37,360-character line. NASM assembles it perfectly well -
  // that was checked - but the golden `.asm` tier compares text, so any change
  // anywhere in the array reports as one unreadable line, and `git diff` is no
  // better. The point of that tier is that a human reads the diff.
  //
  // A character budget rather than a count, because elements are not the same
  // width: `formatBytes` emits quoted runs for printable bytes, so one part can be
  // a whole string and the next a single digit.
  //
  // The comment naming the array goes on the FIRST line, with the label. That is
  // where a reader scanning for a symbol looks, so it is where the type belongs -
  // the first version put it on the last line of a wrapped array, which reads as
  // an annotation on the final twelve values rather than on the array.
  const dataBudget = 72

  const emitArrayData = (
    label: string,
    directive: string,
    parts: string[],
    comment: string,
  ) => {
    const head = `${dataLabel(label)} ${directive.padEnd(7)} `
    const continued = `${' '.repeat(15)} ${directive.padEnd(7)} `

    const rows: string[] = []
    let row = ''

    for (let i = 0; i < parts.length; i += 1) {
      const piece = parts[i]! + (i === parts.length - 1 ? '' : ',')

      if (row !== '' && row.length + 1 + piece.length > dataBudget) {
        rows.push(row)
        row = ''
      }

      row = row === '' ? piece : `${row} ${piece}`
    }

    if (row !== '') rows.push(row)

    for (let i = 0; i < rows.length; i += 1) {
      lines.push(
        (i === 0 ? head : continued) + rows[i] +
          (i === 0 ? `        ; ${comment}` : ''),
      )
    }
  }

  // An alias emits no storage - just a name for `parent + n`, which NASM folds
  // into every displacement that uses it. A register byte half, `_heapw` and
  // every `view` all come through here.
  const aliasLine = (symbol: MomoSymbol, comment = '') => {
    if (!('alias' in symbol) || !symbol.alias) return
    const offset = symbol.alias.byteOffset === 0 ? '' : ` + ${symbol.alias.byteOffset}`
    lines.push(
      `${dataLabel(symbol.label)} equ     ${symbol.alias.parent}${offset}` +
        (comment ? `        ; ${comment}` : ''),
    )
  }

  const emitData = () => {
    blank()
    note('============================================================ data ====')
    blank()
    note('---- reserved globals: the machine registers ----')

    for (const symbol of result.symbols) {
      if (symbol.kind !== 'var' || !symbol.builtin) continue
      if (symbol.label === '_hsize') continue // emitted with the heap block
      // A byte half is an alias into the word storage, and carries that as data -
      // so this asks the symbol rather than inferring it from the spelling of the
      // label. `_cf` is the reserved global that is NOT an alias: it is real
      // storage, and used to be told apart by being the only `bool` here.
      if (symbol.alias) {
        aliasLine(symbol)
      } else if (widthOf(symbol.type) === 2) {
        lines.push(`${dataLabel(symbol.label)} dw      0`)
      } else {
        lines.push(`${dataLabel(symbol.label)} db      0`)
      }
    }

    const vars = result.symbols.filter(
      (symbol) => symbol.kind === 'var' && !symbol.builtin && !symbol.alias,
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
          `${dataLabel(symbol.label)} ${directive.padEnd(7)} ${value}` +
            `        ; ${symbol.type}${symbol.init === 0 ? '' : ` = ${symbol.init}`}`,
        )
      }
    }

    const arrays = result.symbols.filter(
      (symbol) => symbol.kind === 'array' && !symbol.dynamic && !symbol.alias,
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
            `${dataLabel(symbol.label)} times ${symbol.length} ${directive} 0` +
              `        ; ${symbol.elementType}[${symbol.length}]`,
          )
          continue
        }

        const parts =
          directive === 'db' ? formatByteParts(symbol.values) : symbol.values.map(String)

        emitArrayData(
          symbol.label,
          directive,
          parts,
          `${symbol.elementType}[${symbol.length}]${symbol.readonly ? ' const' : ''}`,
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
    lines.push(`${dataLabel('_hstack')} equ     ${stack + interruptReserve}` +
      `        ; ${stack} worst-case + ${interruptReserve} interrupt reserve`)
    lines.push(`${dataLabel('_htop')} equ     0FFFEh - _hstack`)
    blank()
    // Deliberately `dw` and not `equ`. With -f bin + org, NASM resolves a label
    // correctly inside a data expression but SECTION-RELATIVE inside an equ, so
    // `_hsize equ _htop - _heap` comes out 100h too large. Verified empirically.
    lines.push(`${dataLabel('_hsize')} dw      _htop - _heap        ; NASM computes this`)
    ins('align', '2', 'keep the u16 view aligned')
    label('_heap')

    const heapw = result.symbols.find((symbol) => symbol.label === '_heapw')
    if (heapw) aliasLine(heapw, 'same bytes, u16 view')
  }

  // Every view in the program, last, because a view of the heap can only be
  // written after `_heap` - and NASM resolves a forward-referenced `equ` used as
  // a displacement correctly, which was measured before this was relied on.
  // Declaration order, so a view of a view still follows its parent.
  const emitViews = () => {
    const views = result.symbols.filter((symbol) => {
      // The builtin aliases are emitted where their parents are: a register half
      // in the reserved block, `_heapw` with the heap.
      if (symbol.kind === 'array') return symbol.alias !== undefined && !symbol.dynamic
      if (symbol.kind === 'var') return symbol.alias !== undefined && !symbol.builtin
      return false
    })
    if (!views.length) return

    blank()
    note('=========================================================== views ====')
    note('No storage: each is a name for an offset into something else.')
    blank()

    for (const symbol of views) {
      if (symbol.kind === 'array') {
        aliasLine(
          symbol,
          `${symbol.elementType}[${symbol.length}]${symbol.readonly ? ' const' : ''}`,
        )
        continue
      }
      if (symbol.kind !== 'var') continue
      aliasLine(symbol, `${symbol.type}${symbol.readonly ? ' const' : ''}`)
    }
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
      lines.push(`${dataLabel(symbol.label)} equ     ${symbol.value}`)
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
    // By label, not by name: `local` lets two files each declare `sub helper`,
    // and a name lookup would emit one of them twice under the other's label.
    const symbol = symbolFor(statement.label)
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

    // Handlers may trash any register they do not document as preserved, and
    // some use ES as input. Saving it here makes "ES survives everything you
    // call" an invariant rather than a discipline - which is what §16's later
    // hoisting will rest on. Only emitted when something actually uses ES.
    if (touchedEs) ins('push', 'es')

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

    if (touchedEs) ins('pop', 'es')

    ins('ret')
  }

  emitData()
  emitHeap()
  emitViews()
  blank()

  // ---- peephole 15: tighten the branch expansion ----------------------------
  //
  // `jumpIf` always emits three lines, because a forward branch cannot be
  // measured while it is being written. This runs over the finished output and
  // takes the expansion back wherever the target is provably in reach:
  //
  //       jae     .L1                 ; unsigned <              jb      target
  //       jmp     target                              ->
  //     .L1:
  //
  // 3 bytes, and 12 clocks off the fall-through path: a taken jcc costs 16 where
  // an untaken one costs 4, so the common direction stops paying for the jump it
  // was only skipping. The comment survives because it describes the SOURCE
  // comparison rather than the mnemonic - `jae ... ; unsigned <` is already a
  // spelling the output uses today.
  //
  // **Reach is decided by an upper bound, never by an exact size table.** Two
  // buckets are enough: an instruction touching memory can reach 7 bytes
  // (opcode, modrm, disp16, imm16 and a segment prefix) and one that does not
  // reaches 3 on this subset, where 4 is used for margin. There is deliberately
  // no per-mnemonic table: DESIGN §1's table is meant to be the only record of
  // the subset, and a second one that has to agree with it byte for byte is
  // exactly the duplicate that has been got wrong here before.
  //
  // **What an under-estimate costs is honesty, not correctness.** NASM does this
  // expansion itself - `jz far` under `cpu 8086` assembles to `jnz $+3` plus a
  // near `jmp`, silently, on its default -Ox - so an out-of-reach jcc would
  // still build and still run. The bound exists so that the `.asm` says what
  // gets assembled: one line here means one instruction there. That matters
  // because counting instructions in the emitted text is how performance is
  // reasoned about in this project (§21), DOSBox being unable to measure it.
  //
  // Anything unrecognised between a jump and its target aborts that inversion
  // rather than being guessed at. `align 2` before the heap is why the rule is
  // "bail out" and not "assume 4".
  const branchBound = (line: string): number | null => {
    if (line === '' || line.startsWith(';')) return 0
    if (/^[.\w]+:$/.test(line)) return 0

    // Instructions are the only lines the emitter indents.
    if (!line.startsWith('        ')) return null

    const text = line.replace(/;.*$/, '').trim()
    if (/^(align|cpu|org|bits|section)\b/.test(text)) return null

    return text.includes('[') ? 7 : 4
  }

  const tightenBranches = () => {
    // A label is only safe to delete if the jcc above it is the one thing that
    // names it. `jumpIf` allocates a fresh `.LN` per branch so this always
    // holds, but it is checked rather than assumed.
    const named = new Map<string, number>()
    for (const line of lines) {
      const reference = line.replace(/;.*$/, '').trim().match(/^(?:j[a-z]+|call)\s+([.\w]+)$/)
      if (!reference) continue
      named.set(reference[1], (named.get(reference[1]) ?? 0) + 1)
    }

    // The set of expansions to consider is fixed HERE, before anything moves,
    // and collapsing never adds to it.
    //
    // Cascading was tried and reverted. Collapsing one expansion can leave a
    // second one in its place, and taking that too is a real further saving -
    // but whether the three lines end up adjacent depends on whether a
    // `; ---- source` comment happens to fall between them, and that depends on
    // the source text rather than on the program. The desugar round trip caught
    // it immediately: `if( done ) break` puts the `break` on the `if`'s own line
    // so its quote is suppressed and the cascade fires, while the printed copy
    // puts it on a line of its own so the comment blocks it. Same program, same
    // instructions, different output.
    //
    // Fixing the set up front makes the pass a function of the instruction
    // stream alone. It costs 48 of 562 collapses - 144 bytes across every
    // committed program - and buys back an output that cannot depend on how the
    // source was laid out. Comments are the product here, so the alternative
    // (matching across them, and stranding a `; ---- break` above unrelated
    // code) was worse for more than it was better.
    const expansions = new Set<string>()
    for (let i = 0; i + 2 < lines.length; i += 1) {
      const conditional = lines[i].replace(/;.*$/, '').trim().match(/^(j[a-z]+)\s+([.\w]+)$/)
      if (!conditional || invertedJump[conditional[1]] === undefined) continue
      if (!/^jmp\s+[.\w]+$/.test(lines[i + 1].replace(/;.*$/, '').trim())) continue
      const over = lines[i + 2].match(/^([.\w]+):$/)
      if (over && over[1] === conditional[2]) expansions.add(over[1])
    }

    // Collapsing shortens regions, which can bring further branches into reach,
    // so this repeats until nothing more moves. Every pass only ever removes
    // lines, so it terminates.
    for (;;) {
      let collapsed = false

      for (let i = 0; i + 2 < lines.length; i += 1) {
        const conditional = lines[i].replace(/;.*$/, '').trim().match(/^(j[a-z]+)\s+([.\w]+)$/)
        if (!conditional) continue
        if (conditional[1] === 'jmp') continue
        if (invertedJump[conditional[1]] === undefined) continue

        const unconditional = lines[i + 1].replace(/;.*$/, '').trim().match(/^jmp\s+([.\w]+)$/)
        if (!unconditional) continue

        const over = lines[i + 2].match(/^([.\w]+):$/)
        if (!over) continue
        if (over[1] !== conditional[2]) continue
        if (!expansions.has(over[1])) continue
        if (named.get(over[1]) !== 1) continue

        const target = lines.findIndex((line) => line === `${unconditional[1]}:`)
        if (target === -1) continue

        // Everything between the inverted jump and its new target. Forward means
        // the label is below; backward is measured the same way and negated.
        const from = Math.min(i + 3, target)
        const to = Math.max(i + 3, target)

        let bytes = 0
        let measurable = true

        for (let k = from; k < to; k += 1) {
          const bound = branchBound(lines[k])
          if (bound === null) {
            measurable = false
            break
          }
          bytes += bound
        }

        if (!measurable) continue
        if (target < i && -bytes < -128) continue
        if (target > i && bytes > 127) continue

        const comment = lines[i].match(/;\s*(.*)$/)
        const taken = invertedJump[conditional[1]]

        lines.splice(i, 3)
        const body = `        ${taken.padEnd(7)} ${unconditional[1]}`
        lines.splice(i, 0, comment ? `${body.padEnd(44)}; ${comment[1]}` : body)

        named.delete(over[1])
        collapsed = true
      }

      if (!collapsed) break
    }
  }

  tightenBranches()

  return { assembly: lines.join('\r\n'), temporaries }
}
