# Style guide

Living document - we iterate on this as we go.

## TypeScript

**Simple and imperative.** Prefer the obvious procedure over the clever
abstraction. This is a hobby compiler, not a framework.

- **No classes**, no `this`, no `new`. Plain functions and data.
- **`type`, never `interface`.**
- **No function overloading.** One signature per function.
- **`async`/`await`**, never `.then()`/`.catch()` chains.
- **`for (;;)` and `for..of` / `for..in`** rather than `.forEach()`.
  `.map()`/`.filter()` are fine where they read as expressions.
- **Arrow functions** assigned to `const` for top-level definitions.
- **No default exports.** Named exports only.
- **`node:` prefix** on all builtin imports (`node:fs/promises`, not `fs/promises`).
- **No semicolons.** Single quotes. Two-space indent.

## Structure

- Constants and paths at the top of the module, derived once - and where more
  than one module needs the same one, derived in `src/tools/cli.ts` instead.
  Eight tools worked out the projects directory from `process.cwd()` separately,
  which made moving it an edit to eight files and a hope. It moved one commit
  after they were consolidated, and the edit was one line.
- Small named helpers over long inline blocks - but only when the helper has a
  name worth reading. Don't extract for its own sake.
- Fail fast and loudly: validate inputs up front, exit with a clear message
  rather than throwing a stack trace at the user.

## Errors: two layers

- **Compiler stages** (`src/momo/`) call `raise(line, col, message)`, which
  throws a `MomoError` carrying a source position. A bare `throw` from a
  compiler stage means a bug in *the compiler*, not in the user's program.
- **Tools** (`src/tools/`) catch `MomoError`, print it via `formatError` (source
  line plus caret), and exit 1. `fail(message): never` is for tool-level
  problems only - missing files, bad arguments, no DOSBox.

## Errors

Messages are lowercase, specific, and say what to do:

```
error: invalid project name "textadventure" - DOS 8.3 requires 1-8 characters
```

Not `Error: validation failed`.

## Assembly (hand-written test programs)

Hand-written `.asm` under `projects/toolchain/` should read like transpiler output,
so it doubles as a check on the codegen design:

- `cpu 8086` at the top of every file. This makes NASM mechanically enforce the
  strict-8086 decision from `DESIGN.md` - a 186+ instruction becomes an error.
- `org 100h`, no sections.
- Source-level intent as a `; ---- ... ----` section header, not echoed per
  instruction.
- Inline comments only for things a reader cannot infer: width conversions, why
  `jbe` and not `jle`, branch-expansion idioms.
- Labels in column 0, mnemonics indented 8, operands aligned.

## Momo

- **`=>` when the body is one thing.** It desugars to `{ return expr }` or
  `{ statement }` in the parser, so there is no cost either way - it is purely
  about reading:

  ```momo
  u16 randomBelow( u16 n ) => (nextRandom() >> 1) % n
  sub cls => clearScreen( color( lightGray, black ) )
  ```

  It reads best when the body is an expression or a call. With an assignment the
  two `=`-family tokens end up close together - `sub seed( u16 s ) => seed_ = s`
  is legal and fine, but braces are also defensible there.

- Reach for braces when the body is multi-statement, when a comment belongs
  inside it, or when the line would wrap.

- **Declare a counter in the `for` when the loop is all it is for.** §44 lifts the
  declaration to the top of the body either way, so both spellings produce the same
  slot and the choice is purely about reading:

  ```momo
  for ( u16 k = 0; k < n; k++ ) { ... }
  ```

  The test is what a routine's declaration block is *for*: state the routine keeps.
  A counter that dies with its loop is not that. `sizeAxis` in momolo went from
  eleven locals to nine on this and lost nothing a reader needed, and `candRemove`
  lost its block entirely. Where a counter is read after the loop or shared with
  the code around it, it belongs in the block - scoping is flat, so both spellings
  work and this is taste rather than a rule.

  Several loops sharing one counter is where it pays least, and that is worth
  saying rather than glossing: five `for ( u16 k = 0; ... )` is more text than one
  `u16 k` and five bare headers. It still reads better, because what remains above
  is then only what outlives a loop - but it is close.

