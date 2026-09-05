// Drift between the documents and what is actually here.
//
//   npm run drift                mechanical checks; exits 1 on any finding
//   npm run drift:since -- <ref> gathers the passages a range of commits may
//                                have invalidated, for a person to read
//
// Two scripts rather than one with a flag: npm drops a user `--flag`, so the
// flag lives in the script definition, as it does for `lex:nl` and `momoc:all`.
//
// Mode A is everything a script can decide: whether a §N cross-reference agrees
// with that section's status line in DESIGN.md, whether a backticked path or an
// `npm run` script exists, whether the committed grammar is what tokens.ts
// generates today, whether CONTRIBUTING.md's counts match the harness, and
// whether an uncommitted edit has taken a heading out of a document.
//
// Mode B decides nothing at all. It collects the terms a diff touched and prints
// every passage that mentions one. Judging them is the reader's job.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, sep } from 'node:path'

import { designPath, fail, root } from './cli.js'
import { keywords } from '../momo/tokens.js'

const docsDir = join(root, 'docs')
const editorGrammar = join(root, 'editor', 'vscode', 'syntaxes', 'momo.tmLanguage.json')
const contributingPath = join(docsDir, 'CONTRIBUTING.md')

// Directories with nothing a document should be cross-referenced against:
// generated output, dependencies, scratch space, and the reference material.
const skipDirs = new Set(['node_modules', 'dist', 'build', 'temp', '.git', '_reference'])

type Finding = { file: string; line: number; message: string }

const findings: Finding[] = []

const report = (file: string, line: number, message: string) => {
  const finding = { file: show(file), line, message }
  const already = findings.some(
    (seen) => seen.file === finding.file && seen.line === line && seen.message === message,
  )
  if (!already) findings.push(finding)
}

const show = (file: string): string => relative(root, file).split(sep).join('/')

// The emitter and the docs disagree about line endings, and nothing here cares
// about the difference - normalise once on the way in.
const readText = (file: string): string => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

const lineStartsOf = (text: string): number[] => {
  const starts = [0]
  for (let at = 0; at < text.length; at++) {
    if (text[at] === '\n') starts.push(at + 1)
  }
  return starts
}

const lineOf = (starts: number[], index: number): number => {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid] <= index) low = mid
    else high = mid - 1
  }
  return low + 1
}

// A sentence ends at terminal punctuation followed by space, or at a blank line.
// A single newline is not a boundary: the documents wrap at 80 columns, so most
// sentences here span two or three lines and a per-line scan would miss them.
type Passage = { text: string; index: number }

const passagesOf = (text: string): Passage[] => {
  const out: Passage[] = []
  let last = 0
  for (const match of text.matchAll(/(?<=[.!?])\s+|\n{2,}/g)) {
    const at = match.index ?? 0
    out.push({ text: text.slice(last, at), index: last })
    last = at + match[0].length
  }
  out.push({ text: text.slice(last), index: last })
  return out.filter((passage) => passage.text.trim().length > 0)
}

const oneLine = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 200 ? `${flat.slice(0, 197)}...` : flat
}

// ---- the file corpus ---------------------------------------------------------

const walk = (dir: string, keep: (file: string) => boolean, into: string[]) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, keep, into)
    else if (keep(path)) into.push(path)
  }
  return into
}

const docFiles = (): string[] =>
  readdirSync(docsDir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => join(docsDir, name))

const rootDoc = (name: string): string[] => {
  const path = join(root, name)
  return existsSync(path) ? [path] : []
}

const sourceFiles = (): string[] => walk(join(root, 'src'), (f) => f.endsWith('.ts'), [])

const momoFiles = (): string[] =>
  walk(join(root, 'projects'), (f) => f.endsWith('.momo'), [])

// ---- (a) status cross-references ---------------------------------------------
//
// DESIGN.md states a section's status as the first bold run under its heading:
// `**Built.**` or `**Designed, not built - the section is in PLAN.md.**`. The
// table near the end lists the sections that carry a number and no text at all.
// Anything that cites §N alongside a status claim has to agree with that.

type Status = 'built' | 'unbuilt'

