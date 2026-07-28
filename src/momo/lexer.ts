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
  ) => {
    tokens.push({ kind, text, num, str, file, line: tokenLine, col: tokenCol })
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
      if (ch === '0' && (source[pos + 1] === 'x' || source[pos + 1] === 'X')) {
        advance(2)
        if (pos >= source.length || !isHexDigit(source[pos])) {
          raise({ file, line: line, col: col }, 'expected hex digits after "0x"')
        }
        while (pos < source.length && (isHexDigit(source[pos]) || source[pos] === '_')) advance(1)
      } else if (ch === '0' && (source[pos + 1] === 'b' || source[pos + 1] === 'B')) {
        advance(2)
        if (pos >= source.length || !isBinDigit(source[pos])) {
          raise({ file, line: line, col: col }, 'expected binary digits after "0b"')
        }
        while (pos < source.length && (isBinDigit(source[pos]) || source[pos] === '_')) advance(1)
      } else {
        while (pos < source.length && (isDigit(source[pos]) || source[pos] === '_')) advance(1)
      }

      // Catches `123abc`, which would otherwise lex as a number then an ident.
      if (pos < source.length && isIdentStart(source[pos])) {
        raise({ file, line: line, col: col }, 'unexpected character after numeric literal')
      }

      const text = source.slice(start, pos)
      if (text.endsWith('_')) raise({ file, line: startLine, col: startCol }, 'numeric literal may not end with "_"')
      if (text.includes('__')) raise({ file, line: startLine, col: startCol }, 'numeric literal may not contain "__"')

      // Number() understands the 0x and 0b prefixes directly.
      push('number', text, startLine, startCol, Number(text.replace(/_/g, '')))
      continue
    }

    if (isIdentStart(ch)) {
      const startLine = line
      const startCol = col
      const start = pos

      while (pos < source.length && isIdentPart(source[pos])) advance(1)
      const text = source.slice(start, pos)

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
