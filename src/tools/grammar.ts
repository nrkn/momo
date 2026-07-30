// Generates the VS Code TextMate grammar from the compiler's own token tables.
//
//   npm run grammar
//
// The point is not saving typing - the lists are short - but that highlighting
// cannot drift from the language. Add a keyword to tokens.ts, regenerate, and it
// is covered. Anything not explicitly categorised below still lands in the
// default keyword bucket rather than silently losing its colour.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { builtinGlobalNames } from '../momo/resolver.js'
import { keywords, operators, typeNames } from '../momo/tokens.js'

const root = process.cwd()
const outDir = join(root, 'editor', 'vscode', 'syntaxes')

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')

const alternation = (words: string[]): string => words.map(escapeRegex).join('|')

// Keywords that want a scope other than the default. Everything else in
// `keywords` falls through to keyword.control, so a new one is never unstyled.
const declarationKeywords = ['sub', 'const']
const literalKeywords = ['true', 'false']
// Builtin functions rather than control flow. `len` belonged here from the start
// and was falling through to keyword.control; peek and poke joining it is what
// made the inconsistency visible.
const builtinKeywords = ['addr', 'len', 'peek8', 'peek16', 'poke8', 'poke16']
const importKeywords = ['include']

const controlKeywords = keywords.filter(
  (word) =>
    !declarationKeywords.includes(word) &&
    !literalKeywords.includes(word) &&
    !builtinKeywords.includes(word) &&
    !importKeywords.includes(word),
)

// Operators are already ordered longest-first in tokens.ts, which is exactly
// what a regex alternation needs so that `<<=` wins over `<<` and then `<`.
const punctuation = ['(', ')', '[', ']', '{', '}', ',', ';']
const realOperators = operators.filter((op) => !punctuation.includes(op))

const grammar = {
  $schema:
    'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
  name: 'Momo',
  scopeName: 'source.momo',
  fileTypes: ['momo'],
  patterns: [
    { include: '#comments' },
    { include: '#strings' },
    { include: '#characters' },
    { include: '#declarations' },
    { include: '#keywords' },
    { include: '#types' },
    { include: '#builtins' },
    { include: '#numbers' },
    { include: '#calls' },
    { include: '#operators' },
  ],
  repository: {
    comments: {
      patterns: [
        { name: 'comment.line.double-slash.momo', match: '//.*$' },
        // Block comments do not nest, matching the lexer.
        { name: 'comment.block.momo', begin: '/\\*', end: '\\*/' },
      ],
    },

    strings: {
      name: 'string.quoted.double.momo',
      begin: '"',
      end: '"',
      patterns: [{ name: 'constant.character.escape.momo', match: '\\\\.' }],
    },

    characters: {
      name: 'string.quoted.single.momo',
      begin: "'",
      end: "'",
      patterns: [{ name: 'constant.character.escape.momo', match: '\\\\.' }],
    },

    // Named declarations, so the name itself reads as a function.
    declarations: {
      patterns: [
        {
          // `sub name` - a routine that returns nothing.
          match: '\\b(sub)\\s+([A-Za-z_][A-Za-z0-9_]*)',
          captures: {
            '1': { name: 'keyword.declaration.momo' },
            '2': { name: 'entity.name.function.momo' },
          },
        },
        {
          // `u16 name(` - a routine that returns a value. Type-led, so the name
          // only reads as a function when a parameter list follows.
          match: `\\b(${alternation(typeNames)})\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?=\\()`,
          captures: {
            '1': { name: 'storage.type.momo' },
            '2': { name: 'entity.name.function.momo' },
          },
        },
        {
          // `const u8 name(` - a parameterised const with a declared type.
          match:
            `\\b(const)\\s+(${alternation(typeNames)})\\s+` +
            '([A-Za-z_][A-Za-z0-9_]*)\\s*(?=\\()',
          captures: {
            '1': { name: 'keyword.declaration.momo' },
            '2': { name: 'storage.type.momo' },
            '3': { name: 'entity.name.function.momo' },
          },
        },
        {
          // `const name(` - a parameterised const.
          match: '\\b(const)\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?=\\()',
          captures: {
            '1': { name: 'keyword.declaration.momo' },
            '2': { name: 'entity.name.function.momo' },
          },
        },
        {
          // `const name =` - a scalar const.
          match: '\\b(const)\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?==)',
          captures: {
            '1': { name: 'keyword.declaration.momo' },
            '2': { name: 'variable.other.constant.momo' },
          },
        },
      ],
    },

    keywords: {
      patterns: [
        { name: 'keyword.control.import.momo', match: `\\b(${alternation(importKeywords)})\\b` },
        { name: 'constant.language.momo', match: `\\b(${alternation(literalKeywords)})\\b` },
        { name: 'support.function.builtin.momo', match: `\\b(${alternation(builtinKeywords)})\\b` },
        { name: 'keyword.declaration.momo', match: `\\b(${alternation(declarationKeywords)})\\b` },
        { name: 'keyword.control.momo', match: `\\b(${alternation(controlKeywords)})\\b` },
      ],
    },

    types: {
      name: 'storage.type.momo',
      match: `\\b(${alternation(typeNames)})\\b`,
    },

    // The reserved register globals, the heap and its size.
    builtins: {
      name: 'variable.language.momo',
      match: `\\b(${alternation(builtinGlobalNames)})\\b`,
    },

    numbers: {
      patterns: [
        { name: 'constant.numeric.hex.momo', match: '\\b0[xX][0-9a-fA-F][0-9a-fA-F_]*\\b' },
        { name: 'constant.numeric.binary.momo', match: '\\b0[bB][01][01_]*\\b' },
        { name: 'constant.numeric.decimal.momo', match: '\\b[0-9][0-9_]*\\b' },
      ],
    },

    // Anything called. Keywords are matched earlier, so `if (` is not caught.
    calls: {
      match: '\\b([A-Za-z_][A-Za-z0-9_]*)\\s*(?=\\()',
      captures: { '1': { name: 'entity.name.function.call.momo' } },
    },

    operators: {
      name: 'keyword.operator.momo',
      match: alternation(realOperators),
    },
  },
}

mkdirSync(outDir, { recursive: true })
const target = join(outDir, 'momo.tmLanguage.json')
writeFileSync(target, `${JSON.stringify(grammar, null, 2)}\n`, 'utf8')

console.log(`ok: ${target}`)
console.log(
  `  ${keywords.length} keywords, ${typeNames.length} types, ` +
    `${realOperators.length} operators, ${builtinGlobalNames.length} builtins`,
)
