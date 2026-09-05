# Provenance

Where Momo's ideas came from.

The author has kept a personal archive of scratchpads, prototypes and finished
work since 2003, and a set of public repositories alongside it. Momo is not a
fresh start on top of that: almost every decision in `DESIGN.md`, and most of the
unbuilt ones in `PLAN.md`, has been attempted before somewhere in it - sometimes
five times, sometimes twenty years earlier, and often as a paragraph in a readme
that was never built at all.

This document traces those lines. It exists because the other documents
deliberately do not: `DESIGN.md` argues each decision on its own merits,
`PLAN.md` refuses to infer intent that was never written down, and neither has
anywhere to say *this argument is twenty years old and has been lost four times*.

## The rule this document follows

**Name a project and a date. Never a path, and never an instruction to go and
look.**

The archive is not in this repository and never will be. It is one machine's
Dropbox folder, it contains commercial work and credentials, and most of it is
not worth publishing. So a citation into it is worth nothing to every reader but
one - which is exactly the problem `STUDIES.md` records under *say what was
learned, never where it was learned*.

The rule here is that rule applied to history rather than to technique. Where a
project mattered, what it did is written out in full below, so this page is
readable on its own. Where the upstream is public - Clay, Zingl, Doom, Human
Resource Machine, the published `yuki-js` package - it is named as upstream and
stays citable.

## Inference is allowed here, and is labelled

`PLAN.md` draws a hard line between **transcription** (a plan that was written
down, lifted) and **forensics** (working out from commits what somebody must have
intended), and refuses the second. That refusal is right for a plan, because a
Done list that is almost a record is worse than an empty one.

Provenance is the opposite case. Nobody wrote down "Momo's mixing rule comes from
a 2018 interpreter", because at the time there was no Momo. Every line below is
therefore inference to some degree, and the document is only trustworthy if it
says which degree:

- **Stated.** The repository, the earlier project, or the author says so. Momo's
  own documents name Yuki; `STUDIES.md` names Clay and Zingl; the 8088
  playground's DOSBox harness was copied across with the file.
- **Traced.** Two things match too closely to be coincidence - the same rule, the
  same worked example, the same wrong turn taken twice - but nothing says so.
- **Rhyming.** The same shape recurs, and that is all that can be claimed.

Each section says which it is.

**The first section is Stated and contradicts the files**, which is the reason it
comes first. Read it as the calibration for everything after it: the method here
is good enough to be worth writing down and not good enough to be trusted against
a first-hand account.

## What the archive under-reports

One bias runs through all of this and it has a direction, so it is better stated
than discovered.

**The archive is experiments.** Commercial work is woven through it rather than
separated out, but only a representative handful of it has been catalogued -
there is too much to do properly without a great deal more effort. So a habit that
lived mainly in paid work leaves almost no trace here, while a habit that produced
a scratch folder leaves a large one.

That skews this document in one direction: **it over-reports ideas and
under-reports conventions.** An idea gets a folder, a readme and a date. A
convention gets used on real projects for fifteen years and written down nowhere,
because nobody documents the thing they always do. §50's separation of layout from
paint is the clearest known instance and is corrected in its own section below.
Where else the same correction is owed cannot be told from the files, which is
the honest position rather than a comfortable one.

## The shortest version

| | |
|---|---|
| 2003-2008 | Layout separated from paint - as three referencing documents, as split stylesheets on white-label client work, and as a skin-authoring toolchain for desktop and web |
| 2003-2025 | Tile, isometric and voxel renderers, about eighteen of them - the game always thinner than the pixel library under it |
| 2008-2012 | Roguelikes under byte budgets, and a polyglot roguelike that drew contributors in about 27 languages |
| 2014-2016 | Text-mode screens in the browser; a fantasy machine costed out in bits before a line of it was written |
| 2018 | Seven consecutive language-and-VM projects, all benchmarked on Bresenham's line. The first of them is called **Momo** |
| 2018-2019 | **Yuki**: a JavaScript subset with bit-width types and a compile-time memory budget, published to npm, with a Pong for a fantasy console as its proof |
| 2019-2024 | The same language redesigned roughly a dozen times in readmes, mostly unbuilt. Units of measure, derived numeric types and fixed point all get written down |
| 2024 | Historic-machine emulators, one after another: 6502, Manchester Baby, Ferranti Mark 1, Atari TIA |
| 2017-2024 | Actual DOS work: QuickBASIC and Turbo C tile engines in mode 13h, on real DOS |
| Feb-Jul 2026 | An 8086 playground with a DOSBox build harness; two language notes; a rasteriser port |
| Jul 2026 | **Momo** |
| Aug 2026 | The clay and vector studies, ported in as `momolo` and `momovec` |

## The name

*Stated by the author, and it corrects what the files said.*

`DESIGN.md` says Momo is named after a cat and continues the tradition set by
Yuki, the earlier language. Two cats, one name each: Momo, who is still around,
and Yuki, who is not. The tradition is exactly what `DESIGN.md` says it is.

**The name was chosen once and used twice, for the same cat.** In March 2018 a
project called `alien-bbs` designed a typed language with no null and a virtual
machine modelled on the Little Man Computer beneath it. That language was Momo -
`MomoProgram`, `MomoCall`, `MomoValue` in its source - and its machine was built
the following month as `momo-asm`, with three further `momo-vm` attempts across
April. The name did not survive to what eventually shipped out of that line, which
became Yuki instead. **Momo is that first choice resurrected eight years later,
deliberately**, which makes the 2018 work an ancestor by name as well as by
design.

**This is the one thing in this document that the evidence got wrong.** Nothing in
either repository refers to those 2018 projects, so from the surviving files the
honest reading was name reuse - the same word twice, no continuation - and that is
what the archive's own catalogue concluded, saying so explicitly and giving its
reasons. It was not a careless reading of the files; it was a complete one that
came out wrong, and the only correction available was from the person who chose
the name. Everything below is inference of the same kind, from the same sort of
evidence.

**Why the name was set aside in 2018 is not recoverable**, and that limit belongs
here beside the other one. The author's account of it is a reconstruction rather
than a recollection - possibly holding the name back for something more ambitious
later, possibly wanting the language that shipped to carry the other cat's name,
probably some of both. So the fact is first-hand and the reason is not. Both kinds
of gap run through this document: files that are complete and point the wrong way,
and memory that is certain about what happened and blank about why.

The 2018 Momo is the first entry in the thread the next section follows.

# Threads that reached the language

## A language, and a machine to run it

*Traced, and the longest line here.*

It starts in 2004 with `nrknml`, a declarative language for describing whole
websites, fully specified and never implemented. It resumes properly in 2018 and
does not stop.

**Spring 2018** is seven projects in eight weeks, alternating between building a
machine and building a language for it:

- `alien-bbs` (March) - the design document. A typed language with no null, custom
  types as predicates, and a VM with *no registers and no accumulator*: just
  inbox, outbox, local, global and ROM byte arrays, signed 8-bit arithmetic that
  throws on overflow, and about a dozen opcodes.
- `momo-asm` (April) - that VM, built. Parse, compile, decompile and detokenize
  in one file, with the round trip asserted lossless. It has no stack and no
  registers, so a subroutine is *a whole compiled program sitting in memory*, and
  calling it means copying arguments into a fresh 256-byte memory, running it, and
  copying the result back.
- three `momo-vm` attempts (April) - the same machine redesigned around a flat
  buffer with typed access, then ported to AssemblyScript and benchmarked against
  the JavaScript version, then extracted into a fresh skeleton and abandoned the
  same day. The second one's readme ends: *"what if we just throw all this shit
  away and make a programming language with an asm like syntax?"*
