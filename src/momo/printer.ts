// AST -> Momo source. The inverse of the parser, as far as one exists.
//
// Not a formatter, and it must not become one: the AST carries no comments, so
// everything a reader wrote alongside the code is gone by the time this runs.
// What survives is the program, which is the point - the parser has already
// lowered `=>`, `else if`, prefix/postfix `++` and adjacent string literals, and
// the loader has spliced every `include`, so printing here shows what those
// actually became.
//
// Two rules keep it honest:
//
//   1. The output must parse back to the same program. `npm test` asserts it by
//      compiling both and comparing the instructions.
//   2. Number literals print from their original lexeme, so `0x7F` and `'A'`
//      survive rather than collapsing to decimal.

import type {
  Expression,
  Parameter,
  Program,
  Statement,
  TypeNode,
} from './ast.js'
import { spell } from './types.js'

// Tighter binds harder. Mirrors the table in DESIGN §6, and is the parser's
// `binaryLevels` read from the other end.
const precedence: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '<': 3, '<=': 3, '>': 3, '>=': 3, '==': 3, '!=': 3,
  '|': 4,
  '^': 5,
  '&': 6,
  '+': 7, '-': 7,
  '*': 8, '/': 8, '%': 8, '<<': 8, '>>': 8,
}

const conditionalPrecedence = 0
const unaryPrecedence = 9
const atomPrecedence = 10

const escapeString = (value: string): string => {
  let out = ''
  for (const ch of value) {
    if (ch === '\\') out += '\\\\'
    else if (ch === '"') out += '\\"'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (ch === '\0') out += '\\0'
    else out += ch
  }
  return `"${out}"`
}

// A fixed-point type prints as it was written, not as its storage: `i12.4` came
// in as an i16 with four fraction bits and has to go back out as `i12.4`, or the
// round trip in section 14 compiles a different program from the one it read.
const printType = (node: TypeNode): string => {
  // A unit prints as itself, not as its storage (§39). Printing `u16` where the
  // source said `px` would compile - and would be a different program, because
  // the unit is exactly what the type checking is about.
  const name = node.unit ?? spell(node.name, node.frac)
  if (!node.array) return name
  if (!node.size) return `${name}[]`
  return `${name}[${printExpression(node.size)}]`
}

const printParams = (params: Parameter[]): string =>
  `( ${params.map((p) => `${printType(p.typeNode)} ${p.name}`).join(', ')} )`

// The precedence of the expression as a whole, for deciding whether a child
// needs bracketing.
const precedenceOf = (node: Expression): number => {
  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    return precedence[node.operator] ?? atomPrecedence
  }
  if (node.type === 'ConditionalExpression') return conditionalPrecedence
  if (node.type === 'UnaryExpression') return unaryPrecedence
  return atomPrecedence
}

// Brackets go on only where the parse would otherwise differ. Extra ones would
// be harmless - the parser drops them and the AST comes out the same - but they
// make the output worse to read, which is most of what this tool is for.
const printChild = (child: Expression, parent: number, side: 'left' | 'right'): string => {
  const own = precedenceOf(child)
  const needed = side === 'left' ? own < parent : own <= parent
  const text = printExpression(child)
  return needed ? `(${text})` : text
}

// `local` is lowered here rather than preserved (§14). A private's identity is
// the file it was written in, and one printed file cannot express that - so a
// private prints under the mangled name the resolver already gave it and the
// modifier goes. Two files that each declare `local u16 hidden` come out as
// `a__hidden` and `b__hidden` rather than colliding.
//
// Collected per program rather than decided per node, because a sub-local's
// label is mangled too - `putNumber__digits` - and printing that would nest on
// the next parse. Only top-level privates lower, which is all of them: `local`
// inside a sub is an error (§11).
//
// `printProgram` owns it. Nothing outside this module calls the two functions
// below directly, and if anything ever does it gets the unlowered names, which
// is what a printer with no program in hand can honestly say.
const privateLabels = new Set<string>()

const lowered = (name: string, label?: string): string =>
  label !== undefined && privateLabels.has(label) ? label : name

// Declarations all carry the same two fields, so they share one accessor.
const declared = (node: { name: string; label?: string }): string =>
  lowered(node.name, node.label)

// A group field access carries the FIELD's label - `pool__x` - because that is
// what the emitter needs, but what prints is the group. Strip the field back off
// to get the group's own label, which is what the set holds. The `group__field`
// spelling is §18's and the resolver builds it the same way.
const ownerLabel = (node: { field?: string; label?: string }): string | undefined =>
  node.field !== undefined && node.label !== undefined
    ? node.label.slice(0, -(node.field.length + 2))
    : node.label

