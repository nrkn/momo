// Where DOSBox lives, shared by the two tools that launch it.
//
// `toolchain.json` is deliberately NOT tracked. It holds one machine's absolute
// path to a DOSBox build, which is useless to anyone else and breaks a fresh
// clone outright - the tracked `toolchain.example.json` is the copy to start
// from. Resolution is MOMO_DOSBOX first, then that file.
//
// There is no fall back to a bare `dosbox` on PATH. It would turn a missing
// config into a spawn ENOENT surfacing somewhere further downstream, and a
// clear message here is worth more than one fewer step in the happy path.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const dosboxEnvVar = 'MOMO_DOSBOX'

export type Toolchain = {
  dosbox: string
  winpos: string
}

type ToolchainFile = {
  dosbox?: Record<string, string>
  winpos?: string
}

// Throws on any problem; both callers run inside a try/catch that prints the
// message and exits 1, per the tool-level error convention in STYLE.md.
export const loadToolchain = (root: string): Toolchain => {
  const path = join(root, 'toolchain.json')
  const present = existsSync(path)
  const config: ToolchainFile = present
    ? (JSON.parse(readFileSync(path, 'utf8')) as ToolchainFile)
    : {}

  const winpos = config.winpos ?? '0,0'
  const fromEnv = process.env[dosboxEnvVar]

  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new Error(`dosbox not found at "${fromEnv}" - from ${dosboxEnvVar}`)
    }
    return { dosbox: fromEnv, winpos }
  }

  if (!present) {
    throw new Error(
      'no toolchain.json - copy toolchain.example.json to toolchain.json and set the path' +
        ` to your DOSBox, or set ${dosboxEnvVar}`,
    )
  }

  const configured = config.dosbox?.[process.platform]
  if (!configured) {
    throw new Error(`no dosbox path for platform "${process.platform}" in toolchain.json`)
  }
  if (!existsSync(configured)) {
    throw new Error(`dosbox not found at "${configured}" - check toolchain.json`)
  }

  return { dosbox: configured, winpos }
}
