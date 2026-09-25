// The host half of §41: build a WAD from a manifest, and list what one holds.
//
//   npm run wad -- build <manifest> <out.wad>
//   npm run wad -- list <file.wad> [<file.wad> ...]
//   npm run wad -- sweep <directory>
//
// **The type ids live in `shared/lib/mowad.momo` and nowhere else.** This file
// compiles that library - load and resolve, the front half of every tool - and
// takes every const declared in the unit `wadType` as the type table, named by
// what follows `wadType` in its name. The header and entry layout come from the
// same place, and are checked rather than assumed: a library whose layout this
// file does not understand stops it by name. So a type added to the library is
// a type this accepts, and there is no second copy to drift.
//
// A manifest is one line per thing, `#` for a comment, paths relative to the
// manifest itself:
//
//   iwad                        the file is an IWAD; a PWAD otherwise
//   lump NAME TYPE FILE [VER]   a lump of ours: the Mo header, then the file
//   foreign NAME FILE           a lump with no header - someone else's bytes
//   row NAME TYPE               a foreign row, the manifest's word for a lump
//                               that cannot speak for itself
//   pad N                       N zero bytes nothing references
//   entry NAME OFFSET SIZE      a directory entry, written as given
//
// The TYPES lump is derived: a row for every `lump`, then the `row` lines, and
// only if there is one of either. A `row` naming a `lump` in the same manifest is
// refused - the header is the authority, and a second description of it is the
// parallel structure §41 refused. The last two kinds exist because a directory
// is free-form, and a checker's fixture has to be able to say what the checker
// must catch; nothing else wants them.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve as resolvePath } from 'node:path'

import { asmFor, buildRoot, fail, failWith, sharedRoot } from './cli.js'
import { runDos } from './dos.js'
import { load } from '../momo/loader.js'
import { resolve } from '../momo/resolver.js'

const libraryPath = join(sharedRoot, 'lib', 'mowad.momo')

type Format = {
  types: Map<string, number>
  names: Map<number, string>
  headerBytes: number
  entryBytes: number
  nameBytes: number
  moBytes: number
  rowBytes: number
  magic: [number, number]
}

// The library, compiled far enough to have its constants. Pruning is not run,
// so a const nothing calls is still here.
const readFormat = (): Format => {
  const sources = new Map<string, string>()
  const consts = new Map<string, { value: number; unit?: string }>()

  try {
    const { symbols } = resolve(load(libraryPath, sharedRoot, sources).program)
    for (const symbol of symbols) {
      if (symbol.kind === 'const') consts.set(symbol.name, { value: symbol.value, unit: symbol.unit })
    }
  } catch (error) {
    failWith(sources, error)
  }

  const constant = (name: string, expected?: number): number => {
    const found = consts.get(name)
    if (!found) fail(`mowad.momo declares no "${name}" - this tool reads its layout from there`)
    if (expected !== undefined && found!.value !== expected) {
      fail(`mowad.momo has ${name} = ${found!.value}, and this tool writes ${expected} - teach it the new layout`)
    }
    return found!.value
  }

  // What the writer below assumes, held against the library rather than
  // restated: the WAD layout is Doom's and fixed, and the entry's field order is
  // what `entryBytes` below writes.
  const format: Format = {
    types: new Map(),
    names: new Map(),
    headerBytes: constant('wadHeaderBytes', 12),
    entryBytes: constant('wadEntryBytes', 16),
    nameBytes: constant('wadNameBytes', 8),
    moBytes: constant('wadMoBytes', 4),
    rowBytes: constant('wadRowBytes', 9),
    magic: [constant('wadMoM'), constant('wadMoO')],
  }
  constant('wadEntPos', 0)
  constant('wadEntSize', 4)
  constant('wadEntName', 8)

  for (const [name, { value, unit }] of consts) {
    if (unit !== 'wadType') continue
    if (!name.startsWith('wadType')) fail(`mowad.momo's type "${name}" does not start wadType, so it has no name here`)
    const short = name.slice('wadType'.length).toLowerCase()
    if (format.names.has(value)) fail(`mowad.momo gives types "${format.names.get(value)}" and "${short}" the same id, ${value}`)
    format.types.set(short, value)
    format.names.set(value, short)
  }

  if (format.types.get('none') !== 0) fail('mowad.momo has no wadTypeNone = 0, which the listing needs for an untyped lump')
  if (!format.types.has('types')) fail('mowad.momo has no wadTypeTypes, which the manifest lump carries')

  return format
}

// ---- build ----

type Entry = { name: string; offset: number; size: number }