export const printExpression = (node: Expression): string => {
  switch (node.type) {
    case 'Identifier':
      return node.field === undefined
        ? lowered(node.name, node.label)
        : `${lowered(node.name, ownerLabel(node))}.${node.field}`

    // The original lexeme, so a hex or character literal stays what it was.
    // The original lexeme, so `1.5` goes back out as `1.5` rather than as the
    // integer it scaled to. The round trip then compiles the same program.
    case 'DecimalLiteral':
      return node.text

    case 'NumberLiteral':
      return node.text

    case 'BoolLiteral':
      return node.value ? 'true' : 'false'

    case 'StringLiteral':
      return escapeString(node.value)

    case 'ArrayLiteral':
      return `[ ${node.elements.map(printExpression).join(', ')} ]`

    // When `*` lowered to a call, the lowering is what the program means - so
    // that is what desugar shows and what the round trip compiles. Only ever set
    // after `resolve`, so printing a freshly parsed program is unchanged.
    case 'BinaryExpression': if (node.lowered) return printExpression(node.lowered)
    {
      const own = precedence[node.operator] ?? atomPrecedence
      return (
        `${printChild(node.left, own, 'left')} ${node.operator}` +
        ` ${printChild(node.right, own, 'right')}`
      )
    }

    case 'LogicalExpression': {
      const own = precedence[node.operator] ?? atomPrecedence
      return (
        `${printChild(node.left, own, 'left')} ${node.operator}` +
        ` ${printChild(node.right, own, 'right')}`
      )
    }

    case 'UnaryExpression': {
      const argument = printExpression(node.argument)
      const bracketed =
        precedenceOf(node.argument) < unaryPrecedence ? `(${argument})` : argument
      return `${node.operator}${bracketed}`
    }

    case 'ConditionalExpression': {
      // The test is parsed by the binary productions, which cannot yield a
      // conditional at all - so one sitting there has to be bracketed or it
      // reparses as the alternate of an outer `?:`. The consequent and the
      // alternate both need nothing: the consequent is parsed as a full
      // expression, and `?:` is right associative, so a nested one lands where
      // it was written.
      const test =
        node.test.type === 'ConditionalExpression'
          ? `(${printExpression(node.test)})`
          : printExpression(node.test)
      return (
        `${test} ? ${printExpression(node.consequent)}` +
        ` : ${printExpression(node.alternate)}`
      )
    }

    case 'CallExpression':
      return `${lowered(node.callee.name, node.callee.label)}( ${node.args.map(printExpression).join(', ')} )`

    // `mob[i].x` puts the field after the index, so the Identifier's own field
    // cannot simply be printed with it.
    case 'IndexExpression': {
      const field = node.array.field === undefined ? '' : `.${node.array.field}`
      return `${lowered(node.array.name, ownerLabel(node.array))}[ ${printExpression(node.index)} ]${field}`
    }

    case 'CastExpression':
      // `spell`, not `node.to`: printing the storage type turns `i8.8( 1 )` into
      // `i16( 1 )`, which parses and means 256 times less. The round trip caught
      // exactly that.
      return (
        // The unit, not the storage, for the same reason `spell` is used rather
        // than `node.to`: printing `u16( x )` where the source said `px( x )`
        // compiles and means something else (§39).
        `${node.raw ? 'raw ' : ''}${node.toUnit ?? spell(node.to, node.toFrac)}` +
        `( ${printExpression(node.argument)} )`
      )

    case 'MulShrExpression':
      return `mulshr8( ${printExpression(node.left)}, ${printExpression(node.right)} )`

    case 'AddrExpression':
      return `addr( ${lowered(node.target.name, node.target.label)} )`

    case 'LenExpression':
      return `len( ${lowered(node.target.name, node.targetLabel)} )`

    case 'PeekExpression':
      return `peek${node.width === 1 ? '8' : '16'}( ${printExpression(node.address)} )`

    case 'InExpression':
      return `in${node.width === 1 ? '8' : '16'}( ${printExpression(node.port)} )`
  }
}

const indent = (depth: number): string => '  '.repeat(depth)

// A block always prints braced, even where the source used `=>`. That is the
// desugaring: `=>` is gone by the time the parser is done with it.
const printBlock = (body: Statement[], depth: number): string => {
  if (body.length === 0) return '{\n' + indent(depth) + '}'
  const inner = body.map((statement) => printStatement(statement, depth + 1)).join('\n')
  return `{\n${inner}\n${indent(depth)}}`
}

// A `for` clause is a statement in the AST but must print without its own line.
const printClause = (statement: Statement | null): string =>
  statement === null ? '' : printStatement(statement, 0).trim()

