// Run a program's committed .asm in the machine with a script for its keyboard,
// and keep what it put on the screen (§72).
//
//   npm run drive -- flatpic args=FLATS.WAD keys=right,right,esc
//   npm run drive -- starfld keys=30-70:right,110:esc snap=20,60,100 out=snaps
//
// `trace` is the door for a program that runs to its end on its own; this one is
// for a program that waits for a person. It is the DOS of `dos.ts` with a
// keyboard that reads a script, a video BIOS that remembers the palette and the
// teletype, and a snapshot of the screen whenever there is something to look at.
// Graduated from two throwaways: one drove a blocking reader and one a poller.
//
// **Two shapes of program, one script.** A blocking reader asks int 16h for a
// key and waits: a key with no frame in front of it is the answer to the next
// such wait, and every wait takes a snapshot first, since what is on screen then
// is what a person would be looking at. A poller never waits - it reads the BIOS
// buffer pointers every frame and paces itself by vertical retrace - so its keys
// carry a frame, and go into the buffer when that frame begins:
//
//   right          the answer to the next wait
//   30:right       pressed at frame 30
//   30-70:right    held from 30 to 70: a press, then the BIOS's default repeat
//   0x4d00         any AX, as int 16h would return it
//
// **A frame is a retrace the program saw begin**: a read of port 3DAh with the
// retrace bit set, after one with it clear. So frames are the program's own, one
// a trip round a loop that waits on retrace, and a program that never reads the
// port has none. A wait with the buffer empty and a timed key ahead moves the
// count to that key's frame, as a person's clock would have moved while it sat.
// `snap=` takes a snapshot as a frame begins, and `frames=` stops there.
//
// **Options are `name=value`, not `--name value`.** npm under PowerShell drops a
// `--flag` even after `--`, and turns commas into spaces, so lists split on
// either and nothing here starts with a dash. See CONTRIBUTING's gotchas. And an
// argument with a space in it arrives with cmd's carets still on, from either
// shell - `tsc` is a batch file, so npm escapes for one - which is undone below.
//
//   args=<tail>     the command tail; default the project's .args, if it has one
//   keys=<list>     the script, as above
//   snap=<frames>   frames to snapshot
//   frames=<n>      stop at frame n
//   budget=<n>      instructions before a run is called hung; default 100,000,000
//   dir=<path>      the directory copied onto C:; default the project's, or none
//   file=<path>     one more file onto C:, as NAME.EXT=<path> to rename it
//   asm=<path>      a different .asm to run
//   out=<dir>       write each snapshot as 64,000 raw bytes and a JSON beside it
//
// It exits 1 for a run that hung or reached something nothing models, and 0 for
// the rest - the program's own exit code is in what it prints, not in this one.
//
// **The frame is what the program drew, and the teletype's text is not in it.**
// The BIOS draws those glyphs from a ROM font nobody has here, so they are kept
// as a grid of characters instead - what was written where since the mode was
// set, which cannot see a program painting over one.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { argsFor, asmFor, fail, projectDir } from './cli.js'
import { filesOf, runDos } from './dos.js'
import type { Machine } from './machine.js'

const defaultBudget = 100_000_000

// The BIOS's default typematic - half a second, then 10.9 a second - in the 70
// frames a second mode 13h and 80x25 both refresh at.
const repeatDelay = 35
const repeatEvery = 70 / 10.9

const bda = 0x40
const bufferStart = 0x1e
const bufferEnd = 0x3e
const frameSegment = 0xa000
const frameBytes = 64000

// ---- keys -------------------------------------------------------------------

// As AH=10h reports them: the grey navigation keys carry E0h in AL, which AH=00h
// turns into 0 on the way out, as the BIOS does.
const namedKeys: Record<string, number> = {
  esc: 0x011b, enter: 0x1c0d, space: 0x3920, tab: 0x0f09, backspace: 0x0e08,
  up: 0x48e0, down: 0x50e0, left: 0x4be0, right: 0x4de0,
  home: 0x47e0, end: 0x4fe0, pgup: 0x49e0, pgdn: 0x51e0, ins: 0x52e0, del: 0x53e0,
  comma: 0x332c,
}
for (let f = 1; f <= 10; f++) namedKeys[`f${f}`] = (0x3a + f) << 8

