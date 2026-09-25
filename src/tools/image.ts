// Write the built programs to 1.44MB floppy images, for 86Box and real hardware.
//
//   npm run image
//
// An .IMA is a raw sector dump and nothing else - 512 x 18 x 2 x 80 bytes, no
// header, no container - so the whole job is writing a FAT12 filesystem into a
// buffer. That needs no dependency: this is `Buffer` and `writeFileSync`.
//
// Each project is a DIRECTORY in the root, named after it, holding its files.
// The first draft laid every file flat in the root, guarded by a hard error on
// a duplicate name, with a note that the day the guard fired was the day this
// grew a directory per project. It fired on 2026-09-25: `wadinfo` and `wadlist`
// both ship a fixture WAD named `BASE.WAD`, because both demonstrate the same
// chain. The image is a build artefact regenerated from scratch, so the change
// paid no migration - the layout moved and nothing else did.
//
// Inside a directory the old flat property holds again and needs no guard: one
// project's files are one directory listing, and a directory cannot list one
// name twice. `cftest` still opens its own listing to prove a successful
// `int 21h` clears carry - run it from its directory, which is where a disk
// this shape puts you anyway.

import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

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

// The files a project carries for the tools rather than for the program: its
// source, what tier 2 expects it to print, and the command tail tier 2 gives it.
// Anything else DOS cannot name is a file the program would open and not find,
// so it is named rather than left off the disk without a word.
const toolFile = /\.(momo|expected|args)$/i

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
      if (!named) {
        if (!toolFile.test(file)) console.log(`warning: ${project}/${file} is not an 8.3 name, so it is not on the disk`)
        continue
      }

      entries.push({ ...named, source, size: stat.size, mtime: stat.mtime })
    }

    if (entries.length) byProject.set(project, entries)
  }

  return byProject
}

// A project lands as a directory; `loose` puts its files in the root instead,
// which is the ferry shape - one `mosplit` chunk per disk, opened as `A:DOOM.001`
// with no directory to name.
type Disk = { project: string; entries: Entry[]; loose?: boolean }[]

// 32 bytes an entry, so a 512-byte cluster holds sixteen - and a directory
// spends its first two on `.` and `..`.
const entriesPerCluster = bytesPerSector / 32

const dirClustersFor = (files: number) => Math.ceil((files + 2) / entriesPerCluster)