- **A pair that must close is a `bracket`, and a block at every call site.** §48
  makes the compiler emit the close, so the choice is not between two spellings
  that both work - one of them can be got wrong and the other cannot:

  ```momo
  panel( blue ) {
    ...
  }
  ```

  **Declare the pair in the file that owns the routines**, not in the file that
  uses them. A declaration is program-wide and order-free, so `mopaint.momo`
  names its own four and every scene gets them by including it. A scene declaring
  its own would be naming somebody else's pair.

  **A bare open stays bare where it is deliberate.** `stripOpen` leaves a box open
  for `stripClose` to take back, which is its whole job - the pair is a bracket at
  the four *call sites*, and the two opens inside the wrapper are not a gap. The
  test is whether the open and close sit in the same body, not whether the words
  appear.

  **Nothing may `return`, `break` or `continue` out of a bracket body**, because
  the close would be skipped; the compiler refuses it by name. If a body wants an
  early exit, it wants a routine rather than a block.

- **Comments say what a reader needs, not how the code got here.** The test is the
  same stranger the documents are written for: they have not read the commit, they
  do not know what was there before, and they are looking something up rather than
  reading it through. Anything that fails that test is in the wrong file, however
  true it is.

  **Density is a symptom, not the measure.** The Momo libraries run 25-76% comment
  lines against the TypeScript's 9-26%, which is worth knowing because it finds
  candidates - but complex code can buy its density honestly.
  `momovec/types.momo` is 80% comment and earns all of it: no cubics, every
  segment pre-limited on arrival, coordinates read through `mapX`/`mapY`, and
  routines the library does not define. A stranger needs all four before reading a
  line of it. `std/rand.momo` was 76% and did not - most of its header was the
  periods of an LCG that no longer exists.

  What accumulates is **record rather than description**: a measurement that has
  drifted, a design that was replaced, a direction nobody took. That is the same
  interleaving `DECISIONS.md` was created to undo, one level down, and the same
  split applies - **a measurement goes to `DECISIONS.md`, a direction goes to
  `PLAN.md`**. Where neither is worth the drift surface, **the commit that removes
  it is the record**: `git log` does not drift, which `PLAN.md` already says of it.

  **A figure nothing checks is drift surface.** `std/io.momo` said 22 programs
  included it when the answer was 36, and 19 of 48 round-trip assertions when the
  suite had 60. Keep a number where it is load-bearing and stable; otherwise give
  the shape of it and let the tools hold the arithmetic.

  That rule was written here and then not applied, so the same sentence in
  `io.momo` drifted a second time - 35 against an answer of 39 - and was cut
  rather than corrected. It is short a test for deciding *which* numbers are
  worth keeping, and a sweep of every figure in the repository produced one.
  **Four kinds, and only the last one costs anything:**

  | | | |
  |---|---|---|
  | **checked by a test** | §1's mnemonic count, and nothing else | free |
  | **not about this repo** | 8086 cycle counts, 64KB, 8.3, 54.9ms a tick | free |
  | **frozen at a date, and visibly saying so** | all of `DECISIONS.md`, §44's corpus figures, §48's "32 of the 34 opens *became* blocks" | free |
  | **present tense about the repo as it stands** | everything that has ever drifted here | all of it |

  **The tell is tense, and it is reliable.** DESIGN §14 carried the same figure
  twice in one paragraph: *"22 programs included that file **at the time**"* is
  still there and still true, and *"in every program that includes it - 35 of
  them"* had rotted and has been cut. Same file, same paragraph, same number -
  the guard is the only difference between them. §44
  says its counts are *"fixed at the date rather than maintained"* and has cost
  nothing since; §45 reused §44's denominator three hundred lines later without
  that sentence, and it went stale.

  So: **a count belongs in `DECISIONS.md`, where it is dated by construction.** A
  present-tense count anywhere else is a bug unless a test reads it - and the fix
  is one of three moves, in this order. Hand it to a tool. Or add §44's sentence,
  if the figure *is* the evidence for a design. Or cut it and give the shape,
  which is nearly always right when the number is incidental to the point being
  made. Note that `DECISIONS.md` carries several hundred numerals and has never
  needed a sweep, which is the argument for the split rather than for counting
  less.

## Prose

`DESIGN.md`, `CONTRIBUTING.md` and this file already share a voice, and it is not
the one most language READMEs use: precise, dry, and willing to say what something
cost. *"This produced one false all-clear."* *"The reduction delivers about 80% of
what it could."* *"Not wrong, just never the biggest thing left."* A claim is
load-bearing or it is cut.

