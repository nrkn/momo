// Run a project in the interpreter rather than in DOSBox (§72).
//
//   npm run trace -- smoke
//   npm run trace:profile -- dirlist
//
// Compiles the project, runs the result in `machine.ts` inside the DOS of
// `dos.ts`, prints what it printed, and then what it cost: instructions exactly,
// cycles as the 8086 estimate. The profile adds where they went, by routine.
//
// A program that waits for a key cannot be run to its end here any more than
// under tier 2 - there is nobody to press one - and says so by stopping at the
// keyboard call. Calling one of its routines directly is what `machine.ts` is
// for; this is the whole-program door.

import { existsSync, readFileSync } from 'node:fs'

import { argsFor, entryFor, fail, failWith, projectDir, sharedRoot } from './cli.js'
import { filesOf, runDos } from './dos.js'
import { compile } from '../momo/compile.js'

const main = () => {
  const args = process.argv.slice(2)
  const profile = args.includes('--profile')
  const project = args.find((arg) => !arg.startsWith('-')) ?? ''
  if (!project) fail('usage: npm run trace -- <project>   (or npm run trace:profile -- <project>)')

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
