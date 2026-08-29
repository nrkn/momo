// Tier 2: compile, assemble and RUN each project that has a .expected file,
// then compare what the program actually printed.
//
//   npm run test:e2e
//
// Slow, because every case launches DOSBox. This is the tier that catches the
// bugs unit tests structurally cannot: the ones that live at the NASM boundary,
// or that only show up when real 8086 code executes.
//
// Projects are found under projects/<name>/, so a test is just a Momo
// program. DOS is 8.3, so names are limited to 8 characters.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  allProjects,
  asmFor,
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
const buildAndRun = async (exe: string, project: string): Promise<string> => {
  const sourceDir = projectDir(project)
  const buildDir = join(buildRoot, project)

  await rm(buildDir, { recursive: true, force: true })
  await mkdir(buildDir, { recursive: true })
  await cp(sourceDir, buildDir, { recursive: true })

  const script = [
    '@echo off',
    'd:',
    `nasm.exe -f bin -Z c:\\build.err -o c:\\${project}.com c:\\${project}.asm`,
    'if errorlevel 1 goto failed',
    'c:',
    'echo ok > c:\\build.ok',
    `${project}.com > c:\\out.txt`,
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
    '-conf', confPath,
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

  const outPath = join(buildDir, 'out.txt')
  return existsSync(outPath) ? readFile(outPath, 'utf8') : ''
}

const main = async () => {
  const exe = loadToolchain(root).dosbox
  const only = process.argv.slice(2).find((arg) => !arg.startsWith('-'))

  const projects = allProjects().filter((name) => {
    if (only && name !== only) return false
    return existsSync(expectedFor(name))
  })

  if (projects.length === 0) fail('no projects with a .expected file')

  let passed = 0
  const failures: string[] = []

  for (const project of projects) {
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
        continue
      }
    }

    const actual = await buildAndRun(exe, project)
    const expected = await readFile(expectedFor(project), 'utf8')

    // Normalise line endings only - everything else must match exactly.
    const clean = (text: string) => text.replace(/\r\n/g, '\n').trimEnd()

    if (clean(actual) === clean(expected)) {
      passed += 1
      console.log(`  ok    ${project}`)
      continue
    }

    failures.push(
      `${project}\n    expected: ${JSON.stringify(clean(expected))}\n` +
        `    actual:   ${JSON.stringify(clean(actual))}`,
    )
    console.log(`  FAIL  ${project}`)
  }

  for (const failure of failures) console.error(`\n  ${failure}`)
  console.log(`\n${passed}/${passed + failures.length} passed`)

  if (failures.length > 0) process.exit(1)
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
