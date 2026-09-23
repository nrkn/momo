// An interpreter for the assembly Momo emits: the 8086 subset of DESIGN §1, run
// from the NASM text rather than from bytes (§72).
//
// Not a stage and not a second compiler. It reads what the emitter wrote, so a
// program runs here without NASM or DOSBox - which is what lets a routine be
// called on its own, its executed instructions counted exactly, and a screen
// compared frame by frame. `dos.ts` is the machine around it.
//
// Two things it is not. **It is not an assembler**: labels get addresses in the
// order they are declared, from a base of its own, so nothing that depends on
// where the image really lands can be asked of it. And **its cycles are an
// estimate** from the documented 8086 table - good for comparing two builds of
// one program, not for predicting a machine. Instruction counts are exact.

import { readFileSync } from 'node:fs'

// ---- parsing ----------------------------------------------------------------

type Operand =
  | { kind: 'reg'; name: string; size: 2 }
  | { kind: 'reg8'; name: string; size: 1 }
  | { kind: 'sreg'; name: string; size: 2 }
  | {
      kind: 'mem'
      size: 1 | 2 | null
      segment: string
      base: string[]
      disp: string
      ea: number
    }
  | { kind: 'imm'; expr: string; size: 1 | 2 | null }

export type Instruction = {
  op: string
  args: string[]
  line: number
  // Parsed when the instruction is first reached, and kept for the cycle
  // estimate of the ones whose cost depends on what they did.
  operands?: Operand[]
}

export type Program = {
  code: Instruction[]
  labels: Map<string, number>
  equs: Map<string, string>
  data: Map<string, number>
  init: { address: number; size: 1 | 2; expr: string }[]
  // The routine each instruction belongs to, for a profile.
  owner: string[]
}

const regs16 = ['ax', 'bx', 'cx', 'dx', 'si', 'di', 'sp', 'bp']
const regs8: Record<string, [string, number]> = {
  al: ['ax', 0], ah: ['ax', 8], bl: ['bx', 0], bh: ['bx', 8],
  cl: ['cx', 0], ch: ['cx', 8], dl: ['dx', 0], dh: ['dx', 8],
}
const segRegs = ['es', 'ds', 'cs', 'ss']

// Where data starts. High enough that no label is ever at 0, which `strFind`'s
// sentinel relies on, and low enough to leave the heap most of the segment.
const dataBase = 0x0400

const stripComment = (line: string): string => {
  let quote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === ';') return line.slice(0, i)
  }
  return line
}

const splitOperands = (text: string): string[] => {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"') quote = c
    else if (c === '[') depth++
    else if (c === ']') depth--
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = text.slice(start).trim()
  if (last !== '') out.push(last)
  return out
}

// NASM scopes a `.label` to the last label without a dot, and so does this.
const qualify = (name: string, scope: string): string =>
  name.startsWith('.') ? `${scope}${name}` : name

