// Print a Momo project back as Momo, with the surface sugar already lowered.
//
//   npm run desugar -- simplerl
//
// One piece of the lowering needs types and so happens in the resolver: `*` on
// two fixed-point values becomes a call on fixMul (DESIGN.md §25). This runs
// `resolve` before printing so that shows up too, and since the resolver
// otherwise only annotates, nothing else in the output moved when it started.
//
// The rest of the lowering is not a pass of its own: it is what the parser and
// loader already did. `=>` is gone, `else if` is a nested if, prefix and postfix `++`
// have collapsed into one form, adjacent string literals have joined, and every
// `include` has been spliced in. Printing the AST is how you see it.
//
// Comments do not survive, because the AST does not carry them. That is why
// this is a desugar tool and not a formatter.

import { existsSync } from 'node:fs'

import { entryFor, fail, failWith, libRoot } from './cli.js'
import { load } from '../momo/loader.js'
import { printProgram } from '../momo/printer.js'
import { resolve } from '../momo/resolver.js'

const usage = 'usage: npm run desugar -- <project>'

const main = async () => {
  const project = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? ''
  if (!project) fail(`no project given\n${usage}`)

  const file = entryFor(project)
  if (!existsSync(file)) fail(`source not found: "${file}"`)

  const sources = new Map<string, string>()

  try {
    const { program } = load(file, libRoot, sources)
    resolve(program)
    process.stdout.write(printProgram(program))
  } catch (error) {
    failWith(sources, error)
  }
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
