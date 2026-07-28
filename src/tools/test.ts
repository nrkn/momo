// Tier 1: compile every file in tests/compile/ and check the outcome.
//
//   npm test
//
// No DOSBox, so the whole suite runs in about a second. A test either compiles
// clean, or declares the error it expects in its own first lines:
//
//   // EXPECT-ERROR: recursion is not supported
//
// Keeping the expectation inside the file means test and assertion cannot drift
// apart, and there is no manifest to forget to update.
//
// Also runs the type-lattice assertions, which are the one place unit tests earn
// their keep: `combineRanges` and `truncate` encode facts about 16-bit integers,
// not design choices we might revisit.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { compile } from '../momo/compile.js'
import { formatError, isMomoError } from '../momo/diagnostics.js'
import { libRootFor } from '../momo/loader.js'
import { combineRanges, naturalType, rangeOf, truncate } from '../momo/types.js'

const root = process.cwd()
const compileDir = join(root, 'tests', 'compile')
const projectsDir = join(root, 'data', 'projects')

let passed = 0
const failures: string[] = []

const check = (name: string, ok: boolean, detail = '') => {
  if (ok) {
    passed += 1
    return
  }
  failures.push(detail ? `${name}\n    ${detail}` : name)
}

// ---- type lattice ----------------------------------------------------------

const combine = (a: Parameters<typeof rangeOf>[0], b: Parameters<typeof rangeOf>[0]) =>
  combineRanges(rangeOf(a), rangeOf(b))

const typeAssertions = () => {
  // The mixing matrix from DESIGN.md, including both error cells.
  check('u8  op u8  -> u16', combine('u8', 'u8') === 'u16')
  check('u8  op i8  -> i16', combine('u8', 'i8') === 'i16')
  check('u8  op u16 -> u16', combine('u8', 'u16') === 'u16')
  check('u8  op i16 -> i16', combine('u8', 'i16') === 'i16')
  check('i8  op i8  -> i16', combine('i8', 'i8') === 'i16')
  check('i8  op i16 -> i16', combine('i8', 'i16') === 'i16')
  check('i16 op i16 -> i16', combine('i16', 'i16') === 'i16')
  check('u16 op u16 -> u16', combine('u16', 'u16') === 'u16')
  check('i8  op u16 -> error', combine('i8', 'u16') === null)
  check('i16 op u16 -> error', combine('i16', 'u16') === null)
  check('bool op u8 -> u16', combine('bool', 'u8') === 'u16')

  // Truncation is two's complement, and bool normalises rather than masking.
  check('truncate 300 -> u8 = 44', truncate(300, 'u8') === 44)
  check('truncate 200 -> i8 = -56', truncate(200, 'i8') === -56)
  check('truncate -1 -> u16 = 65535', truncate(-1, 'u16') === 65535)
  check('truncate -1 -> i16 = -1', truncate(-1, 'i16') === -1)
  check('truncate 65535 -> i16 = -1', truncate(65535, 'i16') === -1)
  check('truncate 256 -> bool = 1', truncate(256, 'bool') === 1)
  check('truncate 0 -> bool = 0', truncate(0, 'bool') === 0)

  // Smallest type that fits, signed if negative.
  check('natural 0 -> u8', naturalType(0) === 'u8')
  check('natural 255 -> u8', naturalType(255) === 'u8')
  check('natural 256 -> u16', naturalType(256) === 'u16')
  check('natural -1 -> i8', naturalType(-1) === 'i8')
  check('natural -129 -> i16', naturalType(-129) === 'i16')
  check('natural 65536 -> none', naturalType(65536) === null)
  check('natural -32769 -> none', naturalType(-32769) === null)
}

// ---- compile tests ---------------------------------------------------------

const expectedError = (source: string): string | null => {
  for (const line of source.split('\n')) {
    const match = line.match(/^\s*\/\/\s*EXPECT-ERROR:\s*(.+?)\s*$/)
    if (match) return match[1]
  }
  return null
}

