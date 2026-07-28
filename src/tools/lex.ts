// Dump the token stream for a Momo project.
//
//   npm run lex -- smoke
//   npm run lex:nl -- smoke    only statement terminators, for checking the
//                              newline rule against the source
//
// The --newlines flag lives in the script definition rather than being passed
// by hand because npm swallows unrecognised --flags from the user as config.
//
// Tokens are the one stage with no visible output of its own, so this exists to
// make the newline rule inspectable before the parser depends on it.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { formatError, isMomoError } from '../momo/diagnostics.js'
import { tokenize } from '../momo/lexer.js'
import type { Token } from '../momo/tokens.js'

const root = process.cwd()
const projectsDir = join(root, 'data', 'projects')

const usage = 'usage: npm run lex -- <project> [--newlines]'

const fail = (message: string): never => {
  console.error(`error: ${message}`)
  process.exit(1)
}

const display = (token: Token): string => {
  if (token.kind === 'newline') return '\\n'
  if (token.kind === 'eof') return '<eof>'
  if (token.kind === 'string') return `${token.text}  -> ${JSON.stringify(token.str)}`
  if (token.kind === 'char') return `${token.text}  -> ${token.num}`
  if (token.kind === 'number') return `${token.text}  -> ${token.num}`
  return token.text
}

const main = async () => {
  const args = process.argv.slice(2)
  const project = args.find((arg) => !arg.startsWith('-')) ?? ''
  const newlinesOnly = args.includes('--newlines')

  if (!project) fail(`no project given\n${usage}`)

  const file = join(projectsDir, project, `${project}.momo`)
  if (!existsSync(file)) fail(`source not found: "${file}"`)

  const source = await readFile(file, 'utf8')
  const sourceLines = source.split('\n')

  let tokens: Token[] = []
  try {
    tokens = tokenize(source, file)
  } catch (error) {
    if (!isMomoError(error)) throw error
    console.error(formatError(new Map([[file, source]]), error))
    process.exit(1)
  }

  if (newlinesOnly) {
    for (const token of tokens) {
      if (token.kind !== 'newline') continue
      const text = (sourceLines[token.line - 1] ?? '').trim()
      console.log(`${String(token.line).padStart(4)} | ${text}`)
    }
  } else {
    for (const token of tokens) {
      const at = `${token.line}:${token.col}`.padStart(8)
      console.log(`${at}  ${token.kind.padEnd(8)}  ${display(token)}`)
    }
  }

  const counts: Record<string, number> = {}
  for (const token of tokens) counts[token.kind] = (counts[token.kind] ?? 0) + 1

  const summary = Object.keys(counts)
    .sort()
    .map((kind) => `${kind}=${counts[kind]}`)
    .join('  ')

  console.log(`\n${tokens.length} tokens   ${summary}`)
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
