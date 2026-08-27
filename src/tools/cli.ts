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

import { existsSync, readdirSync } from 'node:fs'
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
// project name twice. Where that directory SITS is not the project's business:
// it may be nested under any number of category directories, and nothing outside
// this file knows how deep it is. A name is the whole interface - the CLI takes a
// bare one, `.vscode/tasks.json` passes a bare basename, and `build/` is flat.
//
// Built on first use rather than at import: `grammar` and `editor` import this
// module and never look at a project, and a filesystem walk they do not need is
// a cost they should not pay.
let index: Map<string, string> | null = null

// A directory holding its own `.momo` or `.asm` is a project; anything else is a
// category, and is descended into. Both forms are real - `hello` and `keytest`
// are hand-written assembly with no Momo source at all - so looking for `.momo`
// alone would lose them, and the golden tier would stop reading their output.
const indexProjects = (dir: string, into: Map<string, string>) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const path = join(dir, entry.name)
    const owns = (extension: string) =>
      existsSync(join(path, `${entry.name}.${extension}`))

    if (!owns('momo') && !owns('asm')) {
      indexProjects(path, into)
      continue
    }

    // Since the name is the whole interface, two projects sharing one is not a
    // collision to resolve later but an ambiguity with no answer.
    if (into.has(entry.name)) {
      fail(`two projects named "${entry.name}": "${into.get(entry.name)}" and "${path}"`)
    }

    into.set(entry.name, path)
  }
}

const projectIndex = (): Map<string, string> => {
  if (!index) {
    index = new Map()
    indexProjects(projectsDir, index)
  }
  return index
}

// Every project name, sorted. Five tools enumerated `projects/` themselves, each
// pairing its own `readdirSync` with its own `existsSync` filter - the same
// duplication the paths above were consolidated out of, and the reason a nested
// layout used to mean editing five files and hoping.
export const allProjects = (): string[] => [...projectIndex().keys()].sort()

// An unknown name falls back to the flat path deliberately. Callers test
// `existsSync` and then report the path they wanted - `project entry not found:
// "..."` - so a miss has to yield that path rather than raise an error of its
// own. It is also what keeps `image.ts` right without changing it: a `build/`
// directory whose project has been deleted resolves to a path that does not
// exist, which is exactly the staleness test it already performs.
export const projectDir = (project: string): string =>
  projectIndex().get(project) ?? join(projectsDir, project)

export const entryFor = (project: string): string =>
  join(projectDir(project), `${project}.momo`)
export const asmFor = (project: string): string =>
  join(projectDir(project), `${project}.asm`)
export const expectedFor = (project: string): string =>
  join(projectDir(project), `${project}.expected`)

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