- the `-lang` series (late April to May) - which is what that question turned
  into. Borrow JavaScript's parser, restrict the AST to a whitelist, walk what
  survives. Four dialects of the same program sit side by side purely to compare
  readability.

The last of them, in May 2018, is where the reason for all of it is finally
written down, and it is not in any of the compiler code. Its readme is a
three-page design document for a **2D tile-based CRPG run as a small MMO**, in
which players wake in a one-room safe space containing a bed, a replicator and a
computer terminal running a deliberately bare fantasy OS, explicitly modelled on
PLATO and early BBSes. Players write and share programs on those terminals.
Scavenging unlocks better hardware - more memory, more colours, higher resolution,
portable machines - which conveniently gives the author time to build the next
tier of terminal and then release it as an in-game unlockable.

**The language was always for an in-fiction computer that the player programs.**
That is the origin of "a fantasy console, for real hardware", eight years before
the phrase.

**Late 2018 to 2019** is Yuki, which is where the thread first produces something
shipped, and which `DESIGN.md` names. It is covered in its own section below.

**2019 to 2024** is the thread going quiet in code and loud in prose. At least a
dozen readmes design substantially the same language and build little or none of
it:

- October 2019 - a language with C syntax, sized signed and unsigned integers,
  fixed-size one-dimensional arrays, functions taking primitives by value and
  arrays by reference, and a standard library of *maths plus `length( arr )`*.
  Its stated constraint: there is a memory array, but it "is not used to store
  variables, only for communication with host".
- also October 2019 - a separate note wanting **Ada-style primitive extension, so
  that `byte extends int` gives you units of measure**, and no garbage collector
  at all, with memory freed on scope exit and an optional memory cap for
  sandboxing.
- March 2020 - a C-like grammar over raw memory, six integer types, access written
  as a type applied to an address.
- June 2022 - candidate syntax designed by feeding it to existing JavaScript
  parsers to see what tokenises.
- July 2023 - a size-coding language that is *lexically valid JavaScript* so the
  parser can be borrowed for free, and its successor reduced to one type (`BigInt`)
  and one storage location.
- December 2024 - "nscript", a 300-line specification written entirely as
  commented example code: sized number types down to `u2`, immutable by default,
  inferring *the smallest fitting type*, and `schema` types that derive a new
  primitive from a number type with a min, max, step and an overflow policy of
  clamp, wrap or throw.
- February 2026 - a strict JavaScript subset compiling to WebAssembly text, "loosely
  based on yuki-js", with no function parameters, no locals, no recursion, forward
  declarations only.
- April 2026 - the "unnamed bastard child of Lisp and C", whose default fractional
  type is **32:32 fixed point rather than float, heavily biased toward
  determinism**.

Momo is written three months after that last one. The catalogue's own summary of
the thread is that it runs 2004 to 2026 and is the longest in the archive.

## Bresenham, the fixed benchmark

*Traced, and the neatest single line in this document.*

From 2018 onward, essentially every language and VM project in the archive uses
the same yardstick program: **Bresenham's line algorithm**. Not as a feature, as a
measuring stick - the thing you write in the new syntax to find out whether the
new syntax can express anything.

It appears in the 2018 alien-bbs design as a program the interpreter could parse
but not yet run; as four competing dialects side by side in the `-lang` series; as
the timed benchmark for the too-slow interpreter that Yuki was built to replace;
as the running fixture in three forms in Yuki's immediate predecessor; in Yuki's
own examples, with `abs` implemented as a subroutine over a shared global because
functions could not take arguments; in the 2019 toy assemblers; in the 2020
fantasy-computer work, written twice, once with every variable declared into a
byte arena; in QuickBASIC on real DOS in 2022, twice, the second time decomposed
into an explicit step-state record; in the 2024 VM as the program run interpreted
and compiled and timed against itself; and in the 2024 language specification as
the sample.

**In Momo the benchmark became the library.** `momovec` (§37) is a rasteriser
distilled from Alois Zingl's Bresenham curve paper. The thing that had been the
test for eight years is now the thing being shipped, and the acceptance criterion
moved up accordingly: not "can the language express a line" but "does the tiger
draw on real 8086 hardware, matching the model pixel for pixel".

## The memory budget, counted before it runs

*Traced, and close enough in places to be near-transcription.*

`npm run memory` reports exact code, data and worst-case stack for a program
before it runs, then hands the remainder back as a heap that is provably safe to
use (§12, §13). That is not a new idea here; it is the oldest surviving one.

- **2016, `alien-bbs`** - not a BBS and not a game, but *a bit-budget calculator
  for an imaginary 8-bit machine*, written to find out whether a proposed hardware
  spec fits in memory. Palette bits, sprite-table bits and screen-buffer bits
  computed from first principles. Its variable store charges each named slot not
  only for its value but for its overhead - the lookup index, the name's
  characters, the size field, the type tag - all in bits, against a fixed ceiling,
  throwing `out of memory` when exceeded.
- **December 2018** - every variable allocated out of one fixed buffer, with the
  allocator checking the next offset against the buffer length and throwing
  `Out of memory declaring int16 'x'`.
- **2019, Yuki** - three separate static counts before anything runs: total
  declared bit lengths, each constant charged only the bits it actually needs, and
  a program size charging per AST node plus each literal, checked against a
  ceiling with `Program size exceeded: <used>/<limit>` thrown before emission.

The last of those carries the property Momo's heap has, and states it plainly:
the call stack shares the memory budget with the variables, so **the remainder
after declarations is the stack**. Momo inverts the same sentence - the remainder
after code, data and worst-case stack is the heap - because it can prove the stack
depth statically and Yuki could not.

## Two rules that came over almost word for word

*Traced.*

**Mixing widens to the smallest type containing both value ranges** (§4). The
December 2018 interpreter has `smallestType( value )`, which picks the narrowest
type that holds a number, and `biggestType( values )`, which widens a whole array
to one type. The 2024 language specification wants the same thing again, in the
opposite direction as well: infer the *smallest* fitting type for an immutable
binding and the largest for a mutable one.

**`len` rather than a property** (§19). Yuki has no member access except array
indexing, so it needs a built-in `size( g )` because `g.length` is illegal. Momo
arrives at `len` from compile-time array parameters rather than from that
restriction, but the shape is identical and the reason is the same one: a length
is a fact the compiler knows, not a field the program reads.

## Borrowing a parser, and then stopping

*Traced, and this one is a reversal rather than an inheritance.*

Everything from 2018 to 2023 in this thread avoids writing a parser. The trick,
used over and over, is to make the new language *lexically valid JavaScript* so
that an off-the-shelf parser will tokenise it, then walk the resulting tree with a
whitelist and throw on anything not permitted:

- 2018 alien-bbs - programs written as valid JavaScript call expressions,
  tokenised by a standard parser, walked with predicates that recognise only the
  allowed subset.
- the `-lang` series - the same, with four surface syntaxes tried to see which
  reads best.
- Yuki - a whitelist of 24, then 28 estree node types; anything outside throws
  `Unexpected type X` with a source location.
- 2022 - candidate syntax with type sigils designed specifically so that a
  standard parser would accept it.
- 2023 - explicitly, *"the same trick used before with the scheme implementation
  we made by abusing the js parser so we could be lazy and not bother tokenizing"*.

