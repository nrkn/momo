# Contributing to Momo

A small imperative language that transpiles to **commented NASM** for a strict
8086 subset, producing DOS `.COM` files. Named after a cat, following its
predecessor [Yuki](https://github.com/nrkn/yuki-js), whose Pong for a fantasy
console is kept as `_reference/yuki.txt`.

- **`DESIGN.md`** - the system as it stands, and *why* every decision was made.
  Read the relevant section before changing anything; the rationale matters more
  than the rules.
- **`PLAN.md`** - what is going to be built, how sure that is, what is unsettled,
  and the designs for the things that are not built yet. A design lives here until
  it exists, then moves into `DESIGN.md`.

  Section numbers are **one namespace across all three**, stable and only ever
  appended, because they are cited from source comments - §17 means `view`
  permanently, and a number absent from `DESIGN.md` is in `PLAN.md` rather than
  deleted. §21 is a redirect to where its contents went rather than a section.
- **`DECISIONS.md`** - the record: what a choice cost, what was measured, what was
  estimated and missed, what was tried and rejected. Same section numbers, so §18
  is `group` there too - the number is the topic and the file is the aspect. It
  exists because that material was interleaved with the description paragraph by
  paragraph, which is what made `DESIGN.md` hard to read straight through.
- **`PEEPHOLES.md`** - the fifteen local rewrites the emitter applies, and how one
  gets added. Its own document because it is a catalogue with its own numbering,
  cited by number from `emitter.ts`, and because it grows by sweeping emitted
  assembly rather than by designing anything.
- **`STYLE.md`** - TypeScript and Momo conventions.
- **`PITFALLS.md`** - what bites when writing Momo *programs*, as opposed to the
  gotchas below, which are about working on the compiler. Each entry leads with
  the symptom, and every one of them cost real time to find.
- **`STUDIES.md`** - the parts of `shared/lib/` that were ported rather than
  designed here, what each was distilled from, and the method those ports
  converged on. It also carries the one rule that follows from studies living
  outside this repository: say what was learned, never where it was learned.

## Layout

```
src/momo/            the compiler
src/tools/           CLI entry points, over cli.ts (paths, fail) and toolchain.ts
shared/              the include root: what more than one project reads
shared/lib/std/      standard library, written in Momo
shared/lib/momolo/   a layout engine, written in Momo
shared/lib/momovec/  a vector rasteriser, written in Momo
shared/scenes/       data read by more than one project
projects/            programs, as <category>/<name>/<name>.momo
tests/compile/       tier 1 tests
editor/vscode/       generated syntax highlighting
docs/                this file, DESIGN.md, PLAN.md, DECISIONS.md,
                     PEEPHOLES.md, STYLE.md, PITFALLS.md, STUDIES.md
```

`README.md` stays in the root because that is where it is read from, and so do
`LICENSE`, `CLAUDE.md` and `AGENTS.md` - the last two because the tools that look
for them look in the root and nowhere else. Everything else is documentation
rather than front matter, and `docs/` is a directory GitHub already knows to check
for a contributing guide.

A project with more than one file prefixes its parts - `t_scr.momo` beside
`tennis.momo` - and a library does not, because there is no entry file to
separate them from. `STYLE.md` has the rule and why.

`projects/` is grouped by **what is broken when a project fails**:

```
compiler/lang       one language feature each - if it fails, the compiler is wrong
compiler/algo       real algorithms, proving the language carries one
library/std         exercises a library in shared/lib/std
library/vector      holds shared/lib/momovec against the study it was ported from
library/layout      the same for shared/lib/momolo
programs/games      the games
programs/demos      draws, waits for a key, and cannot have a .expected
toolchain/          hand-written .asm, checked before the compiler is involved
```

That axis was chosen over grouping by subject or by purpose because it is the one
a red suite can act on: it says which half of the repo to open. Grouping by
subject leaves `games` with nowhere to sit, and grouping by purpose puts 36 of the
46 in one directory, which is the flat list again one level down.

**A project is still addressed by its bare name** - `npm start tennis` - because
where it sits is not part of its identity. Two projects sharing a name is an error
rather than something a path disambiguates, `build/` stays flat, and
`.vscode/tasks.json` passes a bare basename. It is also why this document writes
`tennis` rather than a path: a path goes stale the first time anything is
recategorised, and these documents have drifted before.

## Pipeline

```
source -> lexer -> parser -> resolver -> emitter -> NASM -> DOSBox
```

Four pure stages, each a single file. `src/momo/compile.ts` runs the whole chain
and every tool goes through it - add a stage there, not in the tools.

## Getting set up

Node 22+, and DOSBox for anything that assembles or runs. Copy
`toolchain.example.json` to `toolchain.json` and point it at your DOSBox, or set
`MOMO_DOSBOX`. `npm test` needs neither.

## Scripts

```bash
npm run momoc -- <project>    # .momo -> .asm
npm run momoc:all             # every project; drives the VS Code build task
npm run build -- <project>    # assemble in DOSBox
npm start <project>           # assemble and run
npm run image                 # build/*.COM -> build/momo.ima, for 86Box

npm run lex -- <project>      # token dump
npm run lex:nl -- <project>   # statement terminators only
npm run parse -- <project>    # AST
npm run check -- <project>    # symbol table
npm run memory -- <project>   # exact static footprint
npm run desugar -- <project>  # the program with its surface sugar lowered

npm test                      # tier 1: compile, golden .asm, types, lexing, ~1s
npm run test:e2e              # tier 2: run in DOSBox, compare output

npm run grammar               # regenerate the grammar from tokens.ts
npm run editor:install        # copy the extension to ~/.vscode/extensions
```

## Gotchas that have cost real time

**npm swallows user `--flags`.** `npm run lex -- smoke --newlines` silently drops
`--newlines`; only flags inside the script definition survive. That is why
`lex:nl`, `parse:json` and `momoc:all` exist as separate scripts.

**TypeScript `never`-narrowing needs the annotation on the const.** Annotating the
arrow's return type is not enough - see the comment on `raise` in
`src/momo/diagnostics.ts`. Without it, every `raise()` at the end of a function
reads as a missing return.

**Use `tsc --pretty false`** when grepping. Coloured output puts escape codes
between "error" and "TS", so `grep "error TS"` silently matches nothing.

**DOSBox exits with its own status, not NASM's.** Build success is signalled by a
marker file written from the generated batch. Assembler errors are captured with
NASM's `-Z`, an option that exists precisely because DOS cannot redirect stderr.

**`momoc` reports `ok` for programs NASM will reject.** The compiler's job ends
at emitting text, and nothing below tier 2 assembles that text - so a codegen bug
at the NASM boundary is indistinguishable from success. `ok: ... prefixes.asm`
means "wrote a file", not "this builds". Naming a global after an instruction did
exactly this for the whole life of the project: `u16 add` compiled clean and
emitted `add dw 0`, which NASM read as an ADD (DESIGN §7). When a change touches
what the emitter *writes* rather than what it computes, `npm run test:e2e` is the
only tier that can tell you it worked.

**`momoc` also reports `ok` for a program that cannot fit the segment.** A different
case from the NASM one above and it bites the same way: raising `maxCrossings` to 3,072
in a momovec program put the image at 69,630 bytes against 65,536, `momoc` said `ok`,
and the program built, ran and hung. **`npm run memory` is what catches it** - it prints
a *negative* heap, which is the only place the overflow is visible. Worth running after
any change to a static capacity, because nothing else will say a word.

**To check what a program prints**, run the `.com` with `> out.txt` inside a
generated batch and read the file afterwards - see `src/tools/e2e.ts`. Do not
rely on watching the DOSBox window.

**A program that does not terminate reports as a bare timeout.** Tier 2 prints
`<timed out after 120s>` and nothing else, because there is no output to compare - so
an infinite loop and a crash look identical from here. `PITFALLS.md` has the one that
caused it.

**8.3 filenames** for anything DOSBox touches: project directories and entry
files are 1-8 characters. Tier 1 tests never touch DOS and can be named freely.

**`git stash pop` does not rebuild `dist/`.** Reverting a change to check the
suite has teeth runs `tsc` as part of `npm test` - so the build left behind is
the *reverted* one. Any tool invoked directly afterwards (`node dist/tools/...`)
is still running the reverted compiler, and reports a clean pass that means
nothing. Run `npx tsc` after restoring. This produced one false all-clear.

**Every emitted file starts with `cpu 8086`**, so NASM enforces the instruction
subset mechanically. A 186+ instruction becomes an assembly error rather than a
silent portability bug.

**DOSBox cannot measure performance.** `cycles = auto` in `data/dosbox.conf`
means it adjusts its own budget against host load, so wall-clock time measures
the host. Pinned to a fixed count it becomes repeatable, but its normal core
charges roughly per *instruction* rather than modelling `mul` at 118 cycles
against `shl` at 2 - so it would rank optimisations wrongly. Count instructions
in the emitted `.asm` and apply documented 8086 timings instead; that is exact,
and it is what the timing tables in §16, §26 and §27 are built from - the last
of those now in DECISIONS.md, which is where a measurement lives. Run under DOSBox
to check correctness, not speed.

**`build/` keeps the output of everything ever built here**, including projects
that have since been renamed or deleted - `rl` and `probe` were both still there
long after they stopped existing. Nothing prunes it, so anything reading `build/`
should ignore a directory with no project behind it, as `npm run image` does.
That staleness is the whole reason the disk image is generated rather than made
by hand.

It also spoiled three separate measurements before being handled properly, because
a stale binary reads exactly like a current one: the figure is real, just not from
this version. `tennis` was reported at 4,110 bytes from a build predating its last
two commits, and the vector port at an image of 3,478 bytes against 4,601 bytes of
data - which is not a number that can exist, and got written down anyway.
**`npm run memory` now compares the binary's timestamp against the source and warns
when the code and image it just printed came from an earlier build.** Being careful
was not working.

**A "GENERATED - do not edit" file can be edited anyway, and the generator will
not notice.** `mvdemo.momo` and `mvpic.momo` are emitted by the vector study, and
both carried an `include "momovec/direct.momo"` that the study's emitter never
wrote - added by hand on this side when `direct.momo` was extracted, and never
taught to the generator. Regenerating would have silently removed it and
`clip.momo` would have failed with `"mapX" is not declared`. Nothing said so for
five commits, because nobody regenerated in between. **The check is to regenerate
and diff**, and it is worth doing whenever either side of a generated file moves -
it is the only thing that can tell you the two still agree.

**`git status` can show a generated `.asm` as modified when `git diff` is empty.**
The emitter writes CRLF, `core.autocrlf` is `input`, so the working tree and the
stored blob differ in line endings while comparing identical after normalisation.
`git diff --stat` is the honest check after regenerating; `git status` is not.

## Branches

**Work happens on `main`.** Everything built so far went straight there - `far`,
`view`, `group`, `local`, `peek`/`poke` and the whole peephole set - and none of
them made anyone want a branch. Small and mid-sized changes are the normal case,
and this is the whole of the rule for them.

Two things are worth branching for, and one of them has happened:

- **A feature large enough that a half-finished `main` would cost more than the
  merge does.** **momolo (DESIGN §36) is the instance** - a layout engine ported
  chunk by chunk across more than one session, built on a `momolo` branch and
  merged as a pull request. Where the line falls is still not written down,
  because one crossing does not locate it, but it is no longer hypothetical. The
  test for anything smaller is unchanged: whether you would mind leaving `main`
  in the state your change reaches by the end of a session.
- **Work that may not survive.** Subsetting the language down to something
  smaller to find out what can still usefully be built in it, say. An experiment
  whose answer might be "no" wants to be able to end without leaving anything
  behind, which is a different reason from size. **This one still has not come
  up** - and this section used to call it the more likely of the two to be needed
  first, which was wrong.

This paragraph said for a while that neither case had come up, having been
written before momolo and not read again afterwards. The claim about which would
arrive first was the tell: a prediction is the part of a document most worth
re-reading once the thing it predicted has happened.

## Working practices

**Verify by running, not by reading.** Almost every real bug here was invisible
to the type checker: scalar initialisers silently dropped, an `i8` path with a
no-op double `xchg`, `_hsize` emitted 0x100 too large, a fn falling off its end
into whatever the return slot last held, a sub-local initialiser that ran once at
load rather than per call. Several existed only in what NASM did with the output.
Compiling a two-line program and reading the assembly finds these; reasoning
about the source does not.

**Check the suite has teeth.** After adding tests, deliberately break the thing
they cover and confirm they fail. A suite that has never failed has not been
tested. Three separate tests here turned out unable to fail for the reason they
existed - output comparison only catches a bug when the wrong computation yields
a *different* number, and small operands collide easily.

**The docs are load-bearing, and have drifted.** DESIGN.md described two
peepholes as built that were never written, and carried a worst-case-stack
formula that contradicted another section. Treat a claim about generated output
as a hypothesis until the compiler agrees with it.

**Generated `.asm` must stay byte-identical** across any change that is not meant
to alter behaviour. `npm test` enforces this for every project rather than
leaving it to whoever remembers to read `git status`. When a change *is* meant
to alter output, adopt it with `npm run momoc:all` and read the diff - that
reading is the point of the tier, not a formality.

**Regenerate the grammar** (`npm run grammar`) after touching `tokens.ts` *or
the builtin globals in `resolver.ts`* - the grammar is generated from both, and
`far` and `_cf` both reached main with the committed extension stale because
this rule used to name only the first. Verify the emitted regexes compile - a
TypeScript template literal will turn `\b` into a backspace character if it is
not doubled.

**A new mnemonic means editing DESIGN §1**, and `npm test` now insists. The
instruction table and its count are the only record of the subset - `cpu 8086`
stops NASM assembling a 186+ instruction, but says nothing about an 8086 one the
doc does not list. `_cf` added `pushf` and the table said 36 for a while.
Everything else points at §1 rather than restating the number, so §1 is the only
edit.

Three tier-1 assertions read `DESIGN.md` itself and check that the heading's count
matches the table, that nothing outside the table is emitted, and that nothing in
the table goes unemitted. The third is a coverage claim: a mnemonic the emitter
can produce but no committed program exercises is a codegen path no test has ever
run.

This was a manual instruction here for one commit, and got done wrong three times
in a row - once by hand-typing the subset (`xchg` and `imul` in, `cwd` out), twice
by a slice that swallowed the prose around the table and read `cmptest` as a
mnemonic. Which is the argument for a test rather than a practice: the check is
fiddlier than it looks, and being careful is not a method.

**Prefer deleting a special case to adding a feature.** `include` retired the
stdlib-as-prologue idea; `view` (§17) retired the emitter's byte-alias arithmetic
and its hardcoded `_heapw equ _heap`. Features that remove compiler special cases
while adding expressiveness have consistently been the right ones.

Read what got retired carefully, though: `view` absorbed those two as *mechanism*,
not as source. `_heapw` and `_al` still cannot be written as views - DESIGN said
they could, and it was half wrong. A feature that subsumes a special case is worth
having whether or not the special case can be re-spelled in it, but the two are
different claims and only one of them survived contact.

**AI-assisted work is welcome; unexamined work is not.** A good deal of this repo
was written that way - `CLAUDE.md` exists and the commit log is explicit about
it - so this is a note from experience rather than a precaution.

None of the practices above are waived, because none of them are about who typed
the change. `CLAUDE.md` already puts the agent's half plainly: *adopting whatever
the tool printed proves only that it printed it.* The contributor's half is the
same sentence.

What is genuinely new is that a change nobody has understood is now cheap to
produce. So:

- **Be able to say what your change does and why, without the assistant in the
  room.** If you cannot, learn it until you can. That is the same bar you would
  clear by writing the code yourself, not a higher one.
- **Work by dialogue.** Proposing, measuring, being told the measurement
  disagrees, and changing the plan is the mode that has produced the good commits
  here. A single prompt and a pull request is not, and it tends to produce changes
  whose reasoning nobody can reconstruct - including whoever submitted them.

A review can catch a bug. It cannot supply an understanding that was never formed.

## Current state

`simplerl` is a roguelike at the "move `@` around a hard-coded
map" stage, using dirty-tile redraw, and is **deliberately finished** - it is
kept as the smallest thing that is recognisably a game, so anything further
belongs in its own project. The name `rl` is reserved for a fuller one.

What most of the rest are is now said by the tree rather than by this paragraph.
What the tree cannot say is that **nothing checks `programs/demos`**: `rndtext`
fills the text buffer with random characters, `rndpix` fills a mode 13h frame with
random pixels, `tilefill` checkerboards two 8x8 tiles over one, and `tigerpic`,
`mvpic` and `mlodemo` draw what the harnesses beside them digest. All six wait for
a key and put the display back, so none can have a `.expected` - tier 2 cannot run
something that blocks. The golden tier still covers them, which is the regression
coverage that matters for a compiler.

`tennis` is the other game and the largest program here - 828 lines over
six files, mode 13h, sprites, a palette, and a keyboard reader that masks IRQ1 and
talks to the 8042 directly. Most of `PITFALLS.md` was found in it, and found on
86Box rather than under DOSBox. It blocks on input, so it is golden-tier only too.

`shared/lib/momovec/` (§37) is a vector rasteriser ported from a study, and it also
arrived with two projects. `tiger` digests the Ghostscript tiger - 339
numbers covering every scanline, every path and the order all 92,949 pixels were
drawn in, held against the study - and `tigerpic` draws it at 320x200 in
mode 13h and waits for a key, so it is golden-tier only. The data is generated and
lives once, at `shared/scenes/tiger.momo`, which all three of `tiger`, `tigerpic`
and `tzoom` include by that one name. It used to live inside `tiger` with
the other two reaching across by `../`, which made the include depend on where all
three happened to sit.

The two programs differ in one routine. `plot` decides whether a pixel becomes a
number or a byte of video memory, and the rasteriser never learns which: a library
file may call a routine the *program* defines, and it compiles to a direct `call`.
That is what DESIGN §19's routine parameters would have been for, and it needed no
language feature at all.

`tzoom` is the tiger zoomed by a transform applied as geometry is READ rather
than baked into data, which is what `shared/lib/momovec/zoom.momo` exists for and what §25 was
built for. It shares `tiger`'s data unchanged - there is no second copy, because
the whole point is that a zoom cannot be stored: the 3x tiger is 84,914 bytes against a
64 KB segment. Held against a digest the study derives independently.

`shared/lib/std/fixed.momo` is the multiply behind `*` on a fixed-point type (§25), and it
holds the same value twice: `fixMulU` over the `mulshr8` intrinsic, and `fixMulUParts`
built from four multiplies in nothing but ordinary operators. The second is the
specification and the first is the fast one, and `fixmul` requires them to agree
over 256 pairs on the target. `fixed` is the language surface instead - every
fixed-point shape that compiles, held by the golden tier because the claim being made
there is about emitted code.

`shared/lib/momolo/` (§36) is a layout engine ported from a study, and it arrived
with two projects rather than one. `momolo` runs six scenes through it
and prints every resolved box as bare numbers, compared against the numbers the
original engine produces - two implementations agreeing on every integer, which
is what makes it a tier 2 test rather than a demo. `mlodemo` draws the
same tree at 80x25 and waits for a key - literally the same, since both include
`shared/scenes/shell.momo` rather than either owning it. Both go through `shared/lib/mopaint.momo`, the
colour, borders and wrapping layer that deliberately sits outside the engine, so
what is untested is the painting rather than the layout.

**`README.md` is provisional**, and knowing that is more useful than the file
itself. It was written quickly to have something in place, in the register most
language READMEs are written in - bolded claims, a feature list, a certain amount
of selling - which is not the voice of the three documents it links to. `STYLE.md`
describes the voice it should have.

Rewriting it waits on two things. **Programs worth showing**, first: `simplerl` is
deliberately the smallest thing that counts as a game, the six demos cannot be
tier-2 tested, and everything else under `projects/` is a fixture. A README
that shows off wants something to show, and the text adventure (a `PLAN.md` item) or a scroller
once §22 is built are the candidates. And second, a draft **written rather than
generated**, which is the other half of why it is waiting.

The cost of waiting is that the first thing a visitor reads is the weakest
document in the repo. That trade is made deliberately, and preferred to shipping a
second draft in the same voice as the first.

344 tier-1 assertions (173 compile tests, 44 golden `.asm`, 53 type, 11 lex, 60
round trip, 3 subset), 35 e2e programs, all green.

Both figures have drifted before, and neither is enforced by anything - unlike
§1's mnemonic count, which a test checks. The e2e one drifted furthest: it said
26 against an actual 33, and was then incremented three times from the wrong
base. The tier 1 one said 253 against an actual 268, because the golden and
round-trip tiers both grew during the vector port and nothing brought the
sentence with them.

Counting `projects/*/*/*/*.expected` is the honest check on the e2e figure, and
`npm test` prints the tier 1 breakdown so its parts can be added up. That glob
gained a level when `projects/` was grouped and this sentence did not follow it,
so the instruction for catching drift had drifted too.
