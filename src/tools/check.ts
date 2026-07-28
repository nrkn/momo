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
  if (symbol.kind === 'var') return `${symbol.type}${symbol.builtin ? '  (reserved)' : ''}`
  if (symbol.kind === 'group') {
    // The group itself has no storage - its fields are listed separately, as the
    // ordinary arrays or variables they compile to.
    const fields = symbol.fields.map((field) => field.name).join(', ')
    const shape = symbol.count === null ? 'group' : `group[${symbol.count}]`
    return `${shape}  { ${fields} }`
  }
  if (symbol.dynamic) return `${symbol.elementType}[_hsize]  heap`
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

    const arrays = symbols.filter((symbol) => symbol.kind === 'array')
    const bytes = arrays.reduce(
      (total, symbol) =>
        symbol.kind === 'array'
          ? total + symbol.length * (symbol.elementType.endsWith('16') ? 2 : 1)
          : total,
      0,
    )

    console.log(`\nok: ${shown.length} symbols, ${arrays.length} arrays, ${bytes} bytes of array data`)
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
