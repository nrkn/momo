// Static memory report for a Momo project.
//
//   npm run memory -- smoke
//
// Everything here is exact rather than estimated, because Momo has no dynamic
// allocation of any kind: every variable and array is a fixed size known at
// compile time, and the call graph is proven acyclic by the resolver. The
// figures are `footprint.ts`'s, which tier 1 also holds every project to.
//
// Code size is the one figure that comes from outside - it needs NASM - so it
// is reported only when a build exists.

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { buildRoot, entryFor, fail, failWith, sharedRoot } from './cli.js'
import { footprintOf, heapLeft, pspSize } from './footprint.js'
import { interruptReserve } from '../momo/analysis.js'
import { compile } from '../momo/compile.js'

const row = (name: string, value: string, indent = 0) =>
  console.log(`  ${' '.repeat(indent)}${name.padEnd(24 - indent)}${value.padStart(12)}`)

const main = async () => {
  const project = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? ''
  if (!project) fail('usage: npm run memory -- <project>')

  const file = entryFor(project)
  if (!existsSync(file)) fail(`source not found: "${file}"`)

  const sources = new Map<string, string>()

  try {
    const footprint = footprintOf(compile(file, sharedRoot, sources))
    const { reserved, scalars, arrays, arrayCount, viewCount, heapViews, heapClaim, data, stack } = footprint

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
    row('max call depth', `${footprint.maxDepth}`, 2)
    row('max temporaries', `${footprint.worstTemporaries}`, 2)
    row('+ interrupt reserve', `${interruptReserve}`, 2)

    console.log(`\n  deepest path            ${footprint.deepestPath.join(' > ')}`)

    if (imageSize !== null) {
      const heap = heapLeft(footprint, imageSize)
      console.log()
      row('heap (_hsize)', `${heap} bytes`)
      if (heap <= 0) {
        console.log('\n  error: the image leaves no room for the heap or stack')
        process.exit(1)
      }

      if (heapViews) {
        row(`claimed by views (${heapViews})`, `${heapClaim}`, 2)
        row('unclaimed', `${heap - heapClaim}`, 2)
      }

      // The same class of failure as a negative heap, and it used to be silent.
      // A program whose views reach past the heap compiles, builds, runs, and
      // writes over whatever is there.
      if (heapClaim > heap) {
        console.log(
          `\n  error: views reach ${heapClaim - heap} bytes past the end of the heap`,
        )
        process.exit(1)
      }
    } else if (heapViews) {
      // The claim is known from the source; what it has to fit inside is not,
      // because the heap is what the image leaves.
      console.log(`\n  views claim ${heapClaim} bytes of heap - what is left needs a build`)
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
