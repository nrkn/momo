// Write the built programs to 1.44MB floppy images, for 86Box and real hardware.
//
//   npm run image
//
// An .IMA is a raw sector dump and nothing else - 512 x 18 x 2 x 80 bytes, no
// header, no container - so the whole job is writing a FAT12 filesystem into a
// buffer. That needs no dependency: this is `Buffer` and `writeFileSync`.
//
// Files are laid out FLAT in the root, which works because of a property the
// language already enforces: a DOS-visible name is 8.3, and a project's files
// are named after the project, so `CFTEST.COM` and `CFTEST.ASM` cannot collide
// with anything. `cftest` depends on exactly that - it opens its own listing to
// prove a successful `int 21h` clears carry, and would report the wrong answer
// on a disk that carried only the .COM.
//
// It breaks the day two projects both ship a file NOT named after them - a
// `MAP.DAT` each. That is guarded rather than pre-solved: a duplicate root name
// is a hard error naming both projects, so flat can never silently break, and
// the day it fires is the day this grows a directory per project. The image is a
// build artefact regenerated from scratch, so there is no migration to pay for.

import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { buildRoot, fail, projectDir } from './cli.js'

// The geometry every 1.44MB floppy has, and which the images this replaces
// already used.
const bytesPerSector = 512
const sectorsPerCluster = 1
const reservedSectors = 1
const fatCount = 2
const rootEntries = 224
const totalSectors = 2880
const mediaDescriptor = 0xf0
const sectorsPerFat = 9
const sectorsPerTrack = 18
const heads = 2

const rootSectors = (rootEntries * 32) / bytesPerSector
const dataStart = reservedSectors + fatCount * sectorsPerFat + rootSectors
const totalClusters = totalSectors - dataStart
const imageBytes = totalSectors * bytesPerSector

// Written by the build harness rather than by the project, so they are ours and
// do not belong on the disk. Everything else a project brings is included, which
// is what makes a future `MAP.DAT` work with no change here.
//
// `stdout.txt` and `stderr.txt` are DOSBox's, and they are ours by the same test:
// the harness asks for them by passing `-noconsole`, which redirects rather than
// silences. Every project tier 2 has run carries a pair, so leaving them out of
// this set made the *second* one collide - and the collision reported a
// `MAP.DAT`-shaped problem that was not there. A file the harness causes to
// exist belongs here however far away the thing that writes it is.
const harnessFiles = new Set([
  'build.bat', 'build.ok', 'build.err', 'out.txt', 'stdout.txt', 'stderr.txt',
])

type Entry = { name: string; ext: string; source: string; size: number; mtime: Date }

// `smoke.asm` -> SMOKE / ASM. Returns null for anything DOS could not name,
// which is how `.momo` and `.expected` exclude themselves: a 4- and an
// 8-character extension are not 8.3, so there is no rule to write for them.
const dosName = (file: string): { name: string; ext: string } | null => {
  const match = file.toUpperCase().match(/^([A-Z0-9_-]{1,8})(?:\.([A-Z0-9_-]{1,3}))?$/)
  if (!match) return null
  return { name: match[1], ext: match[2] ?? '' }
}

const collect = (): Map<string, Entry[]> => {
  const byProject = new Map<string, Entry[]>()

  for (const project of readdirSync(buildRoot).sort()) {
    const dir = join(buildRoot, project)
    if (!statSync(dir).isDirectory()) continue

    // Nothing removes a build directory when its project goes, so `build/` keeps
    // the last output of everything ever built here - `rl` was renamed and
    // `probe` deleted, and both were still on the first disk this wrote. A build
    // with no project behind it is exactly the staleness this tool exists to end.
    if (!existsSync(projectDir(project))) continue

    const entries: Entry[] = []
    for (const file of readdirSync(dir).sort()) {
      if (harnessFiles.has(file.toLowerCase())) continue

      const source = join(dir, file)
      const stat = statSync(source)
      if (!stat.isFile()) continue

      const named = dosName(file)
      if (!named) continue

      entries.push({ ...named, source, size: stat.size, mtime: stat.mtime })
    }

    if (entries.length) byProject.set(project, entries)
  }

  return byProject
}

