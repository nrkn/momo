// Generates docs/INDEX.md: every section number, what it is called, and which of
// the three documents holds a heading for it.
//
//   npm run index
//
// DESIGN.md is long, and its sections are in the order they were written rather
// than by number; DECISIONS.md's are in the order they accrued. One namespace
// across three files (CONTRIBUTING has why) is only navigable with a table of it,
// and a table written by hand would be one more list to drift - so it is read off
// the `## N. Title` headings instead, and `npm run drift` regenerates and diffs.
//
// A path argument writes there instead, which is how drift regenerates without
// touching the committed copy.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { fail, root } from './cli.js'

const docsDir = join(root, 'docs')
const documents = ['DESIGN.md', 'PLAN.md', 'DECISIONS.md'] as const
type Document = (typeof documents)[number]

// One `## N. Title` heading, where it links to, and what kind of entry it is.
// The kinds are read from DESIGN's own conventions, and only those: a stub says
// **Designed, not built - the section is in `PLAN.md`.**, a redirect is a section
// with no status line whose content is a table of other § numbers (§21's shape),
// and a pointer is a heading whose number has a fuller heading in the same file.
type Entry = {
  number: number
  title: string
  slug: string
  kind: 'section' | 'stub' | 'redirect' | 'pointer'
  targets: string[]
}

type Parsed = { entries: Entry[]; unnumbered: { title: string; slug: string }[]; listed: Set<number> }

// GitHub's heading anchors, as github-slugger makes them: the rendered text in
// lower case, with everything but letters, marks, numbers, connectors, hyphens
// and spaces removed, spaces made hyphens, and a repeat given -1, -2 in order.
// Markdown punctuation - backticks, asterisks - is removed by the same rule.
const slugger = () => {
  const occurrences = new Map<string, number>()
  return (heading: string): string => {
    const base = heading.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-')
    let slug = base
    while (occurrences.has(slug)) {
      const n = (occurrences.get(base) ?? 0) + 1
      occurrences.set(base, n)
      slug = `${base}-${n}`
    }
    occurrences.set(slug, 0)
    return slug
  }
}

