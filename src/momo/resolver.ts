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
  FarAddress,
  FarDeclaration,
  GroupDeclaration,
  Identifier,
  RoutineDeclaration,
  TypeName,
  LValue,
  Program,
  Statement,
  TypeNode,
  ViewDeclaration,
} from './ast.js'
import { alwaysReturns, buildCallGraph, fallsThrough, type CallGraph } from './analysis.js'
import { raise, type Location } from './diagnostics.js'
import {
  combineRanges,
  fits,
  isSigned,
  naturalType,
  promote,
  rangeOf,
  truncate,
  widthOf,
  type Range,
  type ValueType,
} from './types.js'

// A view's storage belongs to something else: the label is `parent + offset`,
// which the emitter writes as an `equ`. Carried by the `array` and `var` kinds
// rather than being a kind of its own, because a view of an array IS an array -
// indexing, bounds checks, `len` and `addr` all want to treat it as one, and a
// separate kind would mean a case in every one of them.
//
// `parent` is a label rather than a name: what an alias needs is the thing that
// gets emitted, and a chain of views collapses to one offset from real storage.
export type Alias = { parent: string; byteOffset: number }

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
      alias?: Alias
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
      // `_cf` reports what the machine did; there is nothing to say back to it.
      readonly?: boolean
      // Builtins are normally emitted whether used or not, because the int
      // helpers reference the registers unconditionally. `_cf` is captured only
      // when something reads it, so a program that ignores carry pays nothing.
      onlyIfUsed?: boolean
      // A scalar view, or a register byte alias: no storage of its own.
      alias?: Alias
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
  // A window onto memory in another segment. Emits no storage: the segment and
  // offset bake into the instructions.
  //
  // `segment` records where the value COMES FROM rather than what it is, which
  // is what lets a runtime segment be added without disturbing anything that
  // reads this - see §16.
  | {
      kind: 'far'
      name: string
      label: string
      elementType: ValueType
      length: number | null // null when unsized: no bounds checks, as for `u8[]`
      readonly: boolean
      segment: { from: 'const'; value: number } | { from: 'var'; label: string }
      offset: number
    }
  // Namespacing over structure-of-arrays. The group itself has no storage - it
  // holds the field globals, which are ordinary arrays (or plain variables for
  // the single-instance form) and are what actually gets emitted and pruned.
  | {
      kind: 'group'
      name: string
      label: string
      count: number | null // null is the single-instance form: no index
      fields: { name: string; symbol: MomoSymbol }[]
    }

export type ResolveResult = {
  program: Program
  symbols: MomoSymbol[]
  callGraph: CallGraph
}

// The reserved globals are the machine registers. A byte half is a scalar view
// of the word storage - the same alias the language now spells `view`, which is
// why these carry it as data rather than the emitter reconstructing it from the
// spelling of the label. Little-endian, so the low byte is at offset 0.
const low = (register: string): Alias => ({ parent: register, byteOffset: 0 })
const high = (register: string): Alias => ({ parent: register, byteOffset: 1 })

const reservedGlobals: {
  name: string
  type: ValueType
  readonly?: boolean
  onlyIfUsed?: boolean
  alias?: Alias
}[] = [
  { name: '_ax', type: 'u16' },
  { name: '_al', type: 'u8', alias: low('_ax') }, { name: '_ah', type: 'u8', alias: high('_ax') },
  { name: '_bx', type: 'u16' },
  { name: '_bl', type: 'u8', alias: low('_bx') }, { name: '_bh', type: 'u8', alias: high('_bx') },
  { name: '_cx', type: 'u16' },
  { name: '_cl', type: 'u8', alias: low('_cx') }, { name: '_ch', type: 'u8', alias: high('_cx') },
  { name: '_dx', type: 'u16' },
  { name: '_dl', type: 'u8', alias: low('_dx') }, { name: '_dh', type: 'u8', alias: high('_dx') },
  { name: '_si', type: 'u16' }, { name: '_di', type: 'u16' },
  // Storage for _hsize sits in the heap block; NASM computes its value.
  { name: '_hsize', type: 'u16' },
  // The carry flag after the most recent `int` - how DOS and BIOS report
  // failure. `bool` rather than u8 both because that is what it is and because
  // it is what tells the emitter this one is real storage rather than a byte
  // view of a register (every u8 reserved global is an alias by construction).
  { name: '_cf', type: 'bool', readonly: true, onlyIfUsed: true },
]

