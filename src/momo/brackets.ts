// §48: lowering `bracket` away.
//
// A bracket declaration names two routines as a pair, and `box( args ) { ... }`
// calls them around a body written in place. This pass deletes the declarations
// and rewrites each block into the open call, the body's statements, and the
// close call - so nothing below here learns the word, and the emitted code is
// exactly what writing the three out by hand emits. The identity tier asserts
// that rather than trusting it.
//
// **It runs over the merged program, not per file, and that is the one thing
// about it worth knowing.** §48 said the lowering would happen in the parser,
// the way `=>` does, and it cannot: `loader.ts` parses a file completely before
// visiting the includes inside it, so `shell.momo` is an AST before
// `mopaint.momo` has been read. A bracket declared by a library is therefore not
// in scope when the file using it is parsed. The parser still does the part it
// can do context-free - reading `name( args ) { body }` into a node, which needs
// no symbol table and no lexer involvement - and the pairing waits until every
// file is in one body.
//
// So bracket declarations are program-wide and order-free, like `unit` names,
// rather than declaration-before-use. That is one fewer rule, and it is what
// lets a library ship its own pairs.

import { raise } from './diagnostics.js'
import type {
  BracketDeclaration,
  CallStatement,
  Expression,
  Identifier,
  Located,
  Program,
  Statement,
} from './ast.js'

// The generated call sits where the block is written, not where the pair was
// declared: that is where it happens, and an unknown open or close reports
// against every use rather than once against a declaration nothing calls.
const callTo = (
  callee: Identifier,
  args: Expression[],
  at: Located,
  line: number,
): CallStatement => ({
  type: 'CallStatement',
  callee: { type: 'Identifier', name: callee.name, file: at.file, line, col: at.col },
  args,
  file: at.file,
  line,
  col: at.col,
  endLine: line,
})

// Everything a bracket name could collide with. `local` is not consulted: a
// bracket is program-wide, so shadowing a name that exists in only one file is
// still a reader's problem rather than a scoping question.
const declaredName = (statement: Statement): string | null => {
  switch (statement.type) {
    case 'ConstDeclaration':
    case 'ConstFunctionDeclaration':
    case 'VariableDeclaration':
    case 'GroupDeclaration':
    case 'FarDeclaration':
    case 'ViewDeclaration':
    case 'UnitDeclaration':
    case 'RoutineDeclaration':
      return statement.name
    default:
      return null
  }
}

export const lowerBrackets = (program: Program) => {
  const pairs = new Map<string, BracketDeclaration>()

  for (const statement of program.body) {
    if (statement.type !== 'BracketDeclaration') continue

    const existing = pairs.get(statement.name)
    if (existing) {
      raise(
        statement,
        `"${statement.name}" is already a bracket, declared at ${existing.file}:${existing.line}`,
      )
    }

    pairs.set(statement.name, statement)
  }

  // After the whole map exists, so the message is the same whichever came first
  // in the merged body - which include order decides and a reader does not.
  for (const statement of program.body) {
    const name = declaredName(statement)
    if (name === null || !pairs.has(name)) continue

    raise(
      pairs.get(name) as BracketDeclaration,
      `"${name}" is already declared at ${statement.file}:${statement.line} - a bracket is a` +
        ' spelling for a pair of calls, not a routine, so it cannot share a name with one',
    )
  }

  const rewriteList = (statements: Statement[]): Statement[] => {
    const out: Statement[] = []

    for (const statement of statements) {
      if (statement.type === 'BracketStatement') {
        const pair = pairs.get(statement.name.name)
        if (!pair) {
          raise(
            statement,
            `"${statement.name.name}" is not a bracket - a block after a call needs` +
              ` a declaration like "bracket ${statement.name.name} = open / close"`,
          )
        }

        out.push(callTo(pair.open, statement.args, statement, statement.line))
        out.push(...rewriteList(statement.body.body))
        out.push(callTo(pair.close, [], statement, statement.endLine))
        continue
      }

      out.push(rewriteInner(statement))
    }

    return out
  }

  // A body that is one statement rather than a block - `if ( x ) box { }`. The
  // slot holds one statement and the lowering produces three, so they get a
  // block, which is grouping only and emits nothing.
  const rewriteSlot = (statement: Statement): Statement => {
    if (statement.type !== 'BracketStatement') return rewriteInner(statement)

    const body = rewriteList([statement])

    return {
      type: 'BlockStatement',
      body,
      file: statement.file,
      line: statement.line,
      col: statement.col,
      endLine: statement.endLine,
    }
  }

  const rewriteInner = (statement: Statement): Statement => {
    switch (statement.type) {
      case 'BracketDeclaration':
        raise(
          statement,
          'a bracket is declared at the top level of a file - it names a pair for the whole' +
            ' program rather than for one routine',
        )
        return statement

      case 'BlockStatement':
        statement.body = rewriteList(statement.body)
        return statement

      case 'RoutineDeclaration':
        statement.body.body = rewriteList(statement.body.body)
        return statement

      case 'IfStatement':
        statement.consequent = rewriteSlot(statement.consequent)
        if (statement.alternate) statement.alternate = rewriteSlot(statement.alternate)
        return statement

      case 'ForStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
        statement.body = rewriteSlot(statement.body)
        return statement

      default:
        return statement
    }
  }

  // Top-level declarations are dropped before the walk, so the only
  // BracketDeclaration the walk can meet is a nested one - which is the error
  // above rather than a case here.
  program.body = rewriteList(
    program.body.filter((statement) => statement.type !== 'BracketDeclaration'),
  )
}
