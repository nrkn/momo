# Momo

A small imperative language that transpiles to **commented NASM** for a strict
8086 subset, producing DOS `.COM` files. Named after a cat, following its
predecessor Yuki (`_reference/yuki.txt`).

- **`DESIGN.md`** — the language, and *why* every decision was made. 21 sections:
  built features, four designed-but-deferred ones (§16–§19), open questions
  (§20), and long-term directions (§21). Read the relevant section before
  changing anything; the rationale matters more than the rules.
- **`STYLE.md`** — TypeScript and Momo conventions.

## Layout

```
src/momo/       the compiler
src/tools/      CLI entry points
lib/std/        standard library, written in Momo
data/projects/  programs, as <name>/<name>.momo
tests/compile/  tier 1 tests
editor/vscode/  generated syntax highlighting
```

## Pipeline

```
source -> lexer -> parser -> resolver -> emitter -> NASM -> DOSBox
```

Four pure stages, each a single file. `src/momo/compile.ts` runs the whole chain
and every tool goes through it — add a stage there, not in the tools.

## Scripts

```bash
npm run momoc -- <project>    # .momo -> .asm
npm run momoc:all             # every project; drives the VS Code build task
npm run build -- <project>    # assemble in DOSBox
npm start <project>           # assemble and run

npm run lex -- <project>      # token dump
npm run lex:nl -- <project>   # statement terminators only
npm run parse -- <project>    # AST
npm run check -- <project>    # symbol table
npm run memory -- <project>   # exact static footprint

npm test                      # tier 1: compile tests, golden .asm, types, ~1s
npm run test:e2e              # tier 2: run in DOSBox, compare output

npm run grammar               # regenerate the grammar from tokens.ts
npm run editor:install        # copy the extension to ~/.vscode/extensions
```

## Gotchas that have cost real time

**npm swallows user `--flags`.** `npm run lex -- smoke --newlines` silently drops
`--newlines`; only flags inside the script definition survive. That is why
`lex:nl`, `parse:json` and `momoc:all` exist as separate scripts.

**Never write files containing backslashes through a shell heredoc.** They get
eaten — `"\\.momo"` becomes `"\.momo"`, which is invalid JSON. This produced two
broken config files in one session, both silently. Use the Write/Edit tools for
JSON, regexes, and any TypeScript containing `\r\n` or escapes.

**TypeScript `never`-narrowing needs the annotation on the const.** Annotating the
arrow's return type is not enough — see the comment on `raise` in
`src/momo/diagnostics.ts`. Without it, every `raise()` at the end of a function
reads as a missing return.

**Use `tsc --pretty false`.** Coloured output puts escape codes between "error"
and "TS", so `grep "error TS"` silently matches nothing.

**DOSBox exits with its own status, not NASM's.** Build success is signalled by a
marker file written from the generated batch. Assembler errors are captured with
NASM's `-Z`, an option that exists precisely because DOS cannot redirect stderr.

**To check what a program prints**, run the `.com` with `> out.txt` inside a
generated batch and read the file afterwards — see `src/tools/e2e.ts`. Do not
rely on watching the DOSBox window.

**8.3 filenames** for anything DOSBox touches: project directories and entry
files are 1–8 characters. Tier 1 tests never touch DOS and can be named freely.

**`git stash pop` does not rebuild `dist/`.** Reverting a change to check the
suite has teeth runs `tsc` as part of `npm test` — so the build left behind is
the *reverted* one. Any tool invoked directly afterwards (`node dist/tools/...`)
is still running the reverted compiler, and reports a clean pass that means
nothing. Run `npx tsc` after restoring. This produced one false all-clear.

**Every emitted file starts with `cpu 8086`**, so NASM enforces the instruction
subset mechanically. A 186+ instruction becomes an assembly error rather than a
silent portability bug.

## Working practices

**Verify by running, not by reading.** The three real bugs found so far — scalar
initialisers silently dropped, an `i8` path with a no-op double `xchg`, and
`_hsize` emitted as an `equ` that was 0x100 too large — were all invisible to the
type checker, and two existed only in what NASM did with the output.

**Check the suite has teeth.** After adding tests, deliberately break the thing
they cover and confirm they fail. A suite that has never failed has not been
tested.

**Generated `.asm` must stay byte-identical** across any change that is not meant
to alter behaviour. `npm test` now enforces this for every project rather than
leaving it to whoever remembers to read `git status`. When a change *is* meant
to alter output, adopt it with `npm run momoc:all` and read the diff — that
reading is the point of the tier, not a formality.

**Regenerate the grammar** (`npm run grammar`) after touching `tokens.ts`, and
verify the emitted regexes compile — a TypeScript template literal will turn
`\b` into a backspace character if it is not doubled.

**Prefer deleting a special case to adding a feature.** `include` retired the
stdlib-as-prologue idea; `view` (§17) would retire `_heapw` and the register
aliases. Features that remove compiler special cases while adding expressiveness
have consistently been the right ones.

## Current state

`data/projects/rl` is the active program — a roguelike at the "move `@` around a
map" stage, using dirty-tile redraw. Everything else under `data/projects/` is
either a test fixture or a demonstration of one language feature.

104 tier-1 assertions (67 compile tests, 12 golden `.asm`, 25 type), 11 e2e
programs, all green.
