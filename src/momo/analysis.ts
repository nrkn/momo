// Call graph analysis.
//
// Momo allocates locals statically, so a recursive call overwrites its own
// caller's variables - recursion is never useful here, it is always a bug. That
// makes rejecting it a straight win, and it also buys something else: with the
// call graph proven acyclic, worst-case stack usage becomes a static quantity.

import type { Program, Statement } from './ast.js'

// Structural, to avoid importing the resolver and creating a cycle.
type PrunableSymbol =
  | { kind: 'var'; name: string; label: string; builtin: boolean; owner?: string }
  | { kind: 'array'; name: string; label: string; dynamic: boolean }
  | { kind: 'const'; name: string; label: string }
  | { kind: 'constfn'; name: string; label: string }
  | {
      kind: 'routine'
      name: string
      label: string
      params: { name: string; label: string }[]
      retLabel: string | null
    }
import { raise } from './diagnostics.js'

export const entryName = '__entry'

// DOS switches to an internal stack for most int 21h calls, but BIOS handlers
// generally run on ours. Not computable - a documented allowance.
export const interruptReserve = 256

// Once `fn` calls can appear inside expressions, a call may happen while the
// caller still has temporaries pushed - so temporaries SUM down the call path
// rather than being maxed across it.
//
//   cost(S) = 2 (its return address) + 2 * temporaries(S) + max(cost of callees)
//
// Conservative: it assumes a sub's peak temporaries are live at its deepest
// call, which may not be so. Exact enough to size the heap safely.
export const stackBytes = (graph: CallGraph, temporaries: Map<string, number>): number => {
  const memo = new Map<string, number>()

  const cost = (name: string): number => {
    const known = memo.get(name)
    if (known !== undefined) return known

    memo.set(name, 0) // guards against a cycle; the resolver rejects those anyway

    let deepest = 0
    for (const call of graph.edges.get(name) ?? []) {
      const candidate = cost(call.name)
      if (candidate > deepest) deepest = candidate
    }

    const total = 2 + 2 * (temporaries.get(name) ?? 0) + deepest
    memo.set(name, total)
    return total
  }

  let deepest = 0
  for (const call of graph.edges.get(entryName) ?? []) {
    const candidate = cost(call.name)
    if (candidate > deepest) deepest = candidate
  }

  return 2 * (temporaries.get(entryName) ?? 0) + deepest
}

export type CallSite = { name: string; file: string; line: number; col: number }

export type CallGraph = {
  // Caller -> the subs it calls, in source order. Top-level statements are
  // collected under `entryName`.
  edges: Map<string, CallSite[]>
  maxDepth: number
  deepestPath: string[]
}

// Calls can appear inside expressions now that `fn` exists. Missing those would
// let a recursive fn through the cycle check AND let tree-shaking delete a sub
// that is still reachable - both silent, both fatal.
const collectFromExpression = (value: unknown, into: CallSite[]) => {
  if (Array.isArray(value)) {
    for (const item of value) collectFromExpression(item, into)
    return
  }
  if (typeof value !== 'object' || value === null) return

  const node = value as Record<string, unknown> & { type?: string }

  // A call to a parameterised const carries its `expansion`, and is substituted
  // rather than called - so it is not an edge. Counting it inflated the reported
  // call depth and stack, and put a const in the "deepest path".
  if (node.type === 'CallExpression' && !node.expansion) {
    const callee = node.callee as { name: string }
    into.push({
      name: callee.name,
      file: node.file as string,
      line: node.line as number,
      col: node.col as number,
    })
  }

  for (const key of Object.keys(node)) {
    if (key === 'expansion') continue // already covered by the original call
    collectFromExpression(node[key], into)
  }
}

const collectCalls = (statements: Statement[], into: CallSite[]) => {
  for (const statement of statements) {
    collectFromExpression(
      Object.fromEntries(
        Object.entries(statement).filter(([key]) => key !== 'body' && key !== 'consequent' && key !== 'alternate'),
      ),
      into,
    )

    if (statement.type === 'CallStatement') {
      into.push({ name: statement.callee.name, file: statement.file, line: statement.line, col: statement.col })
      continue
    }
    if (statement.type === 'BlockStatement') {
      collectCalls(statement.body, into)
      continue
    }
    if (statement.type === 'IfStatement') {
      collectCalls([statement.consequent], into)
      if (statement.alternate) collectCalls([statement.alternate], into)
      continue
    }
    if (statement.type === 'ForStatement') {
      if (statement.init) collectCalls([statement.init], into)
      if (statement.update) collectCalls([statement.update], into)
      collectCalls([statement.body], into)
      continue
    }
    if (statement.type === 'WhileStatement' || statement.type === 'DoWhileStatement') {
      collectCalls([statement.body], into)
    }
  }
}

