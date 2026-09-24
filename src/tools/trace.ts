// Run a project in the interpreter rather than in DOSBox (§72).
//
//   npm run trace -- smoke
//   npm run trace:profile -- dirlist
//   npm run trace:check -- dirlist
//
// Compiles the project, runs the result in `machine.ts` inside the DOS of
// `dos.ts`, prints what it printed, and then what it cost: instructions exactly,
// cycles as the 8086 estimate. The profile adds where they went, by routine.
// The check holds the output against the project's .expected instead - the
// machine-tier assertion `npm test` makes for every project, for one, which is
// the spot check a fix wants before the whole suite runs. Graduated from a
// throwaway that diffed a saved trace against the file by hand.
//
// A program that waits for a key cannot be run to its end here any more than
// under tier 2 - there is nobody to press one - and says so by stopping at the
// keyboard call. Calling one of its routines directly is what `machine.ts` is
// for; this is the whole-program door.

import { existsSync, readFileSync } from 'node:fs'

import { argsFor, entryFor, expectedFor, fail, failWith, projectDir, sharedRoot } from './cli.js'
import { filesOf, runDos } from './dos.js'
import { compile } from '../momo/compile.js'

const main = () => {
  const args = process.argv.slice(2)
  const profile = args.includes('--profile')
  const checking = args.includes('--check')
  const project = args.find((arg) => !arg.startsWith('-')) ?? ''
  if (!project) fail('usage: npm run trace -- <project>   (or npm run trace:profile, trace:check)')

  if (checking && !existsSync(expectedFor(project))) {
    fail(`"${project}" has no .expected to check against - trace it instead`)
  }

  const file = entryFor(project)
  if (!existsSync(file)) fail(`source not found: "${file}"`)

  const sources = new Map<string, string>()
  let assembly = ''
  try {
    assembly = compile(file, sharedRoot, sources).assembly
  } catch (error) {
    failWith(sources, error)
  }

  const tail = existsSync(argsFor(project)) ? readFileSync(argsFor(project), 'utf8').trim() : ''
  const run = runDos(assembly, { files: filesOf(projectDir(project)), args: tail })

  // latin1 and byte-wise, the one comparison rule both tiers follow.
  if (checking) {
    const clean = (text: string) => text.replace(/\r\n/g, '\n').trimEnd()
    const actual = clean(run.output)
    const expected = clean(readFileSync(expectedFor(project), 'latin1'))

    if (actual === expected) {
      console.log(`ok: ${project} matches its .expected (${expected.split('\n').length} lines)`)
      return
    }

    const got = actual.split('\n')
    const want = expected.split('\n')
    for (let i = 0; i < Math.max(got.length, want.length); i++) {
      if (got[i] === want[i]) continue
      fail(
        `${project} differs from its .expected at line ${i + 1}\n` +
          `    expected: ${JSON.stringify(want[i] ?? '<nothing>')}\n` +
          `    actual:   ${JSON.stringify(got[i] ?? '<nothing>')}`,
      )
    }
    fail(`${project} differs from its .expected`) // unreachable, but honest
  }

  process.stdout.write(run.output)
  if (!run.output.endsWith('\n')) process.stdout.write('\n')

  const { instructions, cycles } = run.counts
  console.log(
    `\n${project}: exit ${run.exitCode}, ${instructions.toLocaleString('en')} instructions,` +
      ` ~${cycles.toLocaleString('en')} 8086 cycles (estimated)`,
  )

  if (!profile) return

  // Ranked by cycles, so the share is of cycles too, and both are shown beside
  // the instruction count rather than under its name.
  const rows = [...run.profile].filter(([, counts]) => counts.instructions > 0)
  rows.sort((a, b) => b[1].cycles - a[1].cycles)
  console.log('')
  for (const [routine, counts] of rows.slice(0, 20)) {
    const share = ((100 * counts.cycles) / cycles).toFixed(1).padStart(5)
    console.log(
      `  ${(routine || '(top level)').padEnd(28)} ${counts.instructions.toLocaleString('en').padStart(14)}` +
        ` instr ${counts.cycles.toLocaleString('en').padStart(14)} cycles  ${share}% of cycles`,
    )
  }
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
