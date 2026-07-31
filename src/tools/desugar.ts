// Print a Momo project back as Momo, with the surface sugar already lowered.
//
//   npm run desugar -- simplerl              to stdout
//   npm run desugar -- simplerl out.momo     and to a file
//
// The lowering is not a pass of its own: it is what the parser and loader
// already did. `=>` is gone, `else if` is a nested if, prefix and postfix `++`
// have collapsed into one form, adjacent string literals have joined, and every
// `include` has been spliced in. Printing the AST is how you see it.
//
// Comments do not survive, because the AST does not carry them. That is why
// this is a desugar tool and not a formatter.

import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { formatError, isMomoError } from '../momo/diagnostics.js'
import { libRootFor, load } from '../momo/loader.js'
import { printProgram } from '../momo/printer.js'

const root = process.cwd()
const projectsDir = join(root, 'data', 'projects')

const usage = 'usage: npm run desugar -- <project> [out.momo]'

const fail = (message: string): never => {
  console.error(`error: ${message}`)
  process.exit(1)
}

const main = async () => {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
  const project = args[0] ?? ''
  const out = args[1]

  if (!project) fail(`no project given\n${usage}`)

  const file = join(projectsDir, project, `${project}.momo`)
  if (!existsSync(file)) fail(`source not found: "${file}"`)

  const sources = new Map<string, string>()

  try {
    const { program } = load(file, libRootFor(root), sources)
    const text = printProgram(program)

    if (!out) {
      process.stdout.write(text)
      return
    }

    await writeFile(join(root, out), text, 'utf8')
    console.log(`ok: ${join(root, out)}  (${text.split('\n').length - 1} lines)`)
  } catch (error) {
    if (!isMomoError(error)) throw error
    console.error(formatError(sources, error))
    process.exit(1)
  }
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
