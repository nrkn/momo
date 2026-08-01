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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  asmFor,
  buildRoot,
  confPath,
  entryFor,
  expectedFor,
  fail,
  libRoot,
  nasmDir,
  projectDir,
  projectsDir,
  root,
} from './cli.js'
import { compile } from '../momo/compile.js'
import { formatError, isMomoError } from '../momo/diagnostics.js'
import { loadToolchain } from './toolchain.js'

const runDosbox = (exe: string, args: string[]): Promise<void> =>
  new Promise((resolveRun) => {
    const child = spawn(exe, args, {
      stdio: 'ignore',
      env: { ...process.env, SDL_VIDEO_CENTERED: '0', SDL_VIDEO_WINDOW_POS: '0,0' },
    })
    child.on('error', (error) => fail(`could not launch dosbox: ${error.message}`))
    child.on('exit', () => resolveRun())
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

  await runDosbox(exe, [
    '-conf', confPath,
    '-c', `mount c "${buildDir}"`,
    '-c', `mount d "${nasmDir}"`,
    '-c', 'c:',
    '-c', 'call c:\\build.bat',
  ])

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

  const projects = readdirSync(projectsDir).filter((name) => {
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
        const { assembly } = compile(entry, libRoot, sources)
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
