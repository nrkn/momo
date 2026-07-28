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
  array: boolean
  size: Expression | null // `u8[4]` has one, `u8[]` does not
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
}

// One field of a group. Scalars only - an array field would need arrays of
// arrays, which is a separate problem (§18).
export type GroupField = Located & {
  type: 'GroupField'
  name: string
  typeNode: TypeNode
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
}

export type Expression =
  | Identifier
  | NumberLiteral
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
export type ConstFunctionDeclaration = Spanned & {
  type: 'ConstFunctionDeclaration'
  name: string
  params: Parameter[]
  returnType: TypeName | null // null means infer from the body
  body: Expression
}

export type ConstDeclaration = Spanned & {
  type: 'ConstDeclaration'
  name: string
  typeNode: TypeNode | null // `const u8[] banner` has one, `const limit = 20` does not
  init: Expression
}

export type VariableDeclaration = Spanned & {
  type: 'VariableDeclaration'
  name: string
  typeNode: TypeNode
  init: Expression | null
  label?: string // set by the resolver: scoped storage label for this slot
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
  body: BlockStatement
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
  | AssignmentStatement
  | UpdateStatement
  | CallStatement

export type Program = Located & {
  type: 'Program'
  body: Statement[]
}

export type Node = Program | Statement | Expression | TypeNode | Parameter