// A project's files stay together: a program and the data it opens have to be on
// one disk. Alphabetical and greedy, with no attempt to pack tightly.
const intoDisks = (byProject: Map<string, Entry[]>): Entry[][] => {
  const disks: Entry[][] = []
  let current: Entry[] = []
  let clusters = 0

  const clustersFor = (entries: Entry[]) =>
    entries.reduce((total, entry) => total + Math.ceil(entry.size / bytesPerSector), 0)

  for (const [project, entries] of byProject) {
    const needed = clustersFor(entries)

    if (needed > totalClusters || entries.length > rootEntries) {
      fail(`"${project}" does not fit on one disk by itself`)
    }

    if (current.length && (clusters + needed > totalClusters ||
        current.length + entries.length > rootEntries)) {
      disks.push(current)
      current = []
      clusters = 0
    }

    current.push(...entries)
    clusters += needed
  }

  if (current.length) disks.push(current)
  return disks
}

// Flat means one namespace, so two projects bringing the same 8.3 name would
// have one quietly overwrite the other. That is the one way this layout can go
// wrong, so it is the one thing checked.
const checkCollisions = (byProject: Map<string, Entry[]>) => {
  const owners = new Map<string, string>()

  for (const [project, entries] of byProject) {
    for (const entry of entries) {
      const full = entry.ext ? `${entry.name}.${entry.ext}` : entry.name
      const previous = owners.get(full)
      if (previous) {
        fail(
          `"${full}" is brought by both "${previous}" and "${project}"\n` +
            '       the flat layout needs every 8.3 name to be unique, which holds while a' +
            " project's files are named after it - this is the point at which the image" +
            ' wants a directory per project',
        )
      }
      owners.set(full, project)
    }
  }
}

// FAT12 packs two entries into three bytes, alternating which nibble each one
// borrows. Every other detail of this format is bytes in a struct; this is the
// part worth reading twice.
const setFatEntry = (fat: Buffer, index: number, value: number) => {
  const at = Math.floor((index * 3) / 2)
  if (index % 2 === 0) {
    fat[at] = value & 0xff
    fat[at + 1] = (fat[at + 1] & 0xf0) | ((value >> 8) & 0x0f)
  } else {
    fat[at] = (fat[at] & 0x0f) | ((value << 4) & 0xf0)
    fat[at + 1] = (value >> 4) & 0xff
  }
}

const dosTime = (when: Date): number =>
  (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1)

const dosDate = (when: Date): number =>
  ((Math.max(1980, when.getFullYear()) - 1980) << 9) |
  ((when.getMonth() + 1) << 5) |
  when.getDate()