const designStatuses = (): Map<number, Status> => {
  const design = readText(designPath)
  const statuses = new Map<number, Status>()

  const headings = [...design.matchAll(/^## (\d+)\. /gm)]
  for (let at = 0; at < headings.length; at++) {
    const heading = headings[at]
    const from = heading.index ?? 0
    const to = at + 1 < headings.length ? headings[at + 1].index ?? design.length : design.length
    const body = design.slice(from, to)
    const status = body.match(/^\*\*(Built|Designed)/m)
    if (!status) continue
    statuses.set(Number(heading[1]), status[1] === 'Built' ? 'built' : 'unbuilt')
  }

  // The table of sections that are designed and have no text here. Rows only:
  // the prose above it says "designed, but not built" and is not a row.
  const table = design.slice(design.indexOf('## Sections designed, but not built'))
  for (const row of table.matchAll(/^\| §(\d+) \|/gm)) {
    statuses.set(Number(row[1]), 'unbuilt')
  }

  return statuses
}

// "designed" on its own is not a status claim - `view` was designed and is built
// - so it only makes a passage worth looking at, and never a finding on its own.
const statusClaims: [RegExp, Status][] = [
  [/\bnot (?:yet )?(?:been )?built\b|\bunbuilt\b|in `?PLAN\.md`?/gi, 'unbuilt'],
  // "had not been built yet" is the unbuilt claim above, so the negation has to
  // be excluded here rather than left to whichever pattern is tried first.
  [/(?<!\bnot )(?<!\bnever )\b(?:is|was|are|were|now|been) built\b/gi, 'built'],
]

// A §N in the same sentence as a status phrase is not necessarily its subject:
// "not built - §34 - and DECISIONS §16 has the measurements" says nothing about
// §16. So the text between the two has to be connective and nothing else, which
// is what "same clause" amounts to without a parser.
const connective =
  /^[\s\-,()`.:;*"]*(?:(?:is|was|are|were|it|and|but|still|now|the|a|an|section|remains|yet|only|both|which|that|this|to|of|be|been|not|does|designed|built)[\s\-,()`.:;*"]*)*$/i

const checkStatusReferences = (statuses: Map<number, Status>) => {
  for (const file of [...docFiles(), ...sourceFiles(), ...momoFiles()]) {
    const text = readText(file)
    if (!text.includes('§')) continue
    const starts = lineStartsOf(text)

    for (const passage of passagesOf(text)) {
      for (const [phrase, claimed] of statusClaims) {
        for (const said of passage.text.matchAll(phrase)) {
          const from = said.index ?? 0
          const to = from + said[0].length

          for (const cited of passage.text.matchAll(/§(\d+)/g)) {
            const at = cited.index ?? 0
            const between =
              at > to ? passage.text.slice(to, at) : at + cited[0].length <= from
                ? passage.text.slice(at + cited[0].length, from)
                : ''
            if (!connective.test(between)) continue

            const section = Number(cited[1])
            const actual = statuses.get(section)
            if (!actual || actual === claimed) continue
            report(
              file,
              lineOf(starts, passage.index + at),
              `§${section} is ${actual} in DESIGN.md, and this reads as ${claimed}: ${oneLine(passage.text)}`,
            )
          }
        }
      }
    }
  }
}

// ---- (b) quoted paths and scripts --------------------------------------------

const pathExtension = /\.(ts|md|momo|json|asm)$/

// Every file and directory a document could name, by full relative path and by
// bare name. Documents cite `resolver.ts` and `momovec/direct.momo` without a
// root, deliberately - STYLE.md says a project is named rather than pathed - so
// a suffix of a real path counts as resolved.
const repoPaths = (): { paths: Set<string>; names: Set<string> } => {
  const paths = new Set<string>()
  const names = new Set<string>()

  // Generated directories are indexed but not walked: `build/` and `dist/` are
  // named by the documents and exist, and nothing inside either is cited.
  const descend = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      paths.add(show(path))
      names.add(entry.name)
      if (entry.isDirectory() && !skipDirs.has(entry.name)) descend(path)
    }
  }

  descend(root)
  return { paths, names }
}

const scriptNames = (): Set<string> => {
  const json = JSON.parse(readText(join(root, 'package.json'))) as { scripts: Record<string, string> }
  return new Set(Object.keys(json.scripts))
}

// A token is only checked when it is unambiguously a path: it starts with a
// name character, and it either carries a known extension or ends in a slash.
// That drops two noisy classes - a bare extension like `.asm`, and an
// extensionless directory name like `momo/z80`, which is a target that does not
// exist yet rather than a path.
const looksLikePath = (token: string): boolean => {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(token)) return false
  return pathExtension.test(token) || token.endsWith('/')
}