// Drops subs that nothing reaches, and the storage nothing references. Momo has
// no linker, so without this every `include` would pay for the whole library.
export const prune = <S extends PrunableSymbol>(result: {
  program: Program
  symbols: S[]
  callGraph: CallGraph
}): { program: Program; symbols: S[] } => {
  const reachable = new Set<string>([entryName])
  const queue = [entryName]

  while (queue.length > 0) {
    const name = queue.pop()
    if (name === undefined) break
    for (const call of result.callGraph.edges.get(name) ?? []) {
      if (reachable.has(call.name)) continue
      reachable.add(call.name)
      queue.push(call.name)
    }
  }

  const body = result.program.body.filter((statement) => {
    if (statement.type !== 'RoutineDeclaration') return true
    return reachable.has(statement.name)
  })

  // Collect every label the retained code actually mentions. Walking generically
  // rather than per-node-type means a new node kind cannot silently be missed.
  const used = new Set<string>()

  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value !== 'object' || value === null) return

    const node = value as Record<string, unknown> & { type?: string; label?: string }

    // A declaration's own label is not a use - only references count.
    if (node.type === 'VariableDeclaration' || node.type === 'ConstDeclaration') {
      walk(node.init)
      return
    }

    if (typeof node.label === 'string') used.add(node.label)
    for (const key of Object.keys(node)) {
      if (key === 'label') continue
      walk(node[key])
    }
  }

  walk(body)

  const symbols = result.symbols.filter((symbol) => {
    if (symbol.kind === 'routine') return reachable.has(symbol.name)
    // A fn's parameter and return slots live or die with the fn: the call site
    // writes them even when the body never reads them.
    if (symbol.kind === 'var' && symbol.owner) return reachable.has(symbol.owner)
    // Reserved registers, _hsize and the heap views are always present.
    if (symbol.kind === 'var' && symbol.builtin) return true
    if (symbol.kind === 'array' && symbol.dynamic) return true
    return used.has(symbol.label)
  })

  return { program: { ...result.program, body }, symbols }
}

export const buildCallGraph = (program: Program): CallGraph => {
  const edges = new Map<string, CallSite[]>()

  const isCallable = (statement: Statement) => statement.type === 'RoutineDeclaration'

  const entryCalls: CallSite[] = []
  collectCalls(
    program.body.filter((statement) => !isCallable(statement)),
    entryCalls,
  )
  edges.set(entryName, entryCalls)

  for (const statement of program.body) {
    if (!isCallable(statement)) continue
    const calls: CallSite[] = []
    collectCalls(statement.body.body, calls)
    edges.set(statement.name, calls)
  }

  // Depth-first cycle detection. `active` is the current path, so a call back
  // into it is exactly a cycle - and the path shows the user the whole loop.
  const active: string[] = []
  const finished = new Set<string>()

  const visit = (name: string, site: CallSite | null) => {
    if (active.includes(name)) {
      const cycle = [...active.slice(active.indexOf(name)), name].join(' -> ')
      const where = site ?? { file: program.file, line: 1, col: 1 }
      raise(where, `recursion is not supported: ${cycle}` +
          ' - locals are statically allocated, so a recursive call overwrites its own variables',
      )
    }

    if (finished.has(name)) return

    active.push(name)
    for (const call of edges.get(name) ?? []) visit(call.name, call)
    active.pop()
    finished.add(name)
  }

  visit(entryName, null)

  // Also check code nothing reaches yet. A recursive fn is a bug the moment it
  // is written, not the moment it is first called.
  for (const name of edges.keys()) visit(name, null)

  // Longest path. Well-defined now the graph is known to be acyclic.
  const depths = new Map<string, number>()
  const nextOnPath = new Map<string, string>()

  const depthOf = (name: string): number => {
    const known = depths.get(name)
    if (known !== undefined) return known

    let best = 0
    let bestChild = ''

    for (const call of edges.get(name) ?? []) {
      const candidate = depthOf(call.name)
      if (candidate + 1 > best) {
        best = candidate + 1
        bestChild = call.name
      }
    }

    depths.set(name, best)
    if (bestChild) nextOnPath.set(name, bestChild)
    return best
  }

  const maxDepth = depthOf(entryName)

  const deepestPath: string[] = [entryName]
  for (;;) {
    const next = nextOnPath.get(deepestPath[deepestPath.length - 1])
    if (!next) break
    deepestPath.push(next)
  }

  return { edges, maxDepth, deepestPath }
}
