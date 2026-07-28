// Token kinds and the lexeme tables the scanner matches against.

export type TokenKind =
  | 'ident'
  | 'keyword'
  | 'type'
  | 'number'
  | 'string'
  | 'char'
  | 'op'
  | 'newline'
  | 'eof'

export type Token = {
  kind: TokenKind
  text: string // exact source lexeme, used in error messages
  num: number // decoded value for 'number' and 'char', otherwise 0
  str: string // decoded contents for 'string', otherwise empty
  file: string
  line: number
  col: number
}

// Type names are reserved words. That is what lets the parser decide, with one
// token of lookahead and no symbol table, that a statement is a declaration -
// and what makes `u8(x)` unambiguously a cast rather than a call.
export const typeNames = ['u8', 'i8', 'u16', 'i16', 'bool']

export const keywords = [
  'const',
  'include',
  'sub',
  'fn',
  'if',
  'else',
  'for',
  'while',
  'do',
  'break',
  'continue',
  'return',
  'int',
  'addr',
  'len',
  'true',
  'false',
]

// Longest first: the scanner takes the first match, so '<<=' must be tried
// before '<<', and '<<' before '<'.
export const operators = [
  '<<=', '>>=',
  '=>',
  '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '++', '--',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '+', '-', '*', '/', '%', '&', '|', '^', '~', '!',
  '<', '>', '=', '?', ':',
  '(', ')', '[', ']', '{', '}', ',', ';',
]

// A newline only terminates a statement when the previous token could plausibly
// end one. This is Go's semicolon-insertion rule, and it buys free continuation
// after a trailing operator:
//
//   value = someLongThing +
//           anotherThing
//
// It is not sufficient on its own - see the depth tracking in the lexer.
export const canEndStatement = (token: Token): boolean => {
  if (token.kind === 'ident') return true
  if (token.kind === 'number') return true
  if (token.kind === 'string') return true
  if (token.kind === 'char') return true

  if (token.kind === 'keyword') {
    return (
      token.text === 'true' ||
      token.text === 'false' ||
      token.text === 'break' ||
      token.text === 'continue' ||
      token.text === 'return'
    )
  }

  if (token.kind === 'op') {
    return (
      token.text === ')' ||
      token.text === ']' ||
      token.text === '}' ||
      token.text === '++' ||
      token.text === '--'
    )
  }

  return false
}
