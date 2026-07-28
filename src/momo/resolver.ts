// Momo resolver: builds the symbol table, folds constants, annotates every
// expression with its type, and reports semantic errors.
//
// Two passes. The first collects top-level declarations so that forward
// references work (`run` calls `checksum`, defined after it). The second walks
// every body, resolving and checking.
//
// Scoping is deliberately flat: global and per-sub, with no block scope. Locals
// are statically allocated, so a block-scoped variable would just be another
// static slot under a different name - all cost, no benefit.

import type {
  ConstFunctionDeclaration,
  Expression,
  RoutineDeclaration,
  TypeName,
  LValue,
  Program,
  Statement,
  TypeNode,
} from './ast.js'
import { alwaysReturns, buildCallGraph, fallsThrough, type CallGraph } from './analysis.js'
import { raise, type Location } from './diagnostics.js'
import {
  combineRanges,
  fits,
  naturalType,
  promote,
  rangeOf,
  truncate,
  type Range,
  type ValueType,
} from './types.js'

export type MomoSymbol =
  | { kind: 'const'; name: string; label: string; type: ValueType; value: number }
  | {
      kind: 'array'
      name: string
      label: string
      elementType: ValueType
      length: number
      readonly: boolean
      values: number[]
      // The heap has no compile-time length: no storage, no bounds checks.
      dynamic: boolean
    }
  // `owner` marks a fn's parameter or return slot, so pruning keeps it alive
  // whenever the fn itself is reachable - the call site writes it even if the
  // body happens not to read it.
  | {
      kind: 'var'
      name: string
      label: string
      type: ValueType
      builtin: boolean
      init: number
      owner?: string
    }
  | {
      kind: 'routine'
      name: string
      label: string
      params: { name: string; label: string; type: ValueType }[]
      returnType: ValueType | null
      retLabel: string | null
    }
  | {
      kind: 'constfn'
      name: string
      label: string
      params: { name: string; type: ValueType }[]
      returnType: ValueType | null
      body: Expression
    }

export type ResolveResult = {
  program: Program
  symbols: MomoSymbol[]
  callGraph: CallGraph
}

// The reserved globals are the machine registers. Byte aliases index into the
// word storage; the emitter lays them out with `equ`.
const reservedGlobals: { name: string; type: ValueType }[] = [
  { name: '_ax', type: 'u16' }, { name: '_al', type: 'u8' }, { name: '_ah', type: 'u8' },
  { name: '_bx', type: 'u16' }, { name: '_bl', type: 'u8' }, { name: '_bh', type: 'u8' },
  { name: '_cx', type: 'u16' }, { name: '_cl', type: 'u8' }, { name: '_ch', type: 'u8' },
  { name: '_dx', type: 'u16' }, { name: '_dl', type: 'u8' }, { name: '_dh', type: 'u8' },
  { name: '_si', type: 'u16' }, { name: '_di', type: 'u16' },
  // Storage for _hsize sits in the heap block; NASM computes its value.
  { name: '_hsize', type: 'u16' },
]

// The heap is everything past the program image. No storage is emitted - these
// are addresses, and NASM computes the size from them.
const heapGlobals: MomoSymbol[] = [
  {
    kind: 'array', name: '_heap', label: '_heap', elementType: 'u8',
    length: 0, readonly: false, values: [], dynamic: true,
  },
  {
    kind: 'array', name: '_heapw', label: '_heapw', elementType: 'u16',
    length: 0, readonly: false, values: [], dynamic: true,
  },
]

// Every name the compiler predefines. Exported so the editor grammar can
// highlight them without keeping its own copy that could drift.
export const builtinGlobalNames: string[] = [
  ...reservedGlobals.map((entry) => entry.name),
  ...heapGlobals.map((symbol) => symbol.name),
]

// Shifts take their result type from the left operand alone - the count's type
// is irrelevant. Everything else combines both operands.
const shiftOps = ['<<', '>>']
const comparisonOps = ['<', '<=', '>', '>=', '==', '!=']

// NASM words that cannot be used as a bare label. Instruction mnemonics are
// deliberately absent: `add:` assembles fine, and `add` is far too natural a
// name to mangle. Directives and registers genuinely break - `absolute:` is
// parsed as the ABSOLUTE directive and fails with an expression syntax error.
const nasmReserved = new Set([
  // directives
  'absolute', 'align', 'alignb', 'bits', 'common', 'cpu', 'default', 'extern',
  'global', 'incbin', 'org', 'section', 'seg', 'segment', 'static', 'struc',
  'endstruc', 'istruc', 'iend', 'times', 'use16', 'use32', 'equ',
  // data definition and reservation
  'db', 'dw', 'dd', 'dq', 'dt', 'do', 'dy', 'dz',
  'resb', 'resw', 'resd', 'resq', 'rest', 'resy', 'resz',
  // size and address keywords
  'byte', 'word', 'dword', 'qword', 'tword', 'oword', 'yword', 'zword',
  'near', 'far', 'short', 'strict', 'nosplit', 'abs', 'rel', 'wrt', 'at',
  // registers
  'al', 'ah', 'ax', 'bl', 'bh', 'bx', 'cl', 'ch', 'cx', 'dl', 'dh', 'dx',
  'si', 'di', 'bp', 'sp', 'cs', 'ds', 'es', 'ss', 'fs', 'gs',
  'eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp',
])