Momo has its own lexer and its own parser, and this is the largest single break
with the line it descends from. The break is not free and the archive shows what
it bought: every borrowed-parser language in it is a *subset* of the host, so its
syntax is constrained by what the host will already accept, and its semantics have
to be enforced afterward by rewriting the tree. Momo's syntax owes nothing to
JavaScript's, which is why constructs like `view`, `group`, parameterised consts
and `bracket` can exist at all - none of them would tokenise.

The cost is visible too. There are far more parser stubs in the archive than
parsers. Hand-written s-expression readers appear in 2018 and are carried between
three projects; parser-combinator experiments run through 2019; a tokenizer with a
parser that leaves everything unhandled as raw tokens is as far as the 2024
specification got. Writing the parser is the step at which most of these projects
stopped.

## No stack frames, and no recursion

*Traced.*

Momo's most distinctive rule - every variable, including a routine's locals, is a
statically allocated label; BP is never touched; recursion is a compile error
naming the cycle (§2) - has been arrived at repeatedly, from different directions
and for different reasons.

The 2018 VM had **no registers and no stack** as a deliberate design choice
borrowed from the Little Man Computer, and its readme works through the
consequences out loud: *"call stack?? just call - jump to program at memory
location - everything else is by convention"*. Its answer to subroutines was to
give each one its own 256-byte memory and copy arguments in and results out - the
same trade Momo makes, at a cruder grain.

Yuki went the other way, kept a real call stack, and had to charge it: two bytes
per frame, counted against the same budget as the variables, with a thrown error
at a configured ceiling. That works, and it is what makes an exact static answer
impossible - you know the ceiling, not the depth.

The 2026 WebAssembly note takes the third option and simply says: no locals, all
variables global to the unit, no recursion implied, forward declarations only.

Momo takes the third option and *proves* it. Rejecting cycles in the call graph is
what turns worst-case stack depth from a configured ceiling into a computed
number, which is the whole of §12.

## One block of memory, viewed several ways

*Rhyming, strongly.*

`view` (§17), `peek`/`poke` (§10), `far` (§16), `group` (§18) and `_ds` (§35) all
rest on the same posture: there is one address space, and a type is a way of
looking at part of it rather than a thing that owns storage.

The archive does this constantly, long before there is a language attached:

- 2016 - a framebuffer held as one buffer viewed twice, as bytes for reading
  channels and as 32-bit words for writing, so a pixel is one store instead of
  four.
- 2018 - a VM where every operand is a triple of type, location and value, and
  location is address, indirect or literal.
- 2020 - a byte arena where `declare( type, name )` bump-allocates an offset and
  hangs a getter and setter on it, so assigning to a name writes a byte at a fixed
  address.
- 2024, the 6502 emulator - memory and registers in one buffer, with A, X, Y, PC,
  S and P appended past the end of the 64 KB map, *so the registers are just
  further offsets into the same view*.
- 2024, the Ferranti Mark 1 - 20-bit words packed into byte storage, read by
  taking a 32-bit window at a computed offset and shifting, with three cases
  including one that backs the address up a byte at the end of a tube.

`view`'s rule that a window is a name for storage that already exists, and never
allocates, is that habit made into a language feature.

## Units, wanted twice before they were built

*Traced.*

§39's `unit` - a name that subtracts a permission rather than adding a capability
- was asked for twice in the archive, years apart, and built neither time.

October 2019 wanted Ada-style primitive extension so that a derived integer type
gives you units of measure. December 2024 wanted `schema` types: derive a new
primitive from an existing number type with a min, max, step and an overflow
policy of clamp, wrap or throw, so that `Degrees` is an `i16` that wraps at plus
or minus 180. In between, a 2021 experiment worked through branded nominal types
in TypeScript, composing them by intersection so that a range check becomes a
compile-time obligation instead of a runtime convention.

Momo's `unit` is the smallest of the three and the only one that exists. It takes
the nominal half and drops the range half, which is the part all three earlier
sketches spent their length on.

## Fixed point

*Traced.*

§25's fixed-point types, and §25's own note on why not 16.16, sit at the end of a
short line where every earlier appearance chose a different split for a stated
reason:

- **16:16** - the Doom engine's maths tables, listed in a February 2026 keep/remove
  analysis of that engine under "keep" without qualification.
- **8.8 signed** - what a reverse-engineering project in August 2026 found the
  Master System platformer it was modelling actually used for every speed, and
  therefore what its reimplementation had to use to match frame for frame.
- **32:32** - the April 2026 language note's default fractional type, chosen over
  float and justified as being "heavily biased toward determinism".

Momo lands on 8.8 with the scale riding beside the storage type. The determinism
argument is the one that carried across; the width did not.

# Threads that reached the posture

## A fantasy console

*Stated in part, traced in the rest.*

`DESIGN.md`'s "a fantasy console, for real hardware" is presented as a
contradiction with both halves load-bearing. The first half is not rhetorical -
the author has designed fantasy consoles repeatedly and the specifications
survive:

- **2016** - a 96x64 16-colour graphics mode and a 384x240 two-colour text mode,
  costed out in bits.
- **November 2018** - a design note whose safety guarantees come from static
  analysis rather than a VM, alongside research notes on the Atari 2600, the NES
  and the Fairchild Channel F.
- **March 2019** - a console specified from the memory map outward: a system ROM of
  256 8x8 tiles, a 16-colour palette, a 384-byte tilemap of 16x12 cells at two
  bytes each, and a sound block budgeted to the bit at 96 bits across four
  channels.
- **2019, Yuki's Pong** - the one that survived. 128x64 pixels, four foreground
  colours, 64 bytes of variable memory, a 2048-byte program limit, every variable
  sized to the bit, the constraints copied from the Fairchild Channel F. It is
  kept in this repository as `_reference/yuki.txt` and is the benchmark for "level
  of language" named in `DESIGN.md`'s preamble and in `DECISIONS.md` §15.
- **March 2020** - a console constrained by real 1970s economics instead: chip
  prices, RAM at roughly a cent a byte, three candidate screen modes worked out to
  the byte.
- **April 2021** - a 256-pixel viewport, art built from 8x8 patches of 8 colours,
  up to 50 five-colour ramps.

That March 2020 one is the hinge. It is the first time the constraints are taken
from something real rather than invented, and the difference `DESIGN.md` names -
that a fantasy console can revise its specification and this one cannot - is the
difference between it and the five around it.

`tennis`, the Pong on the branch merged in August 2026, is described in its own
commit as *loosely based on the Fairchild Channel F pong clone*. That is Yuki's
example program, re-run on hardware that will not negotiate.

## Chunky pixels, and the engine that keeps being rebuilt

*Traced, and it is the oldest continuous thread in the archive.*

Tile, isometric and voxel rendering runs from 2003 to 2025 across about eighteen
projects, and what it converges on is not a game. It is a small library for
putting pixels in a buffer, rebuilt from scratch every few years, with the game on
top always thinner than the library underneath.

Two of them state the target plainly enough to be worth reading as design
documents for Momo's own library.

**`tower-of-tempests`, 2019** - a browser roguelike that is mostly an engine.
Everything is drawn by hand into one buffer. Sprites are **2-bit** - transparent,
foreground, background - so one bitmap can be blitted in any two colours, which is
what makes the palette dynamic: wall colours randomised per level, the player's
skin and clothes generated once and then multiplied to five shades each. Lighting
is a pass that sums point lights per tile and multiplies each sprite's two colours
by the result. The font is proportional and kerned, with a wrapper for word
wrapping. Sprites are authored as a PNG and read back by thresholding. Its engine
tree is `animation`, `bitmap`, `color`, `font` and `wrap`, `geometry` with
`bsp`/`flood`/`fov-lines`/`line`, `grid`, `map`, `noise`, `random`, `scene`,
`sprite` - which is close to a table of contents for `shared/lib/`.