const checkName = (name: string, where: string): string => {
  if (!/^[\x21-\x7e]{1,8}$/.test(name)) fail(`${where}: "${name}" is not a lump name - one to eight printable characters`)
  return name
}

const build = (manifestPath: string, outPath: string) => {
  const format = readFormat()
  const base = dirname(resolvePath(manifestPath))
  const lines = readFileSync(manifestPath, 'utf8').split(/\r?\n/)

  const chunks: Buffer[] = []
  let offset = format.headerBytes
  const entries: Entry[] = []
  const headed = new Set<string>()
  const derived: [string, number][] = []
  const claimed: [string, number][] = []
  let iwad = false

  const put = (bytes: Buffer) => {
    chunks.push(bytes)
    offset += bytes.length
  }

  const typeOf = (word: string | undefined, where: string): number => {
    const id = word === undefined ? undefined : format.types.get(word)
    if (id === undefined || word === 'none' || word === 'types') {
      const known = [...format.types.keys()].filter((name) => name !== 'none' && name !== 'types')
      fail(`${where}: "${word ?? ''}" is not a type - mowad.momo knows ${known.join(', ')}`)
    }
    return id!
  }

  const number = (word: string | undefined, where: string, max: number): number => {
    if (word === undefined || !/^\d+$/.test(word) || Number(word) > max) {
      fail(`${where}: "${word ?? ''}" is not a number from 0 to ${max}`)
    }
    return Number(word)
  }

  const source = (path: string, where: string): Buffer => {
    try {
      return readFileSync(join(base, path))
    } catch {
      return fail(`${where}: cannot read "${path}"`)
    }
  }

  const header = (type: number, version: number): Buffer =>
    Buffer.from([format.magic[0], format.magic[1], type, version])

  for (let i = 0; i < lines.length; i++) {
    const words = lines[i].replace(/#.*/, '').trim().split(/\s+/).filter((word) => word !== '')
    if (words.length === 0) continue

    const where = `${manifestPath}:${i + 1}`
    const [kind, ...rest] = words
    const arity = (count: number, usage: string) => {
      if (rest.length !== count && !(kind === 'lump' && rest.length === count + 1)) {
        fail(`${where}: "${kind}" takes ${usage}`)
      }
    }

    if (kind === 'iwad') {
      arity(0, 'nothing')
      iwad = true
    } else if (kind === 'lump') {
      arity(3, 'NAME TYPE FILE [VERSION]')
      const name = checkName(rest[0], where)
      const type = typeOf(rest[1], where)
      const version = rest[3] === undefined ? 1 : number(rest[3], where, 255)
      const bytes = source(rest[2], where)
      entries.push({ name, offset, size: format.moBytes + bytes.length })
      put(header(type, version))
      put(bytes)
      headed.add(name)
      derived.push([name, type])
    } else if (kind === 'foreign') {
      arity(2, 'NAME FILE')
      const name = checkName(rest[0], where)
      const bytes = source(rest[1], where)
      entries.push({ name, offset, size: bytes.length })
      put(bytes)
    } else if (kind === 'row') {
      arity(2, 'NAME TYPE')
      claimed.push([checkName(rest[0], where), typeOf(rest[1], where)])
    } else if (kind === 'pad') {
      arity(1, 'a byte count')
      put(Buffer.alloc(number(rest[0], where, 65535)))
    } else if (kind === 'entry') {
      arity(3, 'NAME OFFSET SIZE')
      entries.push({
        name: checkName(rest[0], where),
        offset: number(rest[1], where, 0xffffffff),
        size: number(rest[2], where, 0xffffffff),
      })
    } else {
      fail(`${where}: "${kind}" is not a manifest line - iwad, lump, foreign, row, pad or entry`)
    }
  }

  for (const [name] of claimed) {
    if (headed.has(name)) fail(`${manifestPath}: a row names ${name}, which has a header - a row cannot speak for it`)
  }

  const rows = [...derived, ...claimed]
  if (rows.length > 0) {
    const body = Buffer.alloc(rows.length * format.rowBytes)
    rows.forEach(([name, type], r) => {
      body.write(name, r * format.rowBytes, 'latin1')
      body[r * format.rowBytes + format.nameBytes] = type
    })
    entries.push({ name: 'TYPES', offset, size: format.moBytes + body.length })
    put(header(format.types.get('types')!, 1))
    put(body)
  }

  const directory = Buffer.alloc(entries.length * format.entryBytes)
  entries.forEach((entry, e) => {
    directory.writeUInt32LE(entry.offset, e * format.entryBytes)
    directory.writeUInt32LE(entry.size, e * format.entryBytes + 4)
    directory.write(entry.name, e * format.entryBytes + 8, 'latin1')
  })

  const head = Buffer.alloc(format.headerBytes)
  head.write(iwad ? 'IWAD' : 'PWAD', 0, 'latin1')
  head.writeUInt32LE(entries.length, 4)
  head.writeUInt32LE(offset, 8)

  const file = Buffer.concat([head, ...chunks, directory])
  writeFileSync(outPath, file)
  console.log(`ok: ${outPath}  ${iwad ? 'IWAD' : 'PWAD'}, ${entries.length} lumps, ${rows.length} rows, ${file.length} bytes`)
}

// ---- list ----
//
// The reader again, on the host: a second implementation of what mowad does,
// so a listing here and `wadinfo` there can be held against each other. Files
// in load order, rows merged last-wins, a header always ahead of a row.

type Lump = { file: number; name: string; offset: number; size: number; bytes: Buffer }

const list = (paths: string[]) => {
  const format = readFormat()
  const lumps: Lump[] = []
  const manifests: Map<string, number>[] = []

  paths.forEach((path, file) => {
    const bytes = readFileSync(path)
    const magic = bytes.subarray(0, 4).toString('latin1')
    if (bytes.length < format.headerBytes || (magic !== 'IWAD' && magic !== 'PWAD')) {
      fail(`${path} is not a WAD - it does not start IWAD or PWAD`)
    }

    const count = bytes.readUInt32LE(4)
    const at = bytes.readUInt32LE(8)
    if (at + count * format.entryBytes > bytes.length) fail(`${path}: the directory runs past the end of the file`)

    let types: Lump | null = null
    for (let e = 0; e < count; e++) {
      const entry = at + e * format.entryBytes
      const raw = bytes.subarray(entry + 8, entry + 8 + format.nameBytes).toString('latin1')
      const name = raw.includes('\0') ? raw.slice(0, raw.indexOf('\0')) : raw
      const offset = bytes.readUInt32LE(entry)
      const size = bytes.readUInt32LE(entry + 4)
      const lump = { file, name, offset, size, bytes: bytes.subarray(offset, offset + size) }
      lumps.push(lump)
      if (name === 'TYPES') types = lump
    }

    const rows = new Map<string, number>()
    if (types && types.bytes[0] === format.magic[0] && types.bytes[1] === format.magic[1] &&
        types.bytes[2] === format.types.get('types')) {
      for (let r = format.moBytes; r + format.rowBytes <= types.bytes.length; r += format.rowBytes) {
        const raw = types.bytes.subarray(r, r + format.nameBytes).toString('latin1')
        rows.set(raw.includes('\0') ? raw.slice(0, raw.indexOf('\0')) : raw, types.bytes[r + format.nameBytes])
      }
    }
    manifests.push(rows)
  })

  const typeName = (id: number) => format.names.get(id) ?? 'unknown'

  // The reader's rule, kept in step by hand since this file cannot import the
  // library: `Mo` is only a header when the type byte is one the table knows
  // and not `none` - two bytes are too weak alone, so the type id is part of
  // the magic. A miss here once had the two readers disagreeing over the same
  // lump: mowad read it as foreign while this listed it as `unknown header`.
  const startsMo = (lump: Lump) =>
    lump.bytes.length >= format.moBytes &&
    lump.bytes[0] === format.magic[0] &&
    lump.bytes[1] === format.magic[1]
  const headed = (lump: Lump) => startsMo(lump) && lump.bytes[2] !== 0 && format.names.has(lump.bytes[2])

  // A row in a file that heads a lump of that name is derived, and speaks for no
  // lump - the reader's rule too, so a patch's own lump cannot type the base's
  // foreign one it shadows.
  const headedIn = manifests.map(() => new Set<string>())
  for (const lump of lumps) if (headed(lump)) headedIn[lump.file].add(lump.name)

  lumps.forEach((lump, i) => {
    let type = '-'
    let source = '-'
    let lookalike = false
    if (headed(lump)) {
      type = typeName(lump.bytes[2])
      source = 'header'
    } else {
      lookalike = startsMo(lump)
      for (let f = manifests.length - 1; f >= 0; f--) {
        const row = manifests[f].get(lump.name)
        if (row !== undefined && !headedIn[f].has(lump.name)) {
          type = typeName(row)
          source = 'manifest'
          break
        }
      }
    }
    const shadowed = lumps.findLastIndex((other) => other.name === lump.name) !== i
    console.log(
      `${String(i).padStart(5)} ${lump.file} ${lump.name.padEnd(8)} ${String(lump.offset).padStart(10)} ` +
        `${String(lump.size).padStart(10)} ${type.padEnd(8)} ${source}` +
        `${shadowed ? '  (shadowed)' : ''}${lookalike ? '  (starts Mo, unknown type)' : ''}`,
    )
  })
}

// ---- the sweep ----------------------------------------------------------------
//
// Every .wad under a directory, run one at a time through the committed
// `wadinfo` under `/s` in the machine - so the survey is the Momo reader's own
// verdict, not this file's. One line per WAD, the full output kept beside it,
// and refusals and crashes surfaced rather than averaged away. This is the run
// that found HEXEN.WAD past the residency cap and GTA Doom past the raise
// (DECISIONS §41); it graduated from a throwaway so the next box of old WADs
// gets the same shakedown for one command.
//
// Each WAD is handed to the machine as `SWEPT.WAD`, never by its own name: real
// collections carry names with spaces, which a DOS command tail would split.
const sweep = (root: string) => {
  const wads: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.wad$/i.test(entry.name)) wads.push(path)
    }
  }
  walk(root)
  wads.sort((a, b) => a.localeCompare(b))
  if (wads.length === 0) fail(`no .wad files under "${root}"`)

  const assembly = readFileSync(asmFor('wadinfo'), 'utf8')
  const outDir = join(buildRoot, 'sweep')
  mkdirSync(outDir, { recursive: true })

  const survey: string[] = []
  const notable: string[] = []
  let n = 0

  for (const path of wads) {
    n += 1
    const rel = relative(root, path).replace(/\\/g, '/')
    let line = ''
    try {
      const bytes = readFileSync(path)
      const run = runDos(assembly, { files: new Map([['SWEPT.WAD', bytes]]), args: 'SWEPT.WAD /s' })
      const lines = run.output.replace(/\r\n/g, '\n').split('\n')
      writeFileSync(join(outDir, `${String(n).padStart(3, '0')}-${basename(path)}.txt`), run.output, 'latin1')

      const head = lines[0] ?? ''
      const kind = head.match(/: (\w+), (\d+) lumps/)
      const refused = lines.find((l) => l.includes('not opened') || l.includes('not a WAD'))
      if (refused || !kind) {
        line = `${rel.padEnd(44)} REFUSED: ${(refused ?? head).slice(0, 70)}`
        notable.push(line)
      } else {
        const from = lines.indexOf('findings')
        const to = lines.indexOf('tally')
        const serious = lines
          .slice(from + 1, to < 0 ? undefined : to)
          .filter((l) => l && l !== 'none' && !l.startsWith('none in full'))
        const tally = lines.slice(to + 1).filter((l) => l)
        const sets = (tally.find((l) => l.includes('alias set')) ?? '').match(/(\d+) alias sets? - (\d+) distinct/) ?? []
        const rep = (tally.find((l) => l.includes('repeated')) ?? '').match(/(\d+) repeated/) ?? []
        const gaps = (tally.find((l) => l.includes('gap')) ?? '').match(/(\d+) bytes in (\d+) gap/) ?? []
        line =
          `${rel.padEnd(44)} ${kind[1].padEnd(4)} ${kind[2].padStart(5)} lumps` +
          ` ${String(bytes.length).padStart(9)}b` +
          `  sets:${(sets[1] ?? '0').padStart(4)}  rep:${(rep[1] ?? '0').padStart(4)}` +
          `  gaps:${(gaps[2] ?? '0').padStart(4)}/${(gaps[1] ?? '0').padStart(7)}b` +
          `  serious:${String(serious.length).padStart(3)}`
        for (const s of serious.slice(0, 6)) notable.push(`${rel}: ${s}`)
        if (serious.length > 6) notable.push(`${rel}: ... and ${serious.length - 6} more`)
      }
    } catch (error) {
      line = `${rel.padEnd(44)} CRASHED: ${String(error instanceof Error ? error.message : error).slice(0, 90)}`
      notable.push(line)
    }
    survey.push(line)
    process.stdout.write(`\r${n}/${wads.length} ${rel.slice(0, 50).padEnd(52)}`)
  }

  const report = [
    `corpus sweep: ${wads.length} wads under ${root}`,
    '',
    ...survey,
    '',
    `notable (${notable.length}):`,
    ...notable,
    '',
  ].join('\n')

  const out = join(buildRoot, 'SWEEP.TXT')
  writeFileSync(out, report, 'latin1')
  console.log(`\ndone: ${out}, per-wad outputs in ${outDir}`)
}

const [command, ...rest] = process.argv.slice(2)

if (command === 'build' && rest.length === 2) build(rest[0], rest[1])
else if (command === 'list' && rest.length > 0) list(rest)
else if (command === 'sweep' && rest.length === 1) sweep(rest[0])
else fail('usage: npm run wad -- build <manifest> <out.wad>, list <file.wad> ..., or sweep <directory>')
