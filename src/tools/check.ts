// Lex, parse and resolve a Momo project, then report the symbol table.
//
//   npm run check -- smoke

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { formatError, isMomoError } from '../momo/diagnostics.js'
import { compile } from '../momo/compile.js'
import { libRootFor } from '../momo/loader.js'
import type { MomoSymbol } from '../momo/resolver.js'

const root = process.cwd()
const projectsDir = join(root, 'data', 'projects')

const fail = (message: string): never => {
  console.error(`error: ${message}`)
  process.exit(1)
}

const at = (alias: { parent: string; byteOffset: number }): string =>
  alias.byteOffset === 0 ? alias.parent : `${alias.parent} + ${alias.byteOffset}`

const describe = (symbol: MomoSymbol): string => {
  if (symbol.kind === 'const') return `const ${symbol.type} = ${symbol.value}`
  if (symbol.kind === 'routine') {
    const params = symbol.params.map((p) => p.type).join(', ')
    if (!symbol.returnType) return params ? `sub (${params})` : 'sub'
    return `${symbol.returnType} (${params})`
  }
  if (symbol.kind === 'constfn') {
    const params = symbol.params.map((p) => p.type).join(', ')
    return `const (${params}) -> ${symbol.returnType ?? 'inferred'}`
  }
  // An alias reports where it points rather than a size: the bytes belong to its
  // parent, and are counted there.
  if (symbol.kind === 'var' && symbol.alias) {
    return `view ${symbol.type} @ ${at(symbol.alias)}${symbol.readonly ? '  const' : ''}`
  }
  if (symbol.kind === 'var') return `${symbol.type}${symbol.builtin ? '  (reserved)' : ''}`
  if (symbol.kind === 'far') {
    // No bytes of ours, so no size is reported - the extent is an assertion
    // about hardware, not something we allocated.
    const where =
      symbol.segment.from === 'const'
        ? `0x${symbol.segment.value.toString(16).toUpperCase()}`
        : `[${symbol.segment.label}]`
    const at = symbol.offset === 0 ? where : `${where}:0x${symbol.offset.toString(16).toUpperCase()}`
    const extent = symbol.length === null ? '' : `[${symbol.length}]`
    return `far ${symbol.elementType}${extent} @ ${at}${symbol.readonly ? '  const' : ''}`
  }
  if (symbol.kind === 'group') {
    // The group itself has no storage - its fields are listed separately, as the
    // ordinary arrays or variables they compile to.
    const fields = symbol.fields.map((field) => field.name).join(', ')
    const shape = symbol.count === null ? 'group' : `group[${symbol.count}]`
    return `${shape}  { ${fields} }`
  }
  // Before the alias case: `_heapw` is both, and "u16[0]" would be a worse
  // answer than "the heap, as words" for something whose length is not known
  // until NASM has run.
  if (symbol.dynamic) return `${symbol.elementType}[_hsize]  heap`
  if (symbol.alias) {
    return (
      `view ${symbol.elementType}[${symbol.length}] @ ${at(symbol.alias)}` +
      `${symbol.readonly ? '  const' : ''}`
    )
  }
  const bytes = symbol.length * (symbol.elementType === 'u16' || symbol.elementType === 'i16' ? 2 : 1)
  return `${symbol.elementType}[${symbol.length}]  ${bytes} bytes${symbol.readonly ? '  const' : ''}`
}

const main = async () => {
  const project = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? ''
  if (!project) fail('usage: npm run check -- <project>')

  const file = join(projectsDir, project, `${project}.momo`)
  if (!existsSync(file)) fail(`source not found: "${file}"`)

  const sources = new Map<string, string>()

  try {
    const { symbols } = compile(file, libRootFor(root), sources)

    const shown = symbols.filter((symbol) => !(symbol.kind === 'var' && symbol.builtin))
    const width = Math.max(...shown.map((symbol) => symbol.label.length))

    for (const symbol of shown) {
      console.log(`  ${symbol.label.padEnd(width)}  ${describe(symbol)}`)
    }

    // Only arrays that occupy bytes. A view's storage is its parent's, and the
    // heap's is not in the image at all - counting either reports data that was
    // never allocated.
    const arrays = symbols.filter(
      (symbol) => symbol.kind === 'array' && !symbol.alias && !symbol.dynamic,
    )
    const bytes = arrays.reduce(
      (total, symbol) =>
        symbol.kind === 'array'
          ? total + symbol.length * (symbol.elementType.endsWith('16') ? 2 : 1)
          : total,
      0,
    )
    const views = symbols.filter((symbol) => {
      if (symbol.kind === 'array') return symbol.alias !== undefined && !symbol.dynamic
      if (symbol.kind === 'var') return symbol.alias !== undefined && !symbol.builtin
      return false
    })

    console.log(
      `\nok: ${shown.length} symbols, ${arrays.length} arrays, ${bytes} bytes of array data` +
        (views.length ? `, ${views.length} views (no storage)` : ''),
    )
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
