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
  Eight tools worked out `data/projects` from `process.cwd()` separately, which
  made moving it an edit to eight files and a hope.
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

Hand-written `.asm` under `data/projects/` should read like transpiler output,
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
rule: the source comments have used ` - ` from the beginning, 265 asides against
a single em dash, and nobody has ever minded.

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
