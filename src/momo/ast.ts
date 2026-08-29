// Momo AST. ESTree-flavoured, not ESTree-compliant.
//
// Kept from ESTree: a `type` discriminant on every node, familiar node names,
// source positions. Deviations, all deliberate:
//
//   - Assignment and ++/-- are STATEMENTS, not expressions. That is a language
//     decision (see DESIGN.md), and encoding it here means the parser simply
//     has no production for `if (x = 5)` - it is structurally impossible rather
//     than caught by a later check.
//   - Declarations carry a TypeNode. ESTree has no concept of types.
//   - IndexExpression instead of MemberExpression: Momo has `a[i]` and never
//     `a.b`, so `computed: true` would be pure JS baggage.
//   - CastExpression is distinct from CallExpression. `u8(x)` looks like a call
//     and is not; type names are reserved, so the parser can tell immediately.
//   - IntStatement, AddrExpression, LenExpression: Momo primitives with no JS
//     analogue.

import type { ValueType } from './types.js'

export type TypeName = 'u8' | 'i8' | 'u16' | 'i16' | 'bool'

// Every node knows where it started, for diagnostics.
//
// `resolvedType` and `constValue` are filled in by the resolver, in place. The
// emitter reads them constantly - it cannot choose `jb` vs `jl`, `shr` vs
// `sar`, or `div` vs `idiv` without them.
export type Located = {
  file: string
  line: number
  col: number
  resolvedType?: ValueType
  constValue?: number | null
}

// Statements additionally know where they ended, so the emitter can quote the
// original source line(s) in its `; ---- ... ----` comments.
export type Spanned = Located & { endLine: number }

export type TypeNode = Located & {
  type: 'TypeNode'
  name: TypeName
  // Fraction bits, 0 for every type that is not fixed-point. Parallel to `name`
  // rather than part of it: `i12.4` IS an i16, so the storage type is unchanged
  // and everything downstream that wants storage keeps reading `name`. See
  // DESIGN.md §25.
  frac: number
  array: boolean
  size: Expression | null // `u8[4]` has one, `u8[]` does not
  // The unit this was written as, when it was written as one (DESIGN §39).
  // `name` and `frac` are the storage it stands for, exactly as they are for a
  // fixed-point spelling - so everything downstream that wants storage keeps
  // reading them and never learns about units.
  unit?: string
}

// ---- expressions ------------------------------------------------------------

export type Identifier = Located & {
  type: 'Identifier'
  name: string
  label?: string // set by the resolver: which symbol this actually refers to
  // Set when this name was written as `name.field` - a group field access. The
  // parser could mangle straight to `mob__x`, but then a typo would report
  // `"mob__z" is not declared` for source that says `mob[i].z`. Keeping the two
  // apart until the resolver lets it say "z" is not a field of group "mob"
  // instead. The emitter never sees it: by then only `label` matters, so a field
  // access and an ordinary array index are the same thing to it.
  field?: string
}

export type NumberLiteral = Located & {
  type: 'NumberLiteral'
  value: number
  text: string // original lexeme, so `'0'` and `0x7F` survive into comments
}

export type BoolLiteral = Located & {
  type: 'BoolLiteral'
  value: boolean
}

// `1.5`. Kept as the two halves the lexer split, because the scale comes from the
// target type: 1.5 is 384 in 8.8 and 24 in 12.4, and there is no one integer to
// store here. `scaleTo` is set by the resolver at the sites that know the target -
// a declaration, an assignment, a cast, an argument - and a decimal that reaches
// resolution without one is an error. See DESIGN.md §25.
export type DecimalLiteral = Located & {
  type: 'DecimalLiteral'
  whole: number
  digits: string // fractional digits, separators already stripped
  text: string // original lexeme, so the printer can put `1.5` back
  scaleTo?: number
}

export type StringLiteral = Located & {
  type: 'StringLiteral'
  value: string
}

export type ArrayLiteral = Located & {
  type: 'ArrayLiteral'
  elements: Expression[]
}