// PLAN.md is the document for things that do not exist, so a file it names may
// legitimately be absent - `block.momo` and `shared/lib/mobids.momo` are both
// designs. Dropping the file is cheaper than carrying exceptions for its prose.
const pathCheckedDocs = (): string[] => [
  ...docFiles().filter((file) => basename(file) !== 'PLAN.md'),
  ...rootDoc('CLAUDE.md'),
  ...rootDoc('README.md'),
]

const checkQuotedPaths = () => {
  const { paths, names } = repoPaths()
  const scripts = scriptNames()

  const resolves = (token: string): boolean => {
    const clean = token.replace(/\/+$/, '')
    if (paths.has(clean)) return true
    if (!clean.includes('/')) return names.has(clean)
    for (const path of paths) {
      if (path.endsWith(`/${clean}`)) return true
    }
    return false
  }

  for (const file of pathCheckedDocs()) {
    const text = readText(file)
    const starts = lineStartsOf(text)

    for (const quoted of text.matchAll(/`([^`\n]+)`/g)) {
      const token = quoted[1].trim()
      const line = lineOf(starts, quoted.index ?? 0)

      if (token.startsWith('npm ')) {
        const words = token.split(/\s+/)
        const script = words[1] === 'run' ? words[2] : words[1]
        if (script && !scripts.has(script)) {
          report(file, line, `\`${token}\` names no script in package.json`)
        }
        continue
      }

      if (token.includes('*') || token.includes('://')) continue
      if (!looksLikePath(token)) continue
      if (!resolves(token)) report(file, line, `\`${token}\` does not exist`)
    }
  }
}

// ---- (c) grammar freshness ---------------------------------------------------
//
// `grammar.ts` writes under `process.cwd()`, so generating into a temporary
// directory is a matter of running it from one. Nothing in the repository is
// touched, which is the point: an overwrite would destroy the evidence.

const checkGrammar = () => {
  const generator = join(root, 'dist', 'tools', 'grammar.js')
  if (!existsSync(generator)) fail(`no ${show(generator)} - run npm run compile first`)

  const scratch = mkdtempSync(join(tmpdir(), 'momo-drift-grammar-'))
  execFileSync(process.execPath, [generator], { cwd: scratch, stdio: 'pipe' })

  const fresh = readText(join(scratch, 'editor', 'vscode', 'syntaxes', 'momo.tmLanguage.json'))
  if (!existsSync(editorGrammar)) {
    report(editorGrammar, 1, 'no committed grammar - run npm run grammar')
    return
  }

  const committed = readText(editorGrammar)
  if (fresh === committed) return

  const a = fresh.split('\n')
  const b = committed.split('\n')
  let at = 0
  while (at < a.length && at < b.length && a[at] === b[at]) at += 1
  report(
    editorGrammar,
    at + 1,
    `stale - tokens.ts or resolver.ts has moved since; run npm run grammar` +
      ` (committed "${(b[at] ?? '').trim()}", generated "${(a[at] ?? '').trim()}")`,
  )
}

// ---- (d) present-tense counts ------------------------------------------------
//
// STYLE.md's rule is that a present-tense count about the repository is a bug
// unless a test reads it. These are the ones CONTRIBUTING.md still carries, so
// they are read here rather than by a person.

const words: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
}

const harnessTally = (): number[] => {
  const suite = join(root, 'dist', 'tools', 'test.js')
  if (!existsSync(suite)) fail(`no ${show(suite)} - run npm run compile first`)

  let output = ''
  try {
    output = execFileSync(process.execPath, [suite], { cwd: root, encoding: 'utf8' })
  } catch (error) {
    // A red suite still prints its tally, and the counts are what is wanted here.
    output = String((error as { stdout?: string }).stdout ?? '')
  }

  const tally = output.match(
    /(\d+)\/(\d+) passed\s+\((\d+) compile tests, (\d+) golden, (\d+) type, (\d+) lex, (\d+) round trip, (\d+) identity, (\d+) subset\)/,
  )
  // `fail` returns never, and never-narrowing needs the annotation on the const
  // rather than on the arrow - so it is returned rather than called.
  if (!tally) return fail('the tier 1 harness did not print a tally this run')
  return tally.slice(2).map(Number)
}