- **Understatement over enthusiasm.** Say what the thing does and let the reader
  decide whether that is impressive. Bolded superlatives and a bullet list of
  features are the register of a product page.
- **Record what a decision cost**, not only what it bought. A good share of the
  value in these documents is the entries admitting a measurement came in under
  its estimate, or that a claim had drifted from the code.
- **Dry wit is welcome; jokes are not.** The test is whether it still reads well
  on the fourth pass, when the reader is looking something up rather than
  browsing.
- **Never cite a study** - not from a document, and not from a source comment.
  Some of `shared/lib/` was ported from projects that are not in this repository
  and never will be, so a reference to one names a file the reader does not have
  and cannot get. Say what was learned instead; anything worth citing has to be
  brought across first. Public upstream - Clay, Zingl, the Ghostscript tiger -
  stays citable, because a reader can go and look. `STUDIES.md` has the rule and
  the register.

`README.md` does not currently follow any of this - see `CONTRIBUTING.md`.

## Typography

**ASCII in documents, comments and commit messages, with one exception.**
Anything a contributor cannot type at full speed on an ordinary keyboard costs
every writer something to save a reader almost nothing.

| for | use | not |
|---|---|---|
| an aside | ` - ` | `—` |
| a range | `1-8`, `§1-§18` | `1–8` |
| "becomes" | `->` | `→` |
| dimensions | `320x200` | `320×200` |

Curly quotes and `…` have never appeared here. Keep it that way.

**`§` is the exception**, and earns it on the same test: it carries a real
cross-reference rather than decoration, it is unambiguous, it greps cleanly, and
it is typed only when citing a section rather than in every third sentence. High
value, low frequency - which is exactly what an em dash is not.

This makes the documents consistent with the code rather than introducing a new
rule: the source comments have used ` - ` from the beginning, in hundreds of
asides, and nobody has ever minded. There is now no em dash anywhere in `src/` -
the one this used to count against has since gone.

There is a small loss, and it is worth naming. In prose full of `-o` and
`u8 -> u16`, a hyphen aside is a shade more ambiguous than an em dash would be.
The comments have absorbed exactly that ambiguity for as long as they have
existed, so the cost is real and small, and it is paid once by a reader rather
than every time by a writer.

## Naming

- Files: `kebab-case.ts`.
- Functions and variables: `camelCase`.
- Types: `PascalCase`.
- DOS-visible filenames must be **8.3** - project directories and entry files
  are limited to 8 characters, letters/digits/underscore, starting with a letter.
  **Category directories are not DOS-visible** and are not limited: `run.ts`
  copies a project's own files flat into `build/<name>/` and mounts that as `C:`,
  so DOSBox never sees a category at all.
- **A project is named, not pathed.** `npm start tennis`, `momoc -- tiger`,
  `${fileBasenameNoExtension}` in the VS Code task: nothing spells the category,
  and two projects sharing a name is an error rather than something a path
  resolves. Prose follows the same rule - write `tennis`, not its path, or the
  reference goes stale the next time anything is recategorised.
- **`shared/scenes/` is for data read by more than one project**, and only that.
  Data with a single reader lives beside its reader as an ordinary prefixed part
  - `c_data.momo` in `tclip`, `s_corpus.momo` in `subdiv`. The three that moved
  did so because their readers ended up in different categories, which made
  `../` a path that depended on where all of them happened to sit.
- **A multi-file project prefixes its parts**, one letter and an underscore, from
  the project's own name: `tennis/` has `t_cfg.momo` and `t_scr.momo`
  beside `tennis.momo`, and `momovec/` has `m_scene.momo` beside
  `momovec.momo`. The prefix exists to separate the parts from the entry file,
  which DOS requires to be named after the directory - so a reader can tell at a
  glance which file the program starts in.

  **Library files take no prefix**, because there is no entry file to be
  separated from. `shared/lib/momolo/` is `types.momo`, `build.momo`, `fit.momo` and so
  on; a `m_` on each would be repeating the directory. The engine was written
  under `projects/` first and moved, and the prefixes came with it before this
  was noticed.

  Both halves of that rule were established by `tennis` and then by the momolo
  port, and neither was written down until the second one needed it - which is
  why it is here rather than being inferred from whichever project you happened
  to read first.
