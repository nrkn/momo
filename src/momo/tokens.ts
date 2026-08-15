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
  'group',
  'far',
  'view',
  'local',
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
  // The only route to a runtime address, and deliberately four names rather than
  // a `_mem` array: a `_memw` would scale its index by two, which is wrong when
  // the index is a byte address. See DESIGN §20.
  'peek8',
  'peek16',
  'poke8',
  'poke16',
  // Ports, spelled exactly as peek and poke are and for the same reasons: a
  // numeric target the compiler cannot check, one read and one write, unsafe
  // and visibly so at every use. See DESIGN §22.
  'in8',
  'in16',
  'out8',
  'out16',
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
  // '.' selects a group field and nothing else. There are no floats, so it can
  // never begin or interrupt a numeric literal.
  '.',
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