**`chonkpix`, 2025** - the same instinct with the game removed entirely, and its
readme says exactly what it is for: *"a stupidly simple chonky pixel engine ...
this is not designed to be the most performant or extensive 2D game engine! it is
designed to be fun for me to use"*, and it *"defers pretty much everything to the
scene, just provides a basic harness ... includes extensive lib for pixel
bashing"*.

That is Momo's posture almost word for word - a thin runtime, a large ordinary
library, and enjoyment as the acceptance criterion. Three details go further:

- **Chunky is the point, not a limitation.** The framebuffer is sized
  `innerWidth / zoom`, so the resolution falls out of how big a pixel should be.
  Momo does the same thing from the other end: the resolution is fixed by the
  hardware and `tennis` doubles its pixels to get square ones.
- **The library list is Momo's, written three years early.** Blit, composite,
  fill, line, triangles, Bresenham, colour, generated palettes and lookup tables,
  mono and proportional bitmap fonts with layout, a terminal backed by a buffer
  with a `view( cols, rows )` that slices the bottom of it, sprites with an
  animator, grid, geometry, voxels, heightmaps, random. Set that beside
  `momovec`, `mopaint`, the palette study and `std` and the overlap is most of
  both lists.
- **Spans, for the same reason.** Its central image type is
  `Row = [ row, startCol, endCol, ...args ]`, under the comment *"fastest way to
  blit or fill is row-wise"*. That is `momovec`'s scanline and edge-event model,
  and it is also the word blitting `tennis` records as intended and not yet done.
  The finding was made in TypeScript years before there was an 8086 to spend it
  on.
- **The state is module-level, not an object**, exposed through a facade of
  getters. Momo has no objects at all and every global is a fixed label. Different
  reasons, same resulting shape - which is part of why the port of a design like
  this is a translation rather than a redesign.

Both projects list sound as a todo and neither has it. So does `PLAN.md`.

## Budgets as a habit

*Rhyming, and the most persistent habit in the archive.*

Thirty-three projects between 2008 and 2026 are size-limited demos: js1k, js13k,
js4k, and self-imposed 1k and 2k budgets. The first is a 2008 entry in a "under
1 kB roguelike" challenge, shipped at 1023 bytes of source. The most recent, in
May 2026, rebuilds a 2019 competition entry from a written specification and
reaches 1021 bytes with a test suite attached.

This is why an exact static footprint reads as a feature here rather than as a
limitation, and why `npm run memory` exists at all. It is also where two working
practices come from, both of which now live in `DECISIONS.md`:

**Record the failures with the wins.** The May 2026 size-coding work produced a
table of twenty-two variants, each with an idea and a byte count, in which
hoisting draw-loop lookups is written down as having made it *worse*, and one
whole line of attack is written off as a dead end and kept only because the code
exists. Its companion project has thirty-odd numbered experiments, each with a
hypothesis, the change, the expected result, the measured result and an
interpretation, failures included.

**Normalise for the tool, not for the eye.** The same notes work out that repeated
raw strings and repeated access shapes are *valuable* to the packer, so
source-level changes that increase repetition beat source-level changes that
shorten. That is the same reasoning as `PEEPHOLES.md`: what the emitter should
produce is decided by what the next stage can do with it, not by what looks tidy.

## Measure it, and write down what did not hold

*Traced.*

`DECISIONS.md` exists to record what a choice cost, what was measured, and what
was tried and rejected. The archive has been doing this in readmes for years, and
the negative results are consistently the best-written parts of it.

- 2018 - *"Well, this was a fun experiment, but it's too slow"*, and the next
  project is the fix.
- 2019 - a VM built specifically to measure interpretation overhead, running the
  same loop three ways and reporting a ratio against native.
- 2023 - a terminal blitter's run-length merging benchmarked and found to cost a
  few milliseconds to save nothing measurable, because output write time dominates
  by two orders of magnitude either way.
- 2023 - a colour system that records, plainly, that blending in HSL shifts hues
  unpredictably, so *"we pick colors using HSL space, but we operate in RGB
  space"*.
- August 2026 - a reverse-engineering project whose closing section catalogues its
  own errors, names the recurring failure (taking a correctly-decoded mechanism
  and asserting *when* it fires without separate evidence) and credits three
  practices with catching it. Corrections are left visible rather than edited away.

That last project also adopted this repository's `STYLE.md` as its house style,
so the influence runs both ways in 2026.

`LESSONS.md` and `PITFALLS.md` are the same instinct given their own files, and
`CONTRIBUTING.md`'s *verify by running, not by reading* is a sentence a study
arrived at independently a few weeks earlier, having found that two corrections
applied and verified in one session were not there an hour later.

## The roguelike as a bar

*Traced.*

Thirty-two roguelikes between 2008 and 2025, under every constraint available:
1 kB, seven days, C#, jQuery, Small Basic, static HTML pages, and twelve languages
at once. One of them, from 2009, was published as a polyglot exercise and grew to
about 32 implementations across 27 languages contributed by twelve people,
recruited through a single newsgroup thread.

The same program keeps being the first thing written on a new machine. Its C
version - map as one string literal with a stride that accounts for the line
endings, movement accepted only if the target byte is a space - was typed into
Turbo C on real DOS in 2018, nine years after the C# original, reaching exactly as
far as that original did and no further.

**`simplerl` is the next one.** Same name as the published polyglot repository,
same shape - a map as a run of string literals, an `@`, and a move rejected unless
the target cell is floor - and its own header says why it stops there: *"the
smallest thing that is recognisably a roguelike"*, with anything further belonging
in its own project. The 2018 C port stopped at exactly the same place for exactly
the same reason.

This matters for how `DECISIONS.md` §15 should be read. That bar is a list of
programs rather than features, which is unusual, and it is unusual because the
author has a standard instrument and has used it to measure about a dozen
platforms before this one. A feature list tells you what a language has. A program
that has been written on twelve other machines tells you what it is like to use.

## Reading the machine rather than emulating it

*Rhyming.*

Momo's output is commented NASM that is meant to be read, and its documents are
full of instruction timings assembled by hand from static readings of the
assembly. §42 wants an executor below DOSBox specifically to *count what actually
ran* rather than what was read.

The archive contains both halves of that tension, done deliberately.

On the reading side: a 5 MB disassembly of a 1989 Windows game collected in 2019
towards extracting its data; and, in August 2026, a reverse-engineering project
whose stated constraint is that **no emulator was used**, so that every claim
traces to a ROM address.

On the emulation side, a dense run in late 2024: a 6502 in a single file, with two
parallel opcode tables where the metadata table doubles as a mini-assembler; a
Manchester Baby, with its store printed as a Williams tube of dots and dashes; a
Ferranti Mark 1, memory system only; and an Atari TIA model that keeps the real
per-scanline object model and priority rules while deliberately dropping cycle
accuracy. That run sits beside a design note classifying instruction sets by
operand count - zero operands is a stack machine, one is an accumulator, two or
three is a register machine.

§42 and §33 (`momo/z80`, `momo/6502`) both land in territory the author has
already walked, which is part of why they are in Maybe rather than in Questions:
the feasibility is not what is uncertain about them.

# The 8086 and DOS specifically

*Stated for the harness, traced for the rest.*

The target is not nostalgia at one remove. There is a working DOS environment in
the archive with the author's own source in it, going back to January 2017.