// A US keyboard's rows, unshifted and shifted, from the scancode each starts at.
const keyRows: [number, string, string][] = [
  [0x02, '1234567890-=', '!@#$%^&*()_+'],
  [0x10, 'qwertyuiop[]', 'QWERTYUIOP{}'],
  [0x1e, "asdfghjkl;'`", 'ASDFGHJKL:"~'],
  [0x2b, '\\zxcvbnm,./', '|ZXCVBNM<>?'],
]
const charKeys = new Map<string, number>()
for (const [first, plain, shifted] of keyRows) {
  for (let i = 0; i < plain.length; i++) {
    charKeys.set(plain[i], ((first + i) << 8) | plain.charCodeAt(i))
    charKeys.set(shifted[i], ((first + i) << 8) | shifted.charCodeAt(i))
  }
}

const keyValue = (name: string, token: string): number => {
  if (/^0x[0-9a-f]{1,4}$/i.test(name)) return parseInt(name, 16)
  const named = namedKeys[name.toLowerCase()]
  if (named !== undefined) return named
  const char = name.length === 1 ? charKeys.get(name) : undefined
  if (char !== undefined) return char
  return fail(`key "${name}" in "${token}" is not one this knows - name it (${Object.keys(namedKeys).join(', ')}), type it, or give its AX as 0xHHHH`)
}

type Script = { demand: number[]; timed: { frame: number; ax: number }[] }

const parseKeys = (text: string): Script => {
  const script: Script = { demand: [], timed: [] }
  for (const token of text.split(/[\s,]+/).filter((t) => t !== '')) {
    const match = token.match(/^(?:(\d+)(?:-(\d+))?:)?(.+)$/)
    if (!match) fail(`cannot read the key "${token}"`)
    const [, from, to, name] = match as RegExpMatchArray
    const ax = keyValue(name, token)
    if (from === undefined) {
      script.demand.push(ax)
      continue
    }
    const start = Number(from)
    script.timed.push({ frame: start, ax })
    if (to === undefined) continue
    const end = Number(to)
    if (end < start) fail(`"${token}" is held until before it was pressed`)
    for (let t = start + repeatDelay; Math.round(t) <= end; t += repeatEvery) {
      script.timed.push({ frame: Math.round(t), ax })
    }
  }
  // Stable, so two keys at one frame arrive in the order they were written.
  script.timed.sort((a, b) => a.frame - b.frame)
  return script
}

const parseFrames = (name: string, text: string): number[] =>
  text.split(/[\s,]+/).filter((t) => t !== '').map((t) => {
    if (!/^\d+$/.test(t)) fail(`${name}= takes frame numbers, and "${t}" is not one`)
    return Number(t)
  })

// ---- the run ----------------------------------------------------------------

type Snapshot = {
  kind: 'wait' | 'frame'
  wait: number
  frame: number
  mode: number
  instructions: number
  cycles: number
  pixels: Uint8Array
  text: string[]
  dac: ([number, number, number] | null)[]
}

type Ended = 'exit' | 'frames' | 'keys' | 'budget' | 'error'

type Drive = {
  ended: Ended
  message: string
  exitCode: number
  output: string | null
  modes: number[]
  frame: number
  waits: number
  keys: { total: number; delivered: number; read: number; dropped: number }
  instructions: number
  cycles: number
  dac: ([number, number, number] | null)[]
  snapshots: Snapshot[]
}

type Setup = {
  assembly: string
  files: Map<string, Uint8Array>
  args: string
  script: Script
  snaps: Set<number>
  stopAt: number | null
  budget: number
}

const isText = (mode: number) => mode <= 3 || mode === 7

