# Momo

A small imperative language that compiles to **readable, commented NASM** for a
strict 8086 subset, producing DOS `.COM` files.

```momo
include "std/screen.momo"

const mapW = 10

const map = "####  ####"
            "#  ####  #"
            "#        #"
            "####  ####"

const tileAt( u8 x, u8 y ) = map[ y * mapW + x ]

sub cls => clearScreen( color( lightGray, black ) )

setTextMode()
cls()
writeAt( 4, 2, '@', color( yellow, black ) )
```

The generated assembly is meant to be read - every statement is quoted above the
code it produced, and each instruction choice is annotated with the reason:

```nasm
; ---- for (x = x1; x <= x2; x++) {
        mov     al, [x1]
        mov     [x], al                     ; u8 -> u8, no widening
.L1:
        mov     al, [x]
        cmp     al, [x2]                    ; byte operands, no widening
        jbe     .L4                         ; unsigned <=
        jmp     .L3
.L4:
```

## Why

Three reasons.

**Primarily, to write small games and tools.** Momo is meant to be used rather
than admired. There is a roguelike, the standard library is a text-mode screen, a
keyboard and strings, and the bar it is held to (`DESIGN.md` §15) is a list of
programs that work, not of features that exist.

**Secondarily, to show that x86 assembly is not overwhelming if you start with
a small subset and work up.** Not by hiding the assembly - by shrinking it
until it fits in your head. Most of the design falls out of that one idea:

- **37 mnemonics**, with `cpu 8086` at the top of every emitted file so NASM
  enforces the boundary on every build. There is no way to meet a 386
  instruction before you have met an 8086 one.
- **DOS `.COM`, tiny model.** One 64KB segment, `org 100h`, no linker, no
  object files, no relocations, and no segment register you have to think
  about - CS, DS and SS are all the same and never appear. The smallest
  complete x86 target that still does something real. ES shows up only where
  you ask for memory outside that segment, to reach the screen.
- **Commented NASM is the product, not an intermediate.** Every statement is
  quoted above the code it produced and every non-obvious choice is annotated,
  so the output is there to be read rather than trusted.

The compiler is the way in, not the destination: write Momo without looking at
the assembly, then look at the assembly when you want to know what happened.

**And to try out language ideas that have been rattling around for a decade,
with echoes going back further.** Various small prototypes over the years;
[Yuki](https://github.com/nrkn/yuki-js) is the one that survived to become a
reference point.

## What makes it unusual

- **The whole memory footprint is known before you run it.** No dynamic
  allocation, no recursion, so `npm run memory` reports exact code, data and
  worst-case stack - then hands the remainder back as a heap you can prove is
  safe to use.
- **Recursion is a compile error**, naming the cycle. Locals are statically
  allocated, so a recursive call would overwrite its own caller's variables.
- **Strict 8086.** No 186+ instructions; NASM enforces it on every build.
- **No externals.** The standard library is ordinary Momo. `int` is the only
  primitive that touches the host, so the whole toolchain is NASM and nothing
  else - no linker, no object files.

## Requirements

- Node 22+
- DOSBox
- NASM is bundled - `data/dos-nasm`, run inside DOSBox

## Quick start

```bash
npm install
npm test                        # compile tests, golden .asm, types - about a second
```

That much needs no DOSBox. To assemble and run, point the toolchain at your
DOSBox first - copy `toolchain.example.json` to `toolchain.json` and edit the
entry for your platform, or set `MOMO_DOSBOX`. `toolchain.json` is gitignored,
since the path is yours rather than the project's.

```bash
npm start smoke                 # compile, assemble and run in DOSBox
```

Write a program at `data/projects/<name>/<name>.momo` - the name must be 1-8
characters, since DOS is 8.3 - then:

```bash
npm run momoc -- <name>         # .momo -> .asm
npm run memory -- <name>        # what it will cost
npm start <name>                # run it
```

## Editor support

```bash
npm run editor:install          # copies to ~/.vscode/extensions, then reload
```

Syntax highlighting is **generated from the compiler's own token tables** - there
is no hand-maintained copy, and `npm run grammar` brings it back in step whenever
the language moves. `.vscode/tasks.json` adds a build task that puts compiler
errors in the Problems panel.

## Documentation

| | |
|---|---|
| **`DESIGN.md`** | The language and the reasoning behind every decision - including the two designed-but-unbuilt features and the long-term directions |
| **`STYLE.md`** | Code conventions |
| **`CONTRIBUTING.md`** | Orientation: layout, scripts, the tooling traps, and the practices that keep this honest |
| **`CLAUDE.md`** | The handful of things that differ when the contributor is an agent |

**For worked examples, read the programs.** `data/projects/*` are real programs
that the test suite compiles and runs, so none of them can drift out of step with
the compiler. `viewtest` and `fartest` are written to be read - each writes
through one name and reads back through another, so every line says why it is
true - and `smoke` is every construct in the language in one file.

[Yuki](https://github.com/nrkn/yuki-js) is Momo's predecessor.
`_reference/yuki.txt` is a Pong for a fantasy console written in it, kept here
as the benchmark for the level of language being aimed at.