export type BinaryExpression = Located & {
  type: 'BinaryExpression'
  operator: string
  left: Expression
  right: Expression
  // For comparisons, `resolvedType` is bool - but the emitter needs the type
  // the OPERANDS combined to, since that is what picks jb vs jl.
  operandType?: ValueType
  // Set by the resolver when `*` on two same-scale fixed values lowers to a call
  // on fixMul. The emitter emits this instead of the multiply, exactly as it does
  // with a parameterised const's `expansion` - and the call graph and the leaf
  // test both walk a node's own keys, so they find the call inside it without
  // being told. See DESIGN.md §25.
  lowered?: Expression
}

// Separate from BinaryExpression because these two short-circuit, and so are
// the only binary forms that emit labels.
export type LogicalExpression = Located & {
  type: 'LogicalExpression'
  operator: '&&' | '||'
  left: Expression
  right: Expression
}

export type UnaryExpression = Located & {
  type: 'UnaryExpression'
  operator: '!' | '~' | '-'
  argument: Expression
}

export type ConditionalExpression = Located & {
  type: 'ConditionalExpression'
  test: Expression
  consequent: Expression
  alternate: Expression
}

// Only ever a call to a parameterised const. The resolver substitutes the
// const's body and stores the result in `expansion`; the emitter emits that, so
// no call is ever generated.
export type CallExpression = Located & {
  type: 'CallExpression'
  callee: Identifier
  args: Expression[]
  expansion?: Expression
}

export type IndexExpression = Located & {
  type: 'IndexExpression'
  array: Identifier
  index: Expression
}

export type CastExpression = Located & {
  type: 'CastExpression'
  to: TypeName
  toFrac: number // fraction bits of the target type, 0 when it is not fixed
  toUnit?: string // the unit it was written as, if it was one (§39)
  // `raw i16( x )`: keep the bits, change what they are read as. An ordinary cast
  // across a scale boundary preserves the VALUE and so implies a shift; this one
  // is the other half, and the lowering of `*` needs it at both ends.
  raw: boolean
  argument: Expression
}

export type AddrExpression = Located & {
  type: 'AddrExpression'
  target: Identifier
}

// Folds to the declared length of an array. The target keeps no `label`: unlike
// addr(), len() needs no storage, so asking for a length must not be what keeps
// an otherwise unused array alive.
export type LenExpression = Located & {
  type: 'LenExpression'
  target: Identifier
  // What the target prints as, which is not the same question. The printer needs
  // a private's mangled name to lower `local` (§14), and pruning collects the
  // `label` key by name - so this is deliberately called something else, and
  // asking a length still does not keep an array alive.
  targetLabel?: string
}

// `peek8(at)` and `peek16(at)` - a read from a RUNTIME address in our segment.
//
// The one construct in Momo that cannot be checked: `far` and `view` both know
// where they point at compile time, and this does not. So it is deliberately
// visible at every use site rather than being dressed up as an array, which is
// the `unsafe { *ptr }` distinction §20 draws.
export type PeekExpression = Located & {
  type: 'PeekExpression'
  width: 1 | 2
  address: Expression
}

// `poke8(at, value)`, `poke16(at, value)`. A statement, not an expression, because
// it has an effect and §6 keeps effects out of expressions.
export type PokeStatement = Spanned & {
  type: 'PokeStatement'
  width: 1 | 2
  address: Expression
  value: Expression
}

// `in8(port)`, `in16(port)`. An expression, even though reading a port can have
// an effect on the hardware - 0x3DA resets the attribute flip-flop by being
// read. §6's rule is about expressions having no effect on Momo's own state,
// which this does not, and it produces a value, so it stays an expression.
export type InExpression = Located & {
  type: 'InExpression'
  width: 1 | 2
  port: Expression
}

// `mulshr8( a, b )`. Unsigned, and the one operation in the language that reads
// the high half of a product - which is why it is a primitive rather than
// something the emitter could recognise: §9 discards DX, so no expression made of
// ordinary operators can get at those bits.
export type MulShrExpression = Located & {
  type: 'MulShrExpression'
  left: Expression
  right: Expression
}

// `out8(port, value)`, `out16(port, value)`. A statement, like poke, because a
// port write is an effect and produces nothing.
export type OutStatement = Spanned & {
  type: 'OutStatement'
  width: 1 | 2
  port: Expression
  value: Expression
}

