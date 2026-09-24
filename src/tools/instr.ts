// Static instruction counts of a project's committed .asm, HEAD against the
// working tree - in total, and by routine with `--routines`.
//
//   npm run instr -- momolo
//   npm run instr:routines -- momolo
//
// This is the reading tool for a deliberate codegen change: `momoc:all` writes
// the new output, and this says what it cost, per routine, before the diff is
// adopted. It counts instructions because that is how performance is reasoned
// about here - CONTRIBUTING is emphatic that DOSBox cannot measure it - and it
// counts statically, which prices the image; `npm run trace` prices a run.
// Graduated from a throwaway written to read §49's adoption diff.
//
// The line test is the machine tier's own: instructions are the only lines the
// emitter indents, less the directives, which reserve or define rather than
// execute.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

import { asmFor, fail, root } from './cli.js'

const directive = /^\s+(db|dw|dd|times|equ|resb|resw|cpu|org|align|bits|section)\b/

type Counts = { total: number; byRoutine: Map<string, number> }

const count = (text: string): Counts => {
  const byRoutine = new Map<string, number>()
  let routine = '(entry)'
  let total = 0

  for (const raw of text.split(/\r?\n/)) {
    // A routine's banner carries two words - its kind and its label - where the
    // entry, data, heap and views banners carry one, so two words is the test.
    const banner = raw.match(/^; =+ (\S+) (\S+) ====/)
    if (banner) {
      routine = banner[1] === 'int' ? '(int helpers)' : banner[2]
      continue
    }

    if (/^\s+[a-z]/.test(raw) && !directive.test(raw)) {
      total += 1
      byRoutine.set(routine, (byRoutine.get(routine) ?? 0) + 1)
    }
  }

  return { total, byRoutine }
}

const main = () => {
  const args = process.argv.slice(2)
  const routines = args.includes('--routines')
  const project = args.find((arg) => !arg.startsWith('-')) ?? ''
  if (!project) fail('usage: npm run instr -- <project>   (or npm run instr:routines -- <project>)')

  const path = asmFor(project)
  const inRepo = relative(root, path).replace(/\\/g, '/')

  let head = ''
  try {
    head = execFileSync('git', ['show', `HEAD:${inRepo}`], {
      encoding: 'utf8',
      maxBuffer: 64 << 20,
      cwd: root,
    })
  } catch {
    fail(`"${inRepo}" is not in HEAD - there is nothing to count against`)
  }

  const before = count(head)
  const after = count(readFileSync(path, 'latin1'))
  const delta = after.total - before.total

  console.log(`${project}: ${before.total} -> ${after.total} (${delta >= 0 ? '+' : ''}${delta})`)

  if (!routines) return

  const names = new Set([...before.byRoutine.keys(), ...after.byRoutine.keys()])
  for (const name of names) {
    const was = before.byRoutine.get(name) ?? 0
    const is = after.byRoutine.get(name) ?? 0
    if (was === is) continue
    console.log(
      `  ${name.padEnd(28)} ${String(was).padStart(5)} -> ${String(is).padStart(5)}` +
        `  ${is - was >= 0 ? '+' : ''}${is - was}`,
    )
  }
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