const buildImage = async (entries: Entry[], label: string): Promise<Buffer> => {
  const image = Buffer.alloc(imageBytes)

  // ---- boot sector: no boot code, only the BPB DOS reads to mount it ----
  image[0] = 0xeb
  image[1] = 0x3c
  image[2] = 0x90
  image.write('MOMO    ', 3, 8, 'latin1')
  image.writeUInt16LE(bytesPerSector, 11)
  image[13] = sectorsPerCluster
  image.writeUInt16LE(reservedSectors, 14)
  image[16] = fatCount
  image.writeUInt16LE(rootEntries, 17)
  image.writeUInt16LE(totalSectors, 19)
  image[21] = mediaDescriptor
  image.writeUInt16LE(sectorsPerFat, 22)
  image.writeUInt16LE(sectorsPerTrack, 24)
  image.writeUInt16LE(heads, 26)
  image[38] = 0x29 // extended boot signature: serial, label and type follow
  image.writeUInt32LE(0x4d4f4d4f, 39)
  image.write(label.toUpperCase().padEnd(11).slice(0, 11), 43, 11, 'latin1')
  image.write('FAT12   ', 54, 8, 'latin1')
  image.writeUInt16LE(0xaa55, 510)

  const fat = Buffer.alloc(sectorsPerFat * bytesPerSector)
  setFatEntry(fat, 0, 0xf00 | mediaDescriptor)
  setFatEntry(fat, 1, 0xfff)

  const rootDir = Buffer.alloc(rootSectors * bytesPerSector)
  let nextCluster = 2
  let slot = 0

  for (const entry of entries) {
    const data = await readFile(entry.source)
    const needed = Math.ceil(data.length / bytesPerSector)
    const first = needed === 0 ? 0 : nextCluster

    for (let n = 0; n < needed; n++) {
      const cluster = nextCluster + n
      const at = (dataStart + cluster - 2) * bytesPerSector
      data.copy(image, at, n * bytesPerSector, Math.min((n + 1) * bytesPerSector, data.length))
      // The last cluster of a file ends the chain; the rest point at the next.
      setFatEntry(fat, cluster, n === needed - 1 ? 0xfff : cluster + 1)
    }
    nextCluster += needed

    const at = slot * 32
    rootDir.write(entry.name.padEnd(8), at, 8, 'latin1')
    rootDir.write(entry.ext.padEnd(3), at + 8, 3, 'latin1')
    rootDir[at + 11] = 0x20 // archive
    rootDir.writeUInt16LE(dosTime(entry.mtime), at + 22)
    rootDir.writeUInt16LE(dosDate(entry.mtime), at + 24)
    rootDir.writeUInt16LE(first, at + 26)
    rootDir.writeUInt32LE(data.length, at + 28)
    slot += 1
  }

  // Both copies are identical; DOS reads the first and repairs from the second.
  fat.copy(image, reservedSectors * bytesPerSector)
  fat.copy(image, (reservedSectors + sectorsPerFat) * bytesPerSector)
  rootDir.copy(image, (reservedSectors + fatCount * sectorsPerFat) * bytesPerSector)

  return image
}

// ---- reading one back ----
//
// The inverse of everything above, and here rather than in a tool of its own
// because it is the same format knowledge: `fatEntry` is `setFatEntry` read
// backwards, and a second file would have to keep the nibble-packing right
// twice.
//
// It exists because a program that WRITES a file is only useful on an emulator
// you can get the file out of. 86Box has no mounted host directory the way
// DOSBox does, so `keyprobe` writing KEYS.TXT to the floppy is the whole of the
// story unless something here can read it back.
//
// The BPB is read rather than assumed. These are our images, but DOS may have
// written to one since, and a geometry taken from the disk costs three lines
// and makes this work on a floppy image we did not write.
const fatEntry = (fat: Buffer, index: number): number => {
  const at = Math.floor((index * 3) / 2)
  return index % 2 === 0
    ? ((fat[at + 1] & 0x0f) << 8) | fat[at]
    : (fat[at + 1] << 4) | (fat[at] >> 4)
}

const extract = (image: Buffer, wanted: string): Buffer | null => {
  const bytes = image.readUInt16LE(11)
  const perCluster = image[13]
  const reserved = image.readUInt16LE(14)
  const fats = image[16]
  const roots = image.readUInt16LE(17)
  const fatSectors = image.readUInt16LE(22)

  if (bytes === 0 || perCluster === 0 || fatSectors === 0) return null

  const rootStart = reserved + fats * fatSectors
  const rootSectors = Math.ceil((roots * 32) / bytes)
  const dataStart = rootStart + rootSectors

  const fat = image.subarray(reserved * bytes, (reserved + fatSectors) * bytes)
  const root = image.subarray(rootStart * bytes, dataStart * bytes)

  const target = wanted.toUpperCase()

  for (let slot = 0; slot < roots; slot++) {
    const at = slot * 32

    if (root[at] === 0x00) break            // no entry past here has ever been used
    if (root[at] === 0xe5) continue         // deleted
    if ((root[at + 11] & 0x0f) === 0x0f) continue   // long-name fragment
    if (root[at + 11] & 0x08) continue              // volume label

    const name = root.subarray(at, at + 8).toString('latin1').trimEnd()
    const ext = root.subarray(at + 8, at + 11).toString('latin1').trimEnd()
    const full = ext ? `${name}.${ext}` : name

    if (full !== target) continue

    const size = root.readUInt32LE(at + 28)
    const out = Buffer.alloc(size)

    let cluster = root.readUInt16LE(at + 26)
    let written = 0

    // 0FF0h and above ends a chain; anything below 2 is not a data cluster, and
    // a file of zero bytes has no chain at all.
    while (cluster >= 2 && cluster < 0xff0 && written < size) {
      const from = (dataStart + (cluster - 2) * perCluster) * bytes
      written += image.copy(out, written, from, from + Math.min(perCluster * bytes, size - written))
      cluster = fatEntry(fat, cluster)
    }

    if (written < size) fail(`"${full}" ends early - its chain gave ${written} of ${size} bytes`)
    return out
  }

  return null
}

