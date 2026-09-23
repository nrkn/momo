// The machine around `machine.ts`: enough DOS and BIOS for a Momo program to run
// as tier 2 runs it, with its standard output captured (§72).
//
// Modelled as each program needed it, not as a specification: anything a
// program asks for that is not here stops the run and names the service, so a
// gap is a message rather than a wrong answer. What is here is what DOSBox does
// for these calls, checked by the tier-1 comparison against the `.expected`
// files tier 2 writes - which is the only claim this file makes.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeMachine, parseAssembly, type Machine, type Counts } from './machine.js'

export type DosRun = {
  output: string
  exitCode: number
  counts: Counts
  profile: Map<string, Counts>
  machine: Machine
}

export type DosOptions = {
  // The project's own files, as tier 2 copies them onto C:. Names are matched
  // case-insensitively, as DOS matches them.
  files?: Map<string, Uint8Array>
  // The command tail, without the leading space DOS adds.
  args?: string
  limit?: number
}

// What tier 2 copies onto C: - a project directory, whole - keyed as DOS names
// it, a subdirectory's files under its name and a backslash.
export const filesOf = (dir: string, prefix = '', into = new Map<string, Uint8Array>()) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) filesOf(path, `${prefix}${entry.name}\\`, into)
    else into.set(`${prefix}${entry.name}`, readFileSync(path))
  }
  return into
}

// Where the program's segment sits and where DOS says memory ends. Neither is a
// number any test prints - they print what the two imply, like whether a block
// fits - so the only requirement is that they are plausible for a real-mode PC.
const topOfMemory = 0x9fff
const bda = 0x0040
const textSegment = 0xb800

// One BIOS tick is 1/18.2 s; at 4.77 MHz that is about 262,000 cycles. The clock
// moves with the instructions the program executes, so a wait for a tick ends.
const instructionsPerTick = 20_000
const instructionsPerFrame = Math.round(instructionsPerTick * 18.2 / 70)
const instructionsPerBlank = Math.round(instructionsPerFrame * 45 / 449)

// `mode` is the access code the file was opened with: 0 read, 1 write, 2 both.
type Handle = { name: string; position: number; mode: number }

const dosError = (machine: Machine, code: number): boolean => {
  machine.regs.ax = code
  machine.flags.c = true
  return true
}

const ok = (machine: Machine): boolean => {
  machine.flags.c = false
  return true
}

