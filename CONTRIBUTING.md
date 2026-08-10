# Contributing to Momo

A small imperative language that transpiles to **commented NASM** for a strict
8086 subset, producing DOS `.COM` files. Named after a cat, following its
predecessor [Yuki](https://github.com/nrkn/yuki-js), whose Pong for a fantasy
console is kept as `_reference/yuki.txt`.

- **`DESIGN.md`** - the language, and *why* every decision was made. 23 sections:
  built features (§1-§18), three designed-but-deferred (§19, §22, §23), open
  questions (§20), and long-term directions (§21). Read the relevant section
  before changing anything; the rationale matters more than the rules.
- **`STYLE.md`** - TypeScript and Momo conventions.

## Layout

```
src/momo/       the compiler
src/tools/      CLI entry points, over cli.ts (paths, fail) and toolchain.ts
lib/std/        standard library, written in Momo
projects/       programs, as <name>/<name>.momo
tests/compile/  tier 1 tests
editor/vscode/  generated syntax highlighting
```

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

npm test                      # tier 1: compile tests, golden .asm, types, ~1s
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

**To check what a program prints**, run the `.com` with `> out.txt` inside a
generated batch and read the file afterwards - see `src/tools/e2e.ts`. Do not
rely on watching the DOSBox window.

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
and it is what the tables in DESIGN §16 and §21 are built from. Run under DOSBox
to check correctness, not speed.

**`build/` keeps the output of everything ever built here**, including projects
that have since been renamed or deleted - `rl` and `probe` were both still there
long after they stopped existing. Nothing prunes it, so anything reading `build/`
should ignore a directory with no project behind it, as `npm run image` does.
That staleness is the whole reason the disk image is generated rather than made
by hand.

**`git status` can show a generated `.asm` as modified when `git diff` is empty.**
The emitter writes CRLF, `core.autocrlf` is `input`, so the working tree and the
stored blob differ in line endings while comparing identical after normalisation.
`git diff --stat` is the honest check after regenerating; `git status` is not.

## Branches

**Work happens on `main`.** Everything built so far went straight there - `far`,
`view`, `group`, `local`, `peek`/`poke` and the whole peephole set - and none of
them made anyone want a branch. Small and mid-sized changes are the normal case,
and this is the whole of the rule for them.

Two things are worth branching for, and neither has come up yet:

- **A feature large enough that a half-finished `main` would cost more than the
  merge does.** Where that line falls is deliberately not written down. Nothing
  has reached it, so a number now would be a guess rather than a record - and
  the honest test in the meantime is whether you would mind leaving `main` in
  the state your change reaches by the end of a session.
- **Work that may not survive.** Subsetting the language down to something
  smaller to find out what can still usefully be built in it, say. An experiment
  whose answer might be "no" wants to be able to end without leaving anything
  behind, which is a different reason from size and the more likely of the two
  to be needed first.

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

`projects/simplerl` is a roguelike at the "move `@` around a hard-coded
map" stage, using dirty-tile redraw, and is **deliberately finished** - it is
kept as the smallest thing that is recognisably a game, so anything further
belongs in its own project. The name `rl` is reserved for a fuller one.

Most of what else is under `projects/` is a test fixture or a demonstration
of one language feature. Three are **demos**: `rndtext` fills the text buffer with
random characters, `rndpix` fills a mode 13h frame with random pixels, and
`tilefill` checkerboards two 8x8 tiles over one. All three wait for a key and put
the display back, so none can have a `.expected` - tier 2 cannot run something
that blocks. The golden tier still covers them, which is the regression coverage
that matters for a compiler.

**`README.md` is provisional**, and knowing that is more useful than the file
itself. It was written quickly to have something in place, in the register most
language READMEs are written in - bolded claims, a feature list, a certain amount
of selling - which is not the voice of the three documents it links to. `STYLE.md`
describes the voice it should have.

Rewriting it waits on two things. **Programs worth showing**, first: `simplerl` is
deliberately the smallest thing that counts as a game, the three demos cannot be
tier-2 tested, and everything else under `projects/` is a fixture. A README
that shows off wants something to show, and the text adventure (§15) or a scroller
once §22 is built are the candidates. And second, a draft **written rather than
generated**, which is the other half of why it is waiting.

The cost of waiting is that the first thing a visitor reads is the weakest
document in the repo. That trade is made deliberately, and preferred to shipping a
second draft in the same voice as the first.

242 tier-1 assertions (142 compile tests, 26 golden `.asm`, 25 type, 46 round
trip, 3 subset), 22 e2e programs, all green.