// A project's files stay together: a program and the data it opens have to be on
// one disk. Alphabetical and greedy, with no attempt to pack tightly. Each
// project costs one root entry for its directory, the directory's own clusters,
// and its files' clusters.
const intoDisks = (byProject: Map<string, Entry[]>): Disk[] => {
  const disks: Disk[] = []
  let current: Disk = []
  let clusters = 0

  const clustersFor = (entries: Entry[]) =>
    dirClustersFor(entries.length) +
    entries.reduce((total, entry) => total + Math.ceil(entry.size / bytesPerSector), 0)

  for (const [project, entries] of byProject) {
    if (!/^[A-Za-z0-9_-]{1,8}$/.test(project)) {
      fail(`"${project}" is not an 8.3 directory name, and every project is a directory now`)
    }

    const needed = clustersFor(entries)

    if (needed > totalClusters) {
      fail(`"${project}" does not fit on one disk by itself`)
    }

    if (current.length && (clusters + needed > totalClusters ||
        current.length + 1 > rootEntries)) {
      disks.push(current)
      current = []
      clusters = 0
    }

    current.push({ project, entries })
    clusters += needed
  }

  if (current.length) disks.push(current)
  return disks
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

const buildImage = async (disk: Disk, label: string): Promise<Buffer> => {
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
  let rootSlot = 0

  const writeEntry = (
    into: Buffer, slot: number, name: string, ext: string,
    attribute: number, mtime: Date, first: number, size: number,
  ) => {
    const at = slot * 32
    into.write(name.padEnd(8), at, 8, 'latin1')
    into.write(ext.padEnd(3), at + 8, 3, 'latin1')
    into[at + 11] = attribute
    into.writeUInt16LE(dosTime(mtime), at + 22)
    into.writeUInt16LE(dosDate(mtime), at + 24)
    into.writeUInt16LE(first, at + 26)
    into.writeUInt32LE(size, at + 28)
  }

  const writeData = async (entry: Entry): Promise<{ first: number; size: number }> => {
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

    return { first, size: data.length }
  }

  for (const { project, entries, loose } of disk) {
    if (loose) {
      for (const entry of entries) {
        const { first, size } = await writeData(entry)
        writeEntry(rootDir, rootSlot, entry.name, entry.ext, 0x20, entry.mtime, first, size)
        rootSlot += 1
      }
      continue
    }

    // The directory's own clusters come first, so its number exists before any
    // entry - its own dot entry included - needs to name it.
    const dirClusters = dirClustersFor(entries.length)
    const dirFirst = nextCluster
    for (let n = 0; n < dirClusters; n++) {
      setFatEntry(fat, nextCluster + n, n === dirClusters - 1 ? 0xfff : nextCluster + n + 1)
    }
    nextCluster += dirClusters

    const dir = Buffer.alloc(dirClusters * bytesPerSector)
    const stamp = entries.reduce((latest, e) => (e.mtime > latest ? e.mtime : latest), entries[0].mtime)
    writeEntry(dir, 0, '.', '', 0x10, stamp, dirFirst, 0)
    writeEntry(dir, 1, '..', '', 0x10, stamp, 0, 0)

    let slot = 2
    for (const entry of entries) {
      const { first, size } = await writeData(entry)
      writeEntry(dir, slot, entry.name, entry.ext, 0x20, entry.mtime, first, size)
      slot += 1
    }

    dir.copy(image, (dataStart + dirFirst - 2) * bytesPerSector)
    writeEntry(rootDir, rootSlot, project.toUpperCase(), '', 0x10, stamp, dirFirst, 0)
    rootSlot += 1
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

type Hit = { dir: string | null; data: Buffer }

// Every hit on the image, searching the root and one level of directories -
// which is every level this tool writes. `wanted` may carry a directory,
// `WADINFO/BASE.WAD`, and then only that directory answers.
const extract = (image: Buffer, wanted: string): Hit[] => {
  const bytes = image.readUInt16LE(11)
  const perCluster = image[13]
  const reserved = image.readUInt16LE(14)
  const fats = image[16]
  const roots = image.readUInt16LE(17)
  const fatSectors = image.readUInt16LE(22)

  if (bytes === 0 || perCluster === 0 || fatSectors === 0) return []

  const rootStart = reserved + fats * fatSectors
  const rootSectors = Math.ceil((roots * 32) / bytes)
  const dataStart = rootStart + rootSectors

  const fat = image.subarray(reserved * bytes, (reserved + fatSectors) * bytes)
  const root = image.subarray(rootStart * bytes, dataStart * bytes)

  const parts = wanted.toUpperCase().split(/[\\/]/)
  const targetFile = parts.pop() ?? ''
  const targetDir = parts.pop() ?? null

  const chain = (first: number, most: number): Buffer => {
    const out = Buffer.alloc(most)
    let cluster = first
    let written = 0

    // 0FF0h and above ends a chain; anything below 2 is not a data cluster, and
    // a file of zero bytes has no chain at all.
    while (cluster >= 2 && cluster < 0xff0 && written < most) {
      const from = (dataStart + (cluster - 2) * perCluster) * bytes
      written += image.copy(out, written, from, from + Math.min(perCluster * bytes, most - written))
      cluster = fatEntry(fat, cluster)
    }

    return out.subarray(0, written)
  }

  const hits: Hit[] = []

  const scan = (table: Buffer, slots: number, dir: string | null) => {
    for (let slot = 0; slot < slots; slot++) {
      const at = slot * 32

      if (table[at] === 0x00) break            // no entry past here has ever been used
      if (table[at] === 0xe5) continue         // deleted
      if ((table[at + 11] & 0x0f) === 0x0f) continue   // long-name fragment
      if (table[at + 11] & 0x08) continue              // volume label

      const name = table.subarray(at, at + 8).toString('latin1').trimEnd()
      const ext = table.subarray(at + 8, at + 11).toString('latin1').trimEnd()
      const full = ext ? `${name}.${ext}` : name

      if (table[at + 11] & 0x10) {
        // A directory, whose chain is a table of entries with no size field -
        // its length is the chain's. Dot entries point back at what is already
        // being walked.
        if (dir !== null || full === '.' || full === '..') continue
        if (targetDir !== null && full !== targetDir) continue
        const entries = chain(table.readUInt16LE(at + 26), totalClusters * perCluster * bytes)
        scan(entries, Math.floor(entries.length / 32), full)
        continue
      }

      if (full !== targetFile) continue
      if (targetDir !== null && dir !== targetDir) continue

      const size = table.readUInt32LE(at + 28)
      const data = chain(table.readUInt16LE(at + 26), size)
      if (data.length < size) fail(`"${full}" ends early - its chain gave ${data.length} of ${size} bytes`)
      hits.push({ dir, data })
    }
  }

  scan(root, roots, null)
  return hits
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

  const hits: { name: string; dir: string | null; data: Buffer }[] = []

  for (const name of images) {
    for (const hit of extract(await readFile(join(buildRoot, name)), wanted)) {
      hits.push({ name, ...hit })
    }
  }

  if (hits.length === 0) fail(`"${wanted}" is on none of: ${images.join(', ')}`)

  if (hits.length > 1) {
    const places = hits.map((hit) => (hit.dir ? `${hit.name}:${hit.dir}` : hit.name)).join(' and ')
    fail(
      `"${wanted}" is in ${places}\n` +
        '       which of those is meant cannot be told from here - name the directory,' +
        ' as in: npm run image:read -- WADINFO/BASE.WAD',
    )
  }

  const file = wanted.toUpperCase().split(/[\\/]/).pop() ?? ''
  const out = join(buildRoot, file)
  writeFileSync(out, hits[0].data)
  const where = hits[0].dir ? `${hits[0].name}:${hits[0].dir}` : hits[0].name
  console.log(`ok: ${out}  (${hits[0].data.length} bytes, from ${where})`)
}

// One host file per disk, in the root - the ferry for a mosplit set:
//
//   npm run image:files -- DOOM.001 DOOM.002 ...
//
// Each disk is named after its file - `doom-001.ima` - which keeps it clear of
// the `momo-N.ima` pattern, so a project-image run neither counts these as its
// own nor cleans them up.
const fileDisks = async (paths: string[]) => {
  if (paths.length === 0) fail('usage: npm run image:files -- <file> [<file> ...]')

  for (const path of paths) {
    if (!existsSync(path)) fail(`"${path}" does not exist`)
    const named = dosName(basename(path))
    // `continue` narrows where `fail` alone cannot - the arrow-typed `never`
    // gotcha CONTRIBUTING.md records, spelled the loop's way.
    if (!named) {
      fail(`"${basename(path)}" is not an 8.3 name, and DOS has to open it`)
      continue
    }

    const stat = statSync(path)
    if (Math.ceil(stat.size / bytesPerSector) > totalClusters) {
      fail(`"${path}" does not fit a 1.44MB floppy - mosplit it first`)
    }

    const entry: Entry = { ...named, source: path, size: stat.size, mtime: stat.mtime }
    const label = named.ext ? `${named.name}.${named.ext}` : named.name
    const disk: Disk = [{ project: named.name, entries: [entry], loose: true }]
    const out = join(buildRoot, `${named.name}${named.ext ? `-${named.ext}` : ''}.ima`.toLowerCase())

    writeFileSync(out, await buildImage(disk, label))
    console.log(`ok: ${out}  (${label}, ${stat.size} bytes)`)
  }
}

const main = async () => {
  // The mode is a flag in the script definition rather than one a user passes,
  // because npm drops user flags - which is why `lex:nl` and `momoc:all` exist.
  const args = process.argv.slice(2)
  if (args.includes('--files')) {
    await fileDisks(args.filter((arg) => !arg.startsWith('-')))
    return
  }
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

  const disks = intoDisks(byProject)

  // Built before anything is removed. The images are a few hundred kilobytes
  // each and holding them costs nothing next to the failure below.
  const built = []

  for (let n = 0; n < disks.length; n++) {
    const name = disks.length === 1 ? 'momo.ima' : `momo-${n}.ima`
    const label = disks.length === 1 ? 'MOMO' : `MOMO${n}`

    built.push({ name, disk: disks[n], data: await buildImage(disks[n], label) })
  }

  // **Written first, cleaned up after, and nothing is deleted that this run is
  // about to replace.**
  //
  // How many disks there are moves with the number of projects, so a previous
  // run's images have to go or they sit beside the new ones looking exactly as
  // current - `momo.ima` from a single-disk run did that for three weeks. That is
  // why there is a clean-up at all.
  //
  // Doing it *first* made the failure worse than not running: an image mounted in
  // an emulator cannot be unlinked on Windows, so a run that cleared the set and
  // then failed left no usable images. The first attempt at fixing that probed
  // each file with `open(r+)` and passed - **a mounted image is writable and not
  // deletable, which are different questions** - and the delete failed anyway,
  // with one image already gone.
  //
  // So the order is the fix rather than the check. Every file this writes is
  // current; anything it could not write keeps its old contents and is named at
  // the end, which is a tool that has done less than asked rather than damage.
  const failures: string[] = []

  for (const image of built) {
    const out = join(buildRoot, image.name)

    try {
      writeFileSync(out, image.data)
    } catch {
      failures.push(out)
      continue
    }

    const used = image.disk.reduce(
      (total, p) =>
        total + dirClustersFor(p.entries.length) +
        p.entries.reduce((sum, e) => sum + Math.ceil(e.size / bytesPerSector), 0),
      0,
    )
    console.log(
      `ok: ${out}  (${used} of ${totalClusters} clusters)\n    ${image.disk.map((p) => p.project).join(' ')}`,
    )
  }

  // Only what this run did not write, and only after it has written. A stale
  // image that cannot be removed is a warning: the set beside it is correct.
  const written = new Set(built.map((image) => image.name))

  for (const stale of imageNames()) {
    if (written.has(stale)) continue

    try {
      rmSync(join(buildRoot, stale))
    } catch {
      console.log(`warning: could not remove the stale ${stale} - eject it`)
    }
  }

  if (failures.length > 0) {
    fail(
      `could not write, so these still hold what they held before:\n  ${failures.join('\n  ')}\n` +
        'an image mounted in an emulator is locked by it - eject it and run again',
    )
  }}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