const checkCounts = () => {
  const text = readText(contributingPath)
  const starts = lineStartsOf(text)
  const [total, , , , , , , subset] = harnessTally()

  // The sentence wraps at 80 columns, so every gap here is `\s+` rather than a
  // space - a literal one matches the file only until somebody rewraps it. The
  // breakdown behind the total is not restated in prose: `npm test` prints it.
  const stated = text.match(/(\d+)\s+tier-1\s+assertions,\s+(\d+)\s+e2e\s+programs/)
  if (stated) {
    const line = lineOf(starts, stated.index ?? 0)
    const pairs: [string, number, number][] = [
      ['tier-1 total', Number(stated[1]), total],
      ['e2e programs', Number(stated[2]), expectedCount()],
    ]
    for (const [name, said, actual] of pairs) {
      if (said !== actual) report(contributingPath, line, `${name}: prose says ${said}, actual ${actual}`)
    }
  }

  const readers = text.match(/([A-Za-z]+) tier-1 assertions read `DESIGN\.md`/)
  if (readers) {
    const said = words[readers[1].toLowerCase()] ?? Number(readers[1])
    if (said !== subset) {
      report(
        contributingPath,
        lineOf(starts, readers.index ?? 0),
        `assertions reading DESIGN.md: prose says ${said}, the subset tier runs ${subset}`,
      )
    }
  }
}

// Tier 2 runs a program per committed expectation, so the files are the count.
const expectedCount = (): number =>
  walk(join(root, 'projects'), (f) => f.endsWith('.expected'), []).length

// How many scenes the layout gallery defines. Three documents said "six" and
// stayed saying it while a seventh was added, which is the failure the rule
// about present-tense counts exists to stop - so it is read here rather than
// remembered. The builders are the count because a scene is exactly a `build`
// sub that the harness runs.
const scenePath = join(root, 'shared', 'scenes', 'shell.momo')

const sceneCount = (): number => {
  const found = readText(scenePath).match(/^sub build[A-Z]/gm) ?? []
  // The structure this assumes is worth checking rather than matching: a zero
  // here means the naming convention moved, and silently agreeing with whatever
  // the prose says is the one outcome that helps nobody.
  if (found.length === 0) return fail(`no scene builders in ${show(scenePath)} - has the naming changed?`)
  return found.length
}

const checkScenes = () => {
  const actual = sceneCount()

  // Two shapes: the documents say "runs six scenes", the scene file's own header
  // opens with the count as a sentence.
  const claims: [string, RegExp][] = [
    [contributingPath, /runs (\w+) scenes/],
    [designPath, /runs (\w+) scenes/],
    [scenePath, /^\/\/ (\w+) scenes,/m],
  ]

  for (const [file, pattern] of claims) {
    const text = readText(file)
    const said = text.match(pattern)
    if (!said) continue

    const n = words[said[1].toLowerCase()] ?? Number(said[1])
    if (n !== actual) {
      report(
        file,
        lineOf(lineStartsOf(text), said.index ?? 0),
        `layout scenes: prose says ${said[1]}, shell.momo defines ${actual}`,
      )
    }
  }
}

// ---- (e) headings removed in the working tree --------------------------------
//
// A section move is a large deletion, and an anchor that ends too late looks
// exactly like the move working. This is silent when nothing is uncommitted.

