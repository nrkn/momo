// The Momo compiler: <project>.momo -> <project>.asm
//
//   npm run momoc -- smoke
//
// Writes the generated assembly next to the source, so `npm start -- smoke`
// picks it up and assembles it in DOSBox.

import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

import { allProjects, asmFor, entryFor, fail, libRoot } from './cli.js'
import { compile } from '../momo/compile.js'
import { formatError, isMomoError } from '../momo/diagnostics.js'

// Returns true on success. Errors are printed rather than thrown, so `--all`
// reports every failing project instead of stopping at the first - which is why
// this does not use `failWith`, the only tool that does not.
const compileProject = async (project: string): Promise<boolean> => {
  const file = entryFor(project)
  if (!existsSync(file)) {
    console.error(`error: source not found: "${file}"`)
    return false
  }

  const output = asmFor(project)
  const sources = new Map<string, string>()

  try {
    const { assembly } = compile(file, libRoot, sources)
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

  let failed = 0
  for (const name of projects) {
    if (!(await compileProject(name))) failed += 1
  }

  if (failed > 0) process.exit(1)
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