- **January 2017** - thirty lines of QuickBASIC: draw a ball, capture it into a
  buffer, move it around the screen, XOR away the previous copy. The
  draw-then-capture idiom in it is still in use seven years later.
- **February 2018** - Turbo C exercises, including the roguelike port above.
- **June 2022** - Bresenham in QuickBASIC, twice, the second version restructured
  as an explicit step-state record.
- **December 2024** - a scrolling tile engine in mode 13h, developed across five
  successive versions in four days. The working one syncs to vertical retrace and
  does a **dirty-tile blit**, redrawing a screen cell only where the map value
  changed; the next day's revision throws that away for a second animation frame.
  It prints free memory on exit, so headroom was the live concern. A C version
  from the same month adds a full 64 KB back buffer copied to video memory in one
  go, sets the mode by interrupt directly, and *does not store the map at all* -
  a hash of the coordinates decides whether a cell is rock.
- **February 2026** - a workshop for cutting DOS Doom apart, with a batch harness
  that mirrors a source tree into a DOS-side folder, mounts it in DOSBox, runs an
  Open Watcom build inside it, and reads the build status and log back out to the
  host.
- **July 2026** - an 8086 playground: real-mode assembly producing `.COM` files,
  with a harness that stages sources and a copy of NASM into a per-project
  workspace, mounts it as `C:` in DOSBox, builds and runs inside it, and writes
  status back for the host to read. Everything kept 8.3-safe.

**That last harness came into Momo with the file.** It is the one piece of
provenance in this document that needs no inference at all.

Two smaller inheritances are worth naming. The dirty-tile blit in the 2024 tile
engine is the same optimisation `tennis` records as intended but not yet needed,
with the same instruction to wait and see whether it is required. And the C tile
engine's decision not to store the map, generating it from a hash instead, is the
same move as the 2023 stateless infinite city elsewhere in the archive, and the
same one available to any Momo program that would rather spend cycles than bytes.

# The two ports, and the method behind them

*Stated. `STUDIES.md` is the record; this adds only what came before it.*

`momolo` (§36) and `momovec` (§37) were each distilled in a separate TypeScript
project before being ported. `STUDIES.md` describes that method and says the two
studies arrived at it independently. The archive shows a third instance, earlier
than both, and two false starts on the first one.

**The false starts.** A 200-line spike in May 2026 asked whether Clay's layout
model transfers at all - *"not a 'serious' port attempt, more a sketch to see if
we can capture the basics"* - and answered yes, alongside a feasibility assessment
arguing the fit is better than it looks because Clay is already data-oriented and
already externalises text measurement. The proper study in August reopened the
question and reached a much stricter answer. The vector study's model was likewise
not the paper directly: a line-by-line port of all 29 of Zingl's primitives had
been made in March 2026, keeping the original C verbatim in a comment above each
one, and the study distilled *that*. `STUDIES.md` records this as the vector
study's provenance running one level deeper than momolo's.

**The earlier instance of the method**, in March 2026 and not called a study, is a
QR encoder: reimplement just enough of an existing library to turn a URL into a
bit matrix, with the whole of the real library checked in unmodified *as a
reference rather than as a dependency*, and the result done properly from first
principles at 324 lines. Build the smallest useful version, keep the model beside
it, check against the model. That is the method, three months before it was named.

**And the demos are period recreations for a reason.** The clay study's two window
mockups - a Mac System 6 desktop and Windows 3.11 Program Manager - were chosen
because each asks a specific question the engine had no answer for: overlapping
windows, and children living inside a parent's client area. Both are now committed
here as scenes with their box counts. Choosing a real interface as the test case,
rather than a synthetic one, is the same instinct as choosing a roguelike as the
acceptance bar.

# What the plan inherits

Every item below is in `PLAN.md`. This section says only where each one has been
attempted before, which is often the most useful thing to know about it.

| `PLAN.md` item | Prior work |
|---|---|
| `momowad` (§41) | Doom, 2009-2026, seventeen years of it |
| The screen library (§43) | Mode 13h by hand in QuickBASIC, C and Pascal, 2017-2024 |
| A palette study | Palette generators, 2016-2024, five of them |
| A schema study | JSON Schema tooling, 2015-2025, about thirty projects |
| The editors - `momoed`, `momode`, `momove`, `momopnt` | Desktop environments 2005-2026, and a twenty-year gap between tooling built for clients and tooling built for himself |
| The layout DSL (§50) | Layout-versus-paint as convention since 2005, and as a format twice - 2004 and 2026 |
| A text adventure | About a dozen authoring engines, 2014-2023, all converging on the same complaint |
| Hosted targets (§30) | WebAssembly spikes, 2018-2026 |
| Other CPUs (§33), an executor (§42) | The 2024 emulator run |
| Sound | Three projects in twenty-three years, and one empty directory |
| A mouse | Nothing |

## `momowad` (§41)

Doom is a seventeen-year thread here and `momowad` is standing on most of it.

A WAD mod in 2009 into which exactly one monster was ever merged. A C# map
renderer the same year that leaned each wall into place with a single vertical
shear. A canvas map renderer in 2011-2012 that is one of the archive's two genuine
pair efforts. A WAD lump parser in 2016. An SVG-to-Doom-map converter in 2022 that
gets as far as sectors, linedefs and winding but stops before writing the file. A
published WAD library of the author's own, vendored back into a voxel renderer in
February 2026 to import real levels.

Three things bear directly on §41's open questions.

**A declarative WAD already exists.** A 2019 sketch proposed JSON Schema for
binary file formats, with fields carrying a bit length, endianness, an overflow
policy, and - the part that makes it work for real formats - a length and offset
that may each be either a number or a pointer into the document being parsed. Its
worked example is a WAD: the directory's length points at the header's entry
count, its offset at the header's directory offset, and each lump's extent points
into the corresponding directory entry. That is §41's format described with no
parsing code, and it is also the schema study's first customer, so those two items
share an ancestor.

**The zone allocator comparison is not an analogy.** A February 2026 analysis of
the Doom engine, written to strip it down to a general-purpose 2D DOS engine,
produced a keep/remove list on which the zone allocator and purgeable cache are
marked *"this is gold class"*, alongside the WAD and lump system, the 16:16 fixed
point tables, and the palettes and colormaps. §41's remark that it is the same
design as the zone allocator is a reading of that engine by someone who has been
through it line by line.

**Override has been seen working.** A minimal Doom IWAD kept in the DOS tree gets
small by *aliasing rather than deleting*: every lump name the engine hard-codes
still exists, with 2,438 declared lumps resolving to 361 distinct blocks - 187
sprite names sharing one patch, all 140 flat names resolving to six. Only what
cannot be faked is kept at full size. That is the override mechanism §41 wants,
demonstrated against the real engine.

## The screen library (§43)

Mode 13h has been set by hand in this archive in QuickBASIC, in Turbo C by
interrupt, and in a Turbo Pascal listing saved as reference, all against real DOS.
Its palette has been reconstructed in the browser from a 256-pixel image and
packed into 32-bit words so that converting an indexed buffer to RGBA is one
lookup and one store per pixel. Text-mode screens have been built at least six
times: an 80x25 model with three parallel buffers and run-length attribute
emission in 2014; an image-to-text-mode converter in 2015 matching glyphs by
Hamming distance over their bitmaps; a dirty-rectangle terminal blitter in 2023,
benchmarked; a bitmap-font canvas terminal in 2022 that repacks the whole font
into one row so a glyph is found by multiplication.

