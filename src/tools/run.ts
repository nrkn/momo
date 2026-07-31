// Build and run a DOS project under DOSBox.
//
//   npm start hello              assemble and run
//   npm run build -- hello       assemble only, then close DOSBox
//
// NASM runs inside DOSBox (there is no host nasm yet). Its errors are captured
// with `-Z` - an option that exists precisely because DOS cannot redirect
// stderr - and printed here, so a failed build reports in this terminal rather
// than flashing past in a GUI window.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { asmFor, buildRoot, confPath, fail, nasmDir, projectDir, root } from './cli.js'
import { loadToolchain } from './toolchain.js'

type Mode = 'run' | 'build'

type Options = {
  project: string
  mode: Mode
  winpos: string | null
}

const usage = [
  'usage: npm start <project> [--winpos X,Y]',
  '       npm run build -- <project> [--winpos X,Y]',
].join('\n')

const parseArgs = (argv: string[]): Options => {
  let project = ''
  let mode: Mode = 'run'
  let winpos: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--build') {
      mode = 'build'
      continue
    }

    if (arg === '--winpos') {
      const value = argv[i + 1]
      if (!value) fail('--winpos requires X,Y')
      winpos = value
      i += 1
      continue
    }

    if (arg.startsWith('-')) fail(`unknown option "${arg}"\n${usage}`)
    if (project) fail(`unexpected second project "${arg}"\n${usage}`)
    project = arg
  }

  if (!project) fail(`no project given\n${usage}`)

  return { project, mode, winpos }
}

// DOS is 8.3. A longer name gets mangled to TEXTAD~1 and the build breaks in a
// thoroughly confusing way, so reject it up front.
const validateProjectName = (name: string) => {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,7}$/.test(name)) {
    fail(
      `invalid project name "${name}" - DOS 8.3 requires 1-8 characters, ` +
        'letters/digits/underscore, starting with a letter',
    )
  }
}

// C: is the staged project, D: is the bundled assembler. Mounting rather than
// copying nasm keeps the build dir to just the project's own files.
const buildBat = (project: string, mode: Mode): string => {
  const lines = [
    '@echo off',
    'd:',
    `nasm.exe -f bin -Z c:\\build.err -o c:\\${project}.com c:\\${project}.asm`,
    'if errorlevel 1 goto failed',
    'c:',
    'echo ok > c:\\build.ok',
  ]

  if (mode === 'run') lines.push(`${project}.com`)

  lines.push('goto end', ':failed', 'c:', 'exit', ':end')

  // On success `build` closes DOSBox; `run` leaves you at the C: prompt so you
  // can read the program's output and re-run it by hand.
  if (mode === 'build') lines.push('exit')

  return lines.join('\r\n') + '\r\n'
}

const runDosbox = (exe: string, args: string[], winpos: string): Promise<number> =>
  new Promise((resolve) => {
    const child = spawn(exe, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        SDL_VIDEO_CENTERED: '0',
        SDL_VIDEO_WINDOW_POS: winpos,
      },
    })

    child.on('error', (error) => fail(`could not launch dosbox: ${error.message}`))
    child.on('exit', (code) => resolve(code ?? 0))
  })

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  validateProjectName(options.project)

  // Throws with its own message if DOSBox cannot be located; the existence of
  // the binary is checked there rather than here.
  const toolchain = loadToolchain(root)
  const dosbox = toolchain.dosbox
  const winpos = options.winpos ?? toolchain.winpos

  const sourceDir = projectDir(options.project)
  const entryPath = asmFor(options.project)
  const buildDir = join(buildRoot, options.project)

  if (!existsSync(confPath)) fail(`dosbox config not found at "${confPath}"`)
  if (!existsSync(entryPath)) fail(`project entry not found: "${entryPath}"`)
  if (!existsSync(join(nasmDir, 'nasm.exe'))) fail(`nasm not found under "${nasmDir}"`)

  // Wiping the build dir also guarantees we never run a stale .com from an
  // earlier successful build after a failed one.
  await rm(buildDir, { recursive: true, force: true })
  await mkdir(buildDir, { recursive: true })
  await cp(sourceDir, buildDir, { recursive: true })
  await writeFile(join(buildDir, 'build.bat'), buildBat(options.project, options.mode), 'ascii')

  const args = [
    '-conf', confPath,
    '-c', `mount c "${buildDir}"`,
    '-c', `mount d "${nasmDir}"`,
    '-c', 'c:',
    '-c', 'call c:\\build.bat',
  ]

  console.log(`${options.mode}: ${options.project}`)
  await runDosbox(dosbox, args, winpos)

  const errorPath = join(buildDir, 'build.err')
  if (existsSync(errorPath)) {
    const text = await readFile(errorPath, 'utf8')
    if (text.trim()) console.error(text.trim())
  }

  // DOSBox exits with its own status, not NASM's, so the marker file written by
  // build.bat is what actually tells us whether assembly succeeded.
  if (!existsSync(join(buildDir, 'build.ok'))) fail('assembly failed')

  console.log(`ok: ${join(buildDir, `${options.project}.com`)}`)
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
