// Rewrite a project's `.expected` from a run of its committed `.asm` in the
// machine, the way the machine tier and tier 2 will read it back: latin1, LF,
// one trailing newline.
//
//   npm run expect -- <project> [<project> ...]
//
// This is deliberate adoption, not verification - the inverse of a test. It
// exists for the change that moves many outputs at once on purpose, where the
// alternative was hand-editing fixtures toward what the program now prints and
// getting one byte wrong (EXPECT-AT positions were adopted from the compiler
// for the same reason). The safety is that `.expected` is committed: this tool
// prints what moved, and the diff to read before believing it is git's.
//
// It runs the committed assembly rather than compiling afresh, because that is
// what both tiers run - a fresh compile could adopt output the golden tier
// would then refuse. Projects are named one by one on purpose: a flag that
// rewrote every fixture in the repository would turn a regression into a
// commit.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { argsFor, asmFor, expectedFor, fail, projectDir } from './cli.js'
import { filesOf, runDos } from './dos.js'

const projects = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
if (projects.length === 0) fail('usage: npm run expect -- <project> [<project> ...]')

for (const project of projects) {
  if (!existsSync(asmFor(project))) fail(`"${project}" has no committed .asm - run: npm run momoc -- ${project}`)

  const args = existsSync(argsFor(project)) ? readFileSync(argsFor(project), 'utf8').trim() : ''

  // The machine refuses what it does not model - a service, or assembly the
  // compiler did not emit (`hello` is hand-written NASM). That refusal is this
  // project's whole answer, not a reason to stop rewriting the rest.
  let output: string
  try {
    output = runDos(readFileSync(asmFor(project), 'utf8'), { files: filesOf(projectDir(project)), args }).output
  } catch (error) {
    console.log(`${project}: the machine refused it - ${error instanceof Error ? error.message : String(error)}`)
    continue
  }
  const fresh = output.replace(/\r\n/g, '\n').trimEnd() + '\n'

  const path = expectedFor(project)
  const had = existsSync(path) ? readFileSync(path, 'latin1') : null

  if (had === fresh) {
    console.log(`${project}: unchanged`)
    continue
  }

  writeFileSync(path, fresh, 'latin1')

  if (had === null) {
    console.log(`${project}: new, ${fresh.split('\n').length - 1} lines - it joins tier 2 and the machine tier`)
    continue
  }

  const before = had.split('\n')
  const after = fresh.split('\n')
  let at = 0
  while (at < before.length && at < after.length && before[at] === after[at]) at++
  console.log(
    `${project}: ${before.length - 1} -> ${after.length - 1} lines, first difference at line ${at + 1} - read the diff`,
  )
}