// Momo has its own name rules; NASM has others. A trailing underscore keeps the
// generated label readable while stepping around the assembler's vocabulary.
const safeLabel = (name: string): string =>
  nasmReserved.has(name.toLowerCase()) ? `${name}_` : name

// A `sub` is just a routine with no return type.
const isSub = (symbol: MomoSymbol): boolean =>
  symbol.kind === 'routine' && symbol.returnType === null

type Resolved = { type: ValueType; value: number | null }

const isExpression = (value: unknown): value is Expression =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string'

export const resolve = (program: Program): ResolveResult => {
  const symbols: MomoSymbol[] = []
  const globals = new Map<string, MomoSymbol>()

  let locals: Map<string, MomoSymbol> | null = null
  let subName: string | null = null
  let loopDepth = 0
  const expanding = new Set<string>()
  let currentFn: (MomoSymbol & { kind: 'routine' }) | null = null

  for (const reserved of reservedGlobals) {
    const symbol: MomoSymbol = {
      kind: 'var',
      name: reserved.name,
      label: reserved.name,
      type: reserved.type,
      builtin: true,
      init: 0,
    }
    globals.set(reserved.name, symbol)
    symbols.push(symbol)
  }

  for (const symbol of heapGlobals) {
    globals.set(symbol.name, symbol)
    symbols.push(symbol)
  }

  const lookup = (name: string): MomoSymbol | null => {
    if (locals) {
      const local = locals.get(name)
      if (local) return local
    }
    return globals.get(name) ?? null
  }

  const declare = (symbol: MomoSymbol, at: Location) => {
    const scope = locals ?? globals
    if (scope.has(symbol.name)) {
      raise(at, `"${symbol.name}" is already declared in this scope`)
    }
    if (!locals && globals.has(symbol.name)) {
      raise(at, `"${symbol.name}" is already declared`)
    }
    scope.set(symbol.name, symbol)
    symbols.push(symbol)
  }

  const labelFor = (name: string): string =>
    subName ? `${subName}__${name}` : safeLabel(name)

  // ---- expressions ----------------------------------------------------------

  const annotate = (node: Expression, resolved: Resolved): Resolved => {
    node.resolvedType = resolved.type
    node.constValue = resolved.value
    return resolved
  }

  // Range a resolved operand occupies. An untyped constant is a single point,
  // which is what lets `i8Var + 200` widen to i16 rather than failing.
  const rangeOfResolved = (resolved: Resolved, at: Location): Range => {
    if (resolved.type !== 'untyped') return rangeOf(resolved.type)
    if (resolved.value === null) raise(at, 'internal: untyped value without a constant')
    return { min: resolved.value, max: resolved.value }
  }

  const combineOperands = (
    left: Resolved,
    right: Resolved,
    operator: string,
    at: Location,
  ): ValueType => {
    if (left.type === 'untyped' && right.type === 'untyped') return 'untyped'

    const combined = combineRanges(
      rangeOfResolved(left, at),
      rangeOfResolved(right, at),
    )

    if (combined) return combined

    raise(at, `cannot apply "${operator}" to ${describeType(left)} and ${describeType(right)}` +
        ' - u16 does not mix with signed types; use an explicit cast',
    )
  }

  // `untyped` means "a constant whose type is not fixed yet". If an expression
  // comes out untyped but its value cannot be computed - `1 << runtimeCount`, or
  // `runtimeTest ? 1 : 2` - that pairing is a contradiction. Settle it to a
  // concrete type built from the constituent values instead.
  const settle = (type: ValueType, value: number | null, values: number[]): ValueType => {
    if (type !== 'untyped' || value !== null) return type

    let min = 0
    let max = 0
    for (const candidate of values) {
      min = Math.min(min, candidate)
      max = Math.max(max, candidate)
    }

    return combineRanges({ min, max }, { min, max }) ?? 'u16'
  }

  const describeType = (resolved: Resolved): string =>
    resolved.type === 'untyped' ? `untyped constant ${resolved.value}` : resolved.type

  const foldBinary = (
    operator: string,
    left: number,
    right: number,
    at: Location,
  ): number | null => {
    if (operator === '+') return left + right
    if (operator === '-') return left - right
    if (operator === '*') return left * right
    if (operator === '/') {
      if (right === 0) raise(at, 'division by zero')
      return Math.trunc(left / right)
    }
    if (operator === '%') {
      if (right === 0) raise(at, 'division by zero')
      return left % right
    }
    if (operator === '&') return left & right
    if (operator === '|') return left | right
    if (operator === '^') return left ^ right
    if (operator === '<<') return left << right
    if (operator === '>>') return left >> right
    if (operator === '<') return left < right ? 1 : 0
    if (operator === '<=') return left <= right ? 1 : 0
    if (operator === '>') return left > right ? 1 : 0
    if (operator === '>=') return left >= right ? 1 : 0
    if (operator === '==') return left === right ? 1 : 0
    if (operator === '!=') return left !== right ? 1 : 0
    return null
  }

  // Used by both the read path and the assignment path - a constant index is
  // bounds-checked wherever it appears.
  const checkIndex = (symbol: MomoSymbol, index: Expression) => {
    if (symbol.kind !== 'array') return

    const resolved = resolveExpression(index)
    if (resolved.type === 'bool') {
      raise(index, 'array index must be numeric')
    }
    if (symbol.dynamic) return
    if (resolved.value !== null && (resolved.value < 0 || resolved.value >= symbol.length)) {
      raise(index, `index ${resolved.value} is out of bounds for "${symbol.name}" (length ${symbol.length})`,
      )
    }
  }

  // Deep-clones a const's body, replacing parameter references with the caller's
  // argument expressions. Generic rather than per-node-type, so a new expression
  // kind cannot silently be missed.
  const substitute = (node: Expression, bindings: Map<string, Expression>): Expression => {
    if (node.type === 'Identifier') {
      const bound = bindings.get(node.name)
      if (bound) return bound
    }

    const clone: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        clone[key] = value.map((item) =>
          isExpression(item) ? substitute(item, bindings) : item,
        )
        continue
      }
      clone[key] = isExpression(value) ? substitute(value, bindings) : value
    }

    return clone as Expression
  }

  // True when evaluating this expression can run user code, and therefore write
  // globals. Only a fn call can; consts substitute to pure expressions.
  const hasEffects = (node: Expression): boolean => {
    if (node.type === 'CallExpression') {
      const symbol = lookup(node.callee.name)
      if (symbol && symbol.kind === 'routine') return true
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) if (isExpression(item) && hasEffects(item)) return true
        continue
      }
      if (isExpression(value) && hasEffects(value)) return true
    }
    return false
  }

  const countUses = (node: Expression, name: string): number => {
    if (node.type === 'Identifier') return node.name === name ? 1 : 0

    let total = 0
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) if (isExpression(item)) total += countUses(item, name)
        continue
      }
      if (isExpression(value)) total += countUses(value, name)
    }
    return total
  }

  const checkArguments = (
    node: { args: Expression[]; file: string; line: number; col: number },
    symbol: MomoSymbol & { kind: 'routine' | 'constfn' },
  ) => {
    if (node.args.length !== symbol.params.length) {
      raise(
        node,
        `"${symbol.name}" takes ${symbol.params.length} argument(s), got ${node.args.length}`,
      )
    }

    for (let i = 0; i < node.args.length; i++) {
      const argument = resolveExpression(node.args[i])
      checkAssignable(argument, symbol.params[i].type, node.args[i])
    }
  }

  const resolveCall = (node: Expression): Resolved => {
    if (node.type !== 'CallExpression') raise(node, 'internal: not a call')

    const symbol = lookup(node.callee.name)
    if (!symbol) raise(node, `"${node.callee.name}" is not declared`)

    if (symbol.kind === 'routine') {
      // A sub is a routine with no return type, so one message covers both.
      if (!symbol.returnType) {
        raise(node, `"${symbol.name}" returns nothing - call it as a statement`)
      }
      node.callee.label = symbol.label
      checkArguments(node, symbol)
      return annotate(node, { type: symbol.returnType, value: null })
    }

    if (symbol.kind !== 'constfn') raise(node, `"${node.callee.name}" is not callable`)

    node.callee.label = symbol.label

    if (expanding.has(symbol.name)) {
      raise(node, `const "${symbol.name}" cannot be recursive - it is substituted, not called`)
    }

    // Arguments resolve in the CALLER's scope, before substitution.
    checkArguments(node, symbol)

    const bindings = new Map<string, Expression>()
    for (let i = 0; i < node.args.length; i++) {
      // Substitution duplicates the argument wherever the parameter appears. That
      // is harmless for a pure expression, but would call a fn twice.
      if (countUses(symbol.body, symbol.params[i].name) > 1 && hasEffects(node.args[i])) {
        raise(
          node.args[i],
          `argument to "${symbol.name}" calls a fn, and parameter "${symbol.params[i].name}"` +
            ' is used more than once - assign it to a variable first',
        )
      }
      bindings.set(symbol.params[i].name, node.args[i])
    }

    let expansion = substitute(symbol.body, bindings)

    // A declared return type narrows exactly like an assignment target does.
    if (symbol.returnType) {
      expansion = {
        type: 'CastExpression',
        to: symbol.returnType as TypeName,
        argument: expansion,
        file: node.file,
        line: node.line,
        col: node.col,
      }
    }

    expanding.add(symbol.name)
    const resolved = resolveExpression(expansion)
    expanding.delete(symbol.name)

    node.expansion = expansion
    return annotate(node, resolved)
  }

  const resolveExpression = (node: Expression): Resolved => {
    if (node.type === 'CallExpression') return resolveCall(node)

    if (node.type === 'NumberLiteral') {
      if (naturalType(node.value) === null) {
        raise(node, `literal ${node.value} does not fit in 16 bits`)
      }
      return annotate(node, { type: 'untyped', value: node.value })
    }

    if (node.type === 'BoolLiteral') {
      return annotate(node, { type: 'bool', value: node.value ? 1 : 0 })
    }

    if (node.type === 'StringLiteral') {
      raise(node, 'a string literal may only initialise an array')
    }

    if (node.type === 'ArrayLiteral') {
      raise(node, 'an array literal may only initialise an array')
    }

    if (node.type === 'Identifier') {
      const symbol = lookup(node.name)
      if (!symbol) raise(node, `"${node.name}" is not declared`)

      node.label = symbol.label

      if (symbol.kind === 'const') {
        return annotate(node, { type: symbol.type, value: symbol.value })
      }
      if (symbol.kind === 'var') {
        return annotate(node, { type: symbol.type, value: null })
      }
      if (symbol.kind === 'array') {
        raise(node, `"${node.name}" is an array - index it, or use addr()`)
      }
      if (symbol.kind === 'constfn' || symbol.kind === 'routine') {
        raise(node, `"${node.name}" takes arguments - call it with ${node.name}(...)`)
      }
      raise(node, `"${node.name}" is a sub - call it with ${node.name}()`)
    }

    if (node.type === 'IndexExpression') {
      const symbol = lookup(node.array.name)
      if (!symbol) raise(node, `"${node.array.name}" is not declared`)
      if (symbol.kind !== 'array') {
        raise(node, `"${node.array.name}" is not an array`)
      }

      node.array.label = symbol.label
      checkIndex(symbol, node.index)
      return annotate(node, { type: symbol.elementType, value: null })
    }

    if (node.type === 'AddrExpression') {
      const symbol = lookup(node.target.name)
      if (!symbol) raise(node, `"${node.target.name}" is not declared`)
      if (isSub(symbol)) raise(node, 'addr() does not take a sub')
      if (symbol.kind === 'const' || symbol.kind === 'constfn') {
        raise(node, 'addr() needs storage - a const has none')
      }
      node.target.label = symbol.label
      return annotate(node, { type: 'u16', value: null })
    }

    if (node.type === 'CastExpression') {
      const argument = resolveExpression(node.argument)
      const value = argument.value === null ? null : truncate(argument.value, node.to)
      return annotate(node, { type: node.to, value })
    }

    if (node.type === 'UnaryExpression') {
      const argument = resolveExpression(node.argument)

      if (node.operator === '!') {
        const value = argument.value === null ? null : argument.value === 0 ? 1 : 0
        return annotate(node, { type: 'bool', value })
      }

      if (node.operator === '-') {
        if (argument.type === 'untyped') {
          const value = argument.value === null ? null : -argument.value
          return annotate(node, { type: 'untyped', value })
        }
        // `neg` is bitwise-identical regardless of operand signedness.
        const value = argument.value === null ? null : truncate(-argument.value, 'i16')
        return annotate(node, { type: 'i16', value })
      }

      if (argument.type === 'untyped') {
        const value = argument.value === null ? null : ~argument.value
        return annotate(node, { type: 'untyped', value })
      }

      const type = promote(argument.type)
      const value = argument.value === null ? null : truncate(~argument.value, type)
      return annotate(node, { type, value })
    }

    if (node.type === 'LogicalExpression') {
      const left = resolveExpression(node.left)
      const right = resolveExpression(node.right)
      requireScalar(left, node.left, node.operator)
      requireScalar(right, node.right, node.operator)

      let value: number | null = null
      if (left.value !== null && right.value !== null) {
        const a = left.value !== 0
        const b = right.value !== 0
        value = (node.operator === '&&' ? a && b : a || b) ? 1 : 0
      }

      return annotate(node, { type: 'bool', value })
    }

    if (node.type === 'ConditionalExpression') {
      const test = resolveExpression(node.test)
      requireScalar(test, node.test, '?:')

      const consequent = resolveExpression(node.consequent)
      const alternate = resolveExpression(node.alternate)
      const type = combineOperands(consequent, alternate, '?:', node)

      let value: number | null = null
      if (test.value !== null) value = test.value !== 0 ? consequent.value : alternate.value

      // `runtimeTest ? 1 : 2` - both arms untyped, but the branch is not known.
      const settled = settle(
        type,
        value,
        [consequent.value, alternate.value].filter((v): v is number => v !== null),
      )

      return annotate(node, { type: settled, value })
    }

    // BinaryExpression
    const left = resolveExpression(node.left)
    const right = resolveExpression(node.right)

    if (shiftOps.includes(node.operator)) {
      // The count's type is irrelevant - the result takes the left operand's.
      const tentative = left.type === 'untyped' ? 'untyped' : promote(left.type)
      const value =
        left.value === null || right.value === null
          ? null
          : foldBinary(node.operator, left.value, right.value, node)

      // `1 << n` with a runtime n: the literal settles to its own natural type.
      return annotate(node, {
        type: settle(tentative, value, left.value === null ? [] : [left.value]),
        value,
      })
    }

    const operandType = combineOperands(left, right, node.operator, node)
    const value =
      left.value === null || right.value === null
        ? null
        : foldBinary(node.operator, left.value, right.value, node)

    if (comparisonOps.includes(node.operator)) {
      // Keep what the operands combined to - it decides jb vs jl.
      node.operandType = operandType === 'untyped' ? 'u16' : operandType
      return annotate(node, { type: 'bool', value })
    }

    return annotate(node, { type: operandType, value })
  }

  const requireScalar = (resolved: Resolved, at: Location, what: string) => {
    if (resolved.type === 'untyped') return
    if (resolved.type === 'bool') return
    if (['u8', 'i8', 'u16', 'i16'].includes(resolved.type)) return
    raise(at, `"${what}" needs a scalar operand`)
  }

  // ---- declarations ---------------------------------------------------------

  const foldConstant = (node: Expression, what: string): number => {
    const resolved = resolveExpression(node)
    if (resolved.value === null) raise(node, `${what} must be a constant`)
    return resolved.value
  }

  // Element type of an array const with no declared type: the smallest type
  // holding every value. Unlike arithmetic this does NOT promote to 16 bits -
  // an array of small values should occupy one byte per element, not two.
  const inferElementType = (values: number[], at: Location): ValueType => {
    let min = 0
    let max = 0

    for (const value of values) {
      if (naturalType(value) === null) raise(at, `value ${value} does not fit in 16 bits`)
      min = Math.min(min, value)
      max = Math.max(max, value)
    }

    if (min >= 0 && max <= 255) return 'u8'
    if (min >= -128 && max <= 127) return 'i8'
    if (min >= 0 && max <= 65535) return 'u16'
    if (min >= -32768 && max <= 32767) return 'i16'
    raise(at, 'array values do not share a common type')
  }

  const arrayValuesFrom = (init: Expression | null, elementType: ValueType | null): number[] => {
    if (!init) return []

    if (init.type === 'StringLiteral') {
      const values: number[] = []
      for (const ch of init.value) values.push(ch.charCodeAt(0))
      return values
    }

    if (init.type !== 'ArrayLiteral') {
      raise(init, 'an array must be initialised with an array or string literal')
    }

    const values: number[] = []
    for (const element of init.elements) {
      const value = foldConstant(element, 'array element')
      if (elementType && !fits(value, elementType)) {
        raise(element, `value ${value} does not fit in ${elementType}`)
      }
      values.push(value)
    }
    return values
  }

  const declareArray = (
    name: string,
    typeNode: TypeNode,
    init: Expression | null,
    readonly: boolean,
    at: Location,
  ) => {
    const elementType = typeNode.name
    const values = arrayValuesFrom(init, elementType)

    let length: number
    if (typeNode.size) {
      length = foldConstant(typeNode.size, 'array size')
      if (length <= 0) raise(typeNode.size, 'array size must be positive')
      if (values.length > length) {
        raise(at, `${values.length} initialisers for an array of ${length}`)
      }
    } else {
      if (!init) raise(at, `"${name}" needs either a size or an initialiser`)
      length = values.length
    }

    while (values.length < length) values.push(0)

    declare(
      {
        kind: 'array', name, label: labelFor(name), elementType,
        length, readonly, values, dynamic: false,
      },
      at,
    )
  }

  // `atTopLevel` is true only for the program's own statement sequence - not for
  // a routine body, and not for a block nested in one. An initialiser is a
  // load-time value: it is written into the data section and never executed, so
  // it is only honest where "before the program runs" and "when control reaches
  // this line" are the same moment. Anywhere else it silently runs once, no
  // matter how many times control arrives.
  //
  // This covers arrays with the same rule rather than an exception, which is the
  // point: with no `rep movsb` in the 8086 subset there is no cheap way to
  // re-initialise an array, so load-time is the only thing an array initialiser
  // could ever be.
  const resolveVariableDeclaration = (node: Statement, atTopLevel: boolean) => {
    if (node.type !== 'VariableDeclaration') return

    if (!atTopLevel && node.init) {
      raise(
        node.init,
        'an initialiser here would run once at load, not each time control reaches it' +
          ` - declare "${node.name}" on its own, then assign to it`,
      )
    }

    if (node.typeNode.array) {
      node.label = labelFor(node.name)
      declareArray(node.name, node.typeNode, node.init, false, node)
      return
    }

    // A constant initialiser becomes the storage's initial value in the data
    // section; a non-constant one becomes code at the point of declaration.
    let init = 0
    if (node.init) {
      const value = resolveExpression(node.init)
      checkAssignable(value, node.typeNode.name, node.init)
      if (value.value !== null) init = truncate(value.value, node.typeNode.name)
    }

    node.label = labelFor(node.name)
    declare(
      {
        kind: 'var',
        name: node.name,
        label: node.label,
        type: node.typeNode.name,
        builtin: false,
        init,
      },
      node,
    )
  }

  const resolveConstFunctionDeclaration = (node: ConstFunctionDeclaration) => {
    const seen = new Set<string>()
    for (const parameter of node.params) {
      if (seen.has(parameter.name)) {
        raise(parameter, `duplicate parameter "${parameter.name}"`)
      }
      seen.add(parameter.name)
    }

    declare(
      {
        kind: 'constfn',
        name: node.name,
        label: labelFor(node.name),
        params: node.params.map((parameter) => ({
          name: parameter.name,
          type: parameter.typeNode.name,
        })),
        returnType: node.returnType,
        body: node.body,
      },
      node,
    )
  }

  const resolveConstDeclaration = (node: Statement) => {
    if (node.type !== 'ConstDeclaration') return

    const isArrayInit = node.init.type === 'ArrayLiteral' || node.init.type === 'StringLiteral'

    if (node.typeNode?.array || isArrayInit) {
      if (node.typeNode?.array) {
        declareArray(node.name, node.typeNode, node.init, true, node)
        return
      }

      const values = arrayValuesFrom(node.init, null)
      const elementType = inferElementType(values, node)
      declare(
        {
          kind: 'array',
          name: node.name,
          label: labelFor(node.name),
          elementType,
          length: values.length,
          readonly: true,
          values,
          dynamic: false,
        },
        node,
      )
      return
    }

    // A scalar const is a named literal: untyped, no storage, emitted as `equ`.
    const value = foldConstant(node.init, 'const initialiser')
    const declaredType = node.typeNode ? node.typeNode.name : 'untyped'

    if (node.typeNode && !fits(value, node.typeNode.name)) {
      raise(node.init, `value ${value} does not fit in ${node.typeNode.name}`)
    }

    declare(
      { kind: 'const', name: node.name, label: labelFor(node.name), type: declaredType, value },
      node,
    )
  }

  // ---- statements -----------------------------------------------------------

  const checkAssignable = (
    value: Resolved,
    target: ValueType,
    at: Location,
  ) => {
    if (value.type === 'untyped') {
      if (value.value !== null && !fits(value.value, target) && target !== 'bool') {
        // Permitted - DESIGN.md makes narrowing implicit at assignment - but
        // worth being loud about when we can see it at compile time.
        if (!fits(truncate(value.value, target), target)) {
          raise(at, `value ${value.value} does not fit in ${target}`)
        }
      }
      return
    }
    if (value.type === 'bool' || target === 'bool') return
    // Everything else narrows implicitly on assignment.
  }

  const resolveLValue = (target: LValue): Resolved => {
    if (target.type === 'Identifier') {
      const symbol = lookup(target.name)
      if (!symbol) raise(target, `"${target.name}" is not declared`)
      if (symbol.kind === 'const') {
        raise(target, `"${target.name}" is a const and cannot be assigned`)
      }
      if (isSub(symbol)) raise(target, `"${target.name}" is a sub`)
      if (symbol.kind === 'routine') raise(target, `"${target.name}" is a fn`)
      if (symbol.kind === 'constfn') raise(target, `"${target.name}" is a const`)
      if (symbol.kind === 'array') {
        raise(target, `"${target.name}" is an array - assign to an element`)
      }
      target.label = symbol.label
      return annotate(target, { type: symbol.type, value: null })
    }

    const symbol = lookup(target.array.name)
    if (!symbol) raise(target, `"${target.array.name}" is not declared`)
    if (symbol.kind !== 'array') raise(target, `"${target.array.name}" is not an array`)
    if (symbol.readonly) {
      raise(target, `"${target.array.name}" is a const array and cannot be assigned`)
    }
    target.array.label = symbol.label
    checkIndex(symbol, target.index)
    return annotate(target, { type: symbol.elementType, value: null })
  }

  const resolveStatement = (node: Statement) => {
    // Everything reaching resolveStatement is nested: a routine body, or a block
    // inside one - or inside a top-level loop, which is the original case.
    if (node.type === 'VariableDeclaration') return resolveVariableDeclaration(node, false)
    if (node.type === 'ConstFunctionDeclaration') {
      raise(node, 'a parameterised const must be declared at the top level')
    }
    if (node.type === 'ConstDeclaration') return resolveConstDeclaration(node)

    if (node.type === 'RoutineDeclaration') {
      raise(node, 'routines cannot be nested')
    }

    if (node.type === 'BlockStatement') {
      for (const statement of node.body) resolveStatement(statement)
      return
    }

    if (node.type === 'AssignmentStatement') {
      const target = resolveLValue(node.target)
      const value = resolveExpression(node.value)

      if (node.operator === '=') {
        checkAssignable(value, target.type, node.value)
        return
      }

      // `arr[i] op= e` loads through the index and stores through it again, so a
      // call in the index would run twice - and could even land on a different
      // element the second time. Plain `=` and `++` evaluate it once and are fine.
      if (node.target.type === 'IndexExpression' && hasEffects(node.target.index)) {
        raise(
          node.target.index,
          `"${node.operator}" evaluates the index twice, and this one calls a fn` +
            ' - assign the index to a variable first',
        )
      }

      // `x op= e` is `x = x op e`, so the mixing rule applies to the pair.
      const operator = node.operator.slice(0, -1)
      if (shiftOps.includes(operator)) return
      combineOperands(target, value, operator, node)
      return
    }

    if (node.type === 'UpdateStatement') {
      const target = resolveLValue(node.target)
      if (target.type === 'bool') {
        raise(node, `cannot apply "${node.operator}" to a bool`)
      }
      return
    }

    if (node.type === 'CallStatement') {
      const symbol = lookup(node.callee.name)
      if (!symbol) raise(node, `"${node.callee.name}" is not declared`)
      if (symbol.kind === 'routine') {
        node.callee.label = symbol.label
        checkArguments(node, symbol)
        return
      }
      if (!isSub(symbol)) raise(node, `"${node.callee.name}" is not a sub`)
      if (node.args.length > 0) raise(node, 'subs take no arguments')
      node.callee.label = symbol.label
      return
    }

    if (node.type === 'IfStatement') {
      const test = resolveExpression(node.test)
      requireScalar(test, node.test, 'if')
      resolveStatement(node.consequent)
      if (node.alternate) resolveStatement(node.alternate)
      return
    }

    if (node.type === 'ForStatement') {
      if (node.init) resolveStatement(node.init)
      if (node.test) {
        const test = resolveExpression(node.test)
        requireScalar(test, node.test, 'for')
      }
      if (node.update) resolveStatement(node.update)
      loopDepth += 1
      resolveStatement(node.body)
      loopDepth -= 1
      return
    }

    if (node.type === 'WhileStatement' || node.type === 'DoWhileStatement') {
      const test = resolveExpression(node.test)
      requireScalar(test, node.test, node.type === 'WhileStatement' ? 'while' : 'do while')
      loopDepth += 1
      resolveStatement(node.body)
      loopDepth -= 1
      return
    }

    if (node.type === 'BreakStatement' || node.type === 'ContinueStatement') {
      if (loopDepth === 0) {
        const word = node.type === 'BreakStatement' ? 'break' : 'continue'
        raise(node, `"${word}" is only valid inside a loop`)
      }
      return
    }

    if (node.type === 'ReturnStatement') {
      if (!subName) raise(node, '"return" is only valid inside a sub or fn')

      if (!node.argument) {
        if (currentFn && currentFn.returnType) {
          raise(node, `"${currentFn.name}" returns ${currentFn.returnType} - "return" needs a value`)
        }
        return
      }

      // `currentFn` is set for the whole of any routine body, and a bare
      // `return` outside one is already rejected above - so the only way here
      // is a sub, which by definition has no return type.
      if (!currentFn || !currentFn.returnType) {
        raise(node, `"${subName}" is a sub - "return" is an early exit and carries no value`)
      }

      const value = resolveExpression(node.argument)
      checkAssignable(value, currentFn.returnType, node.argument)
      return
    }

    if (node.type === 'IntStatement') return
  }

  // ---- reachability ---------------------------------------------------------
  //
  // Anything following a statement that never falls through cannot run. Momo has
  // no preprocessor, no goto and no labels, so there is no shape where this is
  // deliberate - it is always either a typo or a misunderstanding of the control
  // flow, and the same reasoning that makes recursion an error applies. Momo has
  // no warnings to downgrade it to in any case.

  const whyStopped = (statement: Statement): string => {
    if (statement.type === 'ReturnStatement') return 'the "return" above always exits'
    if (statement.type === 'BreakStatement') return 'the "break" above always jumps'
    if (statement.type === 'ContinueStatement') return 'the "continue" above always jumps'
    if (
      statement.type === 'ForStatement' ||
      statement.type === 'WhileStatement' ||
      statement.type === 'DoWhileStatement'
    ) {
      return 'the loop above never ends'
    }
    return 'nothing above it can fall through'
  }

  // Nested bodies are checked before the statement itself is judged, so the
  // innermost - and therefore earliest - unreachable statement is the one
  // reported.
  const checkReachableWithin = (statement: Statement) => {
    if (statement.type === 'BlockStatement') return checkReachable(statement.body)
    if (statement.type === 'IfStatement') {
      checkReachableWithin(statement.consequent)
      if (statement.alternate) checkReachableWithin(statement.alternate)
      return
    }
    if (statement.type === 'ForStatement') return checkReachableWithin(statement.body)
    if (statement.type === 'WhileStatement') return checkReachableWithin(statement.body)
    if (statement.type === 'DoWhileStatement') return checkReachableWithin(statement.body)
  }

  const checkReachable = (statements: Statement[]) => {
    for (let i = 0; i < statements.length; i++) {
      checkReachableWithin(statements[i])
      if (fallsThrough(statements[i])) continue

      const next = statements[i + 1]
      if (next) raise(next, `unreachable code - ${whyStopped(statements[i])}`)
      return
    }
  }

  // Parameters and the return value become mangled globals. Nothing else in the
  // execution model changes: no frame, no BP, no recursion.
  const declareRoutine = (node: RoutineDeclaration) => {
    const seen = new Set<string>()
    const params: { name: string; label: string; type: ValueType }[] = []

    for (const parameter of node.params) {
      if (seen.has(parameter.name)) raise(parameter, `duplicate parameter "${parameter.name}"`)
      seen.add(parameter.name)
      params.push({
        name: parameter.name,
        label: `${safeLabel(node.name)}__${parameter.name}`,
        type: parameter.typeNode.name,
      })
    }

    const retLabel = node.returnType ? `${safeLabel(node.name)}__ret` : null

    declare(
      {
        kind: 'routine',
        name: node.name,
        label: safeLabel(node.name),
        params,
        returnType: node.returnType,
        retLabel,
      },
      node,
    )

    for (const parameter of params) {
      symbols.push({
        kind: 'var',
        name: parameter.label,
        label: parameter.label,
        type: parameter.type,
        builtin: false,
        init: 0,
        owner: node.name,
      })
    }

    if (retLabel && node.returnType) {
      symbols.push({
        kind: 'var',
        name: retLabel,
        label: retLabel,
        type: node.returnType,
        builtin: false,
        init: 0,
        owner: node.name,
      })
    }
  }

  const resolveRoutine = (node: RoutineDeclaration) => {
    const symbol = globals.get(node.name)
    if (!symbol || symbol.kind !== 'routine') raise(node, 'internal: routine not declared')

    subName = node.name
    locals = new Map()
    loopDepth = 0
    currentFn = symbol

    // Parameters are in scope as ordinary variables, backed by their globals.
    for (const parameter of symbol.params) {
      locals.set(parameter.name, {
        kind: 'var',
        name: parameter.name,
        label: parameter.label,
        type: parameter.type,
        builtin: false,
        init: 0,
        owner: node.name,
      })
    }

    for (const statement of node.body.body) resolveStatement(statement)

    // After resolution, so a loop test carries the folded constant that makes
    // `while (true)` recognisable as endless.
    checkReachable(node.body.body)

    // Every path must reach a `return`, not merely some path. Falling off the
    // end would `ret` with the return slot holding whatever the last call left
    // there - a wrong answer with no diagnostic anywhere.
    if (symbol.returnType && !alwaysReturns(node.body)) {
      raise(
        node,
        `"${node.name}" returns ${symbol.returnType} but can end without returning a value`,
      )
    }

    currentFn = null
    locals = null
    subName = null
  }

  // ---- pass 1: top-level declarations ---------------------------------------

  for (const statement of program.body) {
    if (statement.type === 'RoutineDeclaration') {
      declareRoutine(statement)
      continue
    }
    if (statement.type === 'ConstFunctionDeclaration') {
      resolveConstFunctionDeclaration(statement)
      continue
    }
    if (statement.type === 'ConstDeclaration') {
      resolveConstDeclaration(statement)
      continue
    }
    if (statement.type === 'VariableDeclaration') {
      resolveVariableDeclaration(statement, true)
      continue
    }
  }

  // ---- pass 2: bodies and top-level statements ------------------------------

  for (const statement of program.body) {
    if (statement.type === 'RoutineDeclaration') {
      resolveRoutine(statement)
      continue
    }
    if (statement.type === 'ConstDeclaration') continue
    if (statement.type === 'ConstFunctionDeclaration') continue
    if (statement.type === 'VariableDeclaration') continue
    resolveStatement(statement)
  }

  // Top-level statements are the entry point, so the same rule applies to them.
  // Declarations fall through by default, so a routine sitting between two
  // statements does not break the chain - and its own body was checked as it
  // was resolved.
  checkReachable(program.body)

  // Last, so that undefined-sub errors surface before graph shape ones.
  return { program, symbols, callGraph: buildCallGraph(program) }
}