const drive = (setup: Setup): Drive => {
  const { script, snaps, stopAt } = setup
  let machine: Machine | null = null
  let ended: Ended | null = null
  let frame = 0
  let waits = 0
  let lastStatus = 0
  let nextTimed = 0
  let demandAt = 0
  const keys = { total: script.demand.length + script.timed.length, delivered: 0, read: 0, dropped: 0 }
  const modes = [3]
  const dac: Drive['dac'] = new Array(256).fill(null)
  const snapshots: Snapshot[] = []
  const blankRow = () => new Array(40).fill(' ')
  let grid: string[][] = Array.from({ length: 25 }, blankRow)

  const stop = (reason: Ended) => {
    ended = reason
    machine?.stop()
  }

  const word = (memory: Uint8Array, at: number) => memory[at] | (memory[at + 1] << 8)
  const setWord = (memory: Uint8Array, at: number, value: number) => {
    memory[at] = value & 0xff
    memory[at + 1] = value >> 8
  }

  // The BIOS keyboard buffer, where a real one keeps it: a ring of sixteen words
  // with one always empty, head and tail at 1Ah and 1Ch. `dos.ts` leaves the
  // pointers at zero, which reads as empty, so they are set on first touch.
  const buffer = (m: Machine): Uint8Array => {
    const memory = m.segment(bda)
    if (word(memory, 0x1a) === 0 && word(memory, 0x1c) === 0) {
      setWord(memory, 0x1a, bufferStart)
      setWord(memory, 0x1c, bufferStart)
      setWord(memory, 0x80, bufferStart)
      setWord(memory, 0x82, bufferEnd)
    }
    return memory
  }
  const advance = (at: number) => (at + 2 === bufferEnd ? bufferStart : at + 2)
  const empty = (m: Machine) => {
    const memory = buffer(m)
    return word(memory, 0x1a) === word(memory, 0x1c)
  }
  const press = (m: Machine, ax: number) => {
    const memory = buffer(m)
    const tail = word(memory, 0x1c)
    // Full, which the BIOS answers with a beep and nothing else.
    if (advance(tail) === word(memory, 0x1a)) {
      keys.dropped++
      return
    }
    setWord(memory, tail, ax)
    setWord(memory, 0x1c, advance(tail))
    keys.delivered++
  }

  const textNow = (m: Machine): string[] => {
    const memory = m.segment(bda)
    const mode = memory[0x49]
    if (mode === 0x13) return grid.map((row) => row.join('').trimEnd())
    if (!isText(mode)) return []
    const cols = memory[0x4a]
    const rows = memory[0x84] + 1
    const screen = m.segment(mode === 7 ? 0xb000 : 0xb800)
    const lines: string[] = []
    for (let row = 0; row < rows; row++) {
      let line = ''
      for (let col = 0; col < cols; col++) line += String.fromCharCode(screen[(row * cols + col) * 2] || 0x20)
      lines.push(line.trimEnd())
    }
    return lines
  }

  const snapshot = (m: Machine, kind: Snapshot['kind']) => {
    snapshots.push({
      kind,
      wait: waits,
      frame,
      mode: m.segment(bda)[0x49],
      instructions: m.counts.instructions,
      cycles: m.counts.cycles,
      pixels: m.segment(frameSegment).slice(0, frameBytes),
      text: textNow(m),
      // An entry is replaced whole, never changed in place.
      dac: [...dac],
    })
  }

  // What happens as frame `f` begins: its keys arrive, then its snapshot.
  const arrive = (m: Machine, f: number) => {
    while (nextTimed < script.timed.length && script.timed[nextTimed].frame === f) {
      press(m, script.timed[nextTimed++].ax)
    }
    if (snaps.has(f)) snapshot(m, 'frame')
    if (f === stopAt) stop('frames')
  }

  const advanceTo = (m: Machine, target: number) => {
    while (frame < target && ended === null) {
      frame++
      arrive(m, frame)
    }
  }

  // Frame 0 is whenever the program first touches the machine.
  const begin = (m: Machine) => {
    if (machine) return
    machine = m
    buffer(m)
    arrive(m, 0)
  }

  const teletype = (m: Machine, ch: number): boolean => {
    const memory = m.segment(bda)
    const mode = memory[0x49]
    const graphics = mode === 0x13
    if (!graphics && !isText(mode)) return false
    const cols = memory[0x4a]
    const rows = memory[0x84] + 1
    const screen = m.segment(mode === 7 ? 0xb000 : 0xb800)
    let col = memory[0x50]
    let row = memory[0x51]
    if (ch === 0x0d) col = 0
    else if (ch === 0x0a) row++
    else if (ch === 0x08) col = Math.max(0, col - 1)
    else if (ch !== 0x07) {
      if (graphics) grid[row][col] = String.fromCharCode(ch)
      else screen[(row * cols + col) * 2] = ch
      if (++col === cols) {
        col = 0
        row++
      }
    }
    // Off the bottom, the screen moves up a line - in mode 13h, eight rows of
    // pixels with the grid.
    if (row === rows) {
      row = rows - 1
      if (graphics) {
        grid.shift()
        grid.push(blankRow())
        const pixels = m.segment(frameSegment)
        pixels.copyWithin(0, 320 * 8, frameBytes)
        pixels.fill(0, frameBytes - 320 * 8, frameBytes)
      } else {
        screen.copyWithin(0, cols * 2, cols * rows * 2)
        for (let c = 0; c < cols; c++) {
          screen[((rows - 1) * cols + c) * 2] = 0x20
          screen[((rows - 1) * cols + c) * 2 + 1] = 0x07
        }
      }
    }
    memory[0x50] = col
    memory[0x51] = row
    return true
  }

  const video = (m: Machine): boolean => {
    const r = m.regs
    const ah = r.ax >> 8
    const al = r.ax & 0xff
    if (ah === 0x00) {
      // Watched, then passed on: `dos.ts` keeps the data area and the text screen.
      const mode = al & 0x7f
      modes.push(mode)
      if (mode === 0x13) {
        grid = Array.from({ length: 25 }, blankRow)
        if ((al & 0x80) === 0) m.segment(frameSegment).fill(0, 0, frameBytes)
      }
      const memory = m.segment(bda)
      memory[0x50] = 0
      memory[0x51] = 0
      return false
    }
    if (ah === 0x0e) return teletype(m, al)
    if (ah === 0x10 && al === 0x10) {
      dac[r.bx & 0xff] = [r.dx >> 8, r.cx >> 8, r.cx & 0xff]
      return false
    }
    if (ah === 0x10 && al === 0x12) {
      const table = m.segment(r.es)
      for (let i = 0; i < r.cx; i++) {
        const at = (r.dx + i * 3) & 0xffff
        dac[(r.bx + i) & 0xff] = [table[at], table[(at + 1) & 0xffff], table[(at + 2) & 0xffff]]
      }
      return false
    }
    return false
  }

  const keyboard = (m: Machine): boolean => {
    const r = m.regs
    const ah = r.ax >> 8
    const enhanced = (ah & 0x10) !== 0
    // AH=00h and 01h hand a grey key back as the keypad's, with AL=0.
    const shown = (ax: number) => (!enhanced && (ax & 0xff) === 0xe0 && ax >> 8 !== 0 ? ax & 0xff00 : ax)
    if (ah === 0x00 || ah === 0x10) {
      if (empty(m)) {
        snapshot(m, 'wait')
        waits++
        if (demandAt < script.demand.length) press(m, script.demand[demandAt++])
        else if (nextTimed < script.timed.length) advanceTo(m, script.timed[nextTimed].frame)
        if (ended !== null) return true
        if (empty(m)) {
          stop('keys')
          return true
        }
      }
      const memory = buffer(m)
      const head = word(memory, 0x1a)
      r.ax = shown(word(memory, head))
      setWord(memory, 0x1a, advance(head))
      keys.read++
      return true
    }
    if (ah === 0x01 || ah === 0x11) {
      m.flags.z = empty(m)
      if (!m.flags.z) {
        const memory = buffer(m)
        r.ax = shown(word(memory, word(memory, 0x1a)))
      }
      return true
    }
    return false
  }

  let result: ReturnType<typeof runDos> | null = null
  let message = ''
  try {
    result = runDos(setup.assembly, {
      files: setup.files,
      args: setup.args,
      limit: setup.budget,
      interrupt: (vector, m) => {
        begin(m)
        if (vector === 0x10) return video(m)
        if (vector === 0x16) return keyboard(m)
        // AH=0Bh, whether a key is waiting, asked of DOS rather than the BIOS.
        if (vector === 0x21 && m.regs.ax >> 8 === 0x0b) {
          m.regs.ax = (m.regs.ax & 0xff00) | (empty(m) ? 0 : 0xff)
          return true
        }
        return false
      },
      statusRead: (status, m) => {
        begin(m)
        if ((status & 0x08) !== 0 && (lastStatus & 0x08) === 0) advanceTo(m, frame + 1)
        lastStatus = status
      },
    })
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
    ended = /^still running after/.test(message) ? 'budget' : 'error'
  }

  const counts = (machine as Machine | null)?.counts ?? result?.counts ?? { instructions: 0, cycles: 0 }
  return {
    ended: ended ?? 'exit',
    message,
    exitCode: result?.exitCode ?? 0,
    output: result ? result.output : null,
    modes,
    frame,
    waits,
    keys,
    instructions: counts.instructions,
    cycles: counts.cycles,
    dac,
    snapshots,
  }
}

