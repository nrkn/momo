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

import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  asmFor,
  compileTestsDir as compileDir,
  designPath,
  entryFor,
  libRoot,
  projectsDir,
} from './cli.js'
import { compile } from '../momo/compile.js'
import { formatError, isMomoError } from '../momo/diagnostics.js'
import { tokenize } from '../momo/lexer.js'
import { load } from '../momo/loader.js'
import { printProgram } from '../momo/printer.js'
import { resolve } from '../momo/resolver.js'
import {
  combineRanges,
  fixedSplitError,
  fixedStorage,
  naturalType,
  rangeOf,
  rescale,
  scaleDecimal,
  spell,
  truncate,
} from '../momo/types.js'

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

  // Fixed-point splits (DESIGN.md §25). Facts about scales rather than design
  // choices, which is the same thing that earns everything above its place.
  check('split i8.8 legal', fixedSplitError(true, 8, 8) === null)
  check('split i12.4 legal', fixedSplitError(true, 12, 4) === null)
  check('split i4.4 legal', fixedSplitError(true, 4, 4) === null)
  check('split u0.16 legal', fixedSplitError(false, 0, 16) === null)
  // Twelve bits matches no storage width, so the four spare bits would be a lie.
  check('split i6.6 rejected', (fixedSplitError(true, 6, 6) ?? '').includes('12 bits'))
  check('split i99.1 rejected', (fixedSplitError(true, 99, 1) ?? '').includes('100 bits'))
  // Two spellings for one type is worse than one.
  check('split i16.0 rejected', (fixedSplitError(true, 16, 0) ?? '').includes('is i16'))

  check('storage i8.8 -> i16', fixedStorage(true, 16) === 'i16')
  check('storage u4.4 -> u8', fixedStorage(false, 8) === 'u8')

  // The spelling is what a reader wrote; the storage type is true and useless.
  check('spell i16/8 -> i8.8', spell('i16', 8) === 'i8.8')
  check('spell i8/4 -> i4.4', spell('i8', 4) === 'i4.4')
  check('spell u16/16 -> u0.16', spell('u16', 16) === 'u0.16')
  check('spell i16/0 -> i16', spell('i16', 0) === 'i16')

  // Scaling up is exact. Scaling down rounds to nearest, ties away from zero -
  // so 1.5 in 8.8 comes back as 2, and 30.0 comes back as 30.
  check('rescale 1 up to 8.8 = 256', rescale(1, 0, 8) === 256)
  check('rescale 1 from 4.4 to 8.8 = 16', rescale(1, 4, 8) === 16)
  check('rescale 30.0 down = 30', rescale(7680, 8, 0) === 30)
  check('rescale 1.5 down = 2 (tie away)', rescale(384, 8, 0) === 2)
  check('rescale -1.5 down = -2 (tie away)', rescale(-384, 8, 0) === -2)
  check('rescale 1.496 down = 1', rescale(383, 8, 0) === 1)
  check('rescale same scale is identity', rescale(384, 8, 8) === 384)

  // A decimal literal at a scale, exactly. 1.5 is exact in 8.8; 0.1 is 25.6 and
  // so rounds, which is why "exact" is a property of the literal.
  check('decimal 1.5 in 8.8 = 384', scaleDecimal(1, '5', 8) === 384)
  check('decimal 0.5 in 8.8 = 128', scaleDecimal(0, '5', 8) === 128)
  check('decimal 0.25 in 8.8 = 64', scaleDecimal(0, '25', 8) === 64)
  check('decimal 20.0 in 8.8 = 5120', scaleDecimal(20, '0', 8) === 5120)
  check('decimal 1.5 in 12.4 = 24', scaleDecimal(1, '5', 4) === 24)
  check('decimal 0.1 in 8.8 = 26', scaleDecimal(0, '1', 8) === 26)
  check('decimal 1.005 in 8.8 = 257', scaleDecimal(1, '005', 8) === 257)
  // The tie, and the one case that shows the rule: 0.5 at no scale is 1, not 0.
  check('decimal 0.5 at frac 0 = 1 (tie away)', scaleDecimal(0, '5', 0) === 1)
}

