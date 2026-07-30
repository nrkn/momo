// Momo parser: Token[] -> Program.
//
// Recursive descent throughout. The binary operator levels are the one place
// driven by a table rather than by hand-written functions - eleven near-identical
// functions is a lot of copy-paste in which a single transposed level is a nasty
// bug, and the table below mirrors the precedence table in DESIGN.md directly.
//
// Everything that is genuinely different is hand-written: the ternary (right
// associative), unary, and primary/postfix forms.

import { raise } from './diagnostics.js'
import type { Token, TokenKind } from './tokens.js'
import type {
  ArrayLiteral,
  BlockStatement,
  ConstDeclaration,
  ConstFunctionDeclaration,
  Parameter,
  DoWhileStatement,
  Expression,
  RoutineDeclaration,
  FarAddress,
  FarDeclaration,
  ForStatement,
  GroupDeclaration,
  GroupField,
  Identifier,
  IfStatement,
  LValue,
  Program,
  Statement,
  TypeName,
  TypeNode,
  WhileStatement,
} from './ast.js'

// Loosest binding first. Mirrors the table in DESIGN.md.
const binaryLevels = [
  ['||'],
  ['&&'],
  ['<', '<=', '>', '>=', '==', '!='],
  ['|'],
  ['^'],
  ['&'],
  ['+', '-'],
  ['*', '/', '%', '<<', '>>'],
]

// Comparison is non-associative: `a < b < c` is an error, not `(a < b) < c`.
const comparisonLevel = 2

const compoundAssignOps = ['+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']

const describe = (token: Token): string => {
  if (token.kind === 'eof') return 'end of file'
  if (token.kind === 'newline') return 'end of line'
  return `"${token.text}"`
}

