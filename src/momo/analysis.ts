// Whole-program structure: the call graph, and control flow within a body.
//
// Momo allocates locals statically, so a recursive call overwrites its own
// caller's variables - recursion is never useful here, it is always a bug. That
// makes rejecting it a straight win, and it also buys something else: with the
// call graph proven acyclic, worst-case stack usage becomes a static quantity.
//
// Both halves are pure functions of the AST, with no dependency on the symbol
// table, which is why they live here rather than in the resolver that calls
// them.

import type { Expression, Program, Statement } from './ast.js'

// Structural, to avoid importing the resolver and creating a cycle.
type PrunableSymbol =
  | {
      kind: 'var'
      name: string
      label: string
      builtin: boolean
      owner?: string
      onlyIfUsed?: boolean
      alias?: { parent: string; byteOffset: number }
    }
  | {
      kind: 'array'
      name: string
      label: string
      dynamic: boolean
      alias?: { parent: string; byteOffset: number }
    }
  | { kind: 'const'; name: string; label: string }
  | { kind: 'constfn'; name: string; label: string }
  // A group emits nothing itself - its field globals are ordinary arrays or
  // variables, and are pruned per field.
  | { kind: 'group'; name: string; label: string }
  // A far region emits nothing either: segment and offset bake into the
  // instructions, so there is no storage to keep or drop.
  | { kind: 'far'; name: string; label: string }
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
      const candidate = cost(call.label)
      if (candidate > deepest) deepest = candidate
    }

    const total = 2 + 2 * (temporaries.get(name) ?? 0) + deepest
    memo.set(name, total)
    return total
  }

  let deepest = 0
  for (const call of graph.edges.get(entryName) ?? []) {
    const candidate = cost(call.label)
    if (candidate > deepest) deepest = candidate
  }

  return 2 * (temporaries.get(entryName) ?? 0) + deepest
}

// ---- control flow ---------------------------------------------------------
//
// Two questions, deliberately answered by two functions rather than one merged
// verdict, because they disagree. An `if` whose consequent returns and whose
// alternate breaks does NOT fall through - yet it does not always return
// either, since the break path resumes after the enclosing loop.
//
// Both read `constValue`, so both must run after resolution: that is what makes
// `while (true)` recognisable as endless.

// A `break` belongs to the nearest enclosing loop, so a nested loop's breaks
// are not this loop's - hence no recursion into loop bodies here. Momo has no
// labelled break, so there is nothing else to weigh.
const hasBreak = (statement: Statement): boolean => {
  if (statement.type === 'BreakStatement') return true
  if (statement.type === 'BlockStatement') return statement.body.some(hasBreak)
  if (statement.type === 'IfStatement') {
    if (hasBreak(statement.consequent)) return true
    return statement.alternate !== null && hasBreak(statement.alternate)
  }
  return false
}

// `for (;;)`, or any loop whose test folds to a non-zero constant.
const isEndless = (test: Expression | null): boolean => {
  if (test === null) return true
  return test.constValue !== null && test.constValue !== undefined && test.constValue !== 0
}

// A loop nothing escapes: control never reaches whatever follows it.
const loopNeverExits = (test: Expression | null, body: Statement): boolean =>
  isEndless(test) && !hasBreak(body)

// Does control carry on past this statement to the next one?
export const fallsThrough = (statement: Statement): boolean => {
  if (statement.type === 'ReturnStatement') return false
  if (statement.type === 'BreakStatement') return false
  if (statement.type === 'ContinueStatement') return false

  // A list falls through only if nothing in it stops first.
  if (statement.type === 'BlockStatement') return statement.body.every(fallsThrough)

  if (statement.type === 'IfStatement') {
    if (!statement.alternate) return true // the untaken branch falls through
    return fallsThrough(statement.consequent) || fallsThrough(statement.alternate)
  }

  if (statement.type === 'ForStatement') return !loopNeverExits(statement.test, statement.body)
  if (statement.type === 'WhileStatement') return !loopNeverExits(statement.test, statement.body)
  if (statement.type === 'DoWhileStatement') return !loopNeverExits(statement.test, statement.body)

  return true
}

// Does every path through this statement reach a `return`?
//
// An endless loop with no break counts, because control never leaves it and so
// can never arrive at the end of the routine empty-handed. That is what makes
// `while (true) { ... return x ... }` legal rather than a false positive.
export const alwaysReturns = (statement: Statement): boolean => {
  if (statement.type === 'ReturnStatement') return true

  // Anything after a returning statement is unreachable, so one is enough.
  if (statement.type === 'BlockStatement') return statement.body.some(alwaysReturns)

  if (statement.type === 'IfStatement') {
    if (!statement.alternate) return false
    return alwaysReturns(statement.consequent) && alwaysReturns(statement.alternate)
  }

  // A loop that CAN finish tells us nothing: it may run zero times.
  if (statement.type === 'ForStatement') return loopNeverExits(statement.test, statement.body)
  if (statement.type === 'WhileStatement') return loopNeverExits(statement.test, statement.body)
  if (statement.type === 'DoWhileStatement') return loopNeverExits(statement.test, statement.body)

  return false
}