// ---- reporting --------------------------------------------------------------

const n = (value: number) => value.toLocaleString('en')
const hex2 = (value: number) => value.toString(16).padStart(2, '0')

const endedLine = (run: Drive, budget: number): string => {
  switch (run.ended) {
    case 'exit':
      return `exited ${run.exitCode}`
    case 'frames':
      return `stopped at frame ${run.frame}, as asked`
    case 'keys':
      return 'waiting for a key after the script ran out'
    case 'budget':
      return `still running after ${n(budget)} instructions, at frame ${run.frame} - raise budget=, or stop it with frames= or a key that ends it`
    case 'error':
      return `stopped: ${run.message}`
  }
}

const summarise = (project: string, args: string, run: Drive, budget: number) => {
  console.log(`${project}${args ? ` ${args}` : ''}: ${endedLine(run, budget)}`)
  console.log(`  modes    ${run.modes.map(hex2).join(' -> ')}`)
  if (run.output === null) console.log('  output   (lost with a run that did not end)')
  else if (run.output === '') console.log('  output   (none)')
  else for (const line of run.output.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')) console.log(`  output   ${line}`)
  const k = run.keys
  console.log(`  keys     ${k.delivered} of ${k.total} delivered, ${k.read} read${k.dropped ? `, ${k.dropped} dropped by a full buffer` : ''}`)
  console.log(`  waits    ${run.waits}, frames ${run.frame}`)
  console.log(`  cost     ${n(run.instructions)} instructions, ~${n(run.cycles)} 8086 cycles (estimated)`)
  console.log(`  DAC      ${run.dac.filter((entry) => entry).length} of 256 entries set`)

  let previous: Uint8Array = new Uint8Array(frameBytes)
  run.snapshots.forEach((snap, i) => {
    let lit = 0
    let changed = 0
    for (let p = 0; p < frameBytes; p++) {
      if (snap.pixels[p] !== 0) lit++
      if (snap.pixels[p] !== previous[p]) changed++
    }
    previous = snap.pixels
    const at = snap.kind === 'wait' ? `wait ${snap.wait}` : `frame ${snap.frame}`
    const frame = snap.mode === 0x13 ? `  ${n(lit).padStart(6)} lit  ${n(changed).padStart(6)} changed` : ''
    console.log(`\n  #${i}  ${at.padEnd(10)} mode ${hex2(snap.mode)}  ${n(snap.instructions).padStart(13)} instructions${frame}`)
    for (const line of snap.text) if (line !== '') console.log(`      |${line}`)
  })
}

// Indented, but with a list of numbers - a DAC entry, the modes - on one line.
const json = (value: unknown) =>
  `${JSON.stringify(value, null, 1).replace(/\[[\d,\s]*\]/g, (list) => list.replace(/\s+/g, ''))}\n`

// A stale snapshot reads exactly like a current one, so a directory written
// before loses its snapshots first.
const writeOut = (dir: string, project: string, args: string, run: Drive) => {
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir)) {
    if (/^snap-\d+\.(bin|json)$/.test(name) || name === 'run.json') unlinkSync(join(dir, name))
  }
  const names: string[] = []
  run.snapshots.forEach((snap, i) => {
    const name = `snap-${String(i).padStart(2, '0')}`
    names.push(name)
    writeFileSync(join(dir, `${name}.bin`), snap.pixels)
    const { pixels, ...rest } = snap
    writeFileSync(join(dir, `${name}.json`), json(rest))
  })
  const { snapshots, ...rest } = run
  writeFileSync(join(dir, 'run.json'), json({ project, args, ...rest, snapshots: names }))
  console.log(`\nwrote ${names.length} snapshot${names.length === 1 ? '' : 's'} and run.json to ${dir}`)
}