const headingsOf = (text: string): { text: string; line: number }[] => {
  const out: { text: string; line: number }[] = []
  const lines = text.split('\n')
  for (let at = 0; at < lines.length; at++) {
    if (/^#{1,6} /.test(lines[at])) out.push({ text: lines[at].trim(), line: at + 1 })
  }
  return out
}

const checkHeadings = () => {
  for (const file of docFiles()) {
    const name = show(file)
    let committed = ''
    try {
      committed = execFileSync('git', ['show', `HEAD:${name}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch {
      continue // Not in HEAD at all, so nothing has been removed from it.
    }

    const working = new Set(headingsOf(readText(file)).map((heading) => heading.text))
    for (const heading of headingsOf(committed.replace(/\r\n/g, '\n'))) {
      if (working.has(heading.text)) continue
      report(file, heading.line, `heading gone from the working tree (line is HEAD's): ${heading.text}`)
    }
  }
}

// ---- mode B: gather the passages a diff may have invalidated ------------------

const gitLines = (args: string[]): string[] =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .replace(/\r\n/g, '\n')
    .split('\n')

// A backticked `for` in a changed comment is not a term a reader can act on -
// every document mentions it, and none of those mentions is about the change.
// The language's own keyword table is the list, so it cannot drift from one.
const tooCommon = new Set([...keywords, 'true', 'false', 'const', 'type', 'export'])

const gatherTerms = (since: string): Map<string, string> => {
  const terms = new Map<string, string>()
  const add = (term: string, why: string) => {
    if (tooCommon.has(term)) return
    if (!terms.has(term)) terms.set(term, why)
  }

  const diff = gitLines(['diff', '--unified=0', `${since}..HEAD`])
  const messages = gitLines(['log', '--format=%B', `${since}..HEAD`])

  for (const cited of messages.join('\n').matchAll(/§(\d+)/g)) {
    add(`§${cited[1]}`, 'cited in a commit message')
  }

  for (const line of diff) {
    if (line.startsWith('---') || line.startsWith('+++')) continue
    if (!line.startsWith('+') && !line.startsWith('-')) continue

    for (const cited of line.matchAll(/§(\d+)/g)) add(`§${cited[1]}`, 'cited in the diff')

    const body = line.slice(1)

    for (const exported of body.matchAll(/^\s*export (?:const|type|function|async) (\w+)/g)) {
      add(exported[1], 'exported name added or removed in src/')
    }

    // Backticked names out of changed comments and doc headings: the terms a
    // reader would look up, without the rest of the sentence around them.
    const isComment = /^\s*(\/\/|\*)/.test(body)
    const isHeading = /^#{1,6} /.test(body)
    if (isComment || isHeading) {
      for (const quoted of body.matchAll(/`([A-Za-z_][A-Za-z0-9_./]*)`/g)) {
        add(quoted[1], isHeading ? 'from a changed doc heading' : 'from a changed comment')
      }
    }
  }

  for (const line of gitLines(['diff', '--name-status', `${since}..HEAD`, '--', 'src/'])) {
    const parts = line.split('\t')
    if (parts.length < 2) continue
    for (const path of parts.slice(1)) {
      if (path.endsWith('.ts')) add(basename(path), 'file added, removed or renamed in src/')
    }
  }

  return terms
}

// The leading `//` block of a source file, which is where the file says what it
// is - and where a description of behaviour goes stale.
const headerComment = (file: string): { text: string; lines: string[] } => {
  const lines = readText(file).split('\n')
  const header: string[] = []
  for (const line of lines) {
    if (!line.startsWith('//')) break
    header.push(line)
  }
  return { text: header.join('\n'), lines: header }
}

const gatherPassages = (term: string): string[] => {
  const pattern = term.startsWith('§')
    ? new RegExp(`${term}(?![0-9])`)
    : new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)

  const hits: string[] = []

  const scan = (file: string, text: string, offset: number) => {
    const starts = lineStartsOf(text)
    for (const passage of passagesOf(text)) {
      if (!pattern.test(passage.text)) continue
      hits.push(`  ${show(file)}:${lineOf(starts, passage.index) + offset}  ${oneLine(passage.text)}`)
    }
  }

  for (const file of [...docFiles(), ...rootDoc('README.md'), ...rootDoc('CLAUDE.md'), ...rootDoc('LOCAL.md')]) {
    scan(file, readText(file), 0)
  }

  for (const file of sourceFiles()) {
    const header = headerComment(file)
    if (header.lines.length > 0) scan(file, header.text, 0)
  }

  return hits
}

const sweep = (since: string) => {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${since}^{commit}`], { cwd: root, stdio: 'pipe' })
  } catch {
    fail(`not a commit: "${since}"`)
  }

  const terms = gatherTerms(since)
  console.log(`${terms.size} terms from ${since}..HEAD\n`)

  let shown = 0
  for (const [term, why] of [...terms].sort((a, b) => a[0].localeCompare(b[0]))) {
    const hits = gatherPassages(term)
    if (hits.length === 0) continue
    shown += 1
    console.log(`${term}  (${why})`)
    for (const hit of hits) console.log(hit)
    console.log('')
  }

  console.log(`${shown} of ${terms.size} terms are mentioned somewhere.`)
  console.log('Read each passage and decide whether it is still true.')
  console.log('Counts and cross-references are mode A\'s job: run npm run drift.')
  console.log('A stale number is not a finding of this mode.')
}

// ---- entry -------------------------------------------------------------------

const args = process.argv.slice(2)

if (args[0] === '--since') {
  if (!args[1]) fail('--since needs a commit: npm run drift:since -- <ref>')
  sweep(args[1])
} else if (args.length > 0) {
  fail(`unknown argument "${args[0]}" - npm run drift, or npm run drift:since -- <ref>`)
} else {
  checkStatusReferences(designStatuses())
  checkQuotedPaths()
  checkGrammar()
  checkCounts()
  checkScenes()
  checkHeadings()

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line}  ${finding.message}`)
  }

  console.log(`\n${findings.length} findings`)
  if (findings.length > 0) process.exit(1)
}
