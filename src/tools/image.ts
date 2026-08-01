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

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
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
const harnessFiles = new Set(['build.bat', 'build.ok', 'build.err', 'out.txt'])

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

const main = async () => {
  const byProject = collect()
  if (byProject.size === 0) {
    fail(`nothing to write - "${buildRoot}" has no built projects, so run: npm run build -- <project>`)
  }

  checkCollisions(byProject)

  const disks = intoDisks(byProject)

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