// One field of a group. Scalars only - an array field would need arrays of
// arrays, which is a separate problem (§18).
export type GroupField = Located & {
  type: 'GroupField'
  name: string
  typeNode: TypeNode
}

// Where a far region lives. Restricted to a literal or a name at parse time,
// never an expression: it keeps the segment load to one instruction, and it
// settles that `= someVar` is a live reference re-read per access rather than a
// computed snapshot.
export type FarAddress = NumberLiteral | Identifier

// `far u16[2000] textCells = 0xB800`, `const far u8[] font = 0xF000:0xFA6E`.
//
// Names an address rather than contents - the `=` here is not the initialiser of
// §5, which is why these are allowed to name a variable. Emits no storage: the
// segment and offset bake into the instructions.
export type FarDeclaration = Spanned & {
  type: 'FarDeclaration'
  name: string
  typeNode: TypeNode // element type, and an optional size for bounds checking
  readonly: boolean
  segment: FarAddress
  offset: FarAddress | null
  label?: string // set by the resolver
  local?: boolean
}

// `view u8[50] top = bar[0]`, `const view u8 first = bar[0]`.
//
// A named window into an existing array at a constant offset. Like a far region
// this names a location rather than contents, so the `=` is not the initialiser
// of §5 - which is why it may name another declaration. Emits no storage: the
// label is an assembly-time alias for `parent + offset`.
//
// The three shapes are told apart by the TypeNode alone, exactly as they are for
// an ordinary declaration: `u8[50]` sized, `u8[]` the remainder of the parent,
// and `u8` a scalar alias for one element.
// `unit px = u16` (DESIGN §39). A named type that will not mix with another
// unit without a cast - checked entirely in the resolver, and gone by the time
// anything is emitted.
export type UnitDeclaration = Spanned & {
  type: 'UnitDeclaration'
  name: string
  storage: TypeNode
}

export type ViewDeclaration = Spanned & {
  type: 'ViewDeclaration'
  name: string
  typeNode: TypeNode
  readonly: boolean
  parent: Identifier
  offset: Expression // in the PARENT's elements, folded by the resolver
  label?: string // set by the resolver
  local?: boolean
}

// `group mob[64] { ... }` many, `group player { ... }` one. The presence of a
// count decides, exactly as it does for `u8 x` against `u8[4] x`, so no second
// keyword is needed.
//
// Each field becomes an ordinary global - an array when there is a count, a
// plain variable when there is not - labelled `mob__x`. By the time the emitter
// sees a field access it is an ordinary index or load; see the `field` marker
// on Identifier.
export type GroupDeclaration = Spanned & {
  type: 'GroupDeclaration'
  name: string
  count: Expression | null
  fields: GroupField[]
  local?: boolean
  // Set by the resolver. A group emits nothing under this name - its fields are
  // the arrays - so it is the mangled name a private carries, which the printer
  // needs to lower `local` (§14).
  label?: string
}

export type Expression =
  | Identifier
  | NumberLiteral
  | DecimalLiteral
  | BoolLiteral
  | StringLiteral
  | ArrayLiteral
  | BinaryExpression
  | LogicalExpression
  | UnaryExpression
  | ConditionalExpression
  | CallExpression
  | IndexExpression
  | CastExpression
  | AddrExpression
  | LenExpression
  | PeekExpression
  | InExpression
  | MulShrExpression

// Only these can appear on the left of an assignment.
export type LValue = Identifier | IndexExpression

// ---- statements -------------------------------------------------------------

export type Parameter = Located & {
  type: 'Parameter'
  name: string
  typeNode: TypeNode
}

// `const sqr(u8 n) = n * n` - a parameterised const. Single expression, always
// substituted, never called. Folds completely when its arguments are constant,
// which is what makes compile-time tables work.
// `local` on any top-level declaration means private to the file it is written
// in: visible to its siblings there, and to nothing else. The marker rides on
// the declaration rather than being a construct of its own, because the boundary
// it names - the file - is one the loader already keeps.
export type ConstFunctionDeclaration = Spanned & {
  type: 'ConstFunctionDeclaration'
  name: string
  params: Parameter[]
  returnType: TypeName | null // null means infer from the body
  returnFrac: number // fraction bits of the declared return type, else 0
  returnUnit?: string // the unit it was declared as, if it was one (§39)
  body: Expression
  local?: boolean
  // Set by the resolver, and not an assembly label - a parameterised const is
  // substituted inline and emits nothing under its own name. It is the mangled
  // name a private carries, which the printer needs to lower `local` (§14).
  label?: string
}