§43's "ask for properties, not a mode number" is the piece with no precedent. Every
earlier one of these picks a mode and commits to it.

## A palette study

`STUDIES.md` records the palette study's model as *prior work by the author, 2024*.
That work is a palette generator that builds a fixed palette **by construction
rather than by quantising an image**: walk a regular lattice in HSL described
entirely by three axis counts, fill the leftovers with a grey ramp, and then map a
colour to an index *by arithmetic on those axes rather than by searching the
palette*. It adds a power skew on the lightness axis so entries can be
concentrated at one end, with the matching inverse used on the way back, and it
generated a very large body of evidence - every axis combination rendered, plus
dithered, mapped and quantised comparisons against a third-party quantiser at five
colour counts.

Behind it: a 2016 generator that builds palettes from declarative ramp
descriptions, with a slice facility that exists so that ramps do not all collapse
to the same pure black and white; a 2018 project that tried three nearest-colour
metrics side by side - Manhattan in RGB, weighted Euclidean, and CIE L\*a\*b\* -
and shipped the cheap one; a 2023 reading of the original Doom palette into named
ramps by eye; a 2023 generator exporting to a Photoshop colour table; and a 2023
notebook that found the index-by-arithmetic trick and recorded the negative result
that forced compositing back into RGB.

The interesting Momo library really is small, as `PLAN.md` says. The model is not.

## A schema study

This is the largest unbuilt thread in the archive by count. Roughly thirty
projects between 2015 and 2025 attack the same idea: describe a data shape once,
generate everything else from it.

Form generators from schemas, seven of them. A meta-schema decomposed into about
forty single-purpose files with the TypeScript interfaces machine-generated from
it. Schema-to-TypeScript converters. Schema editors. A binary-format schema - the
WAD one above. Terse schema DSLs in 2022, twice. And in October 2025 a study of
five parallel prototypes of a schema DSL that also infers the equivalent
TypeScript type, whose readme states the central ambiguity plainly and works
through solving it, and which became a runtime type library carried in-tree in a
later project.

`PLAN.md` says the audit of that prior work is part of the study's first job
rather than a prerequisite. On this evidence the audit's finding will be that
validation, TypeScript generation and property inspectors are all thoroughly
covered, that **binary layout is covered exactly once** - by the 2019 WAD sketch,
which was types only and never ran - and that the fourth thing on §43's list, the
grammar of the text format, has no instance at all.

## The tools: `momoed`, `momode`, `momove`, `momopnt`

*Stated by the author for the diagnosis, traced for the evidence.*

`PLAN.md`'s destination list is mostly editors - a text editor, a graphical shell,
a vector editor, a shared toolkit under three image editors, and tilemap, sound
and music editors after those. Read as a fantasy-console feature list it is
unremarkable, because that is the shape one is expected to have. **Read against
the archive it is something else: a deliberate attack on a twenty-year blind
spot.**

### The blind spot, and how visible it is

The author's own account is that tooling always looked like too much work for the
return - and that this held in personal work specifically, while commercial work
demanded a great deal of it. The archive bears that out in both directions, which
is unusual for a self-diagnosis.

**Every engine in it authors its content by hand.** The 2003 tile map's data was
typed into Excel and exported as JavaScript array literals. The 2024 DOS tile
engine declares its sprites as `DATA` lines of ASCII art. `tower-of-tempests`
authors sprites as a PNG and thresholds them back. `chonkpix`'s sprite vocabulary
is a TypeScript array of tuples. Yuki's Pong has a 5x5 digit font written out as a
flat constant array. This repository is no different in kind: its scenes are
generated by host-side scripts.

**The editors that were started, stopped early.** A 2015 sprite editor that is
scaffolding only. A 2017 pixel-art editor where the preview pane is filled flat
green and never draws the sprite, and drag-to-paint is written and commented out.
A 2020 image editor that is a UI mockup. Against thirty-odd renderers and engines,
that is the ratio.

**And the same person built tooling constantly, for money.** Seven form generators
driven by schemas. Schema editors. A WYSIWYG document editor and a ticket builder.
A digital-signage playlist manager. An artwork-to-template pipeline. The skill was
never missing; it was spent where someone was paying for it, which is also why
`STUDIES.md`'s bias note applies here - most of that work is not catalogued, so
this document under-reports the strongest half of the evidence.

### Where it starts being addressed

**`rect-editor`, 2020 and revived in 2025**, is the turn. Its one-line description
is the giveaway: *"intended as a base for building document editors operating on a
fixed canvas size"* - not an editor, **a base for editors**. Thirty-two handler
files behind three modes, undo and redo as a command log where every operation
carries both its before and after state so nothing is recomputed, and visual grid
and snap grid decoupled on purpose. Its open list is honest about what is missing
and it is all the unglamorous half: arrow keys, context menu, copy and paste,
align and distribute.

That is `momopnt` - *"the library three image editors share"* - stated as an
intention five years before it had a name. The 2025 desktop environment carries
the same intent at a larger scale, with a file explorer, a text editor and a
visual schema editor on its roadmap.

### The schema study is where the two halves finally meet

`PLAN.md` already contains the sentence that closes this loop, in the schema
study's entry: `momopnt`'s three editors want property inspectors over three
different shapes, *"which is exactly where generating the interface from the
description pays for itself rather than being clever"*.

Generating an interface from a description is the thing the commercial work did
over and over for fifteen years and the personal work never once did. So the
schema study is not only a Momo library - it is the mechanism by which the skill
that was always available to client work gets pointed at the blind spot. That is
a stronger argument for building it than the two customers §41 and `momopnt` give
it, and it is not currently written down anywhere.

### The desktop metaphor underneath it

The desktop metaphor is a 2005 thread. It begins as a two-file Word document
pitching a browser-based layout and content system following "the paradigm of WIMP
operating systems", with four named builders and an argument for object inspectors
over CSS properties. It becomes code in 2014 as an attempt at a complete imaginary
computer modelled on the Xerox Alto, whose 1976 hardware manual is in the folder -
512 KB of RAM as 16-bit words, a 606x808 one-bit portrait display, a real
filesystem serialised into raw bytes, and a repaint loop that only touches pixels
that changed. The CPU folder was never started.

It is built repeatedly in 2022, and then five times in four days in January 2025:
a dirty-rect occlusion compositor that slices a rectangle into up to four remaining
pieces after another covers part of it, so each visible region is blitted exactly
once with no overdraw; that compositor extracted and benchmarked offline; native
attempts in raylib and SDL2; and a restart poured entirely into proportional fonts
with kerning. In December 2025 it becomes a real windowing environment with focus,
z-order, a taskbar, drag and eight-direction resize, whose stated motivation is
practical rather than nostalgic - tying a growing set of interconnected web apps
into coherent workflows - and whose roadmap includes a file explorer, a text
editor and a type-aware terminal shell where commands are typed functions that
pipe data by type.

`momoed`'s explorer beside a text pane, and `momode`'s single-tasking windowed
shell, are that thread arriving somewhere it cannot revise the specification.

## The layout DSL (§50)

§50 records a three-document text format - content, paint, layout - as a design
whose shape was tested and whose syntax was not.

The obvious reading of the archive is that the shape was tried twice, twenty-two
years apart, and forgotten in between. **That reading is wrong, and it is wrong in
the direction the section above predicts.** Separating layout from paint has been
continuous working practice the whole time. What recurs at long intervals is not
the idea; it is the attempt to turn the idea into a *format*.

### As a document format, twice, and unbuilt both times