// ---- the command line -------------------------------------------------------

// One layer of cmd escaping, recognised by the caret npm puts in front, which no
// option name has.
const unescape = (arg: string) =>
  arg.startsWith('^') ? arg.replace(/\^([\s\S])/g, '$1').replace(/\^$/, '') : arg

const main = () => {
  const [project, ...rest] = process.argv.slice(2).map(unescape)
  if (!project || project.includes('=')) {
    fail('usage: npm run drive -- <project> [args=...] [keys=...] [snap=...] [frames=...] [budget=...] [dir=...] [file=...] [asm=...] [out=...]')
  }

  const options = new Map<string, string>()
  const extraFiles: string[] = []
  for (const arg of rest) {
    const match = arg.match(/^([a-z]+)=([\s\S]*)$/)
    if (!match) fail(`"${arg}" is not name=value - write keys=right rather than --keys right, which npm drops under PowerShell`)
    const [, name, value] = match as RegExpMatchArray
    if (!['args', 'keys', 'snap', 'frames', 'budget', 'dir', 'file', 'asm', 'out'].includes(name)) fail(`unknown option "${name}="`)
    if (name === 'file') extraFiles.push(value)
    else options.set(name, value)
  }

  const asmPath = options.get('asm') ?? asmFor(project)
  if (!existsSync(asmPath)) fail(`no .asm to run: "${asmPath}" - npm run momoc -- ${project}`)

  const dirOption = options.get('dir')
  const files = new Map<string, Uint8Array>()
  if (dirOption !== 'none') {
    const dir = dirOption ?? projectDir(project)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) fail(`no directory "${dir}" to copy onto C:`)
    filesOf(dir, '', files)
  }
  for (const value of extraFiles) {
    const renamed = value.match(/^([A-Za-z0-9_~!-]{1,8}(?:\.[A-Za-z0-9_~!-]{0,3})?)=(.+)$/)
    const path = renamed ? renamed[2] : value
    if (!existsSync(path) || !statSync(path).isFile()) fail(`no file "${path}" to copy onto C:`)
    files.set(renamed ? renamed[1] : basename(path), readFileSync(path))
  }

  const args = options.get('args') ?? (existsSync(argsFor(project)) ? readFileSync(argsFor(project), 'utf8').trim() : '')

  const count = (name: string, fallback: number | null): number | null => {
    const text = options.get(name)
    if (text === undefined) return fallback
    if (!/^\d[\d_]*$/.test(text)) fail(`${name}= takes a whole number, and "${text}" is not one`)
    return Number(text.replace(/_/g, ''))
  }
  const budget = count('budget', defaultBudget) as number
  const stopAt = count('frames', null)

  const run = drive({
    assembly: readFileSync(asmPath, 'utf8'),
    files,
    args,
    script: parseKeys(options.get('keys') ?? ''),
    snaps: new Set(parseFrames('snap', options.get('snap') ?? '')),
    stopAt,
    budget,
  })

  summarise(project, args, run, budget)
  const out = options.get('out')
  if (out) writeOut(out, project, args, run)
  if (run.ended === 'budget' || run.ended === 'error') process.exit(1)
}

main()
