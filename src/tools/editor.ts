// Installs the VS Code extension by copying it into the user's extensions
// folder.
//
//   npm run editor:install
//
// `~/.vscode/extensions` is the same path on Windows and Linux, so unlike the
// DOSBox executable this needs no per-platform configuration.

import { existsSync } from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const source = join(root, 'editor', 'vscode')
const target = join(homedir(), '.vscode', 'extensions', 'momo')

const fail = (message: string): never => {
  console.error(`error: ${message}`)
  process.exit(1)
}

const main = async () => {
  if (!existsSync(source)) fail(`extension not found at "${source}"`)

  const grammar = join(source, 'syntaxes', 'momo.tmLanguage.json')
  if (!existsSync(grammar)) fail('grammar not generated - run: npm run grammar')

  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  await cp(source, target, { recursive: true })

  console.log(`ok: installed to ${target}`)
  console.log('   reload VS Code (Developer: Reload Window) to pick it up')
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