export type ConstDeclaration = Spanned & {
  type: 'ConstDeclaration'
  name: string
  typeNode: TypeNode | null // `const u8[] banner` has one, `const limit = 20` does not
  init: Expression
  local?: boolean
  // Set by the resolver. A const emits nothing, so this is not an assembly
  // label - it is the mangled name a private carries, which the printer needs
  // in order to lower `local` (§14).
  label?: string
}

export type VariableDeclaration = Spanned & {
  type: 'VariableDeclaration'
  name: string
  typeNode: TypeNode
  init: Expression | null
  label?: string // set by the resolver: scoped storage label for this slot
  local?: boolean
}

// One node for both forms. A `sub` is simply a routine with no return type:
//
//   sub draw { }                    returnType null, no parameters
//   sub move( u8 dx ) { }           returnType null
//   u16 add( u8 a, u8 b ) { }       returnType u16
//
// Parameters and the return value become mangled globals, and a call becomes a
// store-then-call. No stack frame, no BP, no recursion - so the static memory
// analysis survives intact.
export type RoutineDeclaration = Spanned & {
  type: 'RoutineDeclaration'
  name: string
  params: Parameter[]
  returnType: TypeName | null
  returnFrac: number
  returnUnit?: string
  body: BlockStatement
  label?: string // set by the resolver; the call graph and emitter key on it
  local?: boolean
}

export type BlockStatement = Spanned & {
  type: 'BlockStatement'
  body: Statement[]
}

export type IfStatement = Spanned & {
  type: 'IfStatement'
  test: Expression
  consequent: Statement
  alternate: Statement | null // an `else if` chain is an IfStatement here
}

export type ForStatement = Spanned & {
  type: 'ForStatement'
  init: Statement | null
  test: Expression | null
  update: Statement | null
  body: Statement
}

// while and do-while are sugar over the for emitter, but keep their own nodes
// so the generated source comment matches what was actually written.
export type WhileStatement = Spanned & {
  type: 'WhileStatement'
  test: Expression
  body: Statement
}

export type DoWhileStatement = Spanned & {
  type: 'DoWhileStatement'
  body: Statement
  test: Expression
}

// Resolved away by the loader - never reaches the resolver.
export type IncludeStatement = Spanned & {
  type: 'IncludeStatement'
  path: string
}

export type BreakStatement = Spanned & { type: 'BreakStatement' }
export type ContinueStatement = Spanned & { type: 'ContinueStatement' }

// `argument` is set only inside a routine with a declared return type; in a
// `sub`, `return` is always a bare early exit.
export type ReturnStatement = Spanned & {
  type: 'ReturnStatement'
  argument: Expression | null
}

export type IntStatement = Spanned & {
  type: 'IntStatement'
  interrupt: number
}

export type AssignmentStatement = Spanned & {
  type: 'AssignmentStatement'
  operator: string // '=', '+=', '<<=', ... kept un-desugared for the comment
  target: LValue
  value: Expression
}

export type UpdateStatement = Spanned & {
  type: 'UpdateStatement'
  operator: '++' | '--'
  target: LValue
}

export type CallStatement = Spanned & {
  type: 'CallStatement'
  callee: Identifier
  args: Expression[]
}

export type Statement =
  | ConstDeclaration
  | ConstFunctionDeclaration
  | VariableDeclaration
  | GroupDeclaration
  | FarDeclaration
  | ViewDeclaration
  | UnitDeclaration
  | RoutineDeclaration
  | BlockStatement
  | IfStatement
  | ForStatement
  | WhileStatement
  | DoWhileStatement
  | IncludeStatement
  | BreakStatement
  | ContinueStatement
  | ReturnStatement
  | IntStatement
  | PokeStatement
  | OutStatement
  | AssignmentStatement
  | UpdateStatement
  | CallStatement

export type Program = Located & {
  type: 'Program'
  body: Statement[]
}

export type Node = Program | Statement | Expression | TypeNode | Parameter