const parse = (name: Document): Parsed => {
  const lines = readFileSync(join(docsDir, name), 'utf8').replace(/\r\n/g, '\n').split('\n')
  const slug = slugger()

  // Every heading outside a code fence, since each one takes a slug and a repeat
  // shifts the ones after it.
  const headings: { line: number; level: number; text: string; slug: string }[] = []
  let fenced = false
  lines.forEach((line, at) => {
    if (/^(```|~~~)/.test(line)) fenced = !fenced
    const heading = fenced ? null : /^(#{1,6}) +(.*?)(?: +#+)? *$/.exec(line)
    if (heading) {
      headings.push({ line: at, level: heading[1].length, text: heading[2], slug: slug(heading[2]) })
    }
  })

  const entries: Entry[] = []
  const unnumbered: { title: string; slug: string }[] = []
  const listed = new Set<number>()

  const tops = headings.filter((heading) => heading.level === 2)
  tops.forEach((heading, k) => {
    const end = k + 1 < tops.length ? tops[k + 1].line : lines.length
    const body = lines.slice(heading.line + 1, end)

    // DESIGN's table of sections that are numbered and have no text there.
    if (heading.text.startsWith('Sections designed, but not built')) {
      for (const row of body) {
        const cited = /^\| §(\d+) \|/.exec(row)
        if (cited) listed.add(Number(cited[1]))
      }
    }

    const numbered = /^(\d+)\. (.+)$/.exec(heading.text)
    if (!numbered) {
      unnumbered.push({ title: heading.text, slug: heading.slug })
      return
    }

    const status = body.find((line) => /^\*\*(Built|Partly built|Designed|Not a section)/.test(line))
    const targets = body.flatMap((line) => /^\| (§\d+(?:-§\d+)?) \|/.exec(line)?.[1] ?? [])
    const kind: Entry['kind'] = status?.startsWith('**Designed, not built - the section is in `PLAN.md`')
      ? 'stub'
      : status === undefined && targets.length > 0
        ? 'redirect'
        : 'section'

    entries.push({ number: Number(numbered[1]), title: numbered[2], slug: heading.slug, kind, targets })
  })

  // A number headed twice in one file: the one with less under it points at the
  // other, which is how DESIGN keeps §20's number in sequence and its text last.
  const sizes = new Map(tops.map((heading, k) => [
    heading.slug,
    (k + 1 < tops.length ? tops[k + 1].line : lines.length) - heading.line,
  ]))
  for (const entry of entries) {
    const twins = entries.filter((other) => other.number === entry.number)
    if (twins.length < 2) continue
    const fullest = Math.max(...twins.map((twin) => sizes.get(twin.slug) ?? 0))
    if ((sizes.get(entry.slug) ?? 0) < fullest && entry.kind === 'section') entry.kind = 'pointer'
  }

  return { entries, unnumbered, listed }
}

// Backticks survive into a table cell, and a pipe in a title would end it.
const cell = (text: string): string => text.replace(/\|/g, '\\|')

const render = (): string => {
  const parsed = new Map(documents.map((name) => [name, parse(name)] as [Document, Parsed]))

  const numbers = new Set<number>()
  for (const { entries } of parsed.values()) for (const entry of entries) numbers.add(entry.number)
  for (const number of parsed.get('DESIGN.md')?.listed ?? []) numbers.add(number)

  // The structure all of this assumes. Nothing found means the heading form
  // moved, and an empty index that agrees with itself helps nobody.
  if (numbers.size === 0) return fail('no "## N. Title" headings in DESIGN.md, PLAN.md or DECISIONS.md')

  const highest = Math.max(...numbers)
  const out: string[] = [
    '<!-- GENERATED by `npm run index` from the headings of DESIGN.md, PLAN.md and DECISIONS.md - do not edit -->',
    '',
    '# Section index',
    '',
    'Every section number, sorted, with the title `DESIGN.md` gives it - or `PLAN.md`\'s,',
    'or `DECISIONS.md`\'s, where that is the only file with a heading for it. The number',
    'is the topic and the file is the aspect, so one number can have a heading in more',
    'than one file. Rewritten by `npm run index`; `npm run drift` reports a stale copy.',
    '',
    'A **stub** is a heading kept in `DESIGN.md` so the number reads in sequence, with',
    'the text in `PLAN.md`. A **redirect** holds no text, only where it went. A',
    '**pointer** is a second heading for a number that has a fuller one in the same',
    'file. **listed** is a row in `DESIGN.md`\'s table of numbered sections it has no',
    'text for.',
    '',
    '| § | Title | DESIGN | PLAN | DECISIONS |',
    '|---:|---|---|---|---|',
  ]

  for (let number = 1; number <= highest; number++) {
    const held = documents.map((name) => (parsed.get(name)?.entries ?? []).filter((e) => e.number === number))
    const all = held.flat()
    const listed = parsed.get('DESIGN.md')?.listed.has(number) ?? false

    if (all.length === 0 && !listed) {
      out.push(`| ${number} | *no heading in any of the three* | | | |`)
      continue
    }

    const titled = held[0].find((e) => e.kind === 'section') ?? held[0][0] ?? held[1][0] ?? held[2][0]
    const title = titled ? cell(titled.title) : '*listed, with no heading*'

    const cells = documents.map((name, k) => {
      const links = held[k].map((entry) => {
        const label = entry.kind === 'section'
          ? 'section'
          : entry.kind === 'redirect'
            ? `redirect: ${entry.targets.join(', ')}`
            : entry.kind
        return `[${label}](${name}#${entry.slug})`
      })
      if (name === 'DESIGN.md' && listed) links.push('listed')
      return links.join(', ')
    })

    out.push(`| ${number} | ${title} | ${cells.join(' | ')} |`)
  }

  out.push('', '## Unnumbered headings', '')
  out.push('Not sections, so not cited by number - listed so that nothing above is missing silently.', '')
  for (const name of documents) {
    const unnumbered = parsed.get(name)?.unnumbered ?? []
    if (unnumbered.length === 0) continue
    out.push(`- \`${name}\`: ${unnumbered.map((heading) => `[${heading.title}](${name}#${heading.slug})`).join(', ')}`)
  }

  return `${out.join('\n')}\n`
}

const target = process.argv[2] ?? join(docsDir, 'INDEX.md')
writeFileSync(target, render(), 'utf8')
console.log(`ok: ${target}`)
