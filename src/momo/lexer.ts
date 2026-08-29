// Momo lexer: source text -> Token[].
//
// The only subtle part is statement termination. Momo has no semicolons (except
// as `for` clause separators), so a newline ends a statement - but only when
// BOTH of these hold:
//
//   1. Paren/bracket depth is zero. Note: `(` and `[` only, never `{`, because
//      newlines inside a block body genuinely do separate statements.
//   2. The previous token could end a statement (see `canEndStatement`).
//
// Neither rule suffices alone. Rule 2 alone breaks on a multi-line array
// literal whose last line ends in a number; rule 1 alone breaks on a line
// ending in a trailing binary operator.

import { raise } from './diagnostics.js'
import { canEndStatement, keywords, operators, typeNames, type Token, type TokenKind } from './tokens.js'

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9'

const isHexDigit = (ch: string): boolean =>
  isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')

const isBinDigit = (ch: string): boolean => ch === '0' || ch === '1'

const isIdentStart = (ch: string): boolean =>
  (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'

const isIdentPart = (ch: string): boolean => isIdentStart(ch) || isDigit(ch)

// Returns -1 for an unrecognised escape.
const escapeCode = (ch: string): number => {
  if (ch === 'n') return 10
  if (ch === 'r') return 13
  if (ch === 't') return 9
  if (ch === '0') return 0
  if (ch === '\\') return 92
  if (ch === "'") return 39
  if (ch === '"') return 34
  return -1
}

// A `unit` (§39) names a type without being a reserved word, so the parser
// cannot tell `px x = 40` from two identifiers by shape alone. This is where that
// is settled: after a file is scanned, every `unit NAME` in it is collected and
// the matching identifiers are promoted to `type` tokens.
//
// Two consequences worth knowing. Within a file the scan runs first, so a unit
// may be used above its own declaration. Across files it cannot: `knownUnits`
// arrives from what the loader has already included, which is the same
// declare-before-use every other name here obeys.
//
// The alternative was a symbol table in the parser, which is C's typedef problem
// and would make `px x` a declaration or not depending on what came before it.
// Promoting here keeps the parser deciding by token kind alone, as it always has.
export const unitNamesIn = (tokens: Token[]): string[] => {
  const names: string[] = []
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]
    if (token.kind === 'keyword' && token.text === 'unit' && tokens[i + 1].kind === 'ident') {
      names.push(tokens[i + 1].text)
    }
  }
  return names
}

export const promoteUnits = (tokens: Token[], units: Set<string>): void => {
  for (const token of tokens) {
    if (token.kind === 'ident' && units.has(token.text)) token.kind = 'type'
  }
}

