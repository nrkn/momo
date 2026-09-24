// Tier 2: compile, assemble and RUN each project that has a .expected file,
// then compare what the program actually printed.
//
//   npm run test:e2e
//
// Every case launches its own DOSBox, and that is what makes the tier
// parallelisable rather than slow: each project already owns its build
// directory, its out.txt and its marker files, so instances share nothing and
// a pool of them runs at once. Measured before the pool existed: ~1.8s of the
// ~2.5s fixed cost per test was DOSBox booting, times 67 tests - two minutes
// of pure startup that a single scripted instance would also have saved, at
// the price of one hang stalling every test behind it under one timeout.
// The pool keeps the per-test timeout and the isolation.
//
// This is the tier that catches the bugs unit tests structurally cannot: the
// ones that live at the NASM boundary, or that only show up when real 8086
// code executes.
//
// Projects are found under projects/<name>/, so a test is just a Momo
// program. DOS is 8.3, so names are limited to 8 characters.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { join } from 'node:path'

import {
  allProjects,
  asmFor,
  argsFor,
  buildRoot,
  confPath,
  entryFor,
  expectedFor,
  fail,
  nasmDir,
  projectDir,
  root,
  sharedRoot,
} from './cli.js'
import { compile } from '../momo/compile.js'
import { formatError, isMomoError } from '../momo/diagnostics.js'
import { loadToolchain } from './toolchain.js'

// A tier-2 case gets this long before it is killed and reported as a timeout.
//
// Generous, because a slow machine assembling `momolo` is a legitimate minute and
// a false timeout is worse than a slow suite. Not unbounded, which it was: a
// program that does not terminate used to leave DOSBox sitting there until someone
// noticed and closed the window, and the suite reported nothing until they did.
//
// That is not hypothetical. It happened twice while breaking things deliberately to
// check the suite had teeth - once with a bad peephole that made `momolo` spin, and
// once with a wrong `xy` ordering in the vector port's quadratic that never left
// its recurrence. Both times the failure was real and the suite could not say so
// without a human. DESIGN §9 recorded the gap; this closes it.
const runTimeoutMs = 120_000

// How many DOSBox instances run at once. One per core less one, so the machine
// stays usable, capped where more workers stop paying - the fixed cost per test
// is ~2.5s, so past eight the pool drains faster than instances boot.
// MOMO_E2E_JOBS overrides it; 1 restores the old serial run exactly.
const jobs = Math.max(
  1,
  Math.min(8, Number(process.env.MOMO_E2E_JOBS) || cpus().length - 1),
)

// The tier checks correctness, never speed - CONTRIBUTING is emphatic that
// DOSBox cannot measure performance - so the emulated CPU may run as fast as
// the host allows. `cycles = auto` in the shared conf means a fixed budget for
// real-mode programs, which had `tiger` spending ~8s of wall time on emulated
// arithmetic; `cycles = max` halves it with byte-identical output. Patched at
// runtime rather than committed as a second conf, so there is no copy to drift
// - and the shared conf keeps `auto`, because `npm start` is interactive and a
// game at max cycles is unplayable.
const patchedConf = async (): Promise<string> => {
  const text = await readFile(confPath, 'latin1')
  const patched = text.replace(/^cycles\s*=\s*auto\s*$/m, 'cycles    = max')
  const target = join(buildRoot, 'e2e.conf')
  await mkdir(buildRoot, { recursive: true })
  await writeFile(target, patched, 'latin1')
  return target
}

const runDosbox = (exe: string, args: string[], cwd: string): Promise<'ok' | 'timeout'> =>
  new Promise((resolveRun) => {
    const child = spawn(exe, args, {
      stdio: 'ignore',
      // `-noconsole` below does not silence DOSBox, it redirects: stdout.txt and
      // stderr.txt are written to the working directory. Run from the project's
      // build directory so they land beside the run they describe, and inside the
      // one directory that is already ignored.
      cwd,
      // Headless by default. This tier reads a file and never the screen, so the
      // window buys nothing - and 35 of them taking focus in a row is the reason
      // the tier gets avoided. Overridable, because watching a run is still how a
      // hang gets diagnosed.
      env: {
        ...process.env,
        SDL_VIDEODRIVER: process.env.SDL_VIDEODRIVER ?? 'dummy',
        SDL_VIDEO_CENTERED: '0',
        SDL_VIDEO_WINDOW_POS: '0,0',
      },
    })

    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, runTimeoutMs)

    child.on('error', (error) => {
      clearTimeout(timer)
      fail(`could not launch dosbox: ${error.message}`)
    })

    child.on('exit', () => {
      clearTimeout(timer)
      resolveRun(timedOut ? 'timeout' : 'ok')
    })
  })