// ---- lexer decode ----------------------------------------------------------
//
// The compile tests cover every way a decimal or a fixed type name can be
// rejected. None of them cover what the lexer DECODES: a decimal's two halves
// are consumed by nothing until DESIGN.md §25 is built, so a wrong split would
// be invisible for as long as that takes. These are facts about a lexeme rather
// than design choices, which is the same thing that earns the type assertions
// above their place.

const checkLex = (name: string, actual: string, expected: string) =>
  check(name, actual === expected, `expected "${expected}", got "${actual}"`)

const lexShape = (source: string): string =>
  tokenize(source, 'lex.momo')
    .filter((token) => token.kind !== 'eof' && token.kind !== 'newline')
    .map((token) => `${token.kind}(${token.text})`)
    .join(' ')

// The two halves as the lexer split them, or a count when there is not exactly
// one decimal - which is itself the answer for a lexeme that must not become one.
const lexDecimal = (source: string): string => {
  const decimals = tokenize(source, 'lex.momo').filter((token) => token.kind === 'decimal')
  if (decimals.length !== 1) return `${decimals.length} decimals`
  return `${decimals[0].num} + .${decimals[0].frac}`
}

const lexAssertions = () => {
  // Split rather than scaled: 1.5 is 384 in 8.8 and 24 in 12.4, so the scale
  // cannot be applied here - it comes from a target type the lexer cannot see.
  checkLex('lex 1.5', lexDecimal('1.5'), '1 + .5')
  checkLex('lex 0.1', lexDecimal('0.1'), '0 + .1')
  // A trailing zero is a fraction, not the absence of one.
  checkLex('lex 20.0', lexDecimal('20.0'), '20 + .0')
  // Separators strip from both halves, as they do from an integer literal.
  checkLex('lex 1_000.250', lexDecimal('1_000.250'), '1000 + .250')

  // A fixed type name is one token. `i12` and `u0` are not type names, so a
  // lexer that builds one by absorbing a dot after a type token reaches only
  // four of the 48 spellings - and two of those are splits §25 rejects.
  checkLex('lex i8.8', lexShape('i8.8'), 'type(i8.8)')
  checkLex('lex i12.4', lexShape('i12.4'), 'type(i12.4)')
  checkLex('lex u0.16', lexShape('u0.16'), 'type(u0.16)')

  // And what must not have changed. A field name cannot start with a digit,
  // which is the whole reason group access stays clear of a fixed type.
  checkLex(
    'lex mob[0].hp',
    lexShape('mob[0].hp'),
    'ident(mob) op([) number(0) op(]) op(.) ident(hp)',
  )
  checkLex('lex player.x', lexShape('player.x'), 'ident(player) op(.) ident(x)')
  checkLex('lex 123', lexShape('123'), 'number(123)')
  checkLex('lex 0xFF', lexShape('0xFF'), 'number(0xFF)')
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
      compile(file, libRoot, sources)
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
    .filter((name) => existsSync(entryFor(name)))
    .sort()

  for (const project of projects) {
    const goldenPath = asmFor(project)
    const sources = new Map<string, string>()

    if (!existsSync(goldenPath)) {
      check(project, false, `nothing committed at ${project}.asm`)
      continue
    }

    let assembly: string
    try {
      assembly = compile(entryFor(project), libRoot, sources).assembly
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

// ---- desugar round trip ------------------------------------------------------
//
// Print each program back as Momo, compile the printed copy, and require the
// same code out of both. This is the only test of the parser, and it is the one
// shape that does not have the churn problem §14 objects to: it asserts nothing
// about how the AST is arranged, only that printing and parsing are inverse, so
// it survives every refactor that keeps the meaning.
//
// It cannot compare the assembly byte for byte. The emitter quotes the source
// line above the code it produced, and the printed source is by construction
// different text - no comments, different wrapping, sugar lowered. So the
// `; ---- ` lines come out and everything else has to match: every instruction,
// every label, every inline comment about a widening or a jump choice.

const roundTripRoot = mkdtempSync(join(tmpdir(), 'momo-roundtrip-'))

const codeOnly = (assembly: string): string[] =>
  asLines(assembly).filter((line) => !line.startsWith('; ---- '))

const roundTripTests = (): number => {
  const cases: { name: string; file: string }[] = []

  for (const project of readdirSync(projectsDir).sort()) {
    const file = entryFor(project)
    if (existsSync(file)) cases.push({ name: project, file })
  }

  // The ok- files carry syntax no project happens to use - every `far` shape,
  // every `view` shape - so they are where the printer's coverage comes from.
  for (const name of readdirSync(compileDir).sort()) {
    if (name.startsWith('ok-') && name.endsWith('.momo')) {
      cases.push({ name, file: join(compileDir, name) })
    }
  }

  let asserted = 0

  for (const { name, file } of cases) {
    const sources = new Map<string, string>()

    try {
      const program = load(file, libRoot, new Map()).program

      // `local` names a file as its owner, and printing splices every include
      // into one file - so the boundary that gives a private its identity is
      // exactly what the round trip destroys. A private from `rand.momo` comes
      // back owned by the printed file, and two files that each declare
      // `local u16 hidden` collide outright. Not a printer bug: the AST is
      // faithful, and one file cannot express which of several files a name
      // belonged to. Skipped rather than weakened, so the count below says how
      // much is actually asserted.
      if (program.body.some((statement) => 'local' in statement && statement.local)) {
        continue
      }

      const original = compile(file, libRoot, sources).assembly
      // Resolved first: `*` on two fixed-point values lowers to a call, and that
      // needs types, so it is invisible to a printer fed a freshly parsed AST.
      // Everything else the resolver does is annotation, so this changed no
      // existing case when it was introduced.
      resolve(program)
      const printed = printProgram(program)

      // Written out rather than compiled from memory, so the round trip goes
      // through the same lexer and loader entry point everything else does.
      const copy = join(roundTripRoot, `${name.replace(/\.momo$/, '')}.momo`)
      writeFileSync(copy, printed, 'utf8')

      const again = compile(copy, libRoot, new Map()).assembly
      asserted += 1

      const difference = firstDifference(
        codeOnly(again).join('\n'),
        codeOnly(original).join('\n'),
      )
      check(`round trip ${name}`, difference === null, difference ?? '')

      // The round trip compares assembly, and `x * y` compiles to the same code
      // as the call it lowers to - so it cannot tell whether the printer showed
      // the lowering or the multiply. One project asserts the text directly,
      // because "the printed form IS the hand-written Momo" is the claim DESIGN.md
      // §25 rests on and nothing else here checks it.
      if (name === 'fixmul') {
        asserted += 1
        check(
          'round trip fixmul shows the lowering',
          printed.includes('raw i8.8( fixMul( raw i16(') &&
            printed.includes('raw u8.8( fixMulU( raw u16('),
          'the printer wrote the multiply rather than the call it lowers to',
        )
      }
    } catch (error) {
      if (!isMomoError(error)) throw error
      check(`round trip ${name}`, false, formatError(sources, error))
    }
  }

  return asserted
}

// ---- instruction subset ------------------------------------------------------
//
// DESIGN §1's table is the only record of the 8086 subset, and `cpu 8086` does
// not enforce it: NASM rejects a 186+ instruction but says nothing about an 8086
// one the table omits. `pushf` arrived and the count read 36 for a while, and
// CONTRIBUTING has asked ever since for a check that was manual - which was got
// wrong three times running, once by hand-typing the list (`xchg` and `imul` in,
// `cwd` out) and twice by a slice that swallowed the prose around the table.
//
// So it is asserted against DESIGN.md itself rather than against a copy here.

// Directives share the instruction column, because the emitter writes `cpu`,
// `org` and `align` through the same helper that writes instructions. Named
// rather than guessed at, so a real mnemonic can never be mistaken for one.
const asmDirectives = new Set(['cpu', 'org', 'align', 'db', 'dw', 'times', 'equ'])

// Documented directly beneath the table as a second spelling of `je`/`jne`
// rather than as additions, which is why they are legal output and deliberately
// not counted. A third spelling appearing should fail here and be a decision.
const alternateSpellings = new Set(['jz', 'jnz'])

const subsetTests = (): number => {
  const design = readFileSync(designPath, 'utf8')
  const before = failures.length + passed

  const heading = design.match(/### Instruction subset[^\n]*?(\d+) mnemonics/)
  if (!heading) {
    check('§1 heading is readable', false, 'no "### Instruction subset - N mnemonics" heading')
    return failures.length + passed - before
  }

  // Table ROWS only. The prose on either side is full of backticked words, and
  // taking the whole section reads `cmptest` as a mnemonic.
  const table = design.slice(design.indexOf(heading[0]), design.indexOf('Deliberately absent'))
  const documented = new Set(
    table
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| Group') )
      .flatMap((line) => [...line.matchAll(/`([a-z]+)`/g)].map((m) => m[1])),
  )

  check(
    `§1 lists ${heading[1]} mnemonics`,
    documented.size === Number(heading[1]),
    `the heading says ${heading[1]}, the table holds ${documented.size}` +
      ' - a new mnemonic means editing both',
  )

  // Every committed .asm, including the hand-written ones: STYLE holds those to
  // the same subset, and they are part of what ships. The golden tier has just
  // checked that the generated ones match what the compiler emits today.
  const emitted = new Map<string, string>()
  for (const project of readdirSync(projectsDir)) {
    const file = asmFor(project)
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^ {8}([a-z]+)/)
      if (!match || asmDirectives.has(match[1])) continue
      if (!emitted.has(match[1])) emitted.set(match[1], project)
    }
  }

  const undocumented = [...emitted.keys()].filter(
    (mnemonic) => !documented.has(mnemonic) && !alternateSpellings.has(mnemonic),
  )
  check(
    'nothing outside §1 is emitted',
    undocumented.length === 0,
    undocumented.map((m) => `"${m}" (in ${emitted.get(m)}.asm) is not in §1's table`).join('\n    '),
  )

  // A coverage claim, and the one that found `jle`, `jg` and `jz` had no program
  // behind them at all. A mnemonic the emitter can produce but nothing exercises
  // is a codegen path no test has ever run.
  const unused = [...documented].filter((mnemonic) => !emitted.has(mnemonic))
  check(
    'every mnemonic in §1 is emitted by some program',
    unused.length === 0,
    `${unused.join(', ')} - listed in §1 and emitted by no committed program,` +
      ' so nothing exercises that path',
  )

  return failures.length + passed - before
}

typeAssertions()
const typeCount = passed + failures.length
lexAssertions()
const lexCount = passed + failures.length - typeCount
const compileCount = compileTests()
const goldenCount = goldenTests()
const roundTripCount = roundTripTests()
const subsetCount = subsetTests()

for (const failure of failures) console.error(`  FAIL  ${failure}`)

const total = passed + failures.length
console.log(
  `\n${passed}/${total} passed` +
    `  (${compileCount} compile tests, ${goldenCount} golden, ${typeCount} type` +
    `, ${lexCount} lex, ${roundTripCount} round trip, ${subsetCount} subset)`,
)

if (failures.some((failure) => failure.includes('first difference'))) {
  console.error('\n  a deliberate codegen change is adopted with: npm run momoc:all')
}

if (failures.length > 0) process.exit(1)