export const printStatement = (node: Statement, depth = 0): string => {
  // No `local` modifier: it is lowered into the name instead - see the note
  // above `privateLabels`.
  const pad = indent(depth)

  switch (node.type) {
    case 'ConstDeclaration': {
      const type = node.typeNode ? `${printType(node.typeNode)} ` : ''
      return `${pad}const ${type}${declared(node)} = ${printExpression(node.init)}`
    }

    case 'ConstFunctionDeclaration': {
      const type = node.returnType ? `${spell(node.returnType, node.returnFrac)} ` : ''
      return (
        `${pad}const ${type}${declared(node)}${printParams(node.params)}` +
        ` = ${printExpression(node.body)}`
      )
    }

    case 'VariableDeclaration': {
      const init = node.init ? ` = ${printExpression(node.init)}` : ''
      return `${pad}${printType(node.typeNode)} ${declared(node)}${init}`
    }

    // The closing brace takes plain indentation, not `pad` - `pad` carries the
    // `local` modifier, and a second copy of it would land on the `}`.
    case 'GroupDeclaration': {
      const count = node.count ? `[${printExpression(node.count)}]` : ''
      const fields = node.fields
        .map((field) => `${indent(depth + 1)}${printType(field.typeNode)} ${field.name}`)
        .join('\n')
      return `${pad}group ${declared(node)}${count} {\n${fields}\n${indent(depth)}}`
    }

    case 'FarDeclaration': {
      const readonly = node.readonly ? 'const ' : ''
      const offset = node.offset ? `:${printExpression(node.offset)}` : ''
      return (
        `${pad}${readonly}far ${printType(node.typeNode)} ${declared(node)}` +
        ` = ${printExpression(node.segment)}${offset}`
      )
    }

    case 'ViewDeclaration': {
      const readonly = node.readonly ? 'const ' : ''
      return (
        `${pad}${readonly}view ${printType(node.typeNode)} ${declared(node)}` +
        ` = ${lowered(node.parent.name, node.parent.label)}[ ${printExpression(node.offset)} ]`
      )
    }

    // A typed routine always takes a parameter list, empty or not: it is what
    // tells the parser that `u16 readKey()` is a routine and not a variable
    // declaration. A `sub` needs no such disambiguation, so an empty one is
    // written bare.
    case 'RoutineDeclaration': {
      const head = node.returnType
        ? `${spell(node.returnType, node.returnFrac)} ${declared(node)}`
        : `sub ${declared(node)}`
      const params =
        node.returnType || node.params.length ? printParams(node.params) : ''
      return `${pad}${head}${params} ${printBlock(node.body.body, depth)}`
    }

    case 'UnitDeclaration':
      return `${pad}unit ${node.name} = ${printType(node.storage)}`

    case 'BlockStatement':
      return `${pad}${printBlock(node.body, depth)}`

    case 'IfStatement': {
      const consequent = printBranch(node.consequent, depth)
      if (!node.alternate) return `${pad}if ( ${printExpression(node.test)} ) ${consequent}`
      // An `else if` chain is an IfStatement in the alternate, and prints as one
      // rather than being re-nested in braces.
      const alternate =
        node.alternate.type === 'IfStatement'
          ? printStatement(node.alternate, depth).trimStart()
          : printBranch(node.alternate, depth)
      return (
        `${pad}if ( ${printExpression(node.test)} ) ${consequent} else ${alternate}`
      )
    }

    case 'ForStatement': {
      const test = node.test ? ` ${printExpression(node.test)}` : ''
      return (
        `${pad}for ( ${printClause(node.init)};${test};` +
        ` ${printClause(node.update)} ) ${printBranch(node.body, depth)}`
      )
    }

    case 'WhileStatement':
      return `${pad}while ( ${printExpression(node.test)} ) ${printBranch(node.body, depth)}`

    case 'DoWhileStatement':
      return (
        `${pad}do ${printBranch(node.body, depth)}` +
        ` while ( ${printExpression(node.test)} )`
      )

    case 'IncludeStatement':
      return `${pad}include ${escapeString(node.path)}`

    case 'BreakStatement':
      return `${pad}break`

    case 'ContinueStatement':
      return `${pad}continue`

    case 'ReturnStatement':
      return node.argument === null
        ? `${pad}return`
        : `${pad}return ${printExpression(node.argument)}`

    // The AST keeps the number and not the lexeme, so this cannot echo what was
    // written. Hex is the right guess: an interrupt number is always written
    // that way, here and everywhere else.
    case 'IntStatement':
      return `${pad}int 0x${node.interrupt.toString(16).toUpperCase()}`

    case 'PokeStatement':
      return (
        `${pad}poke${node.width === 1 ? '8' : '16'}` +
        `( ${printExpression(node.address)}, ${printExpression(node.value)} )`
      )

    case 'OutStatement':
      return (
        `${pad}out${node.width === 1 ? '8' : '16'}` +
        `( ${printExpression(node.port)}, ${printExpression(node.value)} )`
      )

    case 'AssignmentStatement':
      return (
        `${pad}${printExpression(node.target)} ${node.operator}` +
        ` ${printExpression(node.value)}`
      )

    case 'UpdateStatement':
      return `${pad}${printExpression(node.target)}${node.operator}`

    case 'CallStatement':
      return (
        `${pad}${lowered(node.callee.name, node.callee.label)}` +
        `( ${node.args.map(printExpression).join(', ')} )`
      )
  }
}

// The body of an if, loop or else. Braced bodies keep their braces; a single
// statement is braced too, so every body reads the same way.
const printBranch = (node: Statement, depth: number): string =>
  node.type === 'BlockStatement'
    ? printBlock(node.body, depth)
    : printBlock([node], depth)

export const printProgram = (program: Program): string => {
  privateLabels.clear()
  for (const statement of program.body) {
    if ('local' in statement && statement.local && 'label' in statement && statement.label) {
      privateLabels.add(statement.label)
    }
  }

  return program.body.map((statement) => printStatement(statement, 0)).join('\n') + '\n'
}