export const tokenize = (source: string, file: string): Token[] => {
  const tokens: Token[] = []

  let pos = 0
  let line = 1
  let col = 1
  let depth = 0 // ( and [ only

  const advance = (count: number) => {
    for (let i = 0; i < count; i++) {
      if (source[pos] === '\n') {
        line += 1
        col = 1
      } else {
        col += 1
      }
      pos += 1
    }
  }

  const push = (
    kind: TokenKind,
    text: string,
    tokenLine: number,
    tokenCol: number,
    num = 0,
    str = '',
    frac = '',
  ) => {
    tokens.push({ kind, text, num, str, frac, file, line: tokenLine, col: tokenCol })
  }

  const pushNewline = (tokenLine: number, tokenCol: number) => {
    if (depth > 0) return
    if (tokens.length === 0) return
    if (!canEndStatement(tokens[tokens.length - 1])) return
    push('newline', '\n', tokenLine, tokenCol)
  }

  // Reads one character of a char or string literal, resolving escapes.
  const readCharBody = (): number => {
    if (pos >= source.length || source[pos] === '\n') {
      raise({ file, line: line, col: col }, 'unterminated literal')
    }

    if (source[pos] === '\\') {
      if (pos + 1 >= source.length) raise({ file, line: line, col: col }, 'unterminated escape sequence')
      const code = escapeCode(source[pos + 1])
      if (code < 0) raise({ file, line: line, col: col }, `unknown escape sequence "\\${source[pos + 1]}"`)
      advance(2)
      return code
    }

    const code = source.charCodeAt(pos)
    advance(1)
    return code
  }

  while (pos < source.length) {
    const ch = source[pos]

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      advance(1)
      continue
    }

    if (ch === '\n') {
      const nlLine = line
      const nlCol = col
      advance(1)
      pushNewline(nlLine, nlCol)
      continue
    }

    if (ch === '/' && source[pos + 1] === '/') {
      while (pos < source.length && source[pos] !== '\n') advance(1)
      continue
    }

    if (ch === '/' && source[pos + 1] === '*') {
      const startLine = line
      const startCol = col
      advance(2)

      let closed = false
      while (pos < source.length) {
        if (source[pos] === '*' && source[pos + 1] === '/') {
          advance(2)
          closed = true
          break
        }
        advance(1)
      }

      if (!closed) raise({ file, line: startLine, col: startCol }, 'unterminated block comment')

      // A block comment spanning lines counts as a newline.
      if (line > startLine) pushNewline(line, col)
      continue
    }

    if (isDigit(ch)) {
      const startLine = line
      const startCol = col
      const start = pos

      // `_` is a digit separator inside a numeric literal: 0b1010_1010.
      let radix = 10
      if (ch === '0' && (source[pos + 1] === 'x' || source[pos + 1] === 'X')) {
        radix = 16
        advance(2)
        if (pos >= source.length || !isHexDigit(source[pos])) {
          raise({ file, line: line, col: col }, 'expected hex digits after "0x"')
        }
        while (pos < source.length && (isHexDigit(source[pos]) || source[pos] === '_')) advance(1)
      } else if (ch === '0' && (source[pos + 1] === 'b' || source[pos + 1] === 'B')) {
        radix = 2
        advance(2)
        if (pos >= source.length || !isBinDigit(source[pos])) {
          raise({ file, line: line, col: col }, 'expected binary digits after "0b"')
        }
        while (pos < source.length && (isBinDigit(source[pos]) || source[pos] === '_')) advance(1)
      } else {
        while (pos < source.length && (isDigit(source[pos]) || source[pos] === '_')) advance(1)
      }

      // A '.' can never follow a numeric literal as an operator - a group field
      // is selected off a name, not off a number - so every case here is either
      // a decimal literal or a mistake, and each gets its own message.
      const wholeEnd = pos
      let fracStart = -1

      if (source[pos] === '.') {
        if (radix !== 10) {
          raise(
            { file, line: line, col: col },
            'a decimal point cannot follow a hex or binary literal - write a fixed-point value in decimal',
          )
        }
        if (!isDigit(source[pos + 1])) {
          raise({ file, line: line, col: col }, 'a decimal point needs digits after it')
        }

        advance(1)
        fracStart = pos
        while (pos < source.length && (isDigit(source[pos]) || source[pos] === '_')) advance(1)

        if (source[pos] === '.') {
          raise(
            { file, line: line, col: col },
            'a numeric literal may have only one decimal point',
          )
        }
      }

      // Catches `123abc`, which would otherwise lex as a number then an ident.
      if (pos < source.length && isIdentStart(source[pos])) {
        raise({ file, line: line, col: col }, 'unexpected character after numeric literal')
      }

      const text = source.slice(start, pos)
      if (text.endsWith('_')) raise({ file, line: startLine, col: startCol }, 'numeric literal may not end with "_"')
      if (text.includes('__')) raise({ file, line: startLine, col: startCol }, 'numeric literal may not contain "__"')

      const bare = (from: number, to: number) => source.slice(from, to).replace(/_/g, '')

      if (fracStart < 0) {
        // Number() understands the 0x and 0b prefixes directly.
        push('number', text, startLine, startCol, Number(bare(start, pos)))
        continue
      }

      // Split rather than scaled: 1.5 is 384 in 8.8 and 24 in 12.4, and the
      // scale comes from a target type the lexer cannot see. See DESIGN.md §25.
      push(
        'decimal',
        text,
        startLine,
        startCol,
        Number(bare(start, wholeEnd)),
        '',
        bare(fracStart, pos),
      )
      continue
    }

    if (isIdentStart(ch)) {
      const startLine = line
      const startCol = col
      const start = pos

      while (pos < source.length && isIdentPart(source[pos])) advance(1)
      const text = source.slice(start, pos)

      // A fixed type name is a sign letter, a whole width, a dot and a fraction
      // width: `i8.8`, `i12.4`, `u0.16`. Its whole part is NOT itself a type name
      // - `i12` and `u0` are not - so this cannot be built by absorbing a dot
      // after a type token. Doing it that way reaches only i8, u8, i16 and u16,
      // and of those the two 16s are the splits DESIGN.md §25 rejects.
      //
      // Requiring a digit after the dot is what keeps this clear of group access:
      // a field name cannot start with one, so `u0.x` is still a name and a
      // field. Whether the split is a legal one is decided where the parts are
      // read, so `i99.1` lexes and is rejected there.
      if (/^[iu][0-9]+$/.test(text) && source[pos] === '.' && isDigit(source[pos + 1])) {
        advance(1)
        while (pos < source.length && isDigit(source[pos])) advance(1)
        push('type', source.slice(start, pos), startLine, startCol)
        continue
      }

      if (typeNames.includes(text)) push('type', text, startLine, startCol)
      else if (keywords.includes(text)) push('keyword', text, startLine, startCol)
      else push('ident', text, startLine, startCol)

      continue
    }

    if (ch === "'") {
      const startLine = line
      const startCol = col
      const start = pos

      advance(1)

      // A bare quote is never the body. `''` is empty, and `'''` is an
      // unescaped apostrophe - which otherwise lexes as 39 without complaint,
      // since the third quote closes the literal and the second reads as its
      // contents. Both want catching here, where the two cases are still
      // distinguishable.
      if (source[pos] === "'") {
        raise(
          { file, line: startLine, col: startCol },
          source[pos + 1] === "'"
            ? 'an apostrophe inside a character literal must be escaped'
            : 'a character literal cannot be empty',
        )
      }

      const code = readCharBody()

      if (pos >= source.length || source[pos] !== "'") {
        raise({ file, line: line, col: col }, 'expected closing quote - a character literal holds exactly one character')
      }
      advance(1)

      push('char', source.slice(start, pos), startLine, startCol, code)
      continue
    }

    if (ch === '"') {
      const startLine = line
      const startCol = col
      const start = pos

      advance(1)
      let value = ''
      for (;;) {
        if (pos >= source.length || source[pos] === '\n') {
          raise({ file, line: startLine, col: startCol }, 'unterminated string literal')
        }
        if (source[pos] === '"') break
        value += String.fromCharCode(readCharBody())
      }
      advance(1)

      push('string', source.slice(start, pos), startLine, startCol, 0, value)
      continue
    }

    let matched = ''
    for (const op of operators) {
      if (source.startsWith(op, pos)) {
        matched = op
        break
      }
    }

    if (matched) {
      const startLine = line
      const startCol = col

      if (matched === '(' || matched === '[') depth += 1
      if (matched === ')' || matched === ']') depth = Math.max(0, depth - 1)

      advance(matched.length)
      push('op', matched, startLine, startCol)
      continue
    }

    raise({ file, line: line, col: col }, `unexpected character "${ch}"`)
  }

  // Implicit terminator for a final line with no trailing newline.
  pushNewline(line, col)
  push('eof', '', line, col)

  return tokens
}
