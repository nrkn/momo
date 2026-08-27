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
import { join } from 'node:path'

import { buildRoot, entryFor, fail, failWith, sharedRoot } from './cli.js'
import { entryName, interruptReserve, stackBytes } from '../momo/analysis.js'
import { compile } from '../momo/compile.js'
import { widthOf } from '../momo/types.js'

// A .COM is loaded at offset 0x100, after the 256-byte PSP, and DOS points SP
// at the top of the same 64K segment.
const pspSize = 0x100
const segmentEnd = 0xfffe

const row = (name: string, value: string, indent = 0) =>
  console.log(`  ${' '.repeat(indent)}${name.padEnd(24 - indent)}${value.padStart(12)}`)

const main = async () => {
  const project = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? ''
  if (!project) fail('usage: npm run memory -- <project>')

  const file = entryFor(project)
  if (!existsSync(file)) fail(`source not found: "${file}"`)

  const sources = new Map<string, string>()

  try {
    const resolved = compile(file, sharedRoot, sources)
    const { temporaries } = resolved

    let reserved = 0
    let scalars = 0
    let arrays = 0
    let arrayCount = 0
    let viewCount = 0

    for (const symbol of resolved.symbols) {
      // An alias has no bytes of its own - a register byte half, `_heapw`, or a
      // view. Counting one would report storage that was never allocated, and
      // double-count what its parent already contributed. Only the ones the
      // program wrote are worth reporting; arrays carry no `builtin` flag, so for
      // those the one builtin alias is named.
      if ((symbol.kind === 'var' || symbol.kind === 'array') && symbol.alias) {
        const builtin = symbol.kind === 'var' ? symbol.builtin : symbol.label === '_heapw'
        if (!builtin) viewCount += 1
        continue
      }
      if (symbol.kind === 'var') {
        if (symbol.builtin) reserved += widthOf(symbol.type)
        else scalars += widthOf(symbol.type)
        continue
      }
      if (symbol.kind === 'array') {
        // The heap is reported on its own, below, and is not in the image.
        if (symbol.dynamic) continue
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

    const binary = join(buildRoot, project, `${project}.com`)
    const imageSize = existsSync(binary) ? statSync(binary).size : null

    // Whether that .COM is older than the source it claims to be the size of.
    //
    // `build/` keeps the output of everything ever built here and nothing prunes
    // it, so a stale binary reads exactly like a current one - the figure is a real
    // number from a real build, just not this one. That has now misled three
    // separate measurements: tennis reported 4,110 bytes from a build predating its
    // last two commits, and the vector port reported an image of 3,478 bytes
    // against 4,601 bytes of data, which is not a number that can exist.
    //
    // The second of those is the tell worth keeping in mind: the figures were
    // mutually impossible and got written down anyway. So this says so rather than
    // leaving it to whoever notices.
    const staleBy = imageSize === null
      ? null
      : (() => {
          const source = entryFor(project)

          if (!existsSync(source)) return null

          const built = statSync(binary).mtimeMs
          const written = statSync(source).mtimeMs

          return written > built ? Math.round((written - built) / 1000) : null
        })()

    if (imageSize !== null) row('code', `${imageSize - data} bytes`)
    row('data', `${data} bytes`)
    row('reserved globals', `${reserved}`, 2)
    row('scalars', `${scalars}`, 2)
    row(`arrays (${arrayCount})`, `${arrays}`, 2)
    // Listed as aliases rather than counted: the bytes are above, in whatever the
    // view points into.
    if (viewCount) row(`views (${viewCount})`, 'aliases', 2)

    if (imageSize === null) {
      console.log('\n  code size needs a build - run: npm run build -- ' + project)
    } else {
      console.log()
      row('image', `${imageSize} bytes`)
      row('load range', `0x${pspSize.toString(16)}..0x${(pspSize + imageSize).toString(16)}`)

      if (staleBy !== null) {
        console.log()
        console.log(
          `  warning: the build is ${staleBy}s older than the source, so code and`,
        )
        console.log(
          '           image above are from an earlier version - rebuild with:',
        )
        console.log(`             npm run build -- ${project}`)
      }
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
    failWith(sources, error)
  }
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
