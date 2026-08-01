// What every CLI entry point needs: where things live, and how to give up.
//
// Not a stage and not a compiler concern - `src/momo/` stays the four pure
// stages plus what they need. This is the layer above, and it exists because
// ten tools had derived the same paths from `process.cwd()` independently, so
// moving the projects directory meant editing eight files and hoping. It was
// moved out of `data/` one commit later, and the edit was this one line.
//
// `fail` is the tool half of the two error layers in STYLE.md: a tool-level
// problem (missing file, bad argument, no DOSBox) exits with a message, where a
// compiler stage raises a MomoError carrying a source position.

import { join } from 'node:path'

import { formatError, isMomoError } from '../momo/diagnostics.js'
import { libRootFor } from '../momo/loader.js'

export const root = process.cwd()

export const projectsDir = join(root, 'projects')
export const buildRoot = join(root, 'build')
export const nasmDir = join(root, 'data', 'dos-nasm')
export const confPath = join(root, 'data', 'dosbox.conf')
export const compileTestsDir = join(root, 'tests', 'compile')
export const editorDir = join(root, 'editor', 'vscode')
export const designPath = join(root, 'DESIGN.md')
export const libRoot = libRootFor(root)

// A project is a directory named for its entry file, so every path in it is the
// project name twice. These are the only places that knows that.
export const projectDir = (project: string): string => join(projectsDir, project)
export const entryFor = (project: string): string =>
  join(projectsDir, project, `${project}.momo`)
export const asmFor = (project: string): string =>
  join(projectsDir, project, `${project}.asm`)
export const expectedFor = (project: string): string =>
  join(projectsDir, project, `${project}.expected`)

export const fail = (message: string): never => {
  console.error(`error: ${message}`)
  process.exit(1)
}

// A compile error, printed with its source line and caret. Anything that is not
// a MomoError is a bug in the compiler rather than in the user's program, so it
// is rethrown to keep its stack trace.
export const failWith = (sources: Map<string, string>, error: unknown): never => {
  if (!isMomoError(error)) throw error
  console.error(formatError(sources, error))
  process.exit(1)
}
