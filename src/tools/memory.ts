// Static memory report for a Momo project.
//
//   npm run memory -- smoke
//
// Everything here is exact rather than estimated, because Momo has no dynamic
// allocation of any kind: every variable and array is a fixed size known at
// compile time, and the call graph is proven acyclic by the resolver.
//
// Code size is the one figure that comes from outside - it needs NASM - so it
// is reported only when a build exists.

import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { entryName, interruptReserve, stackBytes } from '../momo/analysis.js'
import { formatError, isMomoError } from '../momo/diagnostics.js'
import { compile } from '../momo/compile.js'
import { libRootFor } from '../momo/loader.js'
import { widthOf } from '../momo/types.js'

const root = process.cwd()
const projectsDir = join(root, 'data', 'projects')

// A .COM is loaded at offset 0x100, after the 256-byte PSP, and DOS points SP
// at the top of the same 64K segment.
const pspSize = 0x100
const segmentEnd = 0xfffe

const fail = (message: string): never => {
  console.error(`error: ${message}`)
  process.exit(1)
}

const row = (name: string, value: string, indent = 0) =>
  console.log(`  ${' '.repeat(indent)}${name.padEnd(24 - indent)}${value.padStart(12)}`)

const main = async () => {
  const project = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? ''
  if (!project) fail('usage: npm run memory -- <project>')

  const file = join(projectsDir, project, `${project}.momo`)
  if (!existsSync(file)) fail(`source not found: "${file}"`)

  const sources = new Map<string, string>()

  try {
    const resolved = compile(file, libRootFor(root), sources)
    const { temporaries } = resolved

    let reserved = 0
    let scalars = 0
    let arrays = 0
    let arrayCount = 0

    for (const symbol of resolved.symbols) {
      if (symbol.kind === 'var') {
        // Byte aliases are `equ` into the word storage - no bytes of their own.
        if (symbol.builtin) reserved += widthOf(symbol.type) === 2 ? 2 : 0
        else scalars += widthOf(symbol.type)
        continue
      }
      if (symbol.kind === 'array') {
        arrays += symbol.length * widthOf(symbol.elementType)
        arrayCount += 1
      }
    }

    const data = reserved + scalars + arrays

    // Calls are statements only, so an expression stack is always empty at a
    // call - no two subs ever have temporaries live at the same time.
    const { maxDepth, deepestPath } = resolved.callGraph
    let worstTemporaries = 0
    for (const depth of temporaries.values()) {
      if (depth > worstTemporaries) worstTemporaries = depth
    }
    const stack = stackBytes(resolved.callGraph, temporaries)

    console.log(`\n${project}.momo\n`)

    const binary = join(root, 'build', project, `${project}.com`)
    const imageSize = existsSync(binary) ? statSync(binary).size : null

    if (imageSize !== null) row('code', `${imageSize - data} bytes`)
    row('data', `${data} bytes`)
    row('reserved globals', `${reserved}`, 2)
    row('scalars', `${scalars}`, 2)
    row(`arrays (${arrayCount})`, `${arrays}`, 2)

    if (imageSize === null) {
      console.log('\n  code size needs a build - run: npm run build -- ' + project)
    } else {
      console.log()
      row('image', `${imageSize} bytes`)
      row('load range', `0x${pspSize.toString(16)}..0x${(pspSize + imageSize).toString(16)}`)
    }

    console.log()
    row('stack (worst case)', `${stack} bytes`)
    row('max call depth', `${maxDepth}`, 2)
    row('max temporaries', `${worstTemporaries}`, 2)
    row('+ interrupt reserve', `${interruptReserve}`, 2)

    const path = deepestPath.map((name) => (name === entryName ? 'entry' : name)).join(' > ')
    console.log(`\n  deepest path            ${path}`)

    if (imageSize !== null) {
      const heap = segmentEnd - pspSize - imageSize - stack - interruptReserve
      console.log()
      row('heap (_hsize)', `${heap} bytes`)
      if (heap <= 0) {
        console.log('\n  error: the image leaves no room for the heap or stack')
        process.exit(1)
      }
    }

    console.log()
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