export const runDos = (assembly: string, options: DosOptions = {}): DosRun => {
  const program = parseAssembly(assembly)
  const files = new Map<string, Uint8Array>()
  const directories = new Set<string>()
  for (const [name, bytes] of options.files ?? []) {
    const upper = name.toUpperCase()
    files.set(upper, bytes)
    // A file in a subdirectory is the directory's existence, as the copy tier 2
    // makes onto C: is.
    const parts = upper.split('\\')
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('\\'))
  }

  const out: number[] = []
  let exitCode = 0
  const handles = new Map<number, Handle>()
  let nextHandle = 5
  let dta = 0x80
  let finding: { names: string[]; index: number } | null = null
  let ticks = 0
  let videoMode = 3

  // The VGA's index/data pairs - sequencer, graphics controller, CRTC - read back
  // what was written, which is what `porttest` holds DOSBox to. Those and the
  // status register are every port a tier 2 program reaches, a byte at a time
  // except for the word `out` below; any other port, or width, stops the run.
  const indexPorts: Record<number, number> = { 0x3c4: 0, 0x3ce: 0, 0x3d4: 0 }
  const registers: Record<number, Uint8Array> = {
    0x3c4: new Uint8Array(256), 0x3ce: new Uint8Array(256), 0x3d4: new Uint8Array(256),
  }
  registers[0x3c4][2] = 0x0f

  const machine = makeMachine(program, {
    portIn: (port, size) => {
      if (size !== 1) return undefined
      // The VGA status register's retrace bit, on the same clock as the ticks:
      // 70 frames a second against 18.2 ticks, the blank about a tenth of each.
      if (port === 0x3da) {
        const phase = machine.counts.instructions % instructionsPerFrame
        return phase < instructionsPerBlank ? 0x08 : 0
      }
      if (port in indexPorts) return indexPorts[port]
      if (port - 1 in indexPorts) return registers[port - 1][indexPorts[port - 1]]
      return undefined
    },
    portOut: (port, value, size) => {
      if (port in indexPorts) {
        indexPorts[port] = value & 0xff
        // A word out writes the index and then the data port beside it.
        if (size === 2) registers[port][value & 0xff] = value >> 8
        return true
      }
      if (port - 1 in indexPorts && size === 1) {
        registers[port - 1][indexPorts[port - 1]] = value & 0xff
        return true
      }
      return false
    },
    every: instructionsPerTick,
    tick: (m) => {
      ticks = (ticks + 1) >>> 0
      const memory = m.segment(bda)
      memory[0x6c] = ticks & 0xff
      memory[0x6d] = (ticks >> 8) & 0xff
      memory[0x6e] = (ticks >> 16) & 0xff
      memory[0x6f] = (ticks >> 24) & 0xff
    },
    interrupt: (vector, m) => {
      if (vector === 0x21) return dos(m)
      if (vector === 0x10) return video(m)
      if (vector === 0x16) return keyboard(m)
      if (vector === 0x20) {
        m.stop()
        return true
      }
      return false
    },
  })

  const ds = machine.regs.ds
  const memory = machine.segment(ds)

  // The PSP: `int 20h` at offset 0, where memory ends at 2, the tail at 0x80.
  memory[0] = 0xcd
  memory[1] = 0x20
  memory[2] = topOfMemory & 0xff
  memory[3] = topOfMemory >> 8
  const tail = options.args ? ` ${options.args}` : ''
  memory[0x80] = tail.length
  for (let i = 0; i < tail.length; i++) memory[0x81 + i] = tail.charCodeAt(i)
  memory[0x81 + tail.length] = 0x0d

  // The BIOS data area, in 80x25 colour text.
  const bdaMemory = machine.segment(bda)
  const setTextMode = (mode: number, rows: number) => {
    videoMode = mode
    bdaMemory[0x49] = mode
    bdaMemory[0x4a] = mode === 0x13 ? 40 : 80
    bdaMemory[0x4b] = 0
    bdaMemory[0x84] = rows - 1
    bdaMemory[0x63] = 0xd4
    bdaMemory[0x64] = 0x03
  }
  setTextMode(3, 25)

  // A string with no terminator anywhere in the segment is the program's bug,
  // and it stops the run rather than going round the segment for ever.
  const stringAt = (address: number, end: number): string => {
    let text = ''
    let a = address
    for (let k = 0; memory[a] !== end; k++, a = (a + 1) & 0xffff) {
      if (k === 65536) {
        throw new Error(`unterminated ${end === 0x24 ? '$' : 'NUL'} string at 0x${address.toString(16)}`)
      }
      text += String.fromCharCode(memory[a])
    }
    return text
  }

  const bytesAt = (address: number, count: number): Uint8Array => {
    const bytes = new Uint8Array(count)
    for (let i = 0; i < count; i++) bytes[i] = memory[(address + i) & 0xffff]
    return bytes
  }

  // DOS names are 8.3 and case-insensitive; a path's directories are kept as a
  // prefix, which is all `mkdir`, `rmdir` and a find inside one need.
  const normalise = (name: string): string => name.toUpperCase().replace(/^[A-Z]:/, '').replace(/^\\/, '')

  const matches = (name: string, pattern: string): boolean => {
    const [base, ext = ''] = name.split('.')
    const [pBase, pExt = ''] = pattern.split('.')
    const part = (value: string, p: string, width: number): boolean => {
      const v = value.padEnd(width, ' ')
      const q = p.includes('*') ? p.slice(0, p.indexOf('*')).padEnd(width, '?') : p.padEnd(width, ' ')
      for (let i = 0; i < width; i++) if (q[i] !== '?' && q[i] !== v[i]) return false
      return true
    }
    return part(base, pBase, 8) && part(ext, pExt, 3)
  }

  const fillDta = (name: string) => {
    const isDirectory = directories.has(name) || name.endsWith('.')
    const bytes = files.get(name)
    const size = bytes ? bytes.length : 0
    const leaf = name.includes('\\') ? name.slice(name.lastIndexOf('\\') + 1) : name
    // Wrapped to the segment, as every other access here is: past the end of the
    // window a typed array drops the write without a word.
    const put = (offset: number, value: number) => {
      memory[(dta + offset) & 0xffff] = value
    }
    put(0x15, isDirectory ? 0x10 : 0x20)
    put(0x16, 0)
    put(0x17, 0)
    put(0x18, 0x21)
    put(0x19, 0)
    put(0x1a, size & 0xff)
    put(0x1b, (size >> 8) & 0xff)
    put(0x1c, (size >> 16) & 0xff)
    put(0x1d, (size >> 24) & 0xff)
    for (let i = 0; i < 13; i++) put(0x1e + i, i < leaf.length ? leaf.charCodeAt(i) : 0)
  }

  const findNext = (m: Machine): boolean => {
    if (!finding || finding.index >= finding.names.length) return dosError(m, 18)
    fillDta(finding.names[finding.index++])
    return ok(m)
  }

  const dos = (m: Machine): boolean => {
    const r = m.regs
    const ah = r.ax >> 8
    const al = r.ax & 0xff
    switch (ah) {
      case 0x02:
        out.push(r.dx & 0xff)
        r.ax = (r.ax & 0xff00) | (r.dx & 0xff)
        return true
      case 0x06:
        if ((r.dx & 0xff) === 0xff) {
          m.flags.z = true
          r.ax &= 0xff00
          return true
        }
        out.push(r.dx & 0xff)
        return true
      case 0x09:
        for (const ch of stringAt(r.dx, 0x24)) out.push(ch.charCodeAt(0))
        r.ax = (r.ax & 0xff00) | 0x24
        return true
      case 0x0b:
        r.ax &= 0xff00
        return true
      case 0x1a:
        dta = r.dx
        return true
      case 0x39: {
        const name = normalise(stringAt(r.dx, 0))
        if (directories.has(name) || files.has(name)) return dosError(m, 5)
        directories.add(name)
        return ok(m)
      }
      case 0x3a: {
        const name = normalise(stringAt(r.dx, 0))
        if (!directories.has(name)) return dosError(m, 3)
        for (const other of [...files.keys(), ...directories]) {
          if (other.startsWith(`${name}\\`)) return dosError(m, 16)
        }
        directories.delete(name)
        return ok(m)
      }
      case 0x3c: {
        const name = normalise(stringAt(r.dx, 0))
        if (directories.has(name)) return dosError(m, 5)
        files.set(name, new Uint8Array(0))
        const handle = nextHandle++
        handles.set(handle, { name, position: 0, mode: 2 })
        r.ax = handle
        return ok(m)
      }
      case 0x3d: {
        const name = normalise(stringAt(r.dx, 0))
        if (!files.has(name)) return dosError(m, 2)
        const handle = nextHandle++
        handles.set(handle, { name, position: 0, mode: al & 0x03 })
        r.ax = handle
        return ok(m)
      }
      case 0x3e:
        if (!handles.delete(r.bx)) return dosError(m, 6)
        return ok(m)
      case 0x3f: {
        const handle = handles.get(r.bx)
        if (!handle) return dosError(m, 6)
        const bytes = files.get(handle.name) ?? new Uint8Array(0)
        const count = Math.max(0, Math.min(r.cx, bytes.length - handle.position))
        for (let i = 0; i < count; i++) memory[(r.dx + i) & 0xffff] = bytes[handle.position + i]
        handle.position += count
        r.ax = count
        return ok(m)
      }
      case 0x40: {
        if (r.bx === 1 || r.bx === 2) {
          for (const b of bytesAt(r.dx, r.cx)) out.push(b)
          r.ax = r.cx
          return ok(m)
        }
        const handle = handles.get(r.bx)
        if (!handle) return dosError(m, 6)
        // A handle opened to read takes nothing and says so by the count, with
        // carry clear - the short write `motrip` holds a save to noticing.
        if (handle.mode === 0) {
          r.ax = 0
          return ok(m)
        }
        const old = files.get(handle.name) ?? new Uint8Array(0)
        // A write of zero bytes truncates at the position, which is DOS's rule.
        const end = r.cx === 0 ? handle.position : Math.max(old.length, handle.position + r.cx)
        const grown = new Uint8Array(end)
        grown.set(old.subarray(0, Math.min(old.length, end)))
        grown.set(bytesAt(r.dx, r.cx), handle.position)
        files.set(handle.name, grown)
        handle.position += r.cx
        r.ax = r.cx
        return ok(m)
      }
      case 0x41: {
        const name = normalise(stringAt(r.dx, 0))
        if (!files.delete(name)) return dosError(m, 2)
        return ok(m)
      }
      case 0x42: {
        const handle = handles.get(r.bx)
        if (!handle) return dosError(m, 6)
        const size = (files.get(handle.name) ?? new Uint8Array(0)).length
        const offset = ((r.cx << 16) | r.dx) >> 0
        const base = al === 0 ? 0 : al === 1 ? handle.position : size
        // Before the start of the file is not clamped to it: what DOS answers
        // there is not something a tier 2 program has shown, so it stops.
        if (base + offset < 0) throw new Error(`int 0x21 AH=0x42: a seek to ${base + offset}, before the start of the file, is not modelled`)
        handle.position = base + offset
        r.ax = handle.position & 0xffff
        r.dx = (handle.position >>> 16) & 0xffff
        return ok(m)
      }
      case 0x4c:
        exitCode = al
        m.stop()
        return true
      case 0x4e: {
        const pattern = normalise(stringAt(r.dx, 0))
        const folder = pattern.includes('\\') ? pattern.slice(0, pattern.lastIndexOf('\\') + 1) : ''
        const leafPattern = pattern.slice(folder.length)
        const wantDirectories = (r.cx & 0x10) !== 0
        const names = [...files.keys(), ...(wantDirectories ? directories : [])]
          .filter((name) => name.startsWith(folder) && !name.slice(folder.length).includes('\\'))
          .filter((name) => matches(name.slice(folder.length), leafPattern))
          .sort()
        // Inside a directory DOS lists its own two entries first.
        if (folder !== '' && wantDirectories) {
          if (matches('.', leafPattern)) names.unshift(folder + '.')
          if (matches('..', leafPattern)) names.splice(names[0] === folder + '.' ? 1 : 0, 0, folder + '..')
        }
        finding = { names, index: 0 }
        if (names.length === 0) return dosError(m, 18)
        return findNext(m)
      }
      case 0x4f:
        return findNext(m)
      default:
        return false
    }
  }

  const video = (m: Machine): boolean => {
    const r = m.regs
    const ah = r.ax >> 8
    const al = r.ax & 0xff
    switch (ah) {
      case 0x00:
        setTextMode(al & 0x7f, 25)
        if ((al & 0x80) === 0 && al <= 3) {
          const text = m.segment(textSegment)
          for (let i = 0; i < 4000; i += 2) {
            text[i] = 0x20
            text[i + 1] = 0x07
          }
        }
        return true
      case 0x01:
      case 0x02:
        if (ah === 0x02) {
          bdaMemory[0x50] = r.dx & 0xff
          bdaMemory[0x51] = r.dx >> 8
        }
        return true
      case 0x03:
        r.dx = bdaMemory[0x50] | (bdaMemory[0x51] << 8)
        r.cx = 0x0607
        return true
      case 0x06:
      case 0x07: {
        // Scroll a window of the text screen; zero lines clears it.
        const cols = bdaMemory[0x4a]
        const text = m.segment(textSegment)
        const top = r.cx >> 8, left = r.cx & 0xff, bottom = r.dx >> 8, right = r.dx & 0xff
        const lines = al
        const attr = r.bx >> 8
        const height = bottom - top + 1
        for (let row = 0; row < height; row++) {
          const destination = ah === 0x06 ? top + row : bottom - row
          const source = ah === 0x06 ? destination + lines : destination - lines
          const inside = lines !== 0 && (ah === 0x06 ? source <= bottom : source >= top)
          for (let col = left; col <= right; col++) {
            const d = (destination * cols + col) * 2
            if (inside) {
              const s = (source * cols + col) * 2
              text[d] = text[s]
              text[d + 1] = text[s + 1]
            } else {
              text[d] = 0x20
              text[d + 1] = attr
            }
          }
        }
        return true
      }
      case 0x09: {
        const cols = bdaMemory[0x4a]
        const text = m.segment(textSegment)
        const at = (bdaMemory[0x51] * cols + bdaMemory[0x50]) * 2
        for (let i = 0; i < r.cx; i++) {
          text[at + i * 2] = al
          text[at + i * 2 + 1] = r.bx & 0xff
        }
        return true
      }
      case 0x08: {
        const cols = bdaMemory[0x4a]
        const text = m.segment(textSegment)
        const at = (bdaMemory[0x51] * cols + bdaMemory[0x50]) * 2
        r.ax = text[at] | (text[at + 1] << 8)
        return true
      }
      case 0x0f:
        r.ax = (bdaMemory[0x4a] << 8) | videoMode
        r.bx &= 0x00ff
        return true
      case 0x10:
        return true
      case 0x11:
        // 0x1112: the 8x8 font, which gives 50 rows on VGA.
        if (al === 0x12) bdaMemory[0x84] = 49
        return true
      case 0x12:
        // BL=0x10: EGA information - colour, 256K.
        if ((r.bx & 0xff) === 0x10) r.bx = 0x0003
        return true
      default:
        return false
    }
  }

  const keyboard = (m: Machine): boolean => {
    const ah = m.regs.ax >> 8
    // A test cannot type, so there is never a key waiting and nothing may wait
    // for one - tier 2 has the same rule, and a program that blocks is refused.
    if (ah === 0x01 || ah === 0x11) {
      m.flags.z = true
      return true
    }
    if (ah === 0x02 || ah === 0x12) {
      m.regs.ax &= 0xff00
      return true
    }
    return false
  }

  machine.run(options.limit)

  return {
    output: Buffer.from(out).toString('latin1'),
    exitCode,
    counts: machine.counts,
    profile: machine.profile,
    machine,
  }
}
