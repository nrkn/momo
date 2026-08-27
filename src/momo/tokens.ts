// Token kinds and the lexeme tables the scanner matches against.

// 'decimal' is its own kind rather than a 'number' carrying a fraction, and
// deliberately: every existing site that consumes a number token then fails to
// match a decimal instead of silently reading 1.5 as 1. There are three such
// sites, and a silent truncation in any of them would be invisible.
export type TokenKind =
  | 'ident'
  | 'keyword'
  | 'type'
  | 'number'
  | 'decimal'
  | 'string'
  | 'char'
  | 'op'
  | 'newline'
  | 'eof'

export type Token = {
  kind: TokenKind
  text: string // exact source lexeme, used in error messages
  num: number // decoded value for 'number' and 'char', 'decimal's integer part
  str: string // decoded contents for 'string', otherwise empty
  // Fractional digits of a 'decimal', separators removed, otherwise empty. Kept
  // as digits rather than scaled here because the scale comes from the target
  // type, which the lexer cannot see - see DESIGN.md §25.
  frac: string
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
  // `raw i16( x )` - a cast that preserves bits rather than value, which is what
  // a fixed-point helper written in plain Momo needs at both ends. Named and
  // grouped with the four above because it belongs to the same family: unsafe,
  // and visibly so at every use. See DESIGN.md §25.
  'raw',
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
  // '.' selects a group field. It also appears inside a decimal literal and
  // inside a fixed type name, but the lexer consumes both of those whole, so it
  // never reaches here as an operator in either position - and a bare '.' after
  // a numeric literal is always a mistake rather than a selection.
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
  if (token.kind === 'decimal') return true
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
