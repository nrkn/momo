// The Momo compiler: <project>.momo -> <project>.asm
//
//   npm run momoc -- smoke
//
// Writes the generated assembly next to the source, so `npm start -- smoke`
// picks it up and assembles it in DOSBox.

import { existsSync, readdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { compile } from '../momo/compile.js'
import { formatError, isMomoError } from '../momo/diagnostics.js'
import { libRootFor } from '../momo/loader.js'

const root = process.cwd()
const projectsDir = join(root, 'data', 'projects')

const fail = (message: string): never => {
  console.error(`error: ${message}`)
  process.exit(1)
}

// Returns true on success. Errors are printed rather than thrown, so `--all`
// reports every failing project instead of stopping at the first.
const compileProject = async (project: string): Promise<boolean> => {
  const file = join(projectsDir, project, `${project}.momo`)
  if (!existsSync(file)) {
    console.error(`error: source not found: "${file}"`)
    return false
  }

  const output = join(projectsDir, project, `${project}.asm`)
  const sources = new Map<string, string>()

  try {
    const { assembly } = compile(file, libRootFor(root), sources)
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
    ? readdirSync(projectsDir).filter((name) =>
        existsSync(join(projectsDir, name, `${name}.momo`)),
      )
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
