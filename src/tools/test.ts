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

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { compile } from '../momo/compile.js'
import { formatError, isMomoError } from '../momo/diagnostics.js'
import { libRootFor } from '../momo/loader.js'
import { combineRanges, naturalType, rangeOf, truncate } from '../momo/types.js'

const root = process.cwd()
const compileDir = join(root, 'tests', 'compile')

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

typeAssertions()
const fileCount = compileTests()

for (const failure of failures) console.error(`  FAIL  ${failure}`)

const total = passed + failures.length
console.log(
  `\n${passed}/${total} passed  (${fileCount} compile tests, ${total - fileCount} type assertions)`,
)

if (failures.length > 0) process.exit(1)