export const parse = (tokens: Token[]): Program => {
  let pos = 0

  const peek = (): Token => tokens[Math.min(pos, tokens.length - 1)]
  const previous = (): Token => tokens[Math.max(0, pos - 1)]

  const at = (kind: TokenKind, text?: string): boolean => {
    const token = peek()
    if (token.kind !== kind) return false
    return text === undefined || token.text === text
  }

  const advance = (): Token => {
    const token = peek()
    if (pos < tokens.length - 1) pos += 1
    return token
  }

  const expect = (kind: TokenKind, text?: string): Token => {
    if (at(kind, text)) return advance()
    const token = peek()
    const wanted = text === undefined ? kind : `"${text}"`
    raise(token, `expected ${wanted} but found ${describe(token)}`)
  }

  const skipNewlines = () => {
    while (at('newline')) advance()
  }

  // A statement ends at a newline, at EOF, or immediately before a closing
  // brace (`if (x) y() }` on one line is legal).
  const expectTerminator = () => {
    if (at('newline')) {
      advance()
      return
    }
    if (at('eof') || at('op', '}')) return
    const token = peek()
    raise(token, `expected end of statement but found ${describe(token)}`)
  }

  // ---- expressions ----------------------------------------------------------

  const parseExpression = (): Expression => parseConditional()

  const parseConditional = (): Expression => {
    const test = parseBinary(0)
    if (!at('op', '?')) return test

    const token = advance()
    const consequent = parseExpression()
    expect('op', ':')
    // Right associative, so `a ? b : c ? d : e` chains as `a ? b : (c ? d : e)`.
    const alternate = parseConditional()

    return {
      type: 'ConditionalExpression',
      test,
      consequent,
      alternate,
      file: token.file,
      line: token.line,
      col: token.col,
    }
  }

  const parseBinary = (level: number): Expression => {
    if (level >= binaryLevels.length) return parseUnary()

    let left = parseBinary(level + 1)
    const ops = binaryLevels[level]

    for (;;) {
      const token = peek()
      if (token.kind !== 'op' || !ops.includes(token.text)) return left

      advance()
      const right = parseBinary(level + 1)

      left =
        token.text === '&&' || token.text === '||'
          ? {
              type: 'LogicalExpression',
              operator: token.text,
              left,
              right,
              file: token.file,
              line: token.line,
              col: token.col,
            }
          : {
              type: 'BinaryExpression',
              operator: token.text,
              left,
              right,
              file: token.file,
              line: token.line,
              col: token.col,
            }

      if (level === comparisonLevel) {
        const next = peek()
        if (next.kind === 'op' && ops.includes(next.text)) {
          raise(next, `comparison is non-associative - parenthesise, e.g. (a ${token.text} b) ${next.text} c`,
          )
        }
        return left
      }
    }
  }

  const parseUnary = (): Expression => {
    const token = peek()

    if (token.kind === 'op' && (token.text === '!' || token.text === '~' || token.text === '-')) {
      advance()
      return {
        type: 'UnaryExpression',
        operator: token.text,
        argument: parseUnary(),
        file: token.file,
        line: token.line,
        col: token.col,
      }
    }

    return parsePrimary()
  }

  const parseArrayLiteral = (): ArrayLiteral => {
    const open = expect('op', '[')
    const elements: Expression[] = []

    if (!at('op', ']')) {
      for (;;) {
        elements.push(parseExpression())
        if (!at('op', ',')) break
        advance()
        if (at('op', ']')) break // tolerate a trailing comma
      }
    }

    expect('op', ']')
    return { type: 'ArrayLiteral', elements, file: open.file, line: open.line, col: open.col }
  }

  const parsePrimary = (): Expression => {
    const token = peek()

    if (token.kind === 'number' || token.kind === 'char') {
      advance()
      return {
        type: 'NumberLiteral',
        value: token.num,
        text: token.text,
        file: token.file,
        line: token.line,
        col: token.col,
      }
    }

    if (token.kind === 'string') {
      advance()
      let value = token.str

      // Adjacent string literals concatenate, across newlines, so ASCII art can
      // be laid out as it will appear. Unambiguous because no statement can
      // begin with a string - if the next token is not one, nothing is consumed.
      for (;;) {
        const saved = pos
        skipNewlines()
        if (!at('string')) {
          pos = saved
          break
        }
        value += advance().str
      }

      return { type: 'StringLiteral', value, file: token.file, line: token.line, col: token.col }
    }

    // A type name in expression position is always a cast - `u8(x)`.
    if (token.kind === 'type') {
      advance()
      expect('op', '(')
      const argument = parseExpression()
      expect('op', ')')
      return {
        type: 'CastExpression',
        to: token.text as TypeName,
        argument,
        file: token.file,
        line: token.line,
        col: token.col,
      }
    }

    if (token.kind === 'keyword') {
      if (token.text === 'true' || token.text === 'false') {
        advance()
        return {
          type: 'BoolLiteral',
          value: token.text === 'true',
          file: token.file,
          line: token.line,
          col: token.col,
        }
      }

      // addr(x) and len(x) share a shape: a keyword, one parenthesised name,
      // never an expression. Both are reserved words, so neither can be shadowed
      // and neither needs the symbol table to parse.
      if (token.text === 'addr' || token.text === 'len') {
        advance()
        expect('op', '(')
        const name = expect('ident')
        expect('op', ')')
        return {
          type: token.text === 'addr' ? 'AddrExpression' : 'LenExpression',
          target: { type: 'Identifier', name: name.text, file: name.file, line: name.line, col: name.col },
          file: token.file,
          line: token.line,
          col: token.col,
        }
      }
    }

    if (token.kind === 'ident') {
      advance()
      const identifier: Identifier = {
        type: 'Identifier',
        name: token.text,
        file: token.file,
        line: token.line,
        col: token.col,
      }

      // Legal in expression position again - but only for a parameterised
      // const. The resolver decides, since the parser has no symbol table.
      if (at('op', '(')) {
        advance()
        const args: Expression[] = []

        if (!at('op', ')')) {
          for (;;) {
            args.push(parseExpression())
            if (!at('op', ',')) break
            advance()
          }
        }

        expect('op', ')')
        return {
          type: 'CallExpression',
          callee: identifier,
          args,
          file: token.file,
          line: token.line,
          col: token.col,
        }
      }

      if (at('op', '[')) {
        advance()
        const index = parseExpression()
        expect('op', ']')

        // `mob[i].x`. The marker rides on the array identifier, which is where
        // the resolver looks; the index passes through untouched, because this
        // is a name substitution rather than layout arithmetic.
        if (at('op', '.')) {
          advance()
          identifier.field = expect('ident').text
        }

        return {
          type: 'IndexExpression',
          array: identifier,
          index,
          file: token.file,
          line: token.line,
          col: token.col,
        }
      }

      // `player.x` - the single-instance form, which takes no index.
      if (at('op', '.')) {
        advance()
        identifier.field = expect('ident').text
      }

      return identifier
    }

    if (token.kind === 'op') {
      if (token.text === '(') {
        advance()
        const inner = parseExpression()
        expect('op', ')')
        return inner
      }
      if (token.text === '[') return parseArrayLiteral()
    }

    raise(token, `expected an expression but found ${describe(token)}`)
  }

  // ---- statements -----------------------------------------------------------

  const parseTypeNode = (): TypeNode => {
    const token = expect('type')
    let array = false
    let size: Expression | null = null

    if (at('op', '[')) {
      advance()
      array = true
      if (!at('op', ']')) size = parseExpression()
      expect('op', ']')
    }

    return {
      type: 'TypeNode',
      name: token.text as TypeName,
      array,
      size,
      file: token.file,
      line: token.line,
      col: token.col,
    }
  }

  const parseParameterList = (): Parameter[] => {
    expect('op', '(')
    const params: Parameter[] = []

    if (!at('op', ')')) {
      for (;;) {
        const start = peek()
        const typeNode = parseTypeNode()
        if (typeNode.array) raise(start, 'a parameter cannot be an array')
        const name = expect('ident')
        params.push({
          type: 'Parameter',
          name: name.text,
          typeNode,
          file: start.file,
          line: start.line,
          col: start.col,
        })
        if (!at('op', ',')) break
        advance()
      }
    }

    expect('op', ')')
    return params
  }

  // Four shapes, told apart by one token of lookahead past the name:
  //   const u8[] a = [...]        type,  then '='  -> array const
  //   const k = 20                ident, then '='  -> scalar const, untyped
  //   const f(u8 n) = n * n       ident, then '('  -> parameterised, inferred
  //   const u8 f(u8 n) = n * n    type,  then '('  -> parameterised, declared
  //
  // The type sits in the same place as it does for a variable or a routine, so
  // there is nothing special to remember.
  const parseConstDeclaration = ():
    | ConstDeclaration
    | ConstFunctionDeclaration
    | FarDeclaration => {
    const start = expect('keyword', 'const')

    // `const far` - read-only region. The order matches §16 and reads as an
    // adjective on `far`, which is what it is.
    if (at('keyword', 'far')) return parseFarDeclaration(true, start)

    const typeNode = at('type') ? parseTypeNode() : null
    const name = expect('ident')

    if (at('op', '(')) {
      if (typeNode?.array) raise(typeNode, 'a const cannot return an array')
      const returnType: TypeName | null = typeNode ? typeNode.name : null
      const params = parseParameterList()

      expect('op', '=')
      const body = parseExpression()
      const endLine = previous().line
      expectTerminator()

      return {
        type: 'ConstFunctionDeclaration',
        name: name.text,
        params,
        returnType,
        body,
        file: start.file,
        line: start.line,
        col: start.col,
        endLine,
      }
    }

    expect('op', '=')
    const init = parseExpression()

    const endLine = previous().line
    expectTerminator()

    return {
      type: 'ConstDeclaration',
      name: name.text,
      typeNode,
      init,
      file: start.file,
      line: start.line,
      col: start.col,
      endLine,
    }
  }

  // The body of a routine: either a block, or `=>` followed by one thing.
  //
  // `=>` desugars here and nowhere else - a typed routine wraps the expression
  // in a `return`, a sub wraps the statement as-is - so the resolver and emitter
  // never see it.
  const parseRoutineBody = (returnType: TypeName | null): BlockStatement => {
    if (!at('op', '=>')) {
      skipNewlines()
      return parseBlock()
    }

    const arrow = advance()
    skipNewlines()

    if (returnType) {
      const value = parseExpression()
      const endLine = previous().line
      expectTerminator()

      const statement: Statement = {
        type: 'ReturnStatement',
        argument: value,
        file: arrow.file,
        line: arrow.line,
        col: arrow.col,
        endLine,
      }

      return {
        type: 'BlockStatement',
        body: [statement],
        file: arrow.file,
        line: arrow.line,
        col: arrow.col,
        endLine,
      }
    }

    const statement = parseStatement()
    return {
      type: 'BlockStatement',
      body: [statement],
      file: arrow.file,
      line: arrow.line,
      col: arrow.col,
      endLine: statement.endLine,
    }
  }

  // A segment or offset: a literal, or a name that the resolver will insist is
  // either a scalar const or a `u16` variable. Deliberately not an expression -
  // see FarAddress.
  const parseFarAddress = (what: string): FarAddress => {
    if (at('number')) {
      const token = advance()
      return {
        type: 'NumberLiteral', value: token.num, text: token.text,
        file: token.file, line: token.line, col: token.col,
      }
    }
    if (at('ident')) {
      const token = advance()
      return {
        type: 'Identifier', name: token.text,
        file: token.file, line: token.line, col: token.col,
      }
    }
    raise(peek(), `a far ${what} must be a number or a name, not an expression`)
  }

  // far       u16[2000] textCells = 0xB800
  // const far u8[]      font      = 0xF000:0xFA6E
  //
  // The size is optional: with one, constant indices are bounds-checked; without,
  // they are not, exactly as for an ordinary array.
  const parseFarDeclaration = (readonly: boolean, start: Token): FarDeclaration => {
    expect('keyword', 'far')
    const typeNode = parseTypeNode()

    if (!typeNode.array) {
      raise(typeNode, 'a far region is an array - write "far u8[] name = 0xB800"')
    }

    const name = expect('ident')
    expect('op', '=')

    const segment = parseFarAddress('segment')
    let offset: FarAddress | null = null
    if (at('op', ':')) {
      advance()
      offset = parseFarAddress('offset')
    }

    // A trailing operator means someone wrote an expression. Say so, rather than
    // letting the terminator check report "expected end of statement but found
    // +", which enforces the rule without explaining it.
    if (at('op') && !at('op', '}')) {
      raise(peek(), 'a far address must be a number or a name, not an expression')
    }

    const endLine = previous().line
    expectTerminator()

    return {
      type: 'FarDeclaration',
      name: name.text,
      typeNode,
      readonly,
      segment,
      offset,
      file: start.file,
      line: start.line,
      col: start.col,
      endLine,
    }
  }

  // group mob[64] { u8 x  u8 y }   many - each field becomes an array
  // group player  { u8 x  u8 y }   one  - each field becomes a plain variable
  //
  // The presence of `[n]` decides, exactly as it does for `u8 x` against
  // `u8[4] x`, so no second keyword is needed.
  const parseGroupDeclaration = (): GroupDeclaration => {
    const start = expect('keyword', 'group')
    const name = expect('ident')

    let count: Expression | null = null
    if (at('op', '[')) {
      advance()
      if (at('op', ']')) raise(peek(), 'a group needs a count - "[]" has no size to infer from')
      count = parseExpression()
      expect('op', ']')
    }

    expect('op', '{')
    skipNewlines()

    const fields: GroupField[] = []
    while (!at('op', '}')) {
      const typeNode = parseTypeNode()
      if (typeNode.array) {
        raise(typeNode, 'group fields are scalars - an array field would need arrays of arrays')
      }

      const fieldName = expect('ident')

      // A deliberate v1 restriction rather than a syntax accident, so say so.
      if (at('op', '=')) {
        raise(peek(), 'group fields have no initialiser - they zero-fill, like "u8[4] buf"')
      }

      fields.push({
        type: 'GroupField',
        name: fieldName.text,
        typeNode,
        file: fieldName.file,
        line: fieldName.line,
        col: fieldName.col,
      })

      expectTerminator()
      skipNewlines()
    }

    expect('op', '}')

    return {
      type: 'GroupDeclaration',
      name: name.text,
      count,
      fields,
      file: start.file,
      line: start.line,
      col: start.col,
      endLine: previous().line,
    }
  }

  // `sub name { }`, `sub name() { }`, `sub name( args ) { }`, or any of those
  // with `=> statement`. A sub is a routine with no return type.
  const parseSubDeclaration = (): RoutineDeclaration => {
    const start = expect('keyword', 'sub')
    const name = expect('ident')
    const params = at('op', '(') ? parseParameterList() : []
    const body = parseRoutineBody(null)

    return {
      type: 'RoutineDeclaration',
      name: name.text,
      params,
      returnType: null,
      body,
      file: start.file,
      line: start.line,
      col: start.col,
      endLine: body.endLine,
    }
  }

  // A statement beginning with a type is either a variable or a routine. One
  // token of lookahead past the name tells them apart.
  const parseTypeLedDeclaration = (): Statement => {
    const start = peek()
    const typeNode = parseTypeNode()
    const name = expect('ident')

    if (at('op', '{') || at('op', '=>')) {
      raise(
        peek(),
        `a routine needs a parameter list - write ${typeNode.name} ${name.text}()`,
      )
    }

    if (!at('op', '(')) {
      let init: Expression | null = null
      if (at('op', '=')) {
        advance()
        init = parseExpression()
      }

      const endLine = previous().line
      expectTerminator()

      return {
        type: 'VariableDeclaration',
        name: name.text,
        typeNode,
        init,
        file: start.file,
        line: start.line,
        col: start.col,
        endLine,
      }
    }

    if (typeNode.array) raise(typeNode, 'a routine cannot return an array')

    const params = parseParameterList()
    const body = parseRoutineBody(typeNode.name)

    return {
      type: 'RoutineDeclaration',
      name: name.text,
      params,
      returnType: typeNode.name,
      body,
      file: start.file,
      line: start.line,
      col: start.col,
      endLine: body.endLine,
    }
  }

  const parseBlock = (): BlockStatement => {
    const open = expect('op', '{')
    const body: Statement[] = []

    skipNewlines()
    while (!at('op', '}')) {
      if (at('eof')) raise(open, 'unterminated block - expected "}"')
      body.push(parseStatement())
      skipNewlines()
    }

    const close = expect('op', '}')
    return {
      type: 'BlockStatement',
      body,
      file: open.file,
      line: open.line,
      col: open.col,
      endLine: close.line,
    }
  }

  // An lvalue is a bare name or a single array index. No pointers, no `a.b`,
  // no chained `a[i][j]` - Momo has no nested arrays.
  const parseLValue = (): LValue => {
    const name = expect('ident')
    const identifier: Identifier = {
      type: 'Identifier',
      name: name.text,
      file: name.file,
      line: name.line,
      col: name.col,
    }

    // `player.x = 1` - the single-instance group form.
    if (!at('op', '[')) {
      if (at('op', '.')) {
        advance()
        identifier.field = expect('ident').text
      }
      return identifier
    }

    advance()
    const index = parseExpression()
    expect('op', ']')

    // `mob[i].hp = 100`. Assignment falls out for free once resolved: the field
    // is its own array, so this IS `mob__hp[i] = 100`.
    if (at('op', '.')) {
      advance()
      identifier.field = expect('ident').text
    }

    return {
      type: 'IndexExpression',
      array: identifier,
      index,
      file: name.file,
      line: name.line,
      col: name.col,
    }
  }

  // Assignment, update, or call - without consuming a terminator, so the `for`
  // header clauses can reuse it.
  const parseSimpleStatement = (): Statement => {
    const start = peek()
    const target = parseLValue()

    if (at('op', '(')) {
      if (target.type !== 'Identifier') {
        raise(start, 'cannot call an array element')
      }
      advance()
      const args: Expression[] = []
      if (!at('op', ')')) {
        for (;;) {
          args.push(parseExpression())
          if (!at('op', ',')) break
          advance()
        }
      }
      expect('op', ')')
      return {
        type: 'CallStatement',
        callee: target,
        args,
        file: start.file,
        line: start.line,
        col: start.col,
        endLine: previous().line,
      }
    }

    if (at('op', '++') || at('op', '--')) {
      const token = advance()
      return {
        type: 'UpdateStatement',
        operator: token.text === '++' ? '++' : '--',
        target,
        file: start.file,
        line: start.line,
        col: start.col,
        endLine: previous().line,
      }
    }

    const token = peek()
    const isAssign =
      token.kind === 'op' && (token.text === '=' || compoundAssignOps.includes(token.text))

    if (!isAssign) {
      raise(token, `expected an assignment or call but found ${describe(token)}`)
    }

    advance()
    const value = parseExpression()

    return {
      type: 'AssignmentStatement',
      operator: token.text,
      target,
      value,
      file: start.file,
      line: start.line,
      col: start.col,
      endLine: previous().line,
    }
  }

  const parseIfStatement = (): IfStatement => {
    const start = expect('keyword', 'if')
    expect('op', '(')
    const test = parseExpression()
    expect('op', ')')

    skipNewlines()
    const consequent = parseStatement()

    // Look past newlines for `else`, but put the position back if there is not
    // one - the enclosing block relies on those terminators.
    let alternate: Statement | null = null
    const saved = pos
    skipNewlines()

    if (at('keyword', 'else')) {
      advance()
      skipNewlines()
      alternate = parseStatement()
    } else {
      pos = saved
    }

    return {
      type: 'IfStatement',
      test,
      consequent,
      alternate,
      file: start.file,
      line: start.line,
      col: start.col,
      endLine: (alternate ?? consequent).endLine,
    }
  }

  const parseForStatement = (): ForStatement => {
    const start = expect('keyword', 'for')
    expect('op', '(')

    const init = at('op', ';') ? null : parseSimpleStatement()
    expect('op', ';')
    const test = at('op', ';') ? null : parseExpression()
    expect('op', ';')
    const update = at('op', ')') ? null : parseSimpleStatement()

    expect('op', ')')
    skipNewlines()
    const body = parseStatement()

    return {
      type: 'ForStatement',
      init,
      test,
      update,
      body,
      file: start.file,
      line: start.line,
      col: start.col,
      endLine: body.endLine,
    }
  }

  const parseWhileStatement = (): WhileStatement => {
    const start = expect('keyword', 'while')
    expect('op', '(')
    const test = parseExpression()
    expect('op', ')')

    skipNewlines()
    const body = parseStatement()

    return {
      type: 'WhileStatement',
      test,
      body,
      file: start.file,
      line: start.line,
      col: start.col,
      endLine: body.endLine,
    }
  }

  const parseDoWhileStatement = (): DoWhileStatement => {
    const start = expect('keyword', 'do')
    skipNewlines()
    const body = parseStatement()

    skipNewlines()
    expect('keyword', 'while')
    expect('op', '(')
    const test = parseExpression()
    expect('op', ')')

    const endLine = previous().line
    expectTerminator()

    return {
      type: 'DoWhileStatement',
      body,
      test,
      file: start.file,
      line: start.line,
      col: start.col,
      endLine,
    }
  }

  const parseStatement = (): Statement => {
    const token = peek()

    if (token.kind === 'type') return parseTypeLedDeclaration()
    if (token.kind === 'op' && token.text === '{') return parseBlock()
    if (token.kind === 'ident') {
      const statement = parseSimpleStatement()
      expectTerminator()
      return statement
    }

    if (token.kind === 'keyword') {
      if (token.text === 'include') {
        advance()
        const path = expect('string')
        const endLine = previous().line
        expectTerminator()
        return {
          type: 'IncludeStatement',
          path: path.str,
          file: token.file,
          line: token.line,
          col: token.col,
          endLine,
        }
      }
      if (token.text === 'const') return parseConstDeclaration()
      if (token.text === 'group') return parseGroupDeclaration()
      if (token.text === 'far') return parseFarDeclaration(false, token)
      if (token.text === 'sub') return parseSubDeclaration()
      if (token.text === 'fn') {
        // Migration aid - delete once the old spelling is out of muscle memory.
        raise(token, 'fn is no longer a keyword - write the return type first, e.g. u16 add( u8 a )')
      }
      if (token.text === 'if') return parseIfStatement()
      if (token.text === 'for') return parseForStatement()
      if (token.text === 'while') return parseWhileStatement()
      if (token.text === 'do') return parseDoWhileStatement()

      if (token.text === 'break' || token.text === 'continue') {
        advance()
        const endLine = previous().line
        expectTerminator()
        return {
          type: token.text === 'break' ? 'BreakStatement' : 'ContinueStatement',
          file: token.file,
          line: token.line,
          col: token.col,
          endLine,
        }
      }

      if (token.text === 'return') {
        advance()
        const bare = at('newline') || at('eof') || at('op', '}')
        const argument = bare ? null : parseExpression()
        const endLine = previous().line
        expectTerminator()
        return {
          type: 'ReturnStatement',
          argument,
          file: token.file,
          line: token.line,
          col: token.col,
          endLine,
        }
      }

      if (token.text === 'int') {
        advance()
        const value = expect('number')
        if (value.num < 0 || value.num > 255) {
          raise(value, `interrupt number must be 0-255, got ${value.num}`)
        }
        const endLine = previous().line
        expectTerminator()
        return {
          type: 'IntStatement',
          interrupt: value.num,
          file: token.file,
          line: token.line,
          col: token.col,
          endLine,
        }
      }
    }

    raise(token, `unexpected ${describe(token)}`)
  }

  // ---- program --------------------------------------------------------------

  const body: Statement[] = []
  skipNewlines()

  while (!at('eof')) {
    body.push(parseStatement())
    skipNewlines()
  }

  return { type: 'Program', body, file: tokens[0].file, line: 1, col: 1 }
}
