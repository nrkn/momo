// Print a Momo project back as Momo, with the surface sugar already lowered.
//
//   npm run desugar -- simplerl
//
// Two pieces of the lowering happen in the resolver rather than earlier, so this
// runs `resolve` before printing and both show up. `*` on two fixed-point values
// becomes a call on fixMul, which needs types (DESIGN.md §25); and `bracket`
// blocks become the open, the body and the close, which needs every file in one
// program (DESIGN.md §48). The second is a pass of its own - `lowerBrackets` -
// and the only one here; everything else the resolver does is annotation, so
// nothing else in this output moved when either arrived.
//
// The rest is what the parser and loader already did. `=>` is gone, `else if` is a
// nested if, prefix and postfix `++` have collapsed into one form, adjacent string
// literals have joined, and every `include` has been spliced in. Printing the AST
// is how you see it.
//
// Which makes this the other half of `npm run parse` for §48: that dumps the AST
// before the resolver, so it shows `box { ... }`, and this shows the two calls.
//
// Comments do not survive, because the AST does not carry them. That is why
// this is a desugar tool and not a formatter.

import { existsSync } from 'node:fs'

import { entryFor, fail, failWith, sharedRoot } from './cli.js'
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
    const { program } = load(file, sharedRoot, sources)
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
