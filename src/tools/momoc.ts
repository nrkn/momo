// The Momo compiler: <project>.momo -> <project>.asm
//
//   npm run momoc -- smoke
//   npm run momoc:all        every project, and every tests/compile/ok- fixture
//
// Writes the generated assembly next to the source, so `npm start -- smoke`
// picks it up and assembles it in DOSBox. `--all` is also how a deliberate
// codegen change is adopted, so it writes every file the golden tier compares -
// the ok- fixtures' included, which no project exercises the shapes of.

import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

import { allProjects, asmBeside, asmFor, entryFor, fail, okTests, sharedRoot } from './cli.js'
import { compile } from '../momo/compile.js'
import { formatError, isMomoError } from '../momo/diagnostics.js'

// Returns true on success. Errors are printed rather than thrown, so `--all`
// reports every failing project instead of stopping at the first - which is why
// this does not use `failWith`, the only tool that does not.
const compileFile = async (file: string, output: string): Promise<boolean> => {
  if (!existsSync(file)) {
    console.error(`error: source not found: "${file}"`)
    return false
  }

  const sources = new Map<string, string>()

  try {
    const { assembly } = compile(file, sharedRoot, sources)
    await writeFile(output, assembly, 'ascii')
    console.log(`ok: ${output}  (${assembly.split('\r\n').length} lines)`)
    return true
  } catch (error) {
    if (!isMomoError(error)) throw error
    console.error(formatError(sources, error))
    return false
  }
}

const main = async () => {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const project = args.find((arg) => !arg.startsWith('-')) ?? ''

  if (!all && !project) fail('usage: npm run momoc -- <project>   (or npm run momoc:all)')

  const projects = all
    ? allProjects().filter((name) => existsSync(entryFor(name)))
    : [project]

  const jobs: [string, string][] = projects.map((name) => [entryFor(name), asmFor(name)])
  if (all) for (const file of okTests()) jobs.push([file, asmBeside(file)])

  let failed = 0
  for (const [file, output] of jobs) {
    if (!(await compileFile(file, output))) failed += 1
  }

  if (failed > 0) process.exit(1)
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