export const parseAssembly = (text: string): Program => {
  const code: Instruction[] = []
  const labels = new Map<string, number>()
  const equs = new Map<string, string>()
  const data = new Map<string, number>()
  const init: Program['init'] = []
  const owner: string[] = []

  let address = dataBase
  let scope = ''

  const emitData = (directive: string): boolean => {
    const match = directive.match(/^(times\s+(\S+)\s+)?(dw|db)\s+(.*)$/)
    if (!match) return false
    const count = match[2] ? Number(match[2]) : 1
    const size = match[3] === 'dw' ? 2 : 1
    for (let k = 0; k < count; k++) {
      for (const item of splitOperands(match[4])) {
        const string = item.match(/^(['"])(.*)\1$/)
        if (string) {
          for (const ch of string[2]) {
            init.push({ address, size: 1, expr: String(ch.charCodeAt(0)) })
            address += 1
          }
          continue
        }
        init.push({ address, size, expr: item })
        address += size
      }
    }
    return true
  }

  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    let line = stripComment(lines[index]).trim()
    if (line === '') continue

    const label = line.match(/^([A-Za-z_.$][A-Za-z0-9_.$]*):\s*(.*)$/)
    if (label) {
      const name = qualify(label[1], scope)
      if (!label[1].startsWith('.')) scope = label[1]
      const rest = label[2]
      if (/^equ\s/.test(rest)) {
        equs.set(name, rest.replace(/^equ\s+/, ''))
        continue
      }
      // A bare label is a jump target and, for `_heap:`, an address - both are
      // recorded, since which one it is only the use can say.
      labels.set(name, code.length)
      data.set(name, address)
      if (rest === '') continue
      line = rest
    }

    const op = line.split(/\s+/)[0]
    const rest = line.slice(op.length).trim()
    if (op === 'cpu' || op === 'org' || op === 'bits') continue
    if (op === 'align') {
      while (address % Number(rest) !== 0) address++
      continue
    }
    if (emitData(line)) continue

    // A jump's target is scoped where the jump is written.
    const args = splitOperands(rest).map((arg) =>
      /^j|^call$/.test(op) && arg.startsWith('.') ? qualify(arg, scope) : arg,
    )
    code.push({ op, args, line: index + 1 })
    owner.push(scope)
  }

  return { code, labels, equs, data, init, owner }
}

export const loadAssembly = (path: string): Program =>
  parseAssembly(readFileSync(path, 'utf8'))

// ---- the machine ------------------------------------------------------------

export type Registers = Record<'ax' | 'bx' | 'cx' | 'dx' | 'si' | 'di' | 'sp' | 'bp' | 'es' | 'ds' | 'cs' | 'ss', number>
export type Flags = { z: boolean; s: boolean; c: boolean; o: boolean }

export type Counts = { instructions: number; cycles: number }

export type Hooks = {
  // What an `in` reads, and what an `out` does. Absent ports read 0.
  portIn?: (port: number, size: 1 | 2) => number
  portOut?: (port: number, value: number, size: 1 | 2) => void
  // An `int`. Returns false for a service nobody modelled, which stops the run
  // with the number in the message rather than pretending it happened.
  interrupt?: (vector: number, machine: Machine) => boolean
  // Called every `every` instructions - how a clock that the program only reads
  // from memory, like the BIOS tick count, moves while it runs.
  every?: number
  tick?: (machine: Machine) => void
}

export type Machine = {
  regs: Registers
  flags: Flags
  segment: (value: number) => Uint8Array
  // Runs a routine by label until it returns, or the program from its first
  // instruction until something stops it.
  call: (label: string, limit?: number) => void
  run: (limit?: number) => void
  stop: () => void
  address: (label: string) => number
  counts: Counts
  profile: Map<string, Counts>
}

// Returned to by `call` - a value no near return address can have here, since
// code never lives in a segment.
const sentinel = 0xffff

// What a compiled instruction returns instead of the next instruction's index.
const returned = -1

// The register file, by index. A typed array rather than an object because the
// hot path indexes it several times an instruction.
const registerIndex: Record<string, number> = {
  ax: 0, bx: 1, cx: 2, dx: 3, si: 4, di: 5, sp: 6, bp: 7, es: 8, ds: 9, cs: 10, ss: 11,
}

type Compiled = {
  // Runs the instruction and returns where to go next.
  exec: () => number
  // Its fixed cycles; a closure charges anything that depends on what happened.
  cost: number
  entry: Counts
}

export const makeMachine = (program: Program, hooks: Hooks = {}): Machine => {
  const { code, labels, equs, data } = program
  // One megabyte, as the 8086 addresses it: segment * 16 + offset. A segment is
  // a 64 KB window onto it, so `0x40:0x6C` and `0:0x46C` are the same byte, as
  // they are on the machine. The extra 64 KB past the top is the window a
  // segment near 0xFFFF opens, which the real machine wraps and nothing here uses.
  const linear = new Uint8Array(0x110000)
  const windows: (Uint8Array | undefined)[] = new Array(65536)
  const segment = (value: number): Uint8Array => {
    let window = windows[value]
    if (!window) {
      window = linear.subarray(value * 16, value * 16 + 65536)
      windows[value] = window
    }
    return window
  }

  const R = new Uint16Array(12)
  const dsValue = 0x0800
  R[registerIndex.sp] = 0xfffe
  R[registerIndex.ds] = dsValue
  R[registerIndex.cs] = dsValue
  R[registerIndex.ss] = dsValue
  // DS and SS never move - nothing Momo emits loads either - so their memory is
  // fixed here; only ES is looked up, and only when it changes.
  const dsMemory = segment(dsValue)
  let esValue = -1
  let esMemory = dsMemory
  const esSegment = (): Uint8Array => {
    const value = R[registerIndex.es]
    if (value !== esValue) {
      esValue = value
      esMemory = segment(value)
    }
    return esMemory
  }

  let zf = false
  let sf = false
  let cf = false
  let of = false

  // The same state as a plain object, for hooks: they run once in a long while
  // and read better as `r.ax` than as an index.
  const regs = {} as Registers
  for (const [name, index] of Object.entries(registerIndex)) {
    Object.defineProperty(regs, name, {
      get: () => R[index],
      set: (value: number) => {
        R[index] = value & 0xffff
      },
      enumerable: true,
    })
  }
  const flags: Flags = {
    get z() { return zf },
    set z(value) { zf = value },
    get s() { return sf },
    set s(value) { sf = value },
    get c() { return cf },
    set c(value) { cf = value },
    get o() { return of },
    set o(value) { of = value },
  }

  const counts: Counts = { instructions: 0, cycles: 0 }
  const profile = new Map<string, Counts>()

  const equValues = new Map<string, number>()
  const symbol = (name: string): number => {
    const equ = equs.get(name)
    if (equ !== undefined) {
      let value = equValues.get(name)
      if (value === undefined) {
        value = evaluate(equ)
        equValues.set(name, value)
      }
      return value
    }
    const address = data.get(name)
    if (address === undefined) throw new Error(`unknown symbol "${name}"`)
    return address
  }

  // The expressions the emitter writes: terms joined by + - * /, parentheses,
  // unary minus, decimal, 0x and trailing-h hex, and single-character literals.
  const evaluate = (expr: string): number => {
    const tokens = expr.replace(/\s+/g, '').match(/0x[0-9a-fA-F]+|[0-9][0-9a-fA-F]*h\b|\d+|'[^']'|[A-Za-z_.$][A-Za-z0-9_.$]*|[-+*/()]/g)
    if (!tokens) throw new Error(`cannot read "${expr}"`)
    let at = 0
    const atom = (): number => {
      const t = tokens[at++]
      if (t === '(') {
        const v = sum()
        at++
        return v
      }
      if (t === '-') return -atom()
      if (t.startsWith('0x')) return parseInt(t, 16)
      if (/^[0-9][0-9a-fA-F]*h$/.test(t)) return parseInt(t.slice(0, -1), 16)
      if (/^\d+$/.test(t)) return Number(t)
      if (/^'.'$/.test(t)) return t.charCodeAt(1)
      return symbol(t)
    }
    const product = (): number => {
      let v = atom()
      while (tokens[at] === '*' || tokens[at] === '/') {
        const o = tokens[at++]
        const w = atom()
        v = o === '*' ? v * w : Math.trunc(v / w)
      }
      return v
    }
    const sum = (): number => {
      let v = product()
      while (tokens[at] === '+' || tokens[at] === '-') {
        const o = tokens[at++]
        const w = product()
        v = o === '+' ? v + w : v - w
      }
      return v
    }
    return sum()
  }

  for (const item of program.init) {
    const value = evaluate(item.expr) & 0xffff
    dsMemory[item.address] = value & 0xff
    if (item.size === 2) dsMemory[item.address + 1] = value >> 8
  }

  const parseOperand = (text: string): Operand => {
    let t = text.trim()
    let size: 1 | 2 | null = null
    const sized = t.match(/^(word|byte)\s+(.*)$/)
    if (sized) {
      size = sized[1] === 'word' ? 2 : 1
      t = sized[2]
    }
    if (regs16.includes(t)) return { kind: 'reg', name: t, size: 2 }
    if (t in regs8) return { kind: 'reg8', name: t, size: 1 }
    if (segRegs.includes(t)) return { kind: 'sreg', name: t, size: 2 }
    const memory = t.match(/^\[(.*)\]$/)
    if (memory) {
      let inner = memory[1].trim()
      let segmentName = 'ds'
      const override = inner.match(/^(es|ds|ss|cs)\s*:\s*(.*)$/)
      if (override) {
        segmentName = override[1]
        inner = override[2]
      }
      const terms = inner.replace(/\s+/g, '').replace(/-/g, '+-').split('+').filter(Boolean)
      const base = terms.filter((term) => ['bx', 'si', 'di', 'bp'].includes(term))
      const disp = terms.filter((term) => !base.includes(term)).join('+').replace(/\+-/g, '-')
      const ea = (base.length === 0 ? 6 : disp === '' ? 5 : 9) + (override ? 2 : 0)
      return { kind: 'mem', size, segment: segmentName, base, disp, ea }
    }
    return { kind: 'imm', expr: t, size }
  }

  // ---- operands, compiled to accessors ----

  type Getter = () => number
  type Setter = (value: number) => void

  const addressOf = (operand: Extract<Operand, { kind: 'mem' }>): Getter => {
    const disp = operand.disp === '' ? 0 : evaluate(operand.disp)
    const bases = operand.base.map((name) => registerIndex[name])
    if (bases.length === 0) {
      const a = disp & 0xffff
      return () => a
    }
    if (bases.length === 1) {
      const b = bases[0]
      return () => (disp + R[b]) & 0xffff
    }
    const [b0, b1] = bases
    return () => (disp + R[b0] + R[b1]) & 0xffff
  }

  const memoryOf = (operand: Extract<Operand, { kind: 'mem' }>): (() => Uint8Array) => {
    if (operand.segment === 'es') return esSegment
    if (operand.segment === 'ds' || operand.segment === 'ss' || operand.segment === 'cs') return () => dsMemory
    throw new Error(`segment ${operand.segment} is not modelled`)
  }

  const getter = (operand: Operand, size: 1 | 2): Getter => {
    if (operand.kind === 'reg' || operand.kind === 'sreg') {
      const i = registerIndex[operand.name]
      return () => R[i]
    }
    if (operand.kind === 'reg8') {
      const [parent, shift] = regs8[operand.name]
      const i = registerIndex[parent]
      return shift === 0 ? () => R[i] & 0xff : () => R[i] >> 8
    }
    if (operand.kind === 'imm') {
      const value = evaluate(operand.expr) & (size === 1 ? 0xff : 0xffff)
      return () => value
    }
    const address = addressOf(operand)
    const memory = memoryOf(operand)
    if (operand.segment !== 'es') {
      return size === 1
        ? () => dsMemory[address()]
        : () => {
            const a = address()
            return dsMemory[a] | (dsMemory[(a + 1) & 0xffff] << 8)
          }
    }
    return size === 1
      ? () => memory()[address()]
      : () => {
          const m = memory()
          const a = address()
          return m[a] | (m[(a + 1) & 0xffff] << 8)
        }
  }

  const setter = (operand: Operand, size: 1 | 2, line: number): Setter => {
    if (operand.kind === 'reg' || operand.kind === 'sreg') {
      const i = registerIndex[operand.name]
      return (value) => {
        R[i] = value
      }
    }
    if (operand.kind === 'reg8') {
      const [parent, shift] = regs8[operand.name]
      const i = registerIndex[parent]
      return shift === 0
        ? (value) => {
            R[i] = (R[i] & 0xff00) | (value & 0xff)
          }
        : (value) => {
            R[i] = (R[i] & 0x00ff) | ((value & 0xff) << 8)
          }
    }
    if (operand.kind === 'imm') throw new Error(`line ${line}: cannot write to an immediate`)
    const address = addressOf(operand)
    const memory = memoryOf(operand)
    return size === 1
      ? (value) => {
          memory()[address()] = value
        }
      : (value) => {
          const m = memory()
          const a = address()
          m[a] = value
          m[(a + 1) & 0xffff] = value >> 8
        }
  }

  // ---- flags ----

  const logic = (value: number, size: 1 | 2): number => {
    const v = value & (size === 1 ? 0xff : 0xffff)
    zf = v === 0
    sf = (v & (size === 1 ? 0x80 : 0x8000)) !== 0
    cf = false
    of = false
    return v
  }

  const add = (a: number, b: number, size: 1 | 2): number => {
    const mask = size === 1 ? 0xff : 0xffff
    const sign = size === 1 ? 0x80 : 0x8000
    const result = a + b
    const v = result & mask
    cf = result > mask
    zf = v === 0
    sf = (v & sign) !== 0
    of = (~(a ^ b) & (a ^ v) & sign) !== 0
    return v
  }

  const subtract = (a: number, b: number, size: 1 | 2): number => {
    const mask = size === 1 ? 0xff : 0xffff
    const sign = size === 1 ? 0x80 : 0x8000
    const v = (a - b) & mask
    cf = a < b
    zf = v === 0
    sf = (v & sign) !== 0
    of = ((a ^ b) & (a ^ v) & sign) !== 0
    return v
  }

  // The documented 8086 figures, simplified: see the note at the top.
  // The fixed part: a jump not taken, a shift by CL of nothing. The rest is
  // charged as it happens - see `charge`.
  const cyclesOf = (op: string, operands: Operand[]): number => {
    const [a, b] = operands
    const memA = a?.kind === 'mem' ? a.ea : null
    const memB = b?.kind === 'mem' ? b.ea : null
    switch (op) {
      case 'mov':
        if (a.kind === 'sreg' || b.kind === 'sreg') return memA !== null ? 9 + memA : memB !== null ? 8 + memB : 2
        if (memA !== null) return (b.kind === 'imm' ? 10 : 9) + memA
        if (memB !== null) return 8 + memB
        return b.kind === 'imm' ? 4 : 2
      case 'add': case 'sub': case 'and': case 'or': case 'xor': case 'cmp': case 'test': {
        const reads = op === 'cmp' || op === 'test'
        if (memA !== null) return (b.kind === 'imm' ? (reads ? 10 : 17) : (reads ? 9 : 16)) + memA
        if (memB !== null) return 9 + memB
        return b.kind === 'imm' ? 4 : 3
      }
      case 'inc': case 'dec': return memA !== null ? 15 + memA : 2
      case 'neg': case 'not': return memA !== null ? 16 + memA : 3
      case 'shl': case 'shr': case 'sar':
        return b.kind === 'reg8' ? 8 : memA !== null ? 15 + memA : 2
      case 'mul': return 124 + (memA ?? 0)
      case 'div': return 150 + (memA ?? 0)
      case 'idiv': return 170 + (memA ?? 0)
      case 'cbw': return 2
      case 'cwd': return 5
      case 'push': return memA !== null ? 16 + memA : 11
      case 'pushf': return 10
      case 'pop': return memA !== null ? 17 + memA : 8
      case 'call': return 19
      case 'ret': return 16
      case 'jmp': return 15
      case 'in': case 'out': return 8
      case 'int': return 51
      default: return 4
    }
  }

  const conditions: Record<string, () => boolean> = {
    je: () => zf, jz: () => zf, jne: () => !zf, jnz: () => !zf,
    jl: () => sf !== of, jle: () => zf || sf !== of,
    jg: () => !zf && sf === of, jge: () => sf === of,
    jb: () => cf, jbe: () => cf || zf, ja: () => !cf && !zf, jae: () => !cf,
  }

  const sp = registerIndex.sp
  const push = (value: number) => {
    R[sp] = R[sp] - 2
    dsMemory[R[sp]] = value
    dsMemory[(R[sp] + 1) & 0xffff] = value >> 8
  }
  const pop = (): number => {
    const value = dsMemory[R[sp]] | (dsMemory[(R[sp] + 1) & 0xffff] << 8)
    R[sp] = R[sp] + 2
    return value
  }

  let stopped = false

  const ax = registerIndex.ax
  const cx = registerIndex.cx
  const dx = registerIndex.dx

  // One instruction, turned into a closure over accessors built for exactly its
  // operands. Paid once per instruction the program reaches.
  const compile = (instruction: Instruction, ip: number): Compiled => {
    const { op, line } = instruction
    const operands = instruction.args.map(parseOperand)
    const [a, b] = operands
    const size: 1 | 2 = a?.size ?? b?.size ?? 2
    const next = ip + 1
    const target = (): number => {
      const index = labels.get(instruction.args[0])
      if (index === undefined) throw new Error(`line ${line}: no label "${instruction.args[0]}"`)
      return index
    }
    const routine = program.owner[ip]
    let entry = profile.get(routine)
    if (!entry) {
      entry = { instructions: 0, cycles: 0 }
      profile.set(routine, entry)
    }
    const counted = entry
    // What an instruction costs beyond its fixed figure: a jump taken, a shift
    // by CL. Charged by the closure, so the loop only ever adds a constant.
    const charge = (cycles: number) => {
      counts.cycles += cycles
      counted.cycles += cycles
    }

    let exec: () => number
    switch (op) {
      case 'mov': {
        const get = getter(b, size)
        const set = setter(a, size, line)
        exec = () => {
          set(get())
          return next
        }
        break
      }
      case 'add': case 'sub': case 'cmp': {
        const getA = getter(a, size)
        const getB = getter(b, size)
        if (op === 'cmp') {
          exec = () => {
            subtract(getA(), getB(), size)
            return next
          }
        } else {
          const set = setter(a, size, line)
          const f = op === 'add' ? add : subtract
          exec = () => {
            set(f(getA(), getB(), size))
            return next
          }
        }
        break
      }
      case 'and': case 'or': case 'xor': case 'test': {
        const getA = getter(a, size)
        const getB = getter(b, size)
        if (op === 'test') {
          exec = () => {
            logic(getA() & getB(), size)
            return next
          }
        } else {
          const set = setter(a, size, line)
          exec = op === 'and'
            ? () => { set(logic(getA() & getB(), size)); return next }
            : op === 'or'
              ? () => { set(logic(getA() | getB(), size)); return next }
              : () => { set(logic(getA() ^ getB(), size)); return next }
        }
        break
      }
      case 'inc': case 'dec': {
        const get = getter(a, size)
        const set = setter(a, size, line)
        const f = op === 'inc' ? add : subtract
        exec = () => {
          const carry = cf
          set(f(get(), 1, size))
          cf = carry
          return next
        }
        break
      }
      case 'neg': {
        const get = getter(a, size)
        const set = setter(a, size, line)
        exec = () => {
          const x = get()
          set(subtract(0, x, size))
          cf = x !== 0
          return next
        }
        break
      }
      case 'not': {
        const get = getter(a, size)
        const set = setter(a, size, line)
        exec = () => {
          set(~get())
          return next
        }
        break
      }
      case 'shl': case 'shr': case 'sar': {
        const get = getter(a, size)
        const set = setter(a, size, line)
        const count: Getter = b.kind === 'reg8' ? () => R[cx] & 0x1f : getter(b, 1)
        const sign = size === 1 ? 0x80 : 0x8000
        const mask = size === 1 ? 0xff : 0xffff
        const byCl = b.kind === 'reg8'
        exec = () => {
          const n = count()
          if (byCl) charge(4 * (R[cx] & 0xff))
          let x = get()
          let carry = cf
          for (let k = 0; k < n; k++) {
            if (op === 'shl') {
              carry = (x & sign) !== 0
              x = (x << 1) & mask
            } else {
              carry = (x & 1) !== 0
              x = op === 'shr' ? x >> 1 : (x >> 1) | (x & sign)
            }
          }
          set(logic(x, size))
          cf = carry
          return next
        }
        break
      }
      case 'mul': {
        const get = getter(a, size)
        exec = size === 1
          ? () => {
              R[ax] = (R[ax] & 0xff) * get()
              return next
            }
          : () => {
              const product = R[ax] * get()
              R[ax] = product
              R[dx] = Math.floor(product / 65536)
              cf = of = R[dx] !== 0
              return next
            }
        break
      }
      case 'div': case 'idiv': {
        if (size !== 2) throw new Error(`line ${line}: byte ${op} is not modelled`)
        const get = getter(a, 2)
        exec = () => {
          const divisor = get()
          if (divisor === 0) throw new Error(`line ${line}: divide by zero`)
          if (op === 'div') {
            const n = R[dx] * 65536 + R[ax]
            const q = Math.floor(n / divisor)
            if (q > 0xffff) throw new Error(`line ${line}: divide overflow`)
            R[ax] = q
            R[dx] = n % divisor
          } else {
            const n = ((R[dx] << 16) | R[ax]) >> 0
            const d = (divisor << 16) >> 16
            R[ax] = Math.trunc(n / d)
            R[dx] = n % d
          }
          return next
        }
        break
      }
      case 'cbw':
        exec = () => {
          R[ax] = ((R[ax] & 0xff) << 24) >> 24
          return next
        }
        break
      case 'cwd':
        exec = () => {
          R[dx] = R[ax] & 0x8000 ? 0xffff : 0
          return next
        }
        break
      case 'push': {
        const get = getter(a, 2)
        exec = () => {
          push(get())
          return next
        }
        break
      }
      case 'pop': {
        const set = setter(a, 2, line)
        exec = () => {
          set(pop())
          return next
        }
        break
      }
      case 'pushf':
        exec = () => {
          push((cf ? 0x01 : 0) | (zf ? 0x40 : 0) | (sf ? 0x80 : 0) | (of ? 0x800 : 0))
          return next
        }
        break
      case 'call': {
        const to = target()
        exec = () => {
          push(next)
          return to
        }
        break
      }
      case 'ret':
        exec = () => {
          const to = pop()
          return to === sentinel ? returned : to
        }
        break
      case 'jmp': {
        const to = target()
        exec = () => to
        break
      }
      case 'in': {
        const set = setter(a, size, line)
        exec = () => {
          set(hooks.portIn?.(R[dx], size) ?? 0)
          return next
        }
        break
      }
      case 'out': {
        const width = b.size ?? 1
        const get = getter(b, width)
        exec = () => {
          hooks.portOut?.(R[dx], get(), width)
          return next
        }
        break
      }
      case 'int': {
        const vector = evaluate(a.kind === 'imm' ? a.expr : instruction.args[0])
        exec = () => {
          if (!hooks.interrupt?.(vector, machine)) {
            const ah = (R[ax] >> 8).toString(16).padStart(2, '0')
            throw new Error(`int 0x${vector.toString(16)} with AH=0x${ah} is not modelled (line ${line})`)
          }
          return next
        }
        break
      }
      default: {
        const condition = conditions[op]
        if (!condition) throw new Error(`line ${line}: "${op}" is not in the subset`)
        const to = target()
        exec = () => {
          if (condition()) {
            charge(12)
            return to
          }
          return next
        }
      }
    }

    instruction.operands = operands
    return { exec, cost: cyclesOf(op, operands), entry }
  }

  const compiled: (Compiled | undefined)[] = new Array(code.length)
  const tick = hooks.tick
  const every = hooks.every ?? 1
  let untilTick = every

  const execute = (start: number, limit: number) => {
    let ip = start
    stopped = false
    for (let steps = 0; ; steps++) {
      if (steps > limit) throw new Error(`still running after ${limit} instructions`)
      let unit = compiled[ip]
      if (!unit) {
        const instruction = code[ip]
        if (!instruction) throw new Error(`ran off the end of the code at instruction ${ip}`)
        unit = compile(instruction, ip)
        compiled[ip] = unit
      }

      const to = unit.exec()
      const cycles = unit.cost
      counts.instructions += 1
      counts.cycles += cycles
      unit.entry.instructions += 1
      unit.entry.cycles += cycles

      if (tick && --untilTick === 0) {
        untilTick = every
        tick(machine)
      }
      if (to === returned || stopped) return
      ip = to
    }
  }

  const machine: Machine = {
    regs,
    flags,
    segment,
    counts,
    profile,
    address: symbol,
    stop: () => {
      stopped = true
    },
    call: (label, limit = 50_000_000) => {
      const start = labels.get(label)
      if (start === undefined) throw new Error(`no routine "${label}"`)
      push(sentinel)
      execute(start, limit)
    },
    run: (limit = 500_000_000) => {
      execute(0, limit)
    },
  }

  return machine
}