const compileTests = () => {
  const files = readdirSync(compileDir)
    .filter((name) => name.endsWith('.momo'))
    .sort()

  for (const name of files) {
    const file = join(compileDir, name)
    const expect = expectedError(readFileSync(file, 'utf8'))
    const sources = new Map<string, string>()

    let error: unknown = null
    try {
      compile(file, libRootFor(root), sources)
    } catch (caught) {
      error = caught
    }

    if (!expect) {
      check(name, error === null, error instanceof Error ? error.message : String(error))
      continue
    }

    if (error === null) {
      check(name, false, `expected an error containing "${expect}", but it compiled`)
      continue
    }

    if (!isMomoError(error)) throw error

    const formatted = formatError(sources, error)
    check(
      name,
      error.message.includes(expect),
      `expected "${expect}"\n    got      "${error.message}"\n${formatted}`,
    )
  }

  return files.length
}

// ---- golden output ---------------------------------------------------------
//
// Compile every project and compare against the .asm committed beside it.
//
// The compile tests above only ask WHETHER a program compiles, never what it
// emits, and tier 2 needs DOSBox - so between them there was nothing watching
// codegen at all. CONTRIBUTING.md has said "smoke output must stay byte-identical"
// since long before this existed, but that was enforced by remembering to read
// `git status`, which is not a test.
//
// Nothing is written here. An intentional change is adopted by regenerating
// with `npm run momoc:all` and committing the diff, which is the point: every
// codegen change has to be looked at.

// Normalised because the emitter writes CRLF while git stores LF. Without this
// a fresh clone on a platform that checks out LF fails every case for a reason
// that has nothing to do with codegen.
const asLines = (text: string): string[] => text.replace(/\r\n/g, '\n').split('\n')

// The whole file is far too much to print - smoke alone is nearly 700 lines - so
// report the first line that differs, with a little context.
const firstDifference = (actual: string, expected: string): string | null => {
  const generated = asLines(actual)
  const committed = asLines(expected)

  let at = 0
  while (at < generated.length && at < committed.length && generated[at] === committed[at]) {
    at += 1
  }

  if (at === generated.length && at === committed.length) return null

  const shown: string[] = [`first difference at line ${at + 1}:`]
  for (let n = Math.max(0, at - 2); n < at; n++) shown.push(`      ${committed[n]}`)
  shown.push(`    - ${committed[at] ?? '(end of file)'}`)
  shown.push(`    + ${generated[at] ?? '(end of file)'}`)
  shown.push(`    ${committed.length} lines committed, ${generated.length} generated`)

  return shown.join('\n')
}

const goldenTests = (): number => {
  // Projects with no .momo are hand-written assembly, and have nothing to
  // compare against.
  const projects = readdirSync(projectsDir)
    .filter((name) => existsSync(join(projectsDir, name, `${name}.momo`)))
    .sort()

  for (const project of projects) {
    const goldenPath = join(projectsDir, project, `${project}.asm`)
    const sources = new Map<string, string>()

    if (!existsSync(goldenPath)) {
      check(project, false, `nothing committed at ${project}.asm`)
      continue
    }

    let assembly: string
    try {
      assembly = compile(join(projectsDir, project, `${project}.momo`), libRootFor(root), sources)
        .assembly
    } catch (error) {
      if (!isMomoError(error)) throw error
      check(project, false, formatError(sources, error))
      continue
    }

    const difference = firstDifference(assembly, readFileSync(goldenPath, 'utf8'))
    check(project, difference === null, difference ?? '')
  }

  return projects.length
}

typeAssertions()
const typeCount = passed + failures.length
const compileCount = compileTests()
const goldenCount = goldenTests()

for (const failure of failures) console.error(`  FAIL  ${failure}`)

const total = passed + failures.length
console.log(
  `\n${passed}/${total} passed` +
    `  (${compileCount} compile tests, ${goldenCount} golden, ${typeCount} type assertions)`,
)

if (failures.some((failure) => failure.includes('first difference'))) {
  console.error('\n  a deliberate codegen change is adopted with: npm run momoc:all')
}

if (failures.length > 0) process.exit(1)