// The heap is everything past the program image. No storage is emitted - these
// are addresses, and NASM computes the size from them.
const heapGlobals: MomoSymbol[] = [
  {
    kind: 'array', name: '_heap', label: '_heap', elementType: 'u8',
    length: 0, readonly: false, values: [], dynamic: true,
  },
  // The same bytes as `_heap`, indexed as words. An alias of offset 0, so it is
  // the degenerate view - and now says so rather than being a line of hardcoded
  // NASM in the emitter.
  {
    kind: 'array', name: '_heapw', label: '_heapw', elementType: 'u16',
    length: 0, readonly: false, values: [], dynamic: true,
    alias: { parent: '_heap', byteOffset: 0 },
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

  // Most labels come from a declared name, and the scope checks in `declare`
  // keep those unique. Routine slots (`add__a`) and group fields (`mob__x`) are
  // *manufactured*, so nothing else compares them - and two symbols sharing a
  // label emits the same NASM definition twice. Claimed from both sides, so the
  // clash is caught whichever was written first.
  const takenLabels = new Set<string>()

  const claimLabel = (label: string, at: Location, what: string) => {
    if (takenLabels.has(label)) {
      raise(at, `${what} would emit a second "${label}" - rename one of them`)
    }
    takenLabels.add(label)
  }

  for (const reserved of reservedGlobals) {
    const symbol: MomoSymbol = {
      kind: 'var',
      name: reserved.name,
      label: reserved.name,
      type: reserved.type,
      builtin: true,
      init: 0,
      readonly: reserved.readonly,
      onlyIfUsed: reserved.onlyIfUsed,
      alias: reserved.alias,
    }
    globals.set(reserved.name, symbol)
    takenLabels.add(symbol.label)
    symbols.push(symbol)
  }

  for (const symbol of heapGlobals) {
    globals.set(symbol.name, symbol)
    takenLabels.add(symbol.label)
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
    // Groups are claimed too. One emits no storage, but it still occupies the
    // emitter's label->symbol map, so `group a__b` alongside `group a { u8 b }`
    // would have a field access find the group instead of its array.
    claimLabel(symbol.label, at, `"${symbol.name}"`)
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
  // `shownAs` overrides the name in the message. A group field's symbol is named
  // for its label, so without this `mob[9].x` would report against "mob__x" -
  // a name the source never mentions.
  const checkIndex = (symbol: MomoSymbol, index: Expression, shownAs?: string) => {
    // null means indexable but with no compile-time length: the heap, and a far
    // region declared without a size. Both still type-check the index.
    let length: number | null
    if (symbol.kind === 'array') length = symbol.dynamic ? null : symbol.length
    else if (symbol.kind === 'far') length = symbol.length
    else return

    const resolved = resolveExpression(index)
    if (resolved.type === 'bool') {
      raise(index, 'array index must be numeric')
    }
    if (length === null) return
    if (resolved.value !== null && (resolved.value < 0 || resolved.value >= length)) {
      raise(index, `index ${resolved.value} is out of bounds for "${shownAs ?? symbol.name}" (length ${length})`,
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
      if (node.field !== undefined) return annotate(node, resolveGroupField(node, null))

      const symbol = lookup(node.name)
      if (!symbol) raise(node, `"${node.name}" is not declared`)

      // A group denotes nothing on its own - there is no record for it to be.
      if (symbol.kind === 'group') {
        const example = symbol.fields[0]?.name ?? 'field'
        const shape = symbol.count === null ? `${node.name}.${example}` : `${node.name}[i].${example}`
        raise(node, `"${node.name}" is a group - name a field, like "${shape}"`)
      }

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
      if (symbol.kind === 'far') {
        raise(node, `"${node.name}" is a far region - index it`)
      }
      if (symbol.kind === 'constfn' || symbol.kind === 'routine') {
        raise(node, `"${node.name}" takes arguments - call it with ${node.name}(...)`)
      }
      raise(node, `"${node.name}" is a sub - call it with ${node.name}()`)
    }

    if (node.type === 'IndexExpression') {
      if (node.array.field !== undefined) {
        return annotate(node, resolveGroupField(node.array, node.index))
      }

      const symbol = lookup(node.array.name)
      if (!symbol) raise(node, `"${node.array.name}" is not declared`)

      // A far region indexes exactly like an array; only the emitter cares that
      // the address is in another segment.
      if (symbol.kind === 'far') {
        node.array.label = symbol.label
        checkIndex(symbol, node.index)
        return annotate(node, { type: symbol.elementType, value: null })
      }

      if (symbol.kind !== 'array') {
        raise(node, `"${node.array.name}" is not an array`)
      }

      node.array.label = symbol.label
      checkIndex(symbol, node.index)
      return annotate(node, { type: symbol.elementType, value: null })
    }

    if (node.type === 'PeekExpression') {
      checkAddress(node.address, node.width === 1 ? 'peek8' : 'peek16')
      return annotate(node, { type: node.width === 1 ? 'u8' : 'u16', value: null })
    }

    if (node.type === 'AddrExpression') {
      const symbol = lookup(node.target.name)
      if (!symbol) raise(node, `"${node.target.name}" is not declared`)
      if (isSub(symbol)) raise(node, 'addr() does not take a sub')
      if (symbol.kind === 'const' || symbol.kind === 'constfn') {
        raise(node, 'addr() needs storage - a const has none')
      }
      // addr() yields an offset in OUR segment, which a far region has none of.
      if (symbol.kind === 'far') {
        raise(node, `addr() has no meaning for "${node.target.name}" - it is in another segment`)
      }
      node.target.label = symbol.label
      return annotate(node, { type: 'u16', value: null })
    }

    if (node.type === 'LenExpression') {
      const symbol = lookup(node.target.name)
      if (!symbol) raise(node, `"${node.target.name}" is not declared`)

      // On a group it is the instance count (§19). The single-instance form has
      // none: asking for its length mistakes which form you are holding, and
      // answering 1 would compile a loop that reads as iteration and is not.
      if (symbol.kind === 'group') {
        if (symbol.count === null) {
          raise(
            node,
            `group "${node.target.name}" has a single instance, so len() has nothing to` +
              ' count - it is only for the indexed form',
          )
        }
        return annotate(node, { type: 'untyped', value: symbol.count })
      }

      // A far region has a length only when one was declared - it is an
      // assertion about hardware, not something the compiler can measure.
      if (symbol.kind === 'far') {
        if (symbol.length === null) {
          raise(
            node,
            `far region "${node.target.name}" was declared without a size, so len() has` +
              ' nothing to report - give it one',
          )
        }
        return annotate(node, { type: 'untyped', value: symbol.length })
      }

      if (symbol.kind !== 'array') {
        raise(node, `len() needs an array - "${node.target.name}" is not one`)
      }

      // The heap is whatever is left over once the image is sized, which NASM
      // works out at assembly time - there is no compile-time length to fold to.
      if (symbol.dynamic) {
        raise(
          node,
          `len() has no answer for "${node.target.name}" - the heap has no compile-time` +
            ' length; use _hsize, which NASM computes',
        )
      }

      // Deliberately no `node.target.label`. Unlike addr(), len() needs no
      // storage, so asking for a length must not be what keeps an otherwise
      // unused array in the output.
      return annotate(node, { type: 'untyped', value: symbol.length })
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
      // The result is one of the arms, not arithmetic over them - so two bool
      // arms stay bool, where range combination would promote to u16 and make
      // `b = flag ? a : b` fail the bool assignment rule for no reason.
      const type: ValueType =
        consequent.type === 'bool' && alternate.type === 'bool'
          ? 'bool'
          : combineOperands(consequent, alternate, '?:', node)

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

  // A segment is a compile-time constant, or a `u16` variable read at each
  // access. An offset is always compile-time: it folds into the displacement of
  // an addressing mode we already emit, so it costs nothing.
  const resolveFarAddress = (
    node: FarAddress,
    what: 'segment' | 'offset',
  ): { from: 'const'; value: number } | { from: 'var'; label: string } => {
    if (node.type === 'Identifier') {
      const symbol = lookup(node.name)
      if (!symbol) raise(node, `"${node.name}" is not declared`)

      if (symbol.kind === 'const') return { from: 'const', value: symbol.value }

      if (symbol.kind === 'var') {
        if (what === 'offset') {
          raise(node, 'a far offset must be constant - it folds into the instruction')
        }
        if (symbol.type !== 'u16') {
          raise(node, `a far segment must be u16 - "${node.name}" is ${symbol.type}`)
        }
        // Deliberately NOT `node.label`: the reference is to the variable's
        // storage, read afresh at every access rather than captured here.
        return { from: 'var', label: symbol.label }
      }

      raise(node, `"${node.name}" is not a constant or a u16 variable`)
    }

    return { from: 'const', value: node.value }
  }

  const resolveFarDeclaration = (node: FarDeclaration) => {
    const segment = resolveFarAddress(node.segment, 'segment')
    const offsetSource = node.offset ? resolveFarAddress(node.offset, 'offset') : null
    const offset = offsetSource && offsetSource.from === 'const' ? offsetSource.value : 0

    if (segment.from === 'const' && (segment.value < 0 || segment.value > 0xffff)) {
      raise(node.segment, `segment ${segment.value} does not fit in 16 bits`)
    }
    if (offset < 0 || offset > 0xffff) {
      raise(node.offset ?? node, `offset ${offset} does not fit in 16 bits`)
    }

    let length: number | null = null
    if (node.typeNode.size) {
      length = foldConstant(node.typeNode.size, 'far region size')
      if (length <= 0) raise(node.typeNode.size, 'far region size must be positive')
    }

    node.label = safeLabel(node.name)

    declare(
      {
        kind: 'far',
        name: node.name,
        label: node.label,
        elementType: node.typeNode.name,
        length,
        readonly: node.readonly,
        segment,
        offset,
      },
      node,
    )
  }

  // A view is an alias, so it declares an ordinary symbol carrying one: a view of
  // an array IS an array and a scalar view IS a variable. Nothing downstream of
  // here needs a case for it - only the emitter, which writes an `equ` instead of
  // storage.
  //
  // A view of a far region is the same idea one level out: the offset it needs is
  // already in the far symbol, so adding to it is the whole implementation and
  // the segment comes along for free.
  const resolveViewDeclaration = (node: ViewDeclaration) => {
    const parent = lookup(node.parent.name)
    if (!parent) raise(node.parent, `"${node.parent.name}" is not declared`)

    if (parent.kind !== 'array' && parent.kind !== 'far') {
      raise(
        node.parent,
        `a view needs an array to window onto - "${node.parent.name}" is not one`,
      )
    }

    const parentWidth = widthOf(parent.elementType)
    const ownWidth = widthOf(node.typeNode.name)

    // `bar[25]` on a u16 parent starts at byte 50: the offset is in the parent's
    // elements, consistent with indexing everywhere else.
    const offsetElements = foldConstant(node.offset, 'view offset')
    if (offsetElements < 0) raise(node.offset, 'a view offset cannot be negative')
    const offsetBytes = offsetElements * parentWidth

    // The heap has no compile-time extent, and a far region has one only when it
    // was declared. Both then have nothing to measure a view against.
    const parentLength =
      parent.kind === 'far'
        ? parent.length
        : parent.dynamic
          ? null
          : parent.length
    const parentBytes = parentLength === null ? null : parentLength * parentWidth

    if (parentBytes !== null && offsetBytes >= parentBytes) {
      raise(
        node.offset,
        `offset ${offsetElements} is outside "${node.parent.name}"` +
          ` (length ${parentLength})`,
      )
    }

    let length: number
    if (node.typeNode.size) {
      length = foldConstant(node.typeNode.size, 'view size')
      if (length <= 0) raise(node.typeNode.size, 'view size must be positive')
    } else if (!node.typeNode.array) {
      length = 1 // a scalar view: one element, and no index
    } else if (parentBytes === null) {
      raise(
        node.typeNode,
        `"${node.parent.name}" has no compile-time length, so the rest of it is not a` +
          ' number - give the view a size',
      )
    } else {
      // Rounded down: three u8s left over is not a u16.
      length = Math.floor((parentBytes - offsetBytes) / ownWidth)
      if (length <= 0) {
        raise(
          node.typeNode,
          `nothing is left of "${node.parent.name}" at offset ${offsetElements} to make a` +
            ` ${node.typeNode.name} from`,
        )
      }
    }

    // The extent check §17 is actually for: caught once, where it is written,
    // rather than at every access that runs off the end.
    if (parentBytes !== null && offsetBytes + length * ownWidth > parentBytes) {
      raise(
        node,
        `this view runs off the end of "${node.parent.name}" -` +
          ` ${length} x ${node.typeNode.name} from offset ${offsetElements} needs` +
          ` ${offsetBytes + length * ownWidth} bytes of ${parentBytes}`,
      )
    }

    // A view of a const array is read-only, or the const guarantee is a lie.
    const readonly = node.readonly || parent.readonly

    node.label = safeLabel(node.name)

    // Views of far regions inherit the segment, so §16 composes with this. The
    // far path has no scalar form - `far u16 port` is an error for the same
    // reason - so a scalar view of one has nowhere to land.
    if (parent.kind === 'far') {
      if (!node.typeNode.array) {
        raise(
          node.typeNode,
          `a view of far region "${node.parent.name}" is an array - write` +
            ` "view ${node.typeNode.name}[1] ${node.name} = ${node.parent.name}` +
            `[${offsetElements}]"`,
        )
      }

      declare(
        {
          kind: 'far',
          name: node.name,
          label: node.label,
          elementType: node.typeNode.name,
          length,
          readonly,
          segment: parent.segment,
          offset: parent.offset + offsetBytes,
        },
        node,
      )
      return
    }

    // Views compose, so the offsets add and the parent recorded here is always
    // real storage rather than another alias.
    const alias: Alias = parent.alias
      ? { parent: parent.alias.parent, byteOffset: parent.alias.byteOffset + offsetBytes }
      : { parent: parent.label, byteOffset: offsetBytes }

    if (!node.typeNode.array) {
      declare(
        {
          kind: 'var',
          name: node.name,
          label: node.label,
          type: node.typeNode.name,
          builtin: false,
          init: 0,
          readonly: readonly ? true : undefined,
          alias,
        },
        node,
      )
      return
    }

    declare(
      {
        kind: 'array',
        name: node.name,
        label: node.label,
        elementType: node.typeNode.name,
        length,
        readonly,
        values: [],
        // A view always has a length, even into the heap, where one had to be
        // stated - so unlike `_heap` itself its indices are bounds-checked.
        dynamic: false,
        alias,
      },
      node,
    )
  }

  // Each field becomes its own global - an array when the group has a count, a
  // plain variable when it does not. Structure-of-arrays, so `mob[i].x` needs no
  // multiply: the field offset is folded into the label and the index is used
  // as-is.
  const resolveGroupDeclaration = (node: GroupDeclaration) => {
    let count: number | null = null
    if (node.count) {
      count = foldConstant(node.count, 'group count')
      if (count <= 0) raise(node.count, 'group count must be positive')
    }

    const seen = new Set<string>()
    const fields: { name: string; symbol: MomoSymbol }[] = []

    for (const field of node.fields) {
      if (seen.has(field.name)) {
        raise(field, `duplicate field "${field.name}" in group "${node.name}"`)
      }
      seen.add(field.name)

      const label = `${safeLabel(node.name)}__${field.name}`
      claimLabel(label, field, `field "${field.name}" of group "${node.name}"`)

      const symbol: MomoSymbol =
        count === null
          ? {
              kind: 'var', name: label, label, type: field.typeNode.name,
              builtin: false, init: 0,
            }
          : {
              kind: 'array', name: label, label, elementType: field.typeNode.name,
              length: count, readonly: false, values: new Array<number>(count).fill(0),
              dynamic: false,
            }

      // Pushed straight into the symbol table, never into scope - reachable only
      // as `mob[i].x`, exactly as a routine's parameter slots are reachable only
      // by calling it.
      symbols.push(symbol)
      fields.push({ name: field.name, symbol })
    }

    declare(
      { kind: 'group', name: node.name, label: safeLabel(node.name), count, fields },
      node,
    )
  }

  // `mob[i].x` and `player.x`. Writes the field's label onto the identifier,
  // after which the node is an ordinary index or load and the emitter never
  // learns a group was involved.
  const resolveGroupField = (target: Identifier, index: Expression | null): Resolved => {
    const symbol = lookup(target.name)
    if (!symbol) raise(target, `"${target.name}" is not declared`)
    if (symbol.kind !== 'group') raise(target, `"${target.name}" is not a group`)

    const entry = symbol.fields.find((candidate) => candidate.name === target.field)
    if (!entry) {
      raise(target, `"${target.field}" is not a field of group "${symbol.name}"`)
    }

    if (symbol.count === null && index !== null) {
      raise(target, `group "${symbol.name}" has a single instance - write "${symbol.name}.${entry.name}"`)
    }
    if (symbol.count !== null && index === null) {
      raise(
        target,
        `group "${symbol.name}" has ${symbol.count} instances - write` +
          ` "${symbol.name}[i].${entry.name}"`,
      )
    }

    target.label = entry.symbol.label

    if (index !== null) checkIndex(entry.symbol, index, `${symbol.name}[].${entry.name}`)

    if (entry.symbol.kind === 'array') return { type: entry.symbol.elementType, value: null }
    if (entry.symbol.kind === 'var') return { type: entry.symbol.type, value: null }
    raise(target, 'internal: group field is not storage')
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

  // An address is a u16 offset in our own segment. Signed types are rejected
  // outright rather than allowed to widen: a negative offset is never meaningful,
  // and §4's rule is that u16 does not mix with signed, so an i16 address would
  // have to be cast somewhere anyway - better at the call than silently here.
  const checkAddress = (node: Expression, what: string) => {
    const resolved = resolveExpression(node)

    if (resolved.type === 'bool') {
      raise(node, `${what} needs an address - a bool is not one`)
    }
    if (isSigned(resolved.type)) {
      raise(
        node,
        `${what} needs a u16 address - this is ${resolved.type}, so write u16(...)` +
          ' if the value really is an offset',
      )
    }
    if (resolved.type === 'untyped' && resolved.value !== null && !fits(resolved.value, 'u16')) {
      raise(node, `address ${resolved.value} does not fit in 16 bits`)
    }
  }

  const checkAssignable = (
    value: Resolved,
    target: ValueType,
    at: Location,
  ) => {
    if (value.type === 'untyped') {
      // A constant we can already see is a different case from the implicit
      // narrowing §4 allows. That rule is about RUNTIME values, where writing
      // `u8 y` is the programmer stating the value is small; there is nothing to
      // state about a literal whose value is right there. `u8 x = 300` has no
      // use as anything but a typo, and `u8(300)` says it deliberately.
      //
      // A bool target takes the same rule: its range is {0, 1}, so `b = 1` is
      // fine and `b = 2` does not fit.
      if (value.value !== null && !fits(value.value, target)) {
        raise(
          at,
          `value ${value.value} does not fit in ${target}` +
            ` - write ${target}(${value.value}) if the truncation is deliberate`,
        )
      }
      return
    }

    // A bool only takes a bool. The store is a raw byte - no normalisation is
    // emitted - so admitting a scalar would let a bool hold 2, where `if (b)`
    // says true and `b == true` says false at once. Comparisons, casts and the
    // logical operators all produce a real bool, so the test is written where
    // it is meant.
    if (target === 'bool') {
      if (value.type !== 'bool') {
        raise(
          at,
          `${value.type} is not a bool - write a comparison ("x != 0"),` +
            ' or bool(x) if the truthiness is deliberate',
        )
      }
      return
    }

    if (value.type === 'bool') return
    // A runtime value still narrows implicitly on assignment, per §4.
  }

  const resolveLValue = (target: LValue): Resolved => {
    // A field access resolves to the field's own global, so assigning through it
    // is an ordinary store - `mob[i].hp = 100` IS `mob__hp[i] = 100`.
    if (target.type === 'Identifier' && target.field !== undefined) {
      return annotate(target, resolveGroupField(target, null))
    }
    if (target.type === 'IndexExpression' && target.array.field !== undefined) {
      return annotate(target, resolveGroupField(target.array, target.index))
    }

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
      if (symbol.kind === 'group') {
        raise(target, `"${target.name}" is a group - assign to a field`)
      }
      if (symbol.kind === 'far') {
        raise(target, `"${target.name}" is a far region - assign to an element`)
      }
      if (symbol.kind === 'var' && symbol.readonly) {
        // Two ways to be a read-only scalar, and they want different advice.
        if (symbol.builtin) {
          raise(
            target,
            `"${target.name}" reports the carry flag after "int" - it cannot be assigned;` +
              ' no DOS or BIOS call reads carry on the way in',
          )
        }
        raise(target, `"${target.name}" is a const view and cannot be assigned`)
      }
      target.label = symbol.label
      return annotate(target, { type: symbol.type, value: null })
    }

    const symbol = lookup(target.array.name)
    if (!symbol) raise(target, `"${target.array.name}" is not declared`)

    if (symbol.kind === 'far') {
      if (symbol.readonly) {
        raise(target, `"${target.array.name}" is a const far region and cannot be assigned`)
      }
      target.array.label = symbol.label
      checkIndex(symbol, target.index)
      return annotate(target, { type: symbol.elementType, value: null })
    }

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
    // The loader splices includes at the top level of each file, so one nested
    // in a block reaches the resolver unspliced - and silently including
    // nothing would be the worst way to say no.
    if (node.type === 'IncludeStatement') {
      raise(node, 'include is only valid at the top level of a file')
    }
    if (node.type === 'ConstFunctionDeclaration') {
      raise(node, 'a parameterised const must be declared at the top level')
    }
    if (node.type === 'GroupDeclaration') {
      raise(node, 'a group must be declared at the top level - entity pools are global')
    }
    if (node.type === 'FarDeclaration') {
      raise(node, 'a far region must be declared at the top level - a hardware address is not scoped')
    }
    if (node.type === 'ViewDeclaration') {
      raise(node, 'a view must be declared at the top level - it is a name for storage, not a local')
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

      // `b += 1` would put arithmetic through a bool, exactly as `b++` would -
      // and the result is not a bool, so the assignment half fails too.
      if (target.type === 'bool') {
        raise(node, `cannot apply "${node.operator}" to a bool`)
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

    if (node.type === 'PokeStatement') {
      const what = node.width === 1 ? 'poke8' : 'poke16'
      checkAddress(node.address, what)
      const value = resolveExpression(node.value)
      // The store keeps one byte or two, so the value follows the same fit rule a
      // declared u8 or u16 would apply - including the bool rule, since a raw
      // byte store is exactly what makes that one matter.
      checkAssignable(value, node.width === 1 ? 'u8' : 'u16', node.value)
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
      claimLabel(parameter.label, node, `parameter "${parameter.name}" of "${node.name}"`)
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
      claimLabel(retLabel, node, `the return slot of "${node.name}"`)
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
    if (statement.type === 'GroupDeclaration') {
      resolveGroupDeclaration(statement)
      continue
    }
    if (statement.type === 'FarDeclaration') {
      resolveFarDeclaration(statement)
      continue
    }
    if (statement.type === 'ViewDeclaration') {
      resolveViewDeclaration(statement)
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
    if (statement.type === 'GroupDeclaration') continue
    if (statement.type === 'FarDeclaration') continue
    if (statement.type === 'ViewDeclaration') continue
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