// Assemble and run in one DOSBox session, with the program's stdout redirected
// to a file we can read back - so no human has to watch the window.
const buildAndRun = async (exe: string, conf: string, project: string): Promise<string> => {
  const sourceDir = projectDir(project)
  const buildDir = join(buildRoot, project)

  await rm(buildDir, { recursive: true, force: true })
  await mkdir(buildDir, { recursive: true })
  await cp(sourceDir, buildDir, { recursive: true })

  // One line, trimmed, appended to the command. Absent for all but one project,
  // and a project that grows one is worth a second look first.
  const argsFile = argsFor(project)
  const args = existsSync(argsFile)
    ? ' ' + (await readFile(argsFile, 'utf8')).trim()
    : ''

  const script = [
    '@echo off',
    'd:',
    `nasm.exe -f bin -Z c:\\build.err -o c:\\${project}.com c:\\${project}.asm`,
    'if errorlevel 1 goto failed',
    'c:',
    'echo ok > c:\\build.ok',
    `${project}.com${args} > c:\\out.txt`,
    ':failed',
    'c:',
    'exit',
    '',
  ].join('\r\n')

  await writeFile(join(buildDir, 'build.bat'), script, 'ascii')

  const outcome = await runDosbox(exe, [
    // The other half of running headless. SDL_VIDEODRIVER hides the emulator
    // window; this hides the status window DOSBox opens beside it on Windows,
    // which does not steal focus but does cover whatever it lands on. Nothing is
    // lost: stdio is ignored here, and success is read from a marker file.
    '-noconsole',
    '-conf', conf,
    '-c', `mount c "${buildDir}"`,
    '-c', `mount d "${nasmDir}"`,
    '-c', 'c:',
    '-c', 'call c:\\build.bat',
  ], buildDir)

  // Reported before the assembly check, because a timeout says nothing about
  // whether NASM was happy - the program may well have assembled and then failed
  // to terminate, which is the case this exists for.
  if (outcome === 'timeout') {
    return `<timed out after ${runTimeoutMs / 1000}s - the program did not terminate>`
  }

  if (!existsSync(join(buildDir, 'build.ok'))) {
    const errPath = join(buildDir, 'build.err')
    const detail = existsSync(errPath) ? readFileSync(errPath, 'utf8').trim() : ''
    return `<assembly failed>\n${detail}`
  }

  // latin1, as the .expected is read below - see the rule there.
  const outPath = join(buildDir, 'out.txt')
  return existsSync(outPath) ? readFile(outPath, 'latin1') : ''
}

const main = async () => {
  const exe = loadToolchain(root).dosbox
  const only = process.argv.slice(2).find((arg) => !arg.startsWith('-'))

  const projects = allProjects().filter((name) => {
    if (only && name !== only) return false
    return existsSync(expectedFor(name))
  })

  if (projects.length === 0) fail('no projects with a .expected file')

  const conf = await patchedConf()

  let passed = 0
  const failures: string[] = []

  // One project, end to end. Everything it touches lives under its own build
  // directory, which is what makes the pool below safe - and the `ok` line
  // prints on completion, so the order varies run to run while the summary
  // does not.
  const runOne = async (project: string) => {
    const entry = entryFor(project)
    const sources = new Map<string, string>()

    // Momo projects are compiled first; hand-written .asm ones are not.
    if (existsSync(entry)) {
      try {
        const { assembly } = compile(entry, sharedRoot, sources)
        await writeFile(asmFor(project), assembly, 'ascii')
      } catch (error) {
        if (!isMomoError(error)) throw error
        failures.push(`${project}\n${formatError(sources, error)}`)
        return
      }
    }

    // The comparison is byte for byte. What a program prints is CP437 bytes, not
    // UTF-8, and latin1 is the decode that maps each byte to one character and
    // back - so both sides are read that way, as the machine's output is (§72).
    // A .expected therefore holds the bytes the program prints. The ones here
    // are all ASCII, where every decode agrees; a UTF-8 read would turn the
    // first byte above 0x7F into U+FFFD, and the two tiers would disagree.
    const actual = await buildAndRun(exe, conf, project)
    const expected = await readFile(expectedFor(project), 'latin1')

    // Normalise line endings only - everything else must match exactly.
    const clean = (text: string) => text.replace(/\r\n/g, '\n').trimEnd()

    if (clean(actual) === clean(expected)) {
      passed += 1
      console.log(`  ok    ${project}`)
      return
    }

    failures.push(
      `${project}\n    expected: ${JSON.stringify(clean(expected))}\n` +
        `    actual:   ${JSON.stringify(clean(actual))}`,
    )
    console.log(`  FAIL  ${project}`)
  }

  // A pool rather than one big Promise.all, so at most `jobs` instances of
  // DOSBox exist at once - each worker takes the next project when its last
  // one finishes, which keeps the heavy vector programs from bunching.
  let next = 0
  const worker = async () => {
    while (next < projects.length) {
      const project = projects[next]
      next += 1
      await runOne(project)
    }
  }

  await Promise.all(Array.from({ length: Math.min(jobs, projects.length) }, worker))

  for (const failure of failures) console.error(`\n  ${failure}`)
  console.log(`\n${passed}/${passed + failures.length} passed`)

  if (failures.length > 0) process.exit(1)
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