In 2003 an entire website was put into XML with a hand-written DTD and transformed
client-side, with content and presentation settings in one document and the
transform in another. In 2004 that became `nrknml`, which is already the
three-document version: a pages document imports a layout document and a config
document; the layout is written in structural vocabulary rather than HTML - column
groups, header images, vertical navigation - and the config binds those ids to
concrete content and styling in three sections of its own. Fully specified, never
implemented.

Twenty-two years later the clay study built a working prototype of a
three-document format whose own comments describe its syntax as *picked rather
than designed*, and §50 is what came across when that study was retired.

Two attempts, two abandoned syntaxes. That is the actual pattern, and it is a
warning rather than a precedent: **the shape is not what has been failing.**

### As a convention, continuously

The split has been ordinary CSS practice for the author since at least 2005 -
layout in one sheet, paint in another, spelled `layout.css` and `skin.css`, or
`layout.css` and `branded.css`. White-label products are what force it, because
one layout has to carry several skins and the skins are the deliverable.

The catalogued instance is commercial work from 2005: a `main.css` whose header
comment states the convention outright - *"Additional styling is provided for
branding"* - with per-brand override sheets beside it for six brands. The rest of
that practice is in client work that is not catalogued and mostly never will be,
so this document can confirm the habit and cannot measure it.

### As a type system and a toolchain, on the desktop as well as the web

The strongest instances are 2003 to 2008, and several are desktop rather than
browser.

- **2003, 2004** - skinnable window chrome in Delphi. A look-and-feel playground
  built from a dockable-toolbar suite, and separately a form that intercepts the
  non-client paint message to draw its own frame and chroma-keys the remainder.
  Skin as a thing applied to a window rather than a property of one.
- **2007, `SkinGenerator`** - a Windows Forms application for authoring skins and
  exporting them as nine-slice PNG sets. Its model is four levels deep: a skin
  owns box groups, which own boxes, which are ordered stacks of layers, each layer
  naming edges, per-corner radii and a colour. Colour is deliberately indirect -
  pick a primary and a secondary and the app derives the gradient ramps through
  HSL - so recolouring a whole skin is two clicks, and the saved documents are
  mostly the same design in different colours. **This is the paint document,
  authored on its own, with no layout anywhere in it.**
- **2008, `Slicer` and `SimpleCssLayoutGenerator`** - the pair. One cuts a bitmap
  into a nine-slice set; the other takes those slice dimensions and emits the div
  scaffold and the stylesheets. Paint authored in one tool, layout generated in
  another, joined by six numbers.
- **2008, `iaml`** - the design note that names the split as types. On one side
  `Skin`, made of a bitmap plus slicing plus padding, and `SkinSegment`. On the
  other `Box` and `ColumnSet`. And then `SkinBox` and `SkinColumnSet` as the
  *composition* of the two, with rules for when a skin is positioned rather than
  nested depending on whether it has alpha and whether the columns are equal
  height. Paint and layout as separate types that combine, rather than one type
  with colour fields on it. Eighteen years before momolo.

### It is already built here, which changes what §50 is for

`momolo` (§36) is pure geometry and knows nothing about text, colour, borders or
drawing - `STUDIES.md` calls that the largest single departure from Clay - and
`mopaint.momo` is, in its words, the layer momolo deliberately does not have.

That is `layout.css` and `skin.css` as a library boundary. The geometry line was
not a discovery of the clay study so much as the author's twenty-year working
convention arriving somewhere it could be enforced by a module boundary instead of
a filename.

So §50 is not proposing the separation. The separation ships. §50 is proposing a
syntax for it - which is precisely the half that failed in 2004 and was left
undesigned in 2026, and precisely the half `PLAN.md` says is unsettled.

## A text adventure

*Traced, and it is the most-attempted unbuilt thing in the archive.*

The last item on the acceptance bar (`DECISIONS.md` §15) has more prior art behind
it than anything else on that list, and the prior art has a finding in it that
bears directly on how it should be done here.

### The authoring language, attempted about a dozen times

Gamebook engines in 2014, 2015 and 2020 - the last of them making each numbered
paragraph a Markdown file and each choice an ordinary Markdown link. A Twine story
in 2020, restarted in TypeScript in the same folder. A text adventure in February
2021 with no state object at all, only an append-only log of `set` tuples answered
by reading backwards - event sourcing - restarted four days later on a hash router
with a save-game store. A dialogue engine in March 2023 with a real condition
language: a tokeniser and recursive parser for `!`, `&`, `|` and parenthesised
grouping over a set of state keys.

Then three engines in nine days in April 2023, which is the run worth reading in
order.

- **The first** writes content as TypeScript data, with a tagged-object
  requirement algebra - `kallof`, `kanyof`, `koneof`, `knot`, `kand`, `kor`,
  nestable arbitrarily - and it has tests. Its readme is already dissatisfied with
  it.
- **The second** makes the game HTML with extra tags and the engine a tree
  rewriter: `<k>` query leaves, `<all>`/`<any>`/`<none>`/`<one>`, `<if>`, `<match>`
  with `<case>` and `<default>`, and `<give>`/`<take>` that execute where they are
  reached so nesting one inside a failing branch is how you make it conditional. A
  full specification. The same folder holds a counter-proposal to itself titled
  *"what if it's just fuckin function yo"*.
- **The third** implements the cut-down version, and it works - sections in a
  `<template>`, links carrying `give`/`take`/`set`, a small arithmetic evaluator
  for numeric variables.

### The finding, which is a sentence in the third one's readme

> *"This is not going well with adding new features... But then it's a dumb
> programming language! I don't want to do that. What's the middle ground?"*

That is what the whole thread discovered, twelve times. **An authoring format for
a text adventure grows conditionals, then state, then variables, then arithmetic,
then scoping and includes - and at that point it is a programming language, badly.**
The section it was written under goes on to sketch named reusable test blocks,
includes, and scoped keys addressed by path. That version was not built, and on
this record it would not have been.

**Momo is the first context in which the question does not arise.** The
programming language is already here, it is not the deliverable, and it has
conditionals, state, arithmetic and includes that somebody already had to design.
A text adventure in Momo is a program. `DECISIONS.md` §15's last item has been
blocked twelve times by a problem this repository does not have - which is worth
knowing, because it means the difficulty is content rather than machinery, and
those want different amounts of time.

### The content half is further along than the machinery

The recurring test corpus is not invented. Fighting Fantasy gamebooks were
transcribed by hand and then, in 2023, through a completed OCR-and-verify
pipeline; *Scorpion Swamp* was transcribed whole - rules, character sheet
instructions and all - specifically as a stress test for one of the engines above.

And several projects use *Vampire: The Masquerade - Bloodlines* as their content,
repeatedly enough to be a habit rather than a coincidence: a character creator in
2021, a fifth-edition data model in 2022, a terminal prose engine the same year
whose mechanic is that choices *rewrite the sentence you are already in* rather
than branching, a dialogue engine in 2023 using the game's opening as test
content, and two of the April 2023 engines running its warehouse tutorial. There
is also an Illustrator file mapping the whole Santa Monica hub as a connected
graph of screens, with one room built against it - existing material reorganised
into the shape a text adventure needs, which is the part of the job that is not
programming.

### One shape worth stealing

The 2026 text application server - built over a month with no runtime
dependencies, its design floor stated as *A-Z, 0-9 and space, 40 columns,
line-based input, no colour, no cursor movement*, so it can face genuinely old
hardware - models a screen as a typed part list (paragraph, headings, menu, table)
flattened only at render time, with exactly one response type per screen.