// Keyed on the emitted label rather than the written name, because `local`
// makes names ambiguous across files: two of them may each declare `sub helper`
// and mean different routines. Merging those into one vertex would give wrong
// reachability - pruning a live routine, or keeping a dead one - and invent
// cycles between routines that never call each other.
export type CallSite = { label: string; file: string; line: number; col: number }

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
  //
  // Follow the expansion INSTEAD OF the arguments, never as well as. The
  // expansion is the whole account of what gets emitted here: the calls written
  // in the const's own body, plus the caller's argument nodes spliced in
  // wherever a parameter was used. Walking `args` too would count an argument's
  // calls twice - and an argument bound to a parameter the body never mentions
  // is not emitted at all, so it is not a call either.
  if (node.type === 'CallExpression' && node.expansion) {
    collectFromExpression(node.expansion, into)
    return
  }

  if (node.type === 'CallExpression') {
    const callee = node.callee as { label: string }
    into.push({
      label: callee.label as string,
      file: node.file as string,
      line: node.line as number,
      col: node.col as number,
    })
  }

  for (const key of Object.keys(node)) collectFromExpression(node[key], into)
}

// A `for`'s init and update clauses are walked twice - once by the generic
// expression pass below, once by the explicit recursion - so a call in one of
// them lands in `into` twice. Deliberately left alone: edges are only ever read
// through a max (depth, stack) or a set (reachability, cycles), so a duplicate
// is unobservable. Filtering it out would mean excluding `init` by statement
// type, since on a VariableDeclaration that same key is the initialiser
// expression and MUST be walked here - machinery, and a chance to drop a real
// edge, for no change in behaviour.
const collectCalls = (statements: Statement[], into: CallSite[]) => {
  for (const statement of statements) {
    collectFromExpression(
      Object.fromEntries(
        Object.entries(statement).filter(([key]) => key !== 'body' && key !== 'consequent' && key !== 'alternate'),
      ),
      into,
    )

    if (statement.type === 'CallStatement') {
      into.push({ label: statement.callee.label as string, file: statement.file, line: statement.line, col: statement.col })
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
      if (reachable.has(call.label)) continue
      reachable.add(call.label)
      queue.push(call.label)
    }
  }

  const body = result.program.body.filter((statement) => {
    if (statement.type !== 'RoutineDeclaration') return true
    return reachable.has(statement.label as string)
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

    // Nor a view's, and nothing inside one is a use either: the parent is
    // deliberately left unlabelled by the resolver, and the offset has already
    // folded into the alias, so a const that only appears there is genuinely
    // dead. Without this every view in an included library would be kept, and
    // would keep its parent's storage with it.
    if (node.type === 'ViewDeclaration') return

    if (typeof node.label === 'string') used.add(node.label)
    for (const key of Object.keys(node)) {
      if (key === 'label') continue
      walk(node[key])
    }
  }

  walk(body)

  // A live view keeps its parent alive: the alias is `equ parent + n`, so
  // dropping the storage would leave NASM with an undefined symbol. Views
  // collapse to real storage when they are declared, so one pass would do - the
  // fixpoint is here so that stops being something this has to know.
  for (;;) {
    let added = false
    for (const symbol of result.symbols) {
      if (!('alias' in symbol) || !symbol.alias) continue
      if (!used.has(symbol.label) || used.has(symbol.alias.parent)) continue
      used.add(symbol.alias.parent)
      added = true
    }
    if (!added) break
  }

  const symbols = result.symbols.filter((symbol) => {
    if (symbol.kind === 'routine') return reachable.has(symbol.label)
    // A fn's parameter and return slots live or die with the fn: the call site
    // writes them even when the body never reads them.
    if (symbol.kind === 'var' && symbol.owner) return reachable.has(symbol.owner)
    // Reserved registers, _hsize and the heap views are always present - every
    // int helper loads and stores the registers whether the program mentions
    // them or not. `_cf` is the exception: it is captured only when something
    // reads it, so a program that ignores carry pays neither the storage nor the
    // four instructions per helper.
    if (symbol.kind === 'var' && symbol.builtin) {
      return symbol.onlyIfUsed ? used.has(symbol.label) : true
    }
    if (symbol.kind === 'array' && symbol.dynamic) return true
    // Groups and far regions emit nothing, so keeping them is free - and
    // `npm run check` should still show the shape either way.
    if (symbol.kind === 'group') return true
    if (symbol.kind === 'far') return true
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
    edges.set(statement.label as string, calls)
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
    for (const call of edges.get(name) ?? []) visit(call.label, call)
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
      const candidate = depthOf(call.label)
      if (candidate + 1 > best) {
        best = candidate + 1
        bestChild = call.label
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
