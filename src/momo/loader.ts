// Resolves `include` into one merged Program.
//
// Includes are ALWAYS once-only. There is no legitimate reason to include a file
// twice in Momo - the only language that benefits is C with X-macro tricks, and
// we have no macros - so diamond dependencies just work with no guards.
//
// Two details make that hold:
//
//   1. Files are identified by `realpathSync.native()`, not by string. Windows
//      filesystems are case-insensitive, so "std/io.momo" and "Std/IO.momo" are
//      the same file but different strings; naive dedupe would include it twice
//      and produce duplicate-declaration errors that look insane.
//   2. A file is marked seen BEFORE its own includes are visited, so a cycle
//      terminates instead of looping forever.
//
// Each file is parsed separately and its statements spliced in, so every node
// keeps its own file's line numbers - an error inside an included file reports
// against that file.

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path'

import type { Program, Statement } from './ast.js'
import { raise, type Location } from './diagnostics.js'
import { promoteUnits, tokenize, unitNamesIn } from './lexer.js'
import { parse } from './parser.js'

export type LoadResult = {
  program: Program
  // file path -> text, for diagnostics and for the emitter's source comments
  sources: Map<string, string>
  files: string[]
}

const canonical = (path: string): string => realpathSync.native(path)

// `sources` is supplied by the caller and filled as files are read, so that a
// failure part-way through still leaves enough behind to format the error.
export const load = (
  entryPath: string,
  sharedRoot: string,
  sources: Map<string, string>,
): LoadResult => {
  const seen = new Set<string>()
  const files: string[] = []
  const body: Statement[] = []

  // Relative to the including file first, then the shared root.
  const locate = (request: string, fromFile: string, at: Location): string => {
    const candidates = isAbsolute(request)
      ? [request]
      : [resolvePath(dirname(fromFile), request), resolvePath(sharedRoot, request)]

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }

    raise(at, `cannot find include "${request}"`)
  }

  // A first walk, for `unit` names only (§39). It has to happen before anything
  // is parsed: a unit makes its name a type, the lexer is what marks a token as
  // one, and a file is parsed before the includes inside it are visited - so by
  // the time an included unit was known, the file that uses it would already be
  // an AST.
  //
  // Includes are found in the token stream rather than by parsing, which is the
  // whole reason this is cheap. Units end up program-wide rather than
  // include-ordered, so a unit may be used above or before its declaration, which
  // is one fewer rule than the alternative.
  const units = new Set<string>()
  const scanned = new Set<string>()

  const scanUnits = (path: string) => {
    const real = canonical(path)
    if (scanned.has(real)) return
    scanned.add(real)

    const tokens = tokenize(readFileSync(real, 'utf8'), real)
    for (const name of unitNamesIn(tokens)) units.add(name)

    for (let i = 0; i < tokens.length - 1; i++) {
      const token = tokens[i]
      if (token.kind !== 'keyword' || token.text !== 'include') continue
      const target = tokens[i + 1]
      if (target.kind === 'string') scanUnits(locate(target.str, real, target))
    }
  }

  const visit = (path: string) => {
    const real = canonical(path)
    if (seen.has(real)) return
    seen.add(real) // before recursing, so cycles terminate

    const source = readFileSync(real, 'utf8')
    sources.set(real, source)
    files.push(real)

    const tokens = tokenize(source, real)
    promoteUnits(tokens, units)

    for (const statement of parse(tokens).body) {
      if (statement.type === 'IncludeStatement') {
        visit(locate(statement.path, real, statement))
        continue
      }
      body.push(statement)
    }
  }

  const entry = canonical(entryPath)
  scanUnits(entry)
  visit(entry)

  return {
    program: { type: 'Program', body, file: entry, line: 1, col: 1 },
    sources,
    files,
  }
}

// The root a non-relative include resolves against. `shared/` rather than `lib/`
// because it holds more than libraries: `shared/lib/` is the code, `shared/scenes/`
// is data read by more than one project. One root, so DESIGN §11's search order
// stays two candidates deep and there is still no special case.
export const sharedRootFor = (root: string): string => join(root, 'shared')
