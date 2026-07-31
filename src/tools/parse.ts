// Parse a Momo project and print its AST.
//
//   npm run parse -- smoke        compact tree
//   npm run parse:json -- smoke   full JSON
//
// (The --json flag lives in the script definition because npm swallows
// unrecognised --flags from the user as config.)

import { existsSync } from 'node:fs'

import { entryFor, fail, failWith, libRoot } from './cli.js'
import type { Node } from '../momo/ast.js'
import { load } from '../momo/loader.js'

const usage = 'usage: npm run parse -- <project>'

// A one-line label for a node: enough to read the shape of the tree without
// drowning in the full JSON.
const label = (node: Node): string => {
  if (node.type === 'Identifier') return `Identifier ${node.name}`
  if (node.type === 'NumberLiteral') return `Number ${node.text}`
  if (node.type === 'BoolLiteral') return `Bool ${node.value}`
  if (node.type === 'StringLiteral') return `String ${JSON.stringify(node.value)}`
  if (node.type === 'BinaryExpression') return `Binary ${node.operator}`
  if (node.type === 'LogicalExpression') return `Logical ${node.operator}`
  if (node.type === 'UnaryExpression') return `Unary ${node.operator}`
  if (node.type === 'CastExpression') return `Cast ${node.to}`
  if (node.type === 'CallStatement') return `CallStatement ${node.callee.name}`
  if (node.type === 'AddrExpression') return `Addr ${node.target.name}`
  if (node.type === 'IndexExpression') return `Index ${node.array.name}`
  if (node.type === 'AssignmentStatement') return `Assign ${node.operator}`
  if (node.type === 'UpdateStatement') return `Update ${node.operator}`
  if (node.type === 'IntStatement') return `Int 0x${node.interrupt.toString(16)}`
  if (node.type === 'IncludeStatement') return `Include ${node.path}`
  if (node.type === 'ConstFunctionDeclaration') return `ConstFn ${node.name}`
  if (node.type === 'Parameter') return `Param ${node.name}`
  if (node.type === 'CallExpression') return `Call ${node.callee.name}`
  if (node.type === 'ConstDeclaration') return `Const ${node.name}`
  if (node.type === 'VariableDeclaration') return `Var ${node.name}`
  if (node.type === 'RoutineDeclaration') {
    return `${node.returnType ?? 'sub'} ${node.name}`
  }
  if (node.type === 'TypeNode') return `Type ${node.name}${node.array ? '[]' : ''}`
  return node.type
}

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof (value as Node).type === 'string'

const printTree = (node: Node, depth: number) => {
  console.log(`${'  '.repeat(depth)}${label(node)}`)

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'line' || key === 'col' || key === 'endLine') continue

    const value = (node as unknown as Record<string, unknown>)[key]

    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) printTree(item, depth + 1)
      continue
    }

    if (isNode(value)) printTree(value, depth + 1)
  }
}

const countNodes = (node: Node): number => {
  let total = 1

  for (const key of Object.keys(node)) {
    const value = (node as unknown as Record<string, unknown>)[key]

    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) total += countNodes(item)
      continue
    }

    if (isNode(value)) total += countNodes(value)
  }

  return total
}

const main = async () => {
  const args = process.argv.slice(2)
  const project = args.find((arg) => !arg.startsWith('-')) ?? ''
  const asJson = args.includes('--json')

  if (!project) fail(`no project given\n${usage}`)

  const file = entryFor(project)
  if (!existsSync(file)) fail(`source not found: "${file}"`)

  const sources = new Map<string, string>()

  try {
    const { program } = load(file, libRoot, sources)
    if (asJson) {
      console.log(JSON.stringify(program, null, 2))
      return
    }

    printTree(program, 0)
    console.log(`\n${countNodes(program)} nodes, ${program.body.length} top-level statements`)
  } catch (error) {
    failWith(sources, error)
  }
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
