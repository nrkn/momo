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

The generated assembly is meant to be read — every statement is quoted above the
code it produced, and each instruction choice is annotated with the reason:

```nasm
; ---- for (x = x1; x <= x2; x++) ----
        mov     al, [x]
        xor     ah, ah                      ; u8 -> u16
        mov     bl, [x2]
        xor     bh, bh
        cmp     ax, bx
        jbe     .for1_body                  ; unsigned <= (both operands u8)
        jmp     .for1_end
```

## What makes it unusual

- **The whole memory footprint is known before you run it.** No dynamic
  allocation, no recursion, so `npm run memory` reports exact code, data and
  worst-case stack — then hands the remainder back as a heap you can prove is
  safe to use.
- **Recursion is a compile error**, naming the cycle. Locals are statically
  allocated, so a recursive call would overwrite its own caller's variables.
- **Strict 8086.** No 186+ instructions; NASM enforces it on every build.
- **No externals.** The standard library is ordinary Momo. `int` is the only
  primitive that touches the host, so the whole toolchain is NASM and nothing
  else — no linker, no object files.

## Requirements

- Node 22+
- DOSBox
- NASM is bundled — `data/dos-nasm`, run inside DOSBox

## Quick start

```bash
npm install
npm test                        # compile tests, golden .asm, types - about a second
```

That much needs no DOSBox. To assemble and run, point the toolchain at your
DOSBox first — copy `toolchain.example.json` to `toolchain.json` and edit the
entry for your platform, or set `MOMO_DOSBOX`. `toolchain.json` is gitignored,
since the path is yours rather than the project's.

```bash
npm start smoke                 # compile, assemble and run in DOSBox
```

Write a program at `data/projects/<name>/<name>.momo` — the name must be 1–8
characters, since DOS is 8.3 — then:

```bash
npm run momoc -- <name>         # .momo -> .asm
npm run memory -- <name>        # what it will cost
npm start <name>                # run it
```

## Editor support

```bash
npm run editor:install          # copies to ~/.vscode/extensions, then reload
```

Syntax highlighting is **generated from the compiler's own token tables**, so it
cannot drift from the language. `.vscode/tasks.json` adds a build task that puts
compiler errors in the Problems panel.

## Documentation

| | |
|---|---|
| **`DESIGN.md`** | The language and the reasoning behind every decision — including four designed-but-unbuilt features and the long-term directions |
| **`STYLE.md`** | Code conventions |
| **`CLAUDE.md`** | Orientation for contributors: layout, scripts, and the tooling traps |

`_reference/yuki.txt` is Momo's predecessor — a Pong for a fantasy console, and
the benchmark for the level of language being aimed at.
