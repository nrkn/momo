// A compiled program's static footprint: what `npm run memory` prints, and what
// tier 1 holds every project to.
//
// Everything here is exact rather than estimated, because Momo has no dynamic
// allocation of any kind: every variable and array is a fixed size known at
// compile time, and the call graph is proven acyclic by the resolver. Code size
// is the one figure that comes from outside - it needs NASM - so what the heap
// is left with is only known given an image size. Without one, the data is the
// least the image can be, which is what `staticOverflow` asks.

import { entryName, interruptReserve, stackBytes } from '../momo/analysis.js'
import type { Compilation } from '../momo/compile.js'
import { widthOf } from '../momo/types.js'

// A .COM is loaded at offset 0x100, after the 256-byte PSP, and DOS points SP
// at the top of the same 64K segment.
export const pspSize = 0x100
export const segmentEnd = 0xfffe

export type Footprint = {
  reserved: number
  scalars: number
  arrays: number
  arrayCount: number
  viewCount: number
  heapViews: number
  heapClaim: number
  data: number
  stack: number
  maxDepth: number
  worstTemporaries: number
  deepestPath: string[]
}

export const footprintOf = (resolved: Compilation): Footprint => {
  const { temporaries } = resolved

  let reserved = 0
  let scalars = 0
  let arrays = 0
  let arrayCount = 0
  let viewCount = 0
  let heapViews = 0
  let heapClaim = 0

  for (const symbol of resolved.symbols) {
    // An alias has no bytes of its own - a register byte half, `_heapw`, or a
    // view. Counting one would report storage that was never allocated, and
    // double-count what its parent already contributed. Only the ones the
    // program wrote are worth reporting; arrays carry no `builtin` flag, so for
    // those the one builtin alias is named.
    if ((symbol.kind === 'var' || symbol.kind === 'array') && symbol.alias) {
      const builtin = symbol.kind === 'var' ? symbol.builtin : symbol.label === '_heapw'
      if (builtin) continue

      // A view over `_heap` is a different thing from a view into an array, and
      // the difference is §13: **the heap emits no storage**, so there are no
      // bytes above for this one to be a share of. It is a claim on memory
      // nothing else counted - a static capacity, and until this it was the one
      // kind this tool could not see. `view u8[60000] big = _heap[0]` compiled
      // clean and was reported as an alias with the whole heap still free.
      //
      // Views compose to a real parent, so `_heap` here also catches a view of
      // `_heapw` and a view of a view.
      if (symbol.alias.parent === '_heap') {
        const bytes = symbol.kind === 'array'
          ? symbol.length * widthOf(symbol.elementType)
          : widthOf(symbol.type)

        // The furthest extent rather than the sum. §17's type punning puts two
        // views over the same bytes deliberately - `view u16[50] words =
        // bytes[0]` beside the bytes - and adding those would report twice the
        // memory anybody claimed. What a layout needs is where it reaches.
        heapClaim = Math.max(heapClaim, symbol.alias.byteOffset + bytes)
        heapViews += 1
        continue
      }

      viewCount += 1
      continue
    }
    // A segment register has no bytes either, for the same reason an alias
    // does not: the read is an instruction rather than a load (§35), and
    // nothing is reserved for it in the data section.
    if (symbol.kind === 'var' && symbol.segment) continue
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

  // Calls are statements only, so an expression stack is always empty at a
  // call - no two subs ever have temporaries live at the same time.
  const { maxDepth, deepestPath } = resolved.callGraph
  let worstTemporaries = 0
  for (const depth of temporaries.values()) {
    if (depth > worstTemporaries) worstTemporaries = depth
  }

  return {
    reserved,
    scalars,
    arrays,
    arrayCount,
    viewCount,
    heapViews,
    heapClaim,
    data: reserved + scalars + arrays,
    stack: stackBytes(resolved.callGraph, temporaries),
    maxDepth,
    worstTemporaries,
    deepestPath: deepestPath.map((name) => (name === entryName ? 'entry' : name)),
  }
}

// What the heap is left with once an image of this size and the stack are placed.
export const heapLeft = (footprint: Footprint, imageSize: number): number =>
  segmentEnd - pspSize - imageSize - footprint.stack - interruptReserve

// The two failures `npm run memory` reports, asked with no build: the image is
// at least its data, so a heap that is already gone, or views that already reach
// past it, stay that way once code is added. Null when neither holds yet - which
// is necessary for fitting rather than sufficient, since code is not counted.
export const staticOverflow = (footprint: Footprint): string | null => {
  const heap = heapLeft(footprint, footprint.data)
  if (heap <= 0) {
    return `${footprint.data} bytes of data and ${footprint.stack} of stack leave` +
      ` ${heap} bytes of heap before any code`
  }
  if (footprint.heapClaim > heap) {
    return `views reach ${footprint.heapClaim - heap} bytes past the end of the heap before any code`
  }
  return null
}