A text adventure on this machine has that same problem: the screen is a structure
that gets flattened, and the input is a menu or a line, and nothing else. That is
a data shape rather than a language, which is precisely why it is the half worth
carrying across.

Two older projects are about delivery rather than structure and are worth keeping
in view for the same reason. A Legend-of-the-Red-Dragon-style door game in 2025,
rendered as pre-HTML-2.0 pages. And a fictional dial-up BBS in 2015 whose entire
point is the transmission: the server returns at most one character per request,
rate-limited to about 37 characters a second and dropped one time in five, so text
crawls onto the screen like a bad connection, with control flow riding the same
channel behind an escape prefix. On a machine that genuinely is slow, that stops
being an effect and becomes the default - which is the sort of trade
`DESIGN.md`'s "slow is acceptable where the work still gets done" already licenses.

## The rest

**Hosted targets (§30).** WebAssembly has been tried repeatedly and never kept: an
AssemblyScript port of a VM dispatch benchmarked against the JavaScript version in
2018; toolchain spikes in 2019 and 2020; bitmap and memory-layout experiments in
2021; a WebAssembly-text backend for a toy VM in 2024 that survives only as build
output because its source was deleted; and the February 2026 note designing a
JavaScript subset that compiles to WebAssembly text. §30's argument - that the
abstract machine does not change and only the emitter and a shim do - is the thing
none of those had, because none of them had an abstract machine already pinned
down by a working target.

**Dropping the assembler (§31).** The 2024 6502 emulator's opcode metadata table
doubles as a mini-assembler: name and addressing mode in, the right one, two or
three bytes out. That is §31's mechanism at 6502 scale, written for a different
reason.

**Self-hosting (§32).** Little precedent, and the closest thing to it is a 2024 todo
list whose remaining items are *"call stack should be in memory, not separate"* and
*"code (as machine code) and data should be in memory together"* - the two problems
§32 has to solve, noticed and not solved.

**Sound** has its own section below, because it is the one item here where the
archive says something stronger than "no precedent".

**A mouse.** Plenty of pointer *handling* and no pointer *driver*. The archive has
click-to-direction conversion worked out several times over for the 1 kB
roguelikes - which third of the canvas was hit, or an angle binned into four,
eight or sixteen sectors, with the quadrant boundaries painted as an HSL wheel to
check them - a hand-drawn cursor blitted into a software framebuffer in the 2025
native desktop attempts, and hit testing done by walking a command list backwards
in paint order. Every one of those receives a position from a host that already
tracked it. Nothing anywhere talks to a mouse: no DOS driver interface, no
interrupt, no packet decoding. So the hard half of §24's mouse callback has no
ancestor here even though everything downstream of it does, which is worth knowing
before estimating it.

## Sound, which is the deepest blind spot here

*Stated by the author, and the archive agrees emphatically.*

The account is that the skill was acquired and then never connected to anything.
In an era before the archive begins - pre-2003, with no surviving backups - a
considerable amount of time went into learning to author music in FruityLoops and
to edit and author audio in one of Sony's tools. The thread was then simply never
picked back up. Almost every project since has ignored sound on the understanding
that it would be got to later, and then the project was abandoned or the work went
somewhere else.

**The archive is unusually decisive about this.** Of the projects catalogued from
2003 onward, three touch audio at all:

- **2019** - the fantasy console, and the only one where sound actually plays.
  Four channels budgeted to the bit: 12-bit frequency, 6-bit duration, 4-bit
  volume and 4 bits of pulse width, 96 bits in total. Pulse waves synthesised by
  computing 8192 harmonic terms, noise as a one-second random buffer through a
  narrow bandpass. **The melody data and the oscillator structure are both
  third-party.**
- **2020** - a three-layer audio bed for a tavern scene: looping music, looping
  ambience and a one-shot spoken line at deliberately lopsided volumes, answering
  the single question of what mix reads as "a tavern" without drowning the speech.
  **The ambience is somebody else's field recording**, and is almost the entire
  size of the folder.
- **2024** - the sound counterpart to the Atari TIA model. About 350 of its 450
  lines are a verbatim 1997 hardware reference pasted into a comment. The code
  beneath is the register file and a `start()` that creates an audio context and
  two oscillators and then stops at the comment `// set inital waveforms`.
  **Nothing makes a sound.**

So in twenty-three years: one playing implementation whose music is somebody
else's, one mixing test using somebody else's recording, and one stub.

### The empty folder

In March 2014 the author worked through Nathan Whitehead's PL101, the
write-your-own-programming-language course. Homework 1 survives complete and
working - Scheem, a Scheme subset, with a PEG grammar, an environment-chain
evaluator and a Mocha suite.

Beside it is a directory named `Tortoise`, which is the course's second project.
It was created on 4 March 2014 and it contains nothing. It has contained nothing
for twelve years.

That is the most exact artefact of this blind spot in the whole archive, and it is
better evidence than the three projects above, because those at least record an
attempt. This one records the intention and no attempt: a language project, by
somebody who has designed a dozen languages, abandoned at the point where the
subject became sound.

### What that means for `PLAN.md`

`PLAN.md` names sound as one of two capabilities missing under the entire
destination tier, and notes that §22's port I/O was justified partly by the PIT
and the speaker - so the mechanism is reachable and the hard part is not access.

**Sound is therefore the item on that list most likely to be underestimated, and
for a non-technical reason.** Everything else there has at least a failed attempt
behind it, and a failed attempt tells you where the difficulty is. Sound has one
empty directory and two borrowed assets. Nothing in twenty-three years establishes
how long it takes this author to go from silence to a tune he wrote, because it
has not once been done.

**It is the same shape as the tooling blind spot, one step further out.** There,
the skill existed and lived in commercial work; here, the skill existed and lived
before the archive started. In both cases the capability is real and has never
been wired to his own projects - which is an argument for treating sound the way
`momoed` and `momopnt` are being treated, as a thing to attack deliberately rather
than a thing to get to later. Getting to it later is precisely the documented
failure mode.

# What has no ancestor here

Stating what is inherited is only useful next to what is not. The following are
Momo's own, on this evidence.

**Read the list against the bias named at the top.** Everything here is an absence
of evidence in an archive that records experiments well and conventions badly, so
each entry means *no folder does this* rather than *this was never done*. §50 is
the worked example of that failing: it looked like a twenty-two-year gap and was
in fact continuous practice, invisible because practice does not leave folders.
The entries most likely to be wrong for the same reason are the ones that describe
a working habit rather than a mechanism.

- **Commented NASM as the product.** The archive has plenty of generated code and
  plenty of readable expansions kept beside golfed originals, but nothing where the
  output is the artefact meant to be read and the input is the convenience.
- **Recursion rejected by name, with the cycle reported.** The no-stack posture is
  inherited; proving the call graph acyclic and turning that into an exact number
  is not.
- **`view`, `group`, `far`, `_ds`, `_cf`.** Each answers something specific about
  this machine, and none has a shape in the archive beyond the general habit of
  viewing one buffer several ways.
- **`bracket` (§48).** Born here, from a real defect in a real port.
- **Three documents under one section-number namespace**, with a design moving
  from `PLAN.md` to `DESIGN.md` and its number travelling with it. The archive
  contains readmes that are design documents, readmes that revise themselves in
  place with strikethrough, and readmes that catalogue their own errors - but no
  structure over several of them.
- **A test corpus weighted toward diagnostics**, and every program's generated
  assembly committed as a golden expectation. The habit of recording failures is
  inherited. Making the failures executable is not.