// Every image this tool could have written, in the order it writes them.
const imageNames = (): string[] =>
  readdirSync(buildRoot)
    .filter((file) => /^momo(-\d+)?\.ima$/i.test(file))
    .sort()

// Every image is searched rather than the first hit taken, and two hits are an
// error. A file found on more than one disk is a file whose version nobody can
// state, which is the failure `build/` keeps producing: a stale artefact reads
// exactly like a current one.
const readBack = async (wanted: string) => {
  const images = imageNames()
  if (images.length === 0) fail(`no images in "${buildRoot}" - run: npm run image`)

  const hits: { name: string; data: Buffer }[] = []

  for (const name of images) {
    const found = extract(await readFile(join(buildRoot, name)), wanted)
    if (found) hits.push({ name, data: found })
  }

  if (hits.length === 0) fail(`"${wanted}" is on none of: ${images.join(', ')}`)

  if (hits.length > 1) {
    fail(
      `"${wanted}" is on ${hits.map((hit) => hit.name).join(' and ')}\n` +
        '       which of those is current cannot be told from here - run: npm run image',
    )
  }

  const out = join(buildRoot, wanted.toUpperCase())
  writeFileSync(out, hits[0].data)
  console.log(`ok: ${out}  (${hits[0].data.length} bytes, from ${hits[0].name})`)
}

const main = async () => {
  // The mode is a flag in the script definition rather than one a user passes,
  // because npm drops user flags - which is why `lex:nl` and `momoc:all` exist.
  const args = process.argv.slice(2)
  if (args.includes('--read')) {
    // `?? ''` rather than a check that narrows: `fail` is `never` on the arrow
    // and not on the const, so it does not narrow here - the gotcha
    // `CONTRIBUTING.md` records, and `momoc.ts` already spells it this way.
    const wanted = args.find((arg) => !arg.startsWith('-')) ?? ''
    if (!wanted) fail('usage: npm run image:read -- <FILE.EXT>')
    await readBack(wanted)
    return
  }

  const byProject = collect()
  if (byProject.size === 0) {
    fail(`nothing to write - "${buildRoot}" has no built projects, so run: npm run build -- <project>`)
  }

  checkCollisions(byProject)

  const disks = intoDisks(byProject)

  // How many disks there are moves with the number of projects, so a previous
  // run's images are not overwritten - they are left beside the new ones looking
  // exactly as current. `momo.ima` from a single-disk run sat beside momo-0, -1
  // and -2 for three weeks doing precisely that. Clear the set before writing it.
  for (const stale of imageNames()) rmSync(join(buildRoot, stale))

  for (let n = 0; n < disks.length; n++) {
    const name = disks.length === 1 ? 'momo.ima' : `momo-${n}.ima`
    const label = disks.length === 1 ? 'MOMO' : `MOMO${n}`
    const out = join(buildRoot, name)

    writeFileSync(out, await buildImage(disks[n], label))

    const used = disks[n].reduce((total, e) => total + Math.ceil(e.size / bytesPerSector), 0)
    console.log(
      `ok: ${out}  (${disks[n].length} files, ${used} of ${totalClusters} clusters)`,
    )
  }
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
