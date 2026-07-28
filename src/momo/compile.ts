// The whole front end in one call: source file -> assembly.
//
// Every tool needs the same chain - load, resolve, prune, emit - so it lives
// here rather than being repeated four times with slightly different bugs.

import { prune, type CallGraph } from './analysis.js'
import { emit } from './emitter.js'
import { load } from './loader.js'
import { resolve, type MomoSymbol } from './resolver.js'

export type Compilation = {
  assembly: string
  symbols: MomoSymbol[]
  callGraph: CallGraph
  temporaries: Map<string, number>
  files: string[]
}

// `sources` is supplied by the caller and filled as files are read, so a failure
// part-way through still leaves enough behind to format the error.
export const compile = (
  entryFile: string,
  libRoot: string,
  sources: Map<string, string>,
): Compilation => {
  const { program, files } = load(entryFile, libRoot, sources)
  const resolved = resolve(program)
  const pruned = { ...resolved, ...prune(resolved) }
  const { assembly, temporaries } = emit(pruned, sources)

  return {
    assembly,
    symbols: pruned.symbols,
    callGraph: resolved.callGraph,
    temporaries,
    files,
  }
}
