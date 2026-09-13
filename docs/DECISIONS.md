# Decisions

The record: what a choice cost, what was measured, what was estimated and missed,
what was tried and rejected, and what an earlier draft of a section believed
before it met a compiler.

**This is not a description of how Momo works** - that is `DESIGN.md` - and it is
not what will be built next, which is `PLAN.md`. It is how the system came to be
the way it is.

## Why it is separate

`DESIGN.md` grew as the only place any of this could live, so the record ended up
interleaved with the description, paragraph by paragraph. That made the document
hard to review: a reader wanting to know what the language *is* had to sort it
out of measurements, corrections and abandoned alternatives, and the reader who
gave up at §9 was not being careless.

Separating them is not a judgement that the record matters less. This project
writes down what a decision cost - `STYLE.md` asks for it explicitly, and a good
share of the value in these documents is the entries admitting an estimate came in
under, or that a claim had drifted. **That material deserves somewhere it gets
read deliberately rather than skipped on the way to a rule.**

## The line

The test that decides where a paragraph goes:

- **Design** is present tense and about the language. *"Signed division by a power
  of two is not just `sar`."* It stays in `DESIGN.md`.
- **The record** is past tense and about the project. *"The estimate beforehand
  was 9.7%, and the shortfall is entirely the first trap."* It comes here.

A paragraph that fails the test in both directions is usually two paragraphs.

## Numbering

Sections carry the same numbers as in `DESIGN.md` and `PLAN.md` - **one namespace
across all three** - so §18 is `group` wherever it appears. The number tells you
the topic; the file tells you which aspect.

That means a number can legitimately appear here *and* in one of the others: the
design of `group` is `DESIGN.md` §18, and what it displaced is §18 below. What
cannot happen is the same aspect in two places.

---

## 14. Testing

### Lowering `local` in the printer found an under-stated stack

The round trip skipped every program that loaded a private, because a printed
program is one file and `local` names a file as its owner. That was a fifth of the
corpus and it included `tennis`, `momolo`, `simplerl` and the file that exists to
test `local` - the parser's only test was skipping the programs most likely to
break it.

Closing it took the round trip from 62 assertions to 77, and turned up a bug that
had been sitting behind the skip. **The emitter recorded each routine's expression
temporaries under its name while the call graph is keyed on its label**, so for a
`local` routine the lookup asked for `build__pushElement`, found `pushElement`,
and counted zero. §12's worst-case stack was under-stated for any program with a
private sub that uses a temporary, and since `_hstack` is what the heap starts
below, the heap was over-stated by the same two bytes. `momolo` and `mlodemo` were
both wrong.

**Nothing had ever failed**, and nothing could have. The golden tier compares
committed output against itself, so it agreed with the wrong number; tier 2 runs
programs that never came close to exhausting the stack; and the one tier that
compiles a program twice and compares was skipping exactly the programs that had
private subs. A gap in coverage and a bug in the thing it did not cover is not a
coincidence - it is the same fact twice.

### What the change cost

Nine sites in the printer and five in the resolver, plus two AST fields that
exist for printing rather than for emitting. The awkward half was that `labelFor`
mangles what reaches the data section and `local` also applies to what does not:
a `local const` had no label at all - 22 of them, the commonest shape - and a
`local view` took `safeLabel` rather than `labelFor`, so its label was never
mangled and two files declaring `local view x` would have collided rather than
been two views. That last one was a latent bug of its own, and it emitted nothing
today only because the one `local view` in the repo is a view of a `far` region.

`len()` needed a field of its own. Its target deliberately carries no `label`,
because pruning collects that key by name and asking a length must not be what
keeps an array alive - so the printer gets `targetLabel`, which pruning cannot
see.

Two emitted comments changed to name things by label rather than by source name:
a routine's banner, and `; segment of`. Both sit directly above or beside the
label they describe and now agree with it. 51 lines across 8 files, and no
instruction moved.

---
## 15. Acceptance test

An early answer to "is this subset useful enough yet", from when that was still
an open question. It survived many iterations of DESIGN.md and acquired more
standing than it was ever given - README still calls it "the bar it is held to" -
which is why it sits here now: it is a true account of how the project decided it
was working, and it stopped describing the system a long time ago.

Its one outstanding entry is a `PLAN.md` item rather than a line in this table,
because it is the only part still carrying intent.

### The bar, and what met it

The original bar: the subset is "useful enough" if it compiles hello world,
fizzbuzz, bubble sort, sieve of Eratosthenes, a string library and a text
adventure. Yuki (`_reference/yuki.txt`) is the stretch target - nothing in that
file trips the type rules.

Where that stands:

| | |
|---|---|
| Hello world | `hello` - hand-written asm, and trivial in Momo |
| Fizzbuzz | inside `smoke`, verified end to end |
| Arithmetic, arrays, loops, branches | `smoke` - every construct in one program |
| A standard library | `shared/lib/std/io.momo` |
| Dynamic allocation | `heaptest` - a bump allocator in Momo |
| Compile-time tables | `consttst` |
| Sieve of Eratosthenes | `sieve`, and `bitsiev` bit-packed on the heap |
| Recursive algorithms | `qsort` (quicksort) and `hanoi` - explicit stacks on the heap |
| Text-mode screen library | `shared/lib/std/screen.momo`, verified by `scrtest` |
| String library | `shared/lib/std/str.momo`, verified by `strtest` |
| Text adventure | not yet attempted |

**Only the text adventure is left**, and nothing in the language blocks it. The
string library was the last item with a missing feature behind it: routines take
scalars, so it needed a runtime address, which is what `peek`/`poke` (§10) are.
Graphics is not blocked either - §16 is built, so the text buffer and mode 13h are
both addressable as memory.

Two things have since joined the list that were never on the original bar:
`grptest` for entity pools (§18), and `cftest`,
which opens a file and notices when that fails - the first Momo program that
could find out the machine said no. `viewtest` (§17) and
`peektest` (§10) make four.

**Dynamic allocation has an answer that is not an allocator.** `view` partitions
the heap into named regions at compile time, so `heaptest`'s bump allocator is now
the interesting case rather than the default one.

The bit-packed sieve is the most demanding program written so far - 1000
candidates in 126 bytes of heap, using `_heap[n >> 3]` with a runtime shift
count. Writing it found two real bugs (§4, §6), which is exactly what it was
for.

---

## 16. `far` regions and ES

Written out in full before it was built, and corrected rather than rewritten when
it landed. Most of what it got wrong, it got wrong about its own cost.

### What it cost

**The instruction cost was near zero, as expected.** `mov`, `push` and `pop` gain
a segment-register operand class, and memory operands gain a `26h` prefix. No new
mnemonics: the subset in §1 is unchanged.

**Nothing was paid by programs that do not use it.** `push es`/`pop es` appear in
the int helpers only once something has actually put a segment in ES, so adding
the whole feature moved no existing generated output.

Sizing beforehand: comparable to the heap work, slightly more - a `far` keyword
and declaration form, a new symbol kind carrying segment, offset and extent, ES
handling plus a tracking peephole in the emitter, and `push es`/`pop es` in the
int helpers. The tracking peephole is the part that did not happen (§34).

### Two things the design sketched wrongly

**ES loads go through DX, not AX**, which is better than the section originally
sketched. It had budgeted a push/pop under "setting ES needs AX"; §9 documents DX
as scratch and never live, so no register needs saving at all for a far store
with a constant index.

**Redundant ES loads were claimed as a performance problem, and are a much
smaller one than that.** The claim compared the ~6-cycle load against the ~16
cycles of the store *in isolation* - a third again, which sounds serious.

**That isolation was the error.** Measured against what Momo actually emits around
the store, in a constant fill of mode 13h - the best case, no generator involved:

| | cycles | share |
|---|---|---|
| Loop machinery - memory counter, expanded branch, `jmp` back | 85 | 55% |
| `push`/`pop` saving AX while the index is computed | 27 | 18% |
| The store itself | 16 | 10% |
| **The ES load** | **6** | **4%** |

The ES load is the smallest item in the loop, and the loop machinery is fourteen
times larger. `rndpix` is worse still: its generator costs ~421 of ~588 cycles per
pixel, leaving the ES load at **1%**.

### And the blitter shape does not rescue it

`tilefill` is the shape hoisting was designed for - 64 far writes per call, one
segment - measured over a full screen of 1000 tiles at ~19.7M cycles:

| | share | |
|---|---|---|
| Inner loop machinery | 30.2% | register counter, short jumps (§29) |
| Index recomputation | 23.4% | `dest`/`src` reloaded per pixel; SI and DI are free (§9) |
| `push`/`pop` per pixel | 9.6% | saving AL while the index is computed |
| The remaining `* 320` | 5.7% | odd residue 5, so behind `-o` (§26) |
| **ES load** | **2.1%** | what hoisting removes, net of `push es`/`pop es` |
| The two `shl` reduction left behind | 2.1% | unrolling would make this ~0.6% |

Hoisting is last but one, in the shape it was designed for.

That table is *after* §26's strength reduction, which took the screen from 19.7M
cycles to 18.0M - the row that read "multiplies in row setup, 15.2%" is gone, and
the two shifts that replaced it are now smaller than the ES load itself.

**The table is the performance roadmap**, and the order to work down it is: a
register-held loop counter, then holding `dest` and `src` in SI and DI instead of
reloading them, then the odd-residue multiply. Keep it measured rather than
estimated - **every entry on it has been wrong at least once**.

### Two options rejected

**`AH=48h` is dropped, not deferred.** It buys DOS's bookkeeping - a memory
control block the system knows about - which matters only for `EXEC` or going
resident, neither of which Momo can do. Meanwhile DOS has already granted a `.COM`
far more than its own segment (§13), so `AH=48h` fails until the program shrinks
its own block with `AH=4Ah`, and shrinking invalidates `_hsize`. Cost with no
benefit.

**`=` rather than a dedicated keyword.** Everywhere else `=` means "has these
contents", whereas for a `far` declaration it names an address - and Turbo Pascal
used a separate word for exactly this (`absolute $B800:$0000`). Rejected anyway:
`far` already announces that an address follows, and one more keyword is not worth
the small gain in precision.

---

## 17. `view`

Written out in full before it was built - `DESIGN.md`'s preamble names §16, §17
and §19 as the three that were - and corrected rather than rewritten when it
landed. These are the corrections.

### What it cost

**One emitter change, two tool changes, and no codegen.**

That views are written last in the file, and are therefore forward references from
the code that uses them, was measured before it was relied on rather than assumed:
a hand-written probe confirmed NASM resolves a forward-referenced `equ` as a
displacement under `-f bin`.

### What the design did not anticipate

**`const view` was not in the plan.** The read-only window onto otherwise-writable
storage was added because the rules as written had no way to hand out part of a
mutable buffer as read-only.

**The two compiler special cases went, but not the way the section argued they
would.** It expected them to go *as source* - that `_heapw` and the register
halves would be re-spelled as ordinary views. They cannot be: `_heapw` is unsized,
which the rules make an error, and the register halves alias a scalar rather than
an array. What they share with a view is the *mechanism*, not the spelling.

So the claim was half right, and it is worth being clear which half: a feature
that subsumes a special case is worth having whether or not the special case can
be re-spelled in it, but those are two different claims and only one of them
survived contact.

All 19 committed programs stayed byte-identical across that change, which is what
makes it a refactor rather than a rewrite.

### The one-byte bug it found

The memory report counted only word-width reserved globals, on the reasoning that
every byte-width one was an alias - true until `_cf` arrived, which is real
storage. Any program reading the carry flag under-reported its data by the one
byte `_cf db 0` occupies. Asking the symbol whether it is an alias, rather than
inferring it from a width, fixes it: `cftest` went from 53 bytes to 54.

---

## 18. `group`

### What it displaces

An earlier idea - allowing a parameterised `const` whose body is an lvalue to be
**assigned through** - was motivated almost entirely by wanting typed field
accessors with a runtime index:

```momo
const u16 hpOf( u16 i ) = party[ i * 4 + 2 ]
hpOf( target ) = 100                              // assigning "to a const"
```

`group` delivers that directly, with better syntax and without the squint of
apparently assigning to a constant. Assignable lvalue-consts remain conceivable
for other named computed locations, but they drop from compelling to occasionally
handy - not worth the confusion on their own.

### The pair that a naming rule found before the feature did

`moflow.momo` shipped `rowFirst` and `rowCount` as two arrays over `maxFlowRows`,
read at the same index everywhere and by three files. That is the
structure-of-arrays shape this section exists for, and what surfaced it was not
the shape: it was that they are the only public names the file exports without
its own prefix, where `flowW`, `flowRowCount` and `flowOverflowed` all carry one.
§11 records that a library prefix is a namespace rather than a hidden boundary,
and a `group flowRow` supplies the namespace and the pairing in one declaration -
`flowRow[r].first` where two loose arrays had to be kept parallel by hand.

**The rename is the whole diff in the assembly.** Same instructions, same
addressing modes, same widths - `mov ax, [flowRow__count + bx]` where it read
`mov ax, [rowCount + bx]` - which is §18 being sugar over the pattern rather than
a layout of its own, restated on a file that had already written the pattern out.

---

## 20. Questions that were answered

§20 in `DESIGN.md` is the list of what is still unsettled. These are the entries
that stopped being open, kept because how a question got settled is worth more
than the fact that it did - and because for a while this was the closest thing the
project had to a record of what had been built.

### How a nested structure should be built - answered by §48

The question named three candidates and rejected all three: **§19's routine
parameters**, which make closing structural but put the body in a named sub written
elsewhere - forty nodes becomes forty subs, and writing the body *in place* is the
whole ergonomic win; **parser sugar**, where a general form is a macro system and a
specific one puts a library's name in the compiler; and **expressing the tree as
data**, which removes the problem rather than solving it and cannot loop or take
parameters, which the existing scenes do.

**The answer was a fourth option none of those three is.** A *declaration* form
naming two routines as a pair is not a macro system - there is no substitution, no
hygiene question and no arbitrary code - and it does not put a library's name in
the compiler, because the library names its own pairs. The rejection of parser
sugar was right about both shapes it considered and the paragraph simply did not
reach a third.

Worth keeping for the shape of the mistake rather than the answer: the question had
been open since §36 landed, and what closed it was not new information. Everything
§48 rests on was true when the question was written down.

**The half it does not answer is the config carrier**, which the question named in
the same breath - `cfg` is a mutable global consumed by the next builder call, and
§48 sharpens the misreading rather than fixing it.

That half turned out to *be* a language question after all, which is why §49 now
exists. It looked like a library problem for as long as the premise in
`build.momo` went unexamined: fourteen optional fields, and no spelling for them.
Measuring found a corpus whose largest routine takes six arguments and whose boxes
carry 2.2 settings, and found that `cfgReset` is default arguments implemented by
hand against Momo's static parameter slots. Neither fact was new. Both were one
count away the whole time.

### Graphics - no longer blocked (§16)

`int 10h` needs no extra instructions but costs an interrupt per cell. Direct
buffer access replaced that: `far` is built, so the text buffer and mode 13h are
ordinary memory, and `view` names a row or a tile inside either.

What remains open is a *library* rather than access to the hardware, and that is
still in §20.

### Port I/O - built (§22)

Two instructions, needed for EGA/VGA planar modes, the PIT and the speaker. It was
out of scope until a program wanted one of those.

**By the time it was built three things wanted it, and the one that first argued
for it was still not written** - the scroll. Timing and two-player input were the
other two.

### `bool _cf` - built (§10)

DOS and BIOS report failure in carry, and nothing in Momo could see it. Read-only,
and captured only when something reads it, so a program that ignores carry pays
nothing.

### `peek8`/`poke8`/`peek16`/`poke16` - built (§10)

The rules, the addressing comparison and the argument against a runtime `view` are
all §10's now, beside the feature. Three things about how the question was settled
are worth keeping here.

**It was not a blocker for colour, contrary to an earlier note in §20.** Writing
coloured text always worked as long as the string was in scope, because indexing a
known array is ordinary:

```momo
for ( i = 0; msg[i] != '$'; i++ ) {
  writeAt( col + i, row, msg[i], attr )
}
```

Inline always worked; only *factoring it into a library* needed an address
parameter. The note claimed more than that for a long time.

**Four builtins rather than a `_mem` array at offset zero.** `_mem[at]` reads
nicely for bytes, but a `_memw` would scale its index by two, which is wrong when
the index is a byte address - and that inconsistency sinks it.

**The codegen prediction held.** §20 guessed roughly `mov bx, ax` / `mov al, [bx]`,
and that is exactly what it emits.

### Strength reduction for powers of two - built (§26)

`i * 4` emitted a `mul` (~120 cycles on an 8086) where two `shl` do, and `x / 8` a
`div` (~160) where `shr` does. Faster *and* smaller, so it lives in the normal
emitter rather than behind a flag. §26 records how far to take it and the two traps
involved, and DECISIONS §26 what it measured.

---

## 22. Port I/O

### What wanted it, and what still does not exist

It waited for the reason §20 gave: out of scope until a program wanted it. **The
program that wanted it was Carmack-style scrolling** - coarse scroll plus fine
scroll plus adaptive tile refresh, which is how Commander Keen moved an EGA screen
smoothly on hardware with no blitter.

By the time it was built three things wanted it, **and the scroll was the one
still not written**. The other two were timing, which retrace polling answers
without touching the PIT (§22), and two-player input, which is still unfinished.

**Two-player input is the one the section did not finish.** BIOS `int 16h` reports
keystrokes rather than key state: no key-up, and no way to see two players holding
keys at once. Reading scancodes needs port `0x60`, and polling it means masking
IRQ1 at the PIC first, or the BIOS handler consumes every scancode before the
program sees it. That is a keyboard module with a hazard of its own - **a masked
IRQ1 left behind is a dead keyboard** - and it wants its own design pass. Whether
such a reader belongs in `std` at all is still open, and §20 has that question.

### What it cost

**Two mnemonics - §1 went from 37 to 39**, the largest single addition to the
subset since it was written down, and the reason this needed a section rather than
a bullet. No segment involvement, and §12's static memory analysis untouched,
because ports are not memory and nothing here allocates.

Six files, all doing what `peek`/`poke` already did: `tokens`, `ast`, `parser`,
`resolver`, `emitter`, `printer`. The lexer and the call graph needed nothing.
Nine compile tests and one project.

**The claim about DX was half right, and the half that was wrong is the whole of
the codegen.** The section said "no new register pressure beyond DX, which §9
already documents as scratch and never live". True of DX at rest - but a port has
to *stay* in DX from the load until the `out`, and `mul` and `div` both write DX.
So `out8( port, u8( n * 3 ) )` with the port parked in DX emits a multiply between
the two and sends the value to whatever the multiply left there.

"Scratch and never live" describes a register nothing keeps a value in, and this
was the first construct that needed to. The rule that came out of it - constant
port loaded last, computed port pushed - is in §22.

**The subset assertion did exactly its job.** The first full run after the emitter
worked failed with `"out" (in porttest.asm) is not in §1's table` - the code was
right and the documentation had not caught up, which is the direction §14 built
that test to catch.

### The testing hierarchy, paid for rather than argued

§22 sets out three tiers and says only the first is automatic. That was written as
an argument and has since been settled by an incident.

A raw keyboard reader built on these builtins **worked perfectly under DOSBox and
dropped keystrokes on 86Box**, because DOSBox hands over the next byte from the
controller immediately where real hardware takes about a millisecond - so a drain
loop really drains on one and collects a single byte on the other. Nothing in tier
2 could have caught it, and three plausible explanations were wrong before the
right one.

`PITFALLS.md` records the specific bug. The general form is the one worth keeping:
**a passing DOSBox run means the logic is right, not that the program works.**

### Three things deliberately out of scope

- **A graphics library.** §20 separates "access to the hardware" from "a library
  over it"; §22 is the first, and mode setting, sprites, clipping and the scroll
  bookkeeping are the second.
- **`rep outsb` and the string port instructions.** More mnemonics, and nothing in
  a tile blitter wants them.
- **Interrupt control.** `cli`/`sti` would be needed to retime the PIT or install a
  handler; both are separate features with their own reasons, and neither is
  needed to scroll.

---

## 25. Fixed-point types

Half built when this was written, and the half that exists cost more than predicted
for a reason the design could not have measured.

### The multiply: 5x, against 3x predicted

**Cost: 5x an optimal multiply, measured.** The estimate was 3x, from four `mul`s at
around 100 cycles against one `mul` and a `sar`.

Counted off the emitted assembly rather than estimated: `shared/lib/std/fixed.momo`'s
portable kernel is **54 instructions and about 901 cycles**, against 7 and about 181
for the intrinsic. The gap is not where the section expected it.

**The four-multiply design assumed byte multiplies, and Momo never emits one.** "`mul`
on byte operands already gives a 16-bit result" is true of the instruction and false
of this language: §4 promotes every byte operand to 16 bits before arithmetic, so
`ah * bh` on two `u8`s emits `mul bx` at 118 cycles rather than `mul bl` at 70. Four
*word* multiplies, not four byte multiplies. On top of that the byte halves shuttle
through memory - 24 `mov`s - and each `>> 8` is `shl ax, cl` at 8 + 4n, which is 40
cycles three times over.

**So the kernel is correct as assembly and inexpressible as Momo**, which is a
distinction the section did not draw. The estimate was made against the design; the
measurement is against the output, and §16's rule about which of those to trust
applies here as much as anywhere.

### The difficulty was backwards

The section treated the back end as the harder half. It is the simpler one. The
four-mul synthesis exists only because §9 discards `DX`; an emitter-synthesised helper
is a leaf that returns in AX, so nothing sees `DX` live across it, and the emitter
already emits helpers of exactly that shape - one per distinct interrupt, literal
baked in, pruned when unused. Around **130 cycles** for the byte-extraction sequence
against roughly 900 for the portable kernel.

**§1 anticipated this without knowing it.** `imul` is excluded there because "with no
32-bit type we never read `DX`", and reading the high half of a product is exactly what
this does - so that justification expired the moment the intrinsic arrived, and §1 now
records a smaller reason instead.

**And it stayed at 39.** `imul` would make signed fixed multiply one instruction, but
`mulshr8` is unsigned and magnitude-and-sign goes around it in ordinary Momo - so the
sign costs a few `neg`s in a routine that already exists rather than a mnemonic in the
subset.

### Order, and what predict-then-check bought

The plan was **the Momo lowering first and the helper second**, because the helper is
where the signed cases live and the Momo version is the reference it gets checked
against. The other way round validates a magnitude-and-sign kernel against nothing.

That order held, and predict-then-check paid: **thirteen products were derived by hand
from the kernel and written into `fixmul.expected` before the program was ever run,
and all thirteen matched first time.**

**One caveat against the section's own advice.** It said *"ship the sugar, measure
whether the 3x matters on something real, and only then spend anything on the back
end"* - and the intrinsic was built before anything measured whether 5x mattered.

The consumer arrived afterwards and says the multiply was never the constraint:
`shared/lib/momovec/zoom.momo` and `tzoom` apply one `fixMul` per coordinate as
geometry is read, and the zoomed tiger fits in 63,454 bytes of a 64 KB segment where
baking it needed 84,914. What it costs is crossing-list capacity, not cycles. So the
intrinsic is still unmeasured against a real workload - just no longer unmeasured
against a real *program*.

### A cost estimate deliberately left unmeasured

Whether one helper per width or one taking the shift as a parameter is better was left
to be decided against real callers. The arithmetic: `mov cl, n` then `shl ax, cl` costs
8+4n where a folded constant of two or less unrolls to repeated `shl ax, 1`, and the
kernel has two or three shifts in it - somewhere between **20% and 40% on top of 400
cycles**.

That range is arithmetic on the timings rather than a measurement, and it is the kind
of figure this project has been wrong about before. Predict it properly before adopting
either shape.

### Two notes about other files

**`rand.momo` was written up here quoting a header the file no longer had.** The
section described it as a u16 LCG with *"period 512 - a visible band every 1.6
scanlines"*; the LCG had been replaced with xorshift16 the day before, and those lines
were its account of what got retired. The file may still want proportions -
`randomBelow` is a `div` per call - but not for the reason given. **Nothing checked the
quotation against the code it came from.**

**It does not reopen the conic cut in the vector study.** One of that decision's four
arguments was 32-bit intermediates; the other three - nothing in the data produces an
arc, an ellipse is not a segment, four winding directions against one `forceDir` -
stand regardless.

---

## 48. `bracket`

### The design put the lowering in the parser, and the parser cannot do it

§48 said it would lower "in the parser, the way `=>` does", and listed among its
advantages that it needed "no symbol table, no promoted tokens and no first walk in
the loader". Two of those three are about *disambiguation* and are true: a `{`
after a complete call decides the shape with no context at all.

The third is about *lowering*, and lowering needs to know which two routines the
name stands for. `loader.ts` parses a file completely and only then visits the
includes inside it, so `shell.momo` is an AST before `mopaint.momo` has been read.
A bracket shipped by a library is not in scope where it is used. **This is the same
problem §39 had, arriving one stage later** - and the section had said it did not
have it.

The fix is a pass over the merged program, run as the first thing `resolve` does.
It is a better answer than the parser would have given, which is the part worth
recording: declarations come out **program-wide and order-free**, like `unit`
names, so `mopaint.momo` declares its own four pairs and a scene gets them by
including it. Lowering in the parser would have forced declaration-before-use in
one file, and every application under momolo re-declaring the same four lines.

**The cost of finding this after the design rather than during it was nothing**,
because it was found by reading `loader.ts` before writing any code. The section
was three days old and its claim had never been checked against the file it was a
claim about.

### The `return` rule was two thirds of a rule

§48 refused `return` inside a body and said nothing about `break` or `continue`,
which jump past the close exactly as `return` does whenever the loop they belong to
is outside the block. Refusing them needs a loop count taken *within* the body -
zero at the block rather than continuing the parser's own depth - so that a loop
written inside a body still owns its own breaks.

**Nothing in the corpus would have caught it.** No scene wraps an open in a loop,
so the sweep would have been clean and the hole would have waited for the first
program that did. That is an argument for reading a rule for what it does not say,
rather than for more tests: the tests came after the reading.

### Four refusals the design did not list

A bracket sharing a name with a routine, a duplicate declaration, a declaration
inside a routine, and an open and close that are the same routine. None was in
"Scope of a first build", and each is a wrong answer with no diagnostic - the same
shape the feature exists to remove, which is what argued for spending the twenty
lines rather than deferring them.

The name collision is the one that matters. `node()` and `node { }` would be
different things with nothing saying so, and the resolver cannot catch it because
brackets are gone before it runs.

### What the identity tier caught that nothing else would

Dropping the close call from the lowering fails the identity pair and **nothing
else in the suite**: not the golden tier, which compares committed output against
itself; not the compile tests, since the program still compiles; not the round
trip, since both sides lower the same way. Checked by neutering it rather than
assumed - and the same check on the escape guard failed exactly
`err-bracket-break` and `err-bracket-continue`, and on the collision guard exactly
`err-bracket-collides`.

### The sweep moved no instruction, and the source quotes prove more than that

**32 of the 34 opens across the three call-site files became blocks.** The two that
did not are both inside `stripOpen`, whose whole job is to leave a box open; its
four call sites are blocks anyway, because `stripClose` owns both of its closes.

`paint` is the bracket in DESIGN §48's motivating example, the open that crossed
two routine boundaries and a file boundary. Six of those in `momolo.momo` and one
in `mlodemo.momo`.

`momolo` and `mlodemo` emit code identical to what they emitted before, and the
count of source-quote comments is unchanged too - 674 and 588 - because each open
and each close is still exactly one statement. What changed is what those quotes
say: `panel( blue ) {` and `}` where they read `panelOpen( blue )` and
`closeBox()`. **The tree structure is now visible in the emitted assembly**, which
was not a design goal and is the nicest thing about the diff.

e2e stayed 39/39 with the swept scene, which is the check that matters: `momolo`
dumps every resolved box as numbers and holds them against the study's own.

### The next library written did not use it, and the sweep was the wrong shape

`std/mode.momo` (§43) landed two days after this and shipped `saveMode` and
`restoreMode` as a bare pair, which nine programs then spelled out by hand. The
adoption sweep above had run over "the three call-site files" - the files that
used the pairs that existed when §48 was built - so it could not have caught a
pair written afterwards, and nothing else was going to.

**The lesson is about where the sweep points.** A feature sweep run at the moment
a feature lands covers the corpus that predates it and nothing else, and the code
most likely to miss a two-day-old feature is the code written three days later by
somebody who has not read it yet. Adoption is not finished when the sweep is.

Making it a bracket moved no instruction in any of the nine, which is the same
result as the first sweep and for the same reason: `videoMode { ... }` lowers to
`saveMode()`, the body, `restoreMode()`. Only the source quotes changed - two
lines per program, `videoMode {` and `}` where they read `saveMode()` and
`restoreMode()`.

`mvpic` is the tenth program and was left alone: it is generated by the vector
study, so the bracket has to be taught to the emitter rather than written here,
and editing it would have been the "GENERATED - do not edit" trap `CONTRIBUTING.md`
records - reverted at the next regeneration with nothing to say so.

### The `cfg` misreading is real, and looking is what settled it

§48 predicted that a block boundary would look like a scope and that a reader might
expect `cfg` calls inside it to configure that box. Reading the swept file
confirms it, and worse than predicted: the carrier is set *above* each open, so the
lines that configure a box now sit outside the braces of the box they configure and
inside the braces of its parent.

```momo
cfgGrowW()
cfg.gap = u
box {
  ...
}
```

Unchanged semantically. Sharper to misread, and the strongest argument for giving
the openers real parameters.

**§49 is what that needs**, and it was written because of this. `cfgReset` turns
out to be default arguments hand-rolled - the callee restoring its own defaults so
a caller sets only what differs - which is a mechanism Momo's static parameter
slots allow and a stack language cannot. Measured on the way there: the corpus's
maximum arity is 6 rather than the fourteen the carrier's own comment argues
against, and a box carries 2.2 settings.

### What it cost

One new keyword, two AST nodes, a 186-line pass and 169 lines of parser. Twelve
compile tests, two round trips and one identity pair, from 406 assertions to 421.

### What it did not cost

No emitter change, no new mnemonic, no lexer change, and no change to the resolver
beyond one call. The printer needed two cases, which is the first time a feature
here has needed any - §44, §45 and §39 all left it untouched - and only because the
nodes exist in the `Statement` union long enough for `strict` to demand them. They
are what an unresolved print shows, which is how the lowering was read by eye
before it was asserted.

---

## 45. `for ( x in a )` and `for ( x of a )`

### What wanted it, and the prediction that was wrong

**Every corpus figure in this entry is fixed at the date, as §44's are and for the
same reason**: they classify the corpus as it stood when this was designed, and
adoption moved it the same week. They are the evidence for the design, not a live
count of anything - do not recount them, and do not read them as current.

**34 of the 170 `for` statements walked a container's full extent**, which is what
these two forms serve - a fifth of the loops, rather than the handful a
fixed-capacity memory model suggests.

That figure is a correction, and the way it was found is the argument for taking
the measurement twice. Reading the histogram of test clauses, the prediction was
that almost every loop walks the **used prefix** of a buffer rather than the
buffer: `count`, `crossingCount`, `candLen`, `scenePathCount[ s ]` and `n` all say
exactly that, and they are thirty-odd loops between them. But `< maxPaths` appears
20 times and is not one of them. `u16[maxPaths] pathPixels` sitting beside
`for ( p = 0; p < maxPaths; p++ )` is a whole-array walk that spells its bound with
the capacity constant instead of with `len`. Opening one of them is what found it.

So the split is roughly 34 whole-extent walks and thirty-odd used-prefix ones, with
the rest counting something that is not a container at all - a screen dimension 19
times, and small literal bounds below that.

**Only 12 of the 34 say `len`.** The other 22 name a constant that the array's own
declaration also names, which is a coupling rather than a bug: the two cannot
disagree while they share the constant, though in `mvdemo` they sit in different
files and the constant is generated. `for ( p in pathPixels )` removes the coupling
rather than maintaining it. That is a smaller correctness argument than "a bug
waiting to happen", and it is the honest size of one.

Where `of` earns its place is density rather than count. There were 281 indexed
field accesses - `el` 177, `player` 33, `st` 30, `held` 24, `mob` 8 - and they
cluster: a five-line body in `momolo/fit.momo` reads `el[ci]` four times, and the
four statements below it read `el[i]` twelve times. That is what `of` is for.

The index histogram is why most of those 281 turned out **not reachable by `of`**:
`i` 195, `pi` 23, `ci` 19, `rightPlayer` 16, `leftPlayer` 16, and several of those
are plainly not counters.

### The design put `of` in the resolver, and it went in the parser

§45 said `m` is "a symbol carrying a target and an index expression", which reads
like a resolver symbol and a new kind beside `array` and `group`. It is not one.
The body is already parsed by the time the loop header is finished, so `of` walks
it and rewrites every use of its binding into an indexed access - `m.hp` becomes
`mob[ c ].hp`, which §18 already understands, and `v` becomes `buf[ c ]`.

That is the third build running where **the printer needed no change at all**, and
by now it is less a surprise than a signal: when a feature is genuinely sugar, the
stage that turns an AST back into source is where you find out.

### Three things the design did not settle, all of them costs

**The `of` counter has to be `u16`.** Its bound is `len( a )`, and `len` folds in
the resolver - the parser has no idea whether the array holds four elements or
four thousand. A counter sized for one would be wrong for the next, so it is
always a word, and `in` is where a program that cares chooses.

The section said that made `of` "not free" for a short array. Adopting it in
`grptest` said otherwise: **three instructions fewer at the same 492 bytes.** The
word counter costs a byte on each `cmp` and each initialising `mov` and saves the
`xor ah, ah` that widening a `u8` index needs, which is one per indexed access
against one per header. The prediction before measuring was "roughly a wash,
possibly a small win"; the instruction count was the win and the byte count was
the wash, which is closer than the section's own claim was.

**The counter's name has to carry its file.** `of__tiger__0`, not `of__0`. The
loader splices every file's top level into one program, so two files each holding
a top-level `of` would declare the same name twice - which §11 already knew, since
that is the collision `local` exists to prevent.

**And nothing survives for a diagnostic to point at.** `m` written bare reports
against `mob`, because by the time anything can complain the binding is gone. The
design had claimed it "says what to write instead"; it does now, but it says `mob`
where the reader wrote `m`. Worth the trade, and worth writing down as a trade.

### The cost the design missed entirely, and adoption found in three loops

Not the width - the **sharing**. §44 lets two declarations of one name in a body
share a slot, and `of` generates a distinct name per loop, so it gave that up
without anyone noticing it was giving anything up.

`grptest` is what noticed. Its three loops had shared one `u8 i`; adopting `of`
in two of them allocated two dedicated words, and the program came out two bytes
larger despite emitting three instructions fewer. Small, and entirely a ratio
problem: a file with six `of` loops would pay for six counters it cannot share.

So sequential `of` loops now share, on the rule that a counter already lifted into
this body is free unless it appears inside the loop being built - which, because
bodies are parsed before their headers are constructed, means it belongs to
something nested and is still live. `grptest` went to **492 bytes against 492**,
and the identity pair carries a nested case so that a counter handed out twice
where it should not be shows up as a difference rather than as wrong output.

This is the second time in two features that adopting into real code found what
the pair could not. §44's was data ordering; this one is a slot the design never
thought to count.

### The sweep found less than the design implied, and the reason is worth having

160 loops classified: 12 already bounded by `len( X )`, 39 by a const that also
sizes some array, 109 by neither. **Eight adopted `in`. One file adopted `of`.**

Two things ate the rest. The 39 are dimensions and capacities shared across several
arrays - `screenH` sizes six of them - so naming one would have said the loop was
about it when the loop is about screen rows. And every array loop `of` could reach
turned out to be a **single-access fill or clear**: `pathPixels[p] = 0`, six times
across the vector programs, plus two more of the same shape. A binding costs a
reader something and buys nothing when the access appears once, so `X[ i ] = 0`
stays.

The design had said `of` earns its place on density and pointed at momolo's 281
indexed field accesses. It was right about the principle and wrong about the reach:
momolo's dense bodies index by `childAt( i, k )` and by routine parameters, which
`of` cannot bind to. What is left for it is groups, and one program uses one.

That is not a reason to regret building it - it costs nothing, it is correct, and
the alias binding it is a special case of is the thing with the 281 sites. It is a
reason for §45 to say plainly how thin the ground is, which it now does.

### The improvement that came out of the worst message

`m` bare lowers to `mob[ c ]` with no field, and §18 answered that with `"mob" is
not an array` - true, useless, and pointing at a word the reader did not write.
It now names a field to write instead, which helps the ordinary `mob[ i ]` case
exactly as much. The best thing §45 did to the diagnostics was to arrive at a bad
one from a new direction.

### The twin had to name a generated label

`ok-for-iter-plain.momo` declares `u16 of__ok_for_iter_sugar__0`, which is not a
joke and not avoidable: instructions carry their operands' labels, so the only
twin that can emit identical instructions is one declaring the same names. **It
couples the twin to the other file's name** - renaming the sugar file breaks the
pair - and the file says so where someone renaming it would look.

That is §44's lesson one turn further on. There, the twin was *chosen* to agree
about the data section and quietly tested less than it looked. Here it has to be
chosen to agree about the labels, and the price is a coupling instead. A pair test
is never free of the pair.

### What it cost

237 lines net in `parser.ts` and 22 in `resolver.ts`, the latter being the group
message above and nothing else. Tier 1 went from 390 to 404: eleven compile tests,
two more round trips, and a third identity pair which covers an array, an indexed
group and a `far` region in one program.

---

## 44. Declaring the counter in a `for`

### What wanted it, and what adoption took

**131 of the 170** `for` statements under `projects/` and `shared/` were already
spelled as a declaration on the line above the loop when this was designed. That
count is the whole case for the feature, and it is fixed at the date rather than
maintained, because adoption moved it immediately: **129 loops across 37 files**
took the sugar in the first sweep, leaving seven counters that are read after their
own loop and keep their declarations.

**Five more were found later, and none of them was one of the seven.** The layout
scenes and `moflow.momo` were written after the sweep and hoisted `r`, `k` and `i`
by hand - not because a rule kept them there, but because the code was written by
somebody working from the code beside it rather than from the feature list.
DECISIONS §48 has the same finding about `bracket` in the same pass and the lesson
they share: an adoption sweep run when a feature lands cannot cover the code
written after it, and that code is where a young feature is most likely to be
missed. The five moved no instruction; two data-section labels changed position,
which is exactly what the section below predicts.

### The design put one decision on the wrong stage

§44 gave the printer a heading of its own - where the lifted declaration should
go - and reasoned the answer out correctly. The placement is the parser's. It
collects a body's lifted declarations and unshifts them as the body closes, so the
position is settled in the AST before the printer is reached, and **the printer
needed no change at all.**

That is worth more than a correction. A feature claiming to be sugar wants
evidence, and "the stage that turns an AST back into source never learned this
exists" is stronger than anything the suite asserts. The design had budgeted a
printer change; the budget was wrong in the useful direction.

### One rule was stated more broadly than it can hold

"Same name and type reuses the slot" does not survive meeting a declaration
written out in full. `u8 i` at the top of a routine with `for ( u8 i = 0; ... )`
below it cannot share, because scoping is flat and there is nothing for the second
to shadow. So the rule is that sharing is between two `for` declarations, and
anything else is the collision it already was.

The narrower rule is the better one, which is why it cost nothing to adopt: two
spellings of one declaration in one body is confusing code, and `"i" is already
declared in this scope` says exactly what to drop.

That is two builds in a row where a rule in the design met a case the design had
not tried - §39's was what a unit combines with under `*` and `/`. One widened and
one narrowed, which is the argument for writing a rule as a claim that can be
wrong rather than as a definition.

### The error messages were most of the work, and nobody predicted that

Nine ways to write it wrong were probed, after four guards had already been
written. Four of the remaining five came out as `expected ";" but found ","` or
`expected ident but found "const"` - a comma list, and `const`, `view` or `local`
in the clause - naming what the parser wanted rather than what the writer should
do. Those got messages of their own. The fifth, a collision against a declaration
written out in full, reuses the resolver's existing one.

**None of the nine was uncaught**, which is the part worth knowing: every one of
them already failed somewhere, so a guard here buys the message rather than the
rejection. The teeth check made that concrete - neutering the array guard leaves
`for ( u8[4] buf = ...; ... )` failing as `"buf" is an array - assign to an
element`, from the resolver meeting the lowered assignment. True, and it names
neither the loop nor the reason, which is exactly what `STYLE.md` means by saying
what to do.

Writing them was more of the change than the lifting was.

### The pair agreed about the data section because it was built to

The identity pair asserts that two files identical but for the sugar emit the same
instructions, and `codeOnly` strips only the source-quote comments - so the data
section is compared too, and the pair passed on it. That looked like evidence and
was not: `ok-for-decl-plain.momo` was written with its declarations in the *lifted*
order, deliberately, so the two agree about storage by construction.

What that hid showed up the first time real code adopted the sugar. Lifting a
counter to the top of a body puts it before declarations it was written after, so
`momolo` came out with 14 data labels repositioned - same names, same widths, same
footprint, and not one changed instruction. The design had claimed "no storage
moves and no instruction changes"; the second half held and the first did not.

Sweeping the rest of the corpus put a figure on it: **34 labels repositioned across
23 of the 47 projects, and zero changed instructions in any of them.** Every changed
line in every `.asm` was classified rather than sampled - 326 source-quote comments,
68 data declarations forming an identical multiset, and nothing else at all.

The lesson is not that the pair is wrong. It is that a twin you *choose* tests
exactly the claim you chose it for, and reads as though it tested more. The golden
tier is what covered the rest, which is the argument for adopting a feature across
the corpus rather than only demonstrating it: 47 files that must not move are a
larger instrument than any two files can be.

### What it cost

159 lines in `parser.ts` - one function, a stack of frames for a body's lifted
declarations, and the exclusions - and nothing in the resolver, the emitter or the
printer. Tier 1 went from 378 to 390: nine compile tests, two more round trips because that
tier already compiles every `ok-` file, and §39's unit-identity assertion
generalised into an identity tier carrying two pairs.

The measurement it exists for: **120 instructions, identical.** The only difference
anywhere in the two emitted files is the emitter's source-quote comment, which
quotes the line that was written and so differs on purpose.

### The question that took longest closed in no code at all

Whether `for ( u8 i = 0; ... )` is the asymmetry §5 rejected took three rounds of
discussion, and the answer had been sitting in `resolveVariableDeclaration` the
whole time: the guard is `!atTopLevel && node.init`, and a lifted declaration has
no `init` for it to find.

Nothing needed writing. What the design had done was frame a mechanical question as
a judgement call, then argue one side of it - which is why it read as unresolved
while the argument itself kept sounding fine. Worth watching for: a section that
advocates is a section that has stopped checking whether the code already decided.

---

## 39. `unit`

### The design had a hole where the parser meets the lexer

The section said the mechanism was §25 generalised, and for the type checking it
was: a tag beside the storage type, required on `Resolved` so a forgotten one is
a compile error, thirty-two construction sites found by the type checker. That
half went exactly as written.

What it had not noticed is that §25 rides on types that were already reserved
words. A unit name is a user identifier, and type-or-identifier is decided in the
lexer here - which is what lets the parser tell a declaration from an expression
with one token of lookahead, and `u8( x )` from a call. Nothing in the design
said where the knowledge that `px` is a type was supposed to live.

It went in the lexer, which promotes declared unit names to type tokens, rather
than in the parser, which would have been C's typedef problem: `px x` a
declaration or not depending on what came before it. The loader needed a first
walk to make it work at all, because a file is parsed before the includes inside
it are visited.

**A design can be complete about the half it is looking at.** This one argued the
type rules carefully and never asked how the parser would know, and the answer
turned out to be the only part with an architectural consequence.

### One rule was too narrow to survive contact

The table said a unit combines with an *untyped* value under `*` and `/`. Written
that way, `w * n` with a runtime count is an error - which is ordinary code, and
the rule was widened to any unitless value. A runtime count is exactly as
dimensionless as a literal one.

### What the tests caught that nothing else would have

The round trip found the printer emitting `u16( x )` where the source said
`px( x )`. Same storage, different program - and it would have been invisible in
the golden tier, which compares committed output against itself. That is the
second bug the round trip has caught this week, both in the printer, and both
only because it compiles a program twice and compares.

### What it did not cost

Nothing at runtime, and that is now an assertion rather than a claim: two files
identical but for their units have to emit the same instructions. Worth having as
a test rather than an argument, because the argument is exactly the kind that
stays true right up until it does not.

### And one thing to know before using it

Units are viral at a library boundary. Everything in `std` takes plain types, so
a unit has to be cast to be printed or passed - `putNumber( u16( width ) )`. That
is the feature working rather than a defect, but it means a unit pays off inside
a body of code that shares it and costs at the edge where it meets one that does
not.

---
## 38. File I/O

### The design's central claim held

It said none of this was a language feature, and none of it was: no resolver
change, no emitter change, no grammar, and not one existing `.asm` moved. The
prediction for `filetest` - `0 64 64 64`, then `1 1 2` - was written into the
`.expected` before the program was ever run, and matched first time.

### `local` cost the round-trip tier, and was taken back out

The status pair and its capture helper were written `local`, which is what §11 is
for and looked obviously right. The tally said otherwise: tier 1 went to 348 with
the round trip **unchanged at 61**, because the printer splices every include into
one file and `npm test` skips any program containing a private - so `filetest` was
in the compile and golden tiers and absent from the one test the parser has.

`std/io.momo` had already weighed this and written the answer down: the test is
whether a writable copy is a **correctness hole**, as `randomSeed` is. Writing
`fileBad` only makes a program lie to itself about its own last call, which is not
that. So the `local` came off, the `file` prefix does the same job it did before
§11 existed, and the round trip went to 62 - one for `filetest`, and one for every
program that ever reads a file.

**The tally is what caught it.** Nothing failed, and the feature worked either way;
the only symptom was a number that did not move when a program was added.

---
## 35. `_ds`

### Three places had to agree that it has no storage

The design said "no storage" and that is one claim with three implementations
under it. The resolver had to describe a scalar that is neither real storage nor
an alias of a parent, which nothing here was: every other zero-storage builtin is
a byte half of a register. The emitter had to skip it when writing the reserved
globals. And `npm run memory` had to skip it too.

**The third is the one that could have shipped wrong.** It adds a builtin's width
to the reserved figure by default, so `_ds` would have contributed two bytes that
do not exist - and nothing would have failed. The assembly would have been
correct, the suite would have passed, and the only symptom would have been a
number two too high in the one tool whose entire purpose is an exact footprint.
It was found by reading the tool rather than by anything catching it.

### The error message stopped being `_cf`'s

`_cf` was the only read-only builtin, so the diagnostic for assigning to one
named carry directly and explained that no call reads carry on the way in. A
second read-only builtin made that wrong rather than merely narrow, so the reason
moved onto the symbol. They are read-only for unrelated reasons - carry is a
report, DS is where DOS put us - and a reader who assigns to one should be told
which they hit.

### What the test could not do

There is no value to assert. DOS loads a `.COM` wherever there is room, so the
segment differs by machine, by DOS version and by what is resident, and a
`.expected` cannot name it.

`dstest` asserts on the PSP instead - `CD 20` at offset 0 of our own segment, put
there so a program can exit by jumping to offset 0. Predicted before running:
`205 32`, then `1`. Both matched first time, which is the evidence that `_ds`
returns our segment rather than merely returning something.

---
## 26. Strength reduction

### What it measured, against what it predicted

Measured on `tilefill`, which has two `* 8` per row: **8.5% off a full screen**,
~4.13s to ~3.78s at 4.77MHz.

**The estimate beforehand was 9.7%**, and the shortfall is entirely the first of
§26's two traps: it assumed a shift of three cost ~6 cycles, where through CL it
costs 20. Unrolling would recover the rest, and that is what `-o` (§29) is for.

Worth keeping as an estimate that came in under rather than over. The prediction
was made from an instruction count and was wrong by a knowable amount, for a
reason the section already contained.

### The cap it set and had to lift

The unconditional tier originally reduced powers of two only **up to eight**, on
the reasoning that a wider shift through CL might not pay. The numbers do not
support that: `mov bx, n` + `mul bx` is 5 bytes and ~125 cycles, while
`mov cl, k` + `shl ax, cl` is 4 bytes and at worst 68 - so the shift wins on both
counts at any width, and the cap was pure caution.

The tier now says every power of two. `emitter.ts` records the same correction
beside the code.

---

## 27. Word copies and data alignment

Two optimisations, measured. Neither is a rule, which is why this is the whole
of §27 rather than part of it: it is a question somebody asked, costed, and
answered, and the answer sent each half somewhere else - the word view to §17 as
a technique, the alignment work to PLAN.md as a deferral with a trigger.
Prompted by an obvious question about `tilefill` - if the tiles are word aligned,
could a `u16` view copy two pixels at a time and halve the loop? The answer turned
out to be two separate optimisations of very different value, and the alignment
half is worth less than it looks.

The premise was also false. `tiles` sits at **0x2F7, which is odd**. Nothing in
Momo aligns user data; only `_heap` gets `align 2`. A `.COM` puts data at
`0x100 + code size`, so the parity of the whole data section is an accident of how
much code precedes it, and one extra instruction anywhere above flips it. It does
not affect correctness - the 8086 permits unaligned word access, which §17's rules
already say - only speed.

**The inner loop, counted.** `pixels[dest + col] = tiles[src + col]` plus its test
and increment is **19 instructions**, of which **two** touch pixel data. Everything
else recomputes both addresses and reloads ES. It performs **7 misaligned word
accesses** per pixel: the loop test reads `col`, the body reads `src`, `col`,
`dest`, `col`, and `inc word [col]` both reads and writes.

Applying the documented 8086 table (accumulator forms at 10, `8 + EA` otherwise,
`jcc` taken at 16, `inc word [mem]` at 21, a segment override at 2) gives ~182
cycles per pixel, and the misalignment adds 7 x 4 = 28.

| per tile (64 pixels) | 8086 | 8088 |
|---|---|---|
| as built | ~13,400 | ~13,900 |
| word views, 32 iterations | ~7,000 (-48%) | ~7,200 (-48%) |
| aligned scalars only | ~11,600 (-13%) | no change |
| both | ~6,100 (-55%) | ~7,200 (-48%) |

**The word-view half is the prize, and it needs no compiler work at all.** §17
already expresses it: `view u16[64] tileWords = tiles[0]` over the `u8[128]` set,
`view u16[32000] pixelWords = pixels[0]` over the far region. It needs no division
either - halve the constants instead, 320 -> 160 and 8 -> 4, and pass the tile
offset in words. The destination stays even for free, since both terms of
`(ty * 8 + row) * 160 + tx * 4` are. The saving is not two bytes per `mov`; it is
paying that 19-instruction preamble 32 times instead of 64, which is why it holds
up on an 8088 too.

**The alignment half is smaller and target-dependent.** An 8088's external bus is
8 bits, so a word access is two bus cycles whether aligned or not - the penalty
this would remove does not exist there. It is a true-8086 optimisation, and most
of these machines were 8088s. §28's CPU target levels are about the *instruction
set*; bus width is a second axis, and nothing in Momo currently has a place to say
which one it is tuning for.

**And reordering alone cannot deliver alignment.** Sorting the scalars words-first
is free and deterministic in itself, but it only makes every word share the parity
of the block start - and that parity comes from the code size, which the compiler
never learns, because it emits NASM source rather than bytes. Sorted, a program
whose data base lands odd has *all* its words misaligned instead of some. So the
package is `align 2` once at the data base plus the sort, not the sort alone.

The `align 2` costs at most one byte for the entire program, which settles the
question of whether a byte-sized scalar could be tucked into the padding slot to
make it free: it could not, since only NASM knows whether a slot is needed, and it
would be saving one byte. The cost worth weighing is not the byte. It is that
sorting by width scatters each routine's locals between the word group and the
byte group, and the data section currently shows a routine's whole frame in one
place. That is a readability trade against a 13%-on-one-chip gain, and readable
output is the product (§9).

Verdict: **the word views are worth doing in a program that cares, today, with no
compiler change. The alignment work waits for a reason to prefer the 8086 over the
8088** - and if it ever comes, it arrives as `align 2` plus a width sort, with the
locals-locality cost paid deliberately. `tilefill` itself stays as it is: it is the
straightforward version on purpose, and §14 wants it readable more than fast.

---

## 36. `momolo`

### A branch nothing could reach, found by reaching it

The port was verified against the study across six scenes, every element and
every pass, and that cross-check is the reason to trust it. It still had a bug,
and the shape of the bug is the useful part.

`sizeAxis` works out how much room a container has inside its insets. The study
writes it as a subtraction and lets the answer go negative; the port's sizes are
`u16`, where a negative wraps to 65,535 and reads as *unlimited* room, so the
port clamped it to zero instead. That clamp is necessary and it is also a
different answer: a box smaller than its own insets stopped reporting an
overflow, because after clamping there was nothing left to be over.

**No scene could reach it.** It needs a container whose border and padding
together exceed its whole size on one axis, which does not happen at a scale
where a unit is eleven pixels. It happens immediately at a scale where a unit is
one character cell and a bar is half a line high, floored at one: a one-unit box
with a one-unit border on each side. Three of them, in the System 6 memory
gauge.

So the divergence sat in a routine that six scenes, five hundred assertions and
a byte-identical golden tier all agreed was correct, and it took a seventh kind
of scene to produce a case where the two implementations could disagree at all.
**A cross-check is only as wide as the corpus put through it**, which is an
argument for more scenes rather than for more assertions about the same ones.

The fix carries the shortfall separately - `avail` stays clamped for arithmetic
and `overshoot` says how much of the box the insets ate - so both the flag and
the shrink deficit come out as the study's, with no intermediate below zero. The
seven existing scenes are unchanged by it, which is what says it is a fix and not
a second opinion.

---

### The multiply that ran per character, and the section that priced the other term

Found while pricing PLAN §43's stride question, which asked whether a screen width
should be a constant or a runtime value and answered it by weighing one multiply
against another.

`mopaint.momo` had three cell-address computations and they disagreed. `fillRect`
worked out a row base once and walked it. `drawRun` and `drawText` computed
`y * screenCols + x` **inside** their loops, where `x` and `y` are parameters that
nothing in the body assigns - so the multiply ran once per character to produce a
value that could not move.

Per character in the loop, before:

| | cycles |
|---|---|
| `mov ax, [y]` | 14 |
| `mov bx, 80` | 4 |
| `mul bx` | ~125 |
| `mov bx, [x]` | 14 |
| `add ax, bx` | 3 |
| | **~160** |

After, `mov ax, [base]`: 14. So **~146 cycles a character**, against ~160 paid
once per call - break-even at two characters, and about 7x for a twenty-character
label. `drawText` also had its `y >= screenRows` test inside the loop, where it
could only ever fail on the first pass; as a guard it says that, and it is what
lets the multiply move.

**The point is not the fix, which is four lines.** §43 had spent its stride
argument on constant-versus-variable, worth ~10 cycles a multiply, while the
number of multiplies actually run was worth an order of magnitude more and had
never been looked at. A per-expression cost is not a program cost, and the two
were being compared as though they were.

The three demos are the only programs affected and they are golden-tier only, so
all three were assembled under DOSBox by hand rather than trusting `momoc`'s `ok`.

---

## 47. `block`

### The estimate was right about the library and wrong about the compiler

§47 said "twenty lines and no compiler change" and put itself top of the Definitely
list on that ratio. The library is 17 lines of Momo once the comments come out, so
the first half held with room to spare.

The second half did not, and the reason is worth separating from the estimate being
optimistic - it was not. **The section knew the problem and priced the wrong
solution to it.** It has a heading called "It initialises itself, which is a pattern
this repo does not have yet", which correctly worked out that a `far` region needs a
`u16` holding `_ds`, that §5 forbids initialising that variable in its declaration,
that only a library's own top-level statement can fill it, and that **no file in
`shared/lib/std/` has one**. It weighed self-initialisation against an explicit
`blockInit()` and chose the first.

What it never asked was whether the variable was necessary. §16 already models a far
region's segment as *where the value comes from* rather than as a number - its own
words - and `_ds` is a value the machine can hand over in one instruction. Adding it
as a third source came to 35 added lines across three files, most of them comment:
a widened union, one `return` in the resolver, one branch in the emitter, and a case
in the symbol-table dump. The code was already shaped for it.

**The cost of the missing question was one alternative row**, and the trade it hides
is real: the standard library would have grown a startup sequence and an ordering
rule, permanently, to save ten lines of compiler once. Written down as those two
things it is not close. It reads close when the compiler change is unknown and the
startup sequence is already designed.

### Going to look for it found a miscompile that had been there since §35

`far u16[2] psp = _ds` compiled clean and emitted `mov dx, [_ds]`. `_ds` has no
storage - §35 says so in three places and `npm run memory` skips it for exactly that
reason - so the label does not exist and NASM rejects the file. `momoc` said `ok`.

This is the failure `CONTRIBUTING.md` describes under "momoc reports `ok` for
programs NASM will reject", and it is the most exact instance of it yet: the
compiler's job ends at emitting text, tier 1 compiles and diffs that text, and
neither reads it as assembly. A second site had the same bug - `_ds` as the *right*
operand of a binary expression loads through BX rather than AX, and `loadIntoBx` had
no case for a register-backed symbol either. That one needed no `far` region at all:
`x = y - _ds` was enough, in any program, from the day §35 landed.

**Nothing in the corpus wrote either spelling**, which is why both survived. §35 is a
feature with one obvious use and `dstest` uses it the obvious way. Neither line is
exotic; they are just not the line somebody wrote first.

### What that says about where the tiers are thin

Not that tier 2 should be bigger. Tier 2 caught both the moment a program used them,
and the teeth check confirms it: neutering either fix turns `blktest` into
`symbol `_ds' not defined` rather than a wrong number.

What it says is that **a builtin with no storage is a shape the emitter has to
special-case in every path that reads a variable**, and nothing structural connects
those paths - each is a literal `[${symbol.label}]` written out where a value is
loaded. There are three that read: into AX, which had the case; into BX, which did
not; and the byte-operand path, which `_ds` cannot reach because it only takes a
one-byte variable. The two that write are safe for a different reason again - the
resolver refuses to assign `_ds` at all - so if a *writable* register-backed builtin
is ever added, those are where to look first. Four ways to be correct, three of them
accidental, and the one that was load-bearing was missing.

### The rule the design did not have

Two routines that compose have an interface between them the design never wrote
down. §47 specified "failure returns 0" and it specified the floor, and it gave a
worked example - `bufSeg = blockBase()` then `blockFits( bufSeg, 64000 )` - in which
those two facts contradict each other: a failed `blockBase()` hands `blockFits` a 0,
and `blockFits` as specified would answer that segment 0 has room for 64,000 bytes.
A program that checked exactly as instructed would then write over the interrupt
vector table.

**It was found by writing the second routine against the first**, which is the
argument for building a small design rather than refining it further on paper. The
fix is one line and it is now a rule in DESIGN §47, along with the two wrap cases -
the one the design did spot in `blockFits`, and the one it did not spot in its own
spelling of the floor, `_ds + 0x1000`, which wraps for a program loaded high and can
wrap to a small non-zero segment that reads as an answer.

### What was weighed and set aside

Carried over from the design, since these are what to reconsider if the surface does
not survive contact:

| | for | against |
|---|---|---|
| **A stateful bump arena** instead of three pure routines | earns its place with two or more regions, or sizes computed at runtime; `heaptest` shows the idiom is at home here | needs state, an init story and a policy, for a case §40 says should not be allocating at all |
| **An explicit `blockInit()`** instead of self-initialisation | no new pattern in `std/`, no ordering rule | moot: the segment register form needs no initialisation of any kind |
| **Paragraphs** rather than bytes in the interface | the full 1 MB range, and it matches the machine | every caller writes the rounding by hand, which is where the trap lives - and it is why `blockParas` is `local` |
| **Starting at the heap top** rather than above our own segment | uses the tail of our own 64 KB instead of stranding it | §13's `_hsize` is a conservative floor, so the boundary between two allocators would be fuzzy - and a fuzzy boundary between allocators is how heaps get corrupted |
| **Verifying by write and read-back** rather than trusting `PSP:0x0002` | catches an emulator or a loader that lies | the word is the DOS contract, and `dosblk` already round-trips once |
| **Naming it `arena`** | the obvious word | it is not an arena - no bump pointer, no `free` - and §40 reserves *zone* for §41's. What was first written here instead was that the word was *taken*; see below |

### The naming row defended a name on availability, and that was the tell

The row above first read "taken by the test project". That is a true sentence and
it is not a reason: it says the word was unavailable, not that `block` was right.
Reading it back is what raised the question of whether the *test project* had any
business holding the word, and it did not - `arena` allocated nothing, had no bump
pointer and no `free`. It was named for what the memory past the segment felt like
rather than for what the program did.

**The word was ambiguous in the documents already**, which is the part that turns
this from tidiness into a finding. §40 uses "arena" as a design term in four places
- "a far arena for assets", "an arena and a zone are the same kind of thing" - and
five lines below the first of those it said "`arena` reads `PSP:0x0002`", meaning
the project. Only the backticks separated the two senses, and a reader had to know
that convention to see it.

So the project became `dosblk`, which says what it reads, and the three files that
share the subject now read as a family: `dosblk` proves the mechanism by hand,
`std/block.momo` is the library, `blktest` holds the library to it. The word
`arena` is free for the allocator §40 still lists as open, and `block` keeps the
name it should have had on its own merits - it is the thing DOS handed us, and it
is not an allocator.

**A project name is a single global slot**, since two projects sharing one is an
error rather than something a path disambiguates. That makes it worth spending on
the thing that most needs the word, and worth re-examining when a name was chosen
because it seemed to fit rather than because it was checked.

---

## 52. `group` data, written as rows

### The estimate held exactly, and the check for it was already written

The design said "pure parser transposition: no table, no indirection, and nothing
reaches the emitter that it does not already emit". That is an unusually testable
claim for a design note, because the golden tier answers it directly: **every
committed `.asm` was byte-identical after the feature landed.** Not one program
changed, because no program used the syntax yet, and the syntax is all there is.

Worth recording as the shape of a cheap feature rather than as a triumph. What
made it cheap is that a group field with data was already a legal symbol - an
array carrying `values` - and had been since §18. The feature was a way to write
one down, not a way to have one.

### The rows form failed a type check before it could fail a value check

The teeth check was to break the transpose and watch `grpdata` change. The first
attempt gave every field the first column's values, and it did not produce wrong
output - it produced `value 10 does not fit in bool`, because `mob`'s columns are
`u8`, `i8`, `u16` and `bool` and a transposed row does not type-check against
them.

That is worth knowing about the feature rather than about the test: **a
heterogeneous group is largely self-checking.** A wrong transpose has to survive
every field's type before it can produce a wrong number, and a group whose fields
differ in type will usually refuse first. It is the *homogeneous* group - three
`u8` columns, which is exactly `palR`/`palG`/`palB` - where a transpose bug would
be silent.

So the second attempt reversed the row order instead, which keeps every column
type-valid, and that failed properly: the three rows-derived lines of output
flipped and the columns-derived lines did not move, which is the discrimination
the test needed to show.

**It also found a weak fixture.** With the rows reversed, the `bool` column still
printed `1 0 1`, because the data happened to be `true, false, true` - a
palindrome. A column that reads the same backwards cannot detect a reversal, so
the fixture was changed to `true, false, false`. A test's data can be wrong in a
way that costs it a whole class of failure, and nothing but deliberately breaking
the thing it covers would have said so.

### A short row is an error where a short array is not

`u8[10] partial = [ 1, 2, 3 ]` zero-fills the tail, and §5 is right that it
should: a buffer with a head and nothing else is a normal thing to want. A group
with three rows and ten instances is not the same shape - it is a miscount, and
the zero-filled instances are entities nobody wrote.

The two rules live one function apart and disagree deliberately, which is the
kind of thing that reads as an inconsistency later unless it says why here.

### Where the check has to happen, and what that cost

The instance count is a constant *expression* - `group mob[mobCount]` - so the
parser cannot fold it and cannot check the row count. The parser checks what it
can see, which is that each row supplies exactly as many values as there are
fields; the resolver checks the row count once the count is folded.

The cost of that split is one boolean on the declaration. By the time the resolver
runs, the rows are columns and a length error would otherwise be phrased in terms
the author never wrote - "field x has 2 values" for someone who wrote two rows.
`fromRows` exists only so the message can say "was given 2 rows", which is a
diagnostic paying for itself in one field.

---

## 1. Target

### A readability heuristic that was correct by accident, for a year

The emitter groups printable runs of a `db` array back into quoted text, so a
string reads as a string rather than as `104, 101, 108, 108, 111`. That was
unconditional, and it produced this:

```nasm
palR:  db  '?', 0, '3::;;<<=>>?39,)??3),9:;=>&', 25, ':<>', 12, 25, '&&', 19, '9,'
```

which is a VGA palette.

**It arrived in the first commit**, carried in from the prototype workspace, so
its origin predates this repository. What makes it worth a section is not the bug
but why nothing could see it.

At that commit there were about nine `u8` arrays written as strings and six
written as numbers - and **every value in every one of the numeric ones fell
outside 32-126**:

```momo
u8[6] partial = [ 1, 2, 3 ]
u8[]  table   = [ 2, 4, 6, 8 ]
const u8[] palette = [ color(white, black), color(red, yellow), color(cyan, blue) ]
```

The literals are all single digits, and even the interesting one evaluates to
`15, 228, 19` - below the printable band, above it, below it. So the grouping
fired on strings and nothing else, not because it tested for one, but because no
data existed that could tell the difference. It was **untestable at the time it
was written**, and indistinguishable from a correct implementation.

### What broke it arrives by construction, not by luck

A VGA palette byte is a 0-63 intensity, and **32-63 is `space` through `?`** - so
half the legal range of a palette byte is printable ASCII, guaranteed. That is why
`palR`, `palG` and `palB` read as line noise, and `t_pal__palette` carries `'1S'`
in the middle of a run of numbers.

It generalises past palettes. A text attribute is `fg | bg << 4`, so attributes on
a green background land in 32-47. Tile indices, small coordinates and packed flags
all drift into that band eventually. The heuristic was never wrong about palettes
specifically - it was wrong about **numeric data**, and palettes are only where
the corpus finally had some.

### No tier could have caught it, and that is the interesting part

Every tier passes on the broken output. `momoc` writes text and says `ok`. The
golden tier compares that text against a copy of itself, so it locks the defect in
rather than reporting it. NASM assembles `db '3::;;'` perfectly happily. Tier 2
runs the program and gets the right answer, because **the bytes were always
correct** - only their spelling was wrong.

That is a class of defect this project is otherwise well defended against, and the
defence does not reach it: §1 says the emitted assembly is the product rather than
an intermediate, and there is no tier that reads the product *as a human would*.
The thing that found it was someone looking at a `.asm` and thinking it looked
odd. Worth stating plainly, because the honest conclusion is that **for
readability, reading it is the tier**, and it runs when somebody happens to look.

### The fix is smaller than a new rule

It is not "group less". It is to make explicit the condition that happened to be
true when the code was written: **group runs only for an array that was written as
a string.** One flag on the array symbol, set at the three places an array with
values is declared, and one condition at the `db` line.

Three places rather than one is the only wrinkle, and it cost a wrong first
attempt: `simplerl`'s map is `const map = "########    ########" ...`, an untyped
const whose initialiser is a string, and that path does not go through
`declareArray`. The first version turned a 200-byte map into twelve lines of
`35, 35, 35, 46` before regenerating showed it. Reading the `momoc:all` diff is
what caught it, which is the argument for that step being a step rather than a
formality.

The corpus has no array written as explicit character literals - checked - so
string provenance is the whole rule, with no third case.

### Both directions have teeth

Grouping unconditionally fails `grpdata`, `tennis`, `tiger`, `tclip`, `tflat` and
`mvpic`. Grouping never fails `cftest`, `filetest`, `maptest`, `mlodemo`,
`mlolayer` and `momolo`. **The two sets are disjoint**, which is the discrimination
the change exists to make, and neither set would have moved before it.

---

## 43. The screen library

### The consolidation was nine programs, not five

§43 counted five hand-set mode 13h sites and made its case on those. The save and
restore pair turned out to be in **nine** - the four text demos duplicate it too -
and folding them in cost nothing to find, because grepping for what was left after
the first five was how the leftovers surfaced.

It cost little to *do*, either, and that is worth recording because it looked as
though it would cost more. A text demo including the mode library seemed likely to
pay for a mode table it never reads. §11 prunes the whole table, both BDA regions,
`setMode`, `setDac` and the row table from a program that calls only `saveMode`
and `restoreMode` - verified before converting them, not after.

**What survives pruning is ten bytes, and this said one.** The descriptor does not
go with the table: `restoreMode` *writes* `curW`, `curH`, `curElems`, `curSeg` and
`curElemBytes` to empty it, and a written global is a used global, so all five
stay. `rndtext` carried `savedMode: db 0` before and carries those plus
`mode__savedMode` after - one byte against ten, so the four text demos each pay
**nine bytes more** than they did, for six lines each they no longer carry.

The number was written from the pruning check rather than from the data section,
which is the shape of mistake `CONTRIBUTING.md` means by treating a claim about
generated output as a hypothesis: the check that ran answered "is the table gone",
and the sentence it produced answered "what does this cost".

### Reading the diff caught a per-pixel regression

The first version had every program take its frame segment from the descriptor:
`frameSeg = screenSegment()`, then `far u8[64000] pixels = frameSeg`. It compiled,
assembled, and passed every tier.

The `momoc:all` diff is where it fell over. `mov dx, [frameSeg]` is 14 cycles
against `mov dx, 0xA000`'s 4, **per far access**, and §16 loads ES on every one -
so `tigerpic` would have paid ten extra cycles 92,949 times, about 0.2s at
4.77MHz, and `tennis` would have paid it per frame. §16 also refuses to hoist a
runtime segment, so the change would have put those programs permanently out of
reach of §34.

Re-reading §43 settles it: the section complains that *mode 13h is set by hand in
five places* and never once complains about `0xA000`. **The segment for a known
mode is a compile-time fact**, and making it runtime buys nothing until a program
does not know its mode - which is the properties query, and is not built. So the
constant stayed and `screenSegment()` is there for when that changes.

The general shape is worth keeping: a consolidation can be correct, pass
everything, and still be a regression, because the tiers check what the code does
and not what it costs. The diff is the only place that showed.

### The test could not see its own distinctive feature

The descriptor reads a text mode's geometry back from the BIOS data area rather
than trusting the table, because 80x43 on EGA and 80x50 on VGA are the same pair
of calls. That is the one thing in the library that is not just a routine with a
name.

**And `modetest` could not tell whether it worked.** The table's nominal 50 for
the tall mode and VGA's actual 50 are the same number, so neutering the read-back
changed nothing the test looked at. It passed either way, which was discovered by
trying to break it rather than by writing it.

The fix was to the *design*, not the test: the text rows carry 0 for `nomW` and
`nomH`. A nominal figure there is a second answer nothing reads, and one that
agrees with the hardware often enough to hide a read-back that had stopped
working. With zeros, neutering the read-back turns `80 25` into `0 0` and the
test fails loudly.

That is the second time in two sections that a teeth check improved the thing
under test rather than confirming it - §52's `bool` column was a palindrome and
could not detect a reversal. **A test's fixture can cost it a whole class of
failure**, and the only thing that says so is breaking what it covers.

### The row table is affordable because of where the fill lives

400 bytes is a lot to add to nine programs, and not one of them indexes by row.
Filling the table inside `setMode` would have kept it alive in every one, because
a written array is a used array. An explicit `screenRowsInit` leaves it prunable,
so `modetest` carries it and nothing else does.

The cost is an ordering rule - call it after `setMode` - and a program that
forgets gets zeros rather than garbage, which is the failure shape §47 chose
deliberately when it made 0 mean "no".

### The tenth program was not a consolidation

`simplerl` is the only program that set a mode and never put one back. It calls
`setTextMode()` and stops, which is invisible from a text-mode prompt and clobbers
anyone running at 80x43 or 80x50 - the two modes the table exists to describe.
It now runs inside `videoMode`, which is the first use of this library that
*added* behaviour rather than moving it.

So it is the one that shows the price with nothing on the other side of the
ledger, both measured against a fresh build rather than against `build/`:

| | before | after |
|---|---|---|
| code | 810 | 880 |
| data | 236 | 246 |
| image | 1,046 | 1,126 |
| heap | 63,970 | 63,890 |

**Eighty bytes, seventy of them code**, which is the two routines the nine already
pay for and the ten bytes above. The data figure is the correction in the section
above arriving on a program that had nothing to trade for it.

Worth having on a program deliberately kept at its smallest, because it is the
case where the library is a straight cost. Eighty bytes against a 64 KB segment
buys the property that no program here leaves a mode it chose, and the file it
buys it in is the one that most wanted a reason to say no.

### What was deliberately not built, and why that is not caution

The properties query, aspect ratio, the interleaved, planar and banked layouts,
and windowing are all still designed and not built. They are not harder than what
landed; they have **no consumer**. The query needs a program that does not know
its mode, aspect needs one that draws circles, the layouts need one that touches
EGA planes, and windowing needs `momode`. Three of those four are blocked on a
mouse; the query stopped being so when `momoed` took a number, because an editor
supporting text modes past 80x25 is a program that does not know its mode and
needs no mouse at all. PLAN §55.

Building them now would mean writing code nothing can run, and this repository has
exactly one defence against that, which is that a program exercises a library. The
half that landed had nine programs waiting for it. The half that did not has none.

---

## 54. `motext`

### What it cost

One file, no includes at all - not even `std` - and one test project. The
capacity consts are `chunkSize = 16`, `maxChunks = 1024` and
`textMaxLines = 512`, which is 16,384 bytes of text.

| | |
|---|---|
| records, in the image | 5,504 bytes - 3,072 of chunk links, 2,048 of line heads, 384 of undo log |
| text, in the heap | 16,384 bytes, and nothing in the `.COM` |

**The image grows with capacity even though the text does not**, which is the
half of the storage split that is easy to miss: the text is a view over `_heap`
and free, and the records that address it are ordinary arrays and are not. Thirty
four bytes of record per hundred bytes of capacity, at these sizes.

### Three things the design did not settle, all found by building it

**An ordinary array would have been in the image, and the design never priced
it.** §54 said the text lives in a view over `_heap` and gave §17 as the reason,
which is a good reason and not the load-bearing one. The load-bearing one is that
a plain array is emitted as `times N db 0`, so the same 16 KB of capacity would
have been 16 KB of `.COM`. Checked in the emitted assembly rather than assumed,
because the alternative would have compiled and run.

**`lineJoin` recorded no undo, and backspace at column 0 is a join.** The design
paired split with join and stopped there, because it was reasoning about undo as
the reversal of *undoable* operations. A join reached from a keystroke rather
than from the log is the same edit and needs the same entry, so `opJoin` records
the column before joining - which is the one thing nothing can recover
afterwards. Found while designing the test, not while designing the buffer.

**A library claiming the bottom of the heap was a decision nobody had made.** A
`view` needs a constant offset and a library cannot be handed one, so `motext`
takes `_heap[0]` and exports `textBytes` for a program to partition after. That
is §17's static partitioning with the library going first, and it holds for
exactly one library.

### `local` on a group, a view and a const

Probed rather than assumed, and all three work, mangling per file. That is what
lets the library keep `chunk`, `line` and `text` as names without colliding with
a program that wants any of them - which matters more here than for momolo's `el`
or mopaint's `st`, because `line` and `text` are names an editor is very likely
to want for itself.

### The teeth check, and the guard that stopped it corrupting

Both policies are visible in exactly one number each, and neutering either leaves
every length and every character of text unchanged - which is the claim the test's
own header makes, and it is checked rather than asserted:

| neutered | chunk count |
|---|---|
| the append that fills rather than splits | 4 -> 7 for the same 64 characters |
| the merge that folds an emptied chunk back | 3 -> 4 for the same 24 characters |

Worth recording that the second of those **no longer corrupts anything**. In the
draft, neutering the merge sent `used` to 255 on the next deletion and the line
reported a chunk of whatever the heap held next. The guards that came out of that
- step over a run of empty chunks, and refuse one holding nothing - are in the
library, so the same neuter now produces a wrong count and correct text. A teeth
check that used to fail loudly for the wrong reason now fails quietly for the
right one.

### Undo did not say where it acted, and an editor has to put the cursor back

Found by writing the dispatch in `edloop`, not by writing the buffer. An undo
reverses an edit and leaves the cursor wherever it was, which after a join is a
line the document no longer has - so the cursor drifts, and the caller cannot work
out where to put it because the edit it would have looked at has been reversed.

The entry knows: it carries the line and column the edit happened at.
`undoLine()` and `undoCol()` report them, set before the reversal is applied.
Neutering the follow in `edloop` leaves the cursor on line 2 where it belongs on
line 1 - a wrong number rather than wrong text, which is the kind of defect that
survives a suite that only compares content.

### The property of including nothing was given up, and the argument went the other way

This file included nothing at all, not even std, and that was recorded as worth
having. `textSave` ended it, and the reasoning is worth keeping because the
first instinct was the wrong one.

The obvious move was a library above this one holding load and save, keeping the
buffer pure. It cannot be done: writing efficiently means handing DOS each chunk
where it already lies, and `text`, `chunk` and `line` are all `local`. A
library above could only have gone through `lineSlice` into a buffer it had to
own - a copy of every byte, and a second static capacity, to preserve a property
that buys nothing at runtime because §11 prunes the include for a program that
never saves.

So the boundary that mattered turned out to be a different one from the boundary
that had been drawn. This file opens no files and knows no filenames; it takes a
handle. That is the line worth holding, and it is intact.

### Coalescing had to be a mark, not a count, and redo is why

The obvious shape for "thirty characters are one step" is one entry with a
count, and it is wrong for a reason that only appears once redo is on the
table: **redo has to put the characters back, and a count has nowhere to keep
them.** So the entries stay one per character and a `joinPrev` mark says which
of them are one action. The log grows a byte an entry and nothing else changes.

Which is worth recording because the two features were planned as one piece of
work and would have been built in the wrong order otherwise. Coalescing alone
would have taken the count, and redo would then have had to undo it.

### Redo found one thing the log had been quietly getting away with

`lineInsert` recorded a zero where the inserted character goes, because undo of
an insert is a delete and a delete does not need to know what it is deleting.
Redo of an insert does. It had been wrong since the log was written and cost
nothing until the day something read it, which is the shape of most of what
these documents record.

### The run can only be ended from outside

§54 can see that two inserts are at consecutive columns on one line. It cannot
see that the cursor moved away and came back, and a buffer that guessed would
merge two separate pieces of typing that happened to line up. So `undoBreak` is
the caller saying an action ended, and `momoed` calls it on every motion.

That is the same division the whole editor is built on - the buffer knows what
was done to it and the program knows what the person meant - and it is the
third time it has decided where a routine goes, after the cursor position on an
undo and the refusal to open a file that does not fit.

### What it cost

About 830 bytes of `momoed` for redo and the run marks together, and one byte
per undo entry. The editor is 19,608 bytes with 6,862 of heap still unclaimed.

### A prediction that held

Every number in the test - four chunk counts, nine lengths, two line counts, two
slice returns and three lines of text - was written down before the first run and
was right. The only correction was the trailing spaces the print helper emits,
which were known and left out of the expected file anyway.

That is worth one line here because most predictions recorded in these documents
did not hold, and the reason this one did is not insight: the three shapes had
already been drafted and run, so the arithmetic had been checked against a
machine twice before it was written down a third time.

---

## 56. `moview`

### The teeth check found untested code rather than a weak test

Both of the library's rules were neutered to check the test could see them.
Scrolling failed loudly, as expected. **Painting rows past the end of the buffer
changed nothing at all** - the neuter took, the output was identical, and the
rule was covered by nothing.

The reason is worth having, because it is not a mistake anybody would notice
otherwise. The test's window was four rows over a nine-line buffer, and
`viewGoto` clamps the cursor to the last line - so the furthest the window can
scroll is to lines 5 through 8, all of which exist. **Rows past the end were
unreachable through the only door the test had.** The case that produces them is
a window *taller* than the file, which is what opening a short file full-screen
looks like and is the ordinary case rather than an edge one.

Adding that render covered it, and the same neuter then removed three rows from
the output.

So the rule this produced is a refinement of a checklist item rather than a new
one: **a neuter that changes nothing has found untested code, not a failed
neuter.** The instinct is to assume the break did not take and to reach for a
different one; the thing to do is ask what the test actually reaches.
`LESSONS.md` has it under Verifying.

### What §54 left open, answered by building the thing that would have needed it

§54 recorded that a cursor moving one character at a time re-walks its line's
chain, and that a cache would fix it if measurement said so. Measurement says it
does not arise: rendering walks each *visible* line once, so a redraw is bounded
by the height of the window rather than by the document, and the redraw an edit
produces is one row. There is no path here where the walk repeats often enough to
be worth caching, and the cache would sit on the one that is already bounded by
what is on screen.

That question was the first item on §55's unsettled list. It was settled by
building the thing that would have needed it, which is cheaper than deciding it
would have been.

### The partitioning rule has a second customer, and the tool sees both

`motext` claims `_heap[0]` and exports `textBytes`; `moview` the test project
declares its file-read buffer at `_heap[textBytes]`. `npm run memory` reports
**two views claiming 16,448 bytes** - 16,384 and 64 - which is the first time
that arrangement has existed and the first time the report has had two of them to
add up. Both halves of §54's heap rule work, and neither is a paragraph nobody
has run.

### What it cost

Small, and hard to state on its own: tree-shaking means the figures for a program
using `moview` are not the library's size but the size of what it reached. The
one number worth keeping is that the row buffer is the library's only static
capacity, at `viewMaxWidth` bytes, and it is the reason `viewSize` clamps rather
than trusting its caller.

---

## 57. `key`

### It was measured because it could not be tested

The question - is `Shift+Left` distinguishable from `Left` - is a fact about a
BIOS and a keyboard, and no headless tier can answer it. So `keyprobe` was
written to ask, one combination at a time, and it is kept rather than run once
and its answer written down, because the answer is a property of a machine and
most of `PITFALLS.md` was found where DOSBox and 86Box differ.

Two runs under DOSBox and one under 86Box. **All thirty-two rows agree**, and two
of them contradicted a design that had already been drafted and had already
passed its own test against codes taken from documentation.

### The two findings, and both would have shipped

**`AH=10h` reports an extended key as `AL = 0E0h`, not 0.** The first draft
decided "is this a character" on `AL` against zero, which is the obvious reading
and normalises every grey navigation key to the character `0E0h`. They would all
have collided on one binding. It passed its test because the test fed codes
invented from documentation; `keyprobe` fed it what a BIOS actually sends and it
fell over. `edloop` now fails loudly on the same neuter: End, Down and Home stop
working together and two inserts land at the start of the wrong line.

**The shift flags carry state as well as modifiers.** The byte holds NumLock,
CapsLock and Insert above the four modifier bits, and the evidence is an accident
rather than a document: an Insert keypress four rows earlier left the toggle on,
and the same keypress reported `0000` under DOSBox and `0080` under 86Box because
the two update the state at different moments relative to the read. A binding
comparing the whole byte would have worked on one emulator and not the other, and
nobody would have suspected the flags.

Both are the same shape of mistake - a reasonable reading of what the hardware
does, tested against a model of the hardware rather than against the hardware.

### Two decisions that are not the keyboard's

**Quitting is not a binding.** `edloop` tests `^Q` outside the table, because a
loop has to be able to stop whatever the table says and a rebindable quit is a
rebindable way to lose the ability to leave.

**The keypad aliases the grey keys**, because both normalise on the scancode and
`0E0h` is discarded. That is what every editor does and it was not decided so
much as fallen into, so it is written down: they cannot be bound apart, and the
day somebody wants that is the day the normalisation grows a third row.

### What the table costs, and why that is the point

§55 has the figures. The short version is that a linear scan of the bindings and
an if-chain to dispatch them comes to roughly half a percent of the time between
two keystrokes, so the key map can be data and the flavour of the editor stops
being a decision that has to be right the first time. The emitted scan is not
tight code, which is exactly the point: **the flexible option is affordable here
in a way it never is in an inner loop.**

---

## 55. `momoed`

### The defect that mattered was found by asking how somebody would run it

Everything in the editor is libraries with test projects under them, so the
program itself was expected to be assembly of tested parts. The one thing it
added that nothing below had was a **file chosen by a person**, and that is where
the defect was.

`momoed.asm` is the obvious first thing to open with it, and it is about 150 KB
against a 16 KB buffer. §54 refuses an edit it has no room for and leaves the
buffer unchanged rather than half changed, which is the right behaviour - and it
is silent. So a file that stopped part way through loading looks exactly like one
that fitted, and `^S` would have written the truncation over the original.

That is a data-losing bug reachable on the first use of the program, and no test
below it could have found it: each library was doing exactly what it says.

**The fix is that refusal is now reportable.** Four places in §54 could decline
for want of space - two chunk takes, a chunk split that could not, and the line
limit - and all four set a flag that `textInit` clears and `textNoRoom` reports.
`momoed` asks before opening and refuses the file rather than showing part of it.
`motext` fills the buffer past capacity and checks the flag flips, which is a
test that could have been written at any point and was not written until a
program needed the answer.

### Two smaller things the program was the first to want

**`run.ts` could not pass a command tail.** `momoed` is the first project that
takes an argument, so `npm start momoed FILE.TXT` had nowhere to put the name.
Extra positionals now become the DOS command tail, with the old guard narrowed
rather than dropped: a second argument that is *also* a project name is still an
error, so `npm start tennis tiger` reports a typo where `npm start momoed
notes.txt` opens a file.

**`momoed` has a `.expected` after all**, which its own header denied in the
commit that created it. Run with no filename it prints a usage line and stops, so
tier 2 reaches the command tail parse and the exit. That covers less than it
sounds - nothing past the argument check - but it is not nothing, and the claim
that an editor cannot be tested at all was wrong three times over by then.

### What it cost, and the redraw that did not need to be clever

The whole screen is repainted on every keystroke. At 80x25 that is two thousand
cells, comfortably inside the time between two keys, and dirty-row redraw - which
§54 and §56 are both shaped for - was not needed and so was not written. The
first version that is too slow is the one that should have it.

---

## 59. `mofind`

### The measurement decides what happens to this next, and it is not the scan

Counted from the emitted assembly on 2026-09-13, for the path that runs on
almost every byte of a search - a start column rejected on its first byte:

| | cycles |
|---|---|
| scanning one column | ~200, or ~245 when the byte is a letter |
| `lineSlice` copying that same byte in | ~227 |

So a search that finds nothing in the 38 KB the buffer holds is roughly
seventeen million cycles - about three and a half seconds at 4.77 MHz, and
nothing at all on anything later. A search that *finds* something costs what the
distance to the match costs, which is why none of this has been felt yet.

**The copy being half of it is the finding.** The obvious lever is a cleverer
scan: Boyer-Moore-Horspool skips the pattern's length on each miss and would cut
the scan by that factor, at 256 bytes and a table rebuilt per term. With the copy
setting the floor it would buy less than half, so it is the wrong thing to reach
for first. The right one is scanning in place - and that means the search moving
inside §54 and giving up the seam this file exists to demonstrate.

That is worth writing down precisely because it is a trade and not an
optimisation. §54's read interface is deliberately a slice and not a character,
and a search built entirely on it is the evidence that the interface is enough;
the price of that evidence is one copy of every byte searched. Nobody should pay
it twice by accident.

### The loop was tightened first, and by how much says where the cost is

Three changes, each obvious once the assembly was read rather than guessed at:
the highest start column is worked out once per window instead of rebuilt as two
comparisons per column; the first pattern byte is hoisted out; and `fold` is
written out rather than called, because a call and a return per byte *compared*
were most of the work rather than beside it.

**Folding the window in place was drafted and thrown away.** It looks like the
same trick - do it once rather than per comparison - and it is not, because each
byte is compared about once anyway. It added a whole pass over the window at
roughly the cost of the scan itself. What made it obvious was counting it.

§55 measured its binding scan and concluded that the flexible option is
affordable in a way it never is in an inner loop. **This is that inner loop**,
and it is the first routine here where every variable being a memory operand is
the cost rather than a curiosity. §46 is where that goes.

### A teeth check that changed nothing, for the second time, and the rule held

Neutering the column a backward wrap starts at left every expected line
identical. The rule from §56 says that is untested code rather than a weak
neuter, and it was: the fixture ended in a newline, so the last line was empty, so
a backward wrap onto it skipped it and landed on the line before - which is where
it was going to land anyway. The column could have been set to anything.

Dropping the trailing newline from the fixture changed nothing in the expected
output and turned the same neuter into five wrong lines. **A fixture can be the
reason an assertion does not hold**, and the check that finds it is the one that
comes back clean.

### The seams were already there

Neither library needed anything from the language, and neither needed a change to
what was below it. §54 was read through `lineSlice` and `lineLength` exactly as
written; §56 was moved by `viewGoto` exactly as written; §57 handed over the
same normalised `u16` a document gets. The only new thing in the editor is a
mode, and the only new thing under it is two files.

### What it cost

2,458 bytes of `momoed` for the search, the field, the prompt and the mark on
the match together - 192 bytes of it the pattern and the window, 64 the field.
The editor is 22,066 bytes with 4,404 of heap unclaimed.

---

## 60. `mofield`

### It is a library for testability, and the reuse is the second reason

The rule this repository keeps is PROVENANCE's: do not build a toolkit before its
second consumer. A one-line text field has exactly one today, so on that rule
alone it belongs inside `momoed`.

It is a library anyway, and for the other rule - §55's, that everything a
headless tier can run lives below the editor. A prompt written inside `momoed`
would have been the first behaviour in the program with nothing able to run it,
and the four things worth checking are the ones nobody checks by hand twice: an
insert in the middle, a delete at each end with nothing to take, and a field that
is full.

**Which is worth recording because the two rules disagreed and the second won.**
The tie-break is that testability is a property of where the code lives and reuse
is a guess about the future; one of those is checkable today.

---

## 61. `morange` and selection

### The 64 KB ran out, and selection is the thing that spent it

Measured with `npm run memory` on 2026-09-13, after the clipboard landed:

| | bytes |
|---|---|
| image | 24,490 |
| heap | 40,494 |
| claimed - §54's buffer, the file read buffer, the clipboard | 39,552 |
| **unclaimed** | **942** |

Selection cost about 2,400 bytes of image and took a 1 KB clipboard out of the
heap, and image and heap come out of the same 64 KB, so it was paid for twice.
What is left is under a kilobyte, and **PLAN §58 stops being a good idea and
becomes the next one.**

### Which is why the undo log is still sixty-four entries, and that is not enough

An entry is seven bytes and there is one per character. Cutting a single line of
sixty characters is sixty-one entries; two lines is past the end of the log.
Raising the number is the obvious fix and there is no room to raise it into - 942
bytes buys about 130 more entries, which is still less than two lines, and leaves
nothing for anything else.

**The fix is one byte per character rather than seven**, and it is a different
shape: a span deleted goes into a text arena and the log holds one entry saying
where it came from. That is a seven-fold difference on the text plus one entry
instead of hundreds, and it is what should happen before the number is touched.

It is not a small change, and the reason is worth writing down: undoing such an
entry means *inserting a span*, which is §61 - which is above §54. So either the
span operations move inside the buffer, or the log learns to call upwards.
**Deciding that is the work**, not the arena.

Meanwhile the behaviour is the honest one. A group the log cannot hold empties
the log rather than keeping the tail of it, because half a group restored is a
document nobody asked for, and `textUndoLost` makes it reportable - `momoed` says
*too big to undo* in the status line. Same call §54 already made with
`textNoRoom`: total rather than partial, and never silent.

### A bracket that looked harmless would have undone §54's coalescing

The tidy way to write "typing replaces the selection" is to wrap every insert in
`undoStep`. It is wrong, and not subtly: **opening a group breaks the run before
it**, so a bracket around each keystroke makes every character its own action and
undo goes back to meaning one character - the exact thing §54's coalescing exists
to prevent, removed by three lines that read as tidying.

So the group is opened only when there is a selection to replace, and the two
duplicated lines that costs are cheaper than the alternative. The general form:
**a command is a new action and a character is not**, which is the same boundary
`undoBreak` draws from the other side.

### Counting the span before the joins, and what the teeth showed

Deleting across three lines can empty each line and then join, or join first and
then delete once. Joining first keeps the walk on one line, and the price is that
the count has to be taken before anything moves.

Neutering that - dropping the middle lines from the count - does not produce a
short delete or a crash. It leaves `[abjklmno/]` where `[abno/]` was expected:
**both ends of the selection correctly removed and the middle of it still sitting
in the document.** That is the failure worth having a test for, and it is the one
that would read as a rendering bug for an hour first.

### The one case nothing above §56 would have noticed

Every span in the editor is asked for in document order, so a selection made
*upwards* - anchor after cursor - is the only thing that can tell whether anybody
put the two ends the right way round. With `markFirst` neutered the whole suite
still passed except the three lines that select backwards, and those failed
completely: the copy returned nothing and the highlight vanished.

It is one line of code in §56 and it earns its place by being asked once rather
than by every caller. The alternative is four callers that agree until one of
them is changed.

### What the tests are shaped like

`morange` checks the span arithmetic and the undo count; `edsel` checks the three
things that live in the editor and nowhere below it - Shift folded back out of
§57's key space, the rule that a shifted motion extends and a bare one collapses,
and the span turned into screen columns.

The last of those is why `edsel` renders at all. `momoed` writes cells and no
tier can read those, so the same arithmetic is written against characters: a row
of text and a row of marks under it. That is what makes the cell past the end of
a line - the one standing for the newline - a thing a test can see, and neutering
it turns `######......` into `#####.......` rather than into nothing at all.

### The cut that would have taken what the clipboard did not keep

Found by reading the finished code rather than by a test, which is worth saying
because it is the same defect shape as §55's first one and was introduced in the
same way - two routines that are each correct, composed.

`rangeCopy` comes back *short* when the span is bigger than the buffer, because
refusing would be worse for a caller that only wants what it can hold. `doCut`
copied and then deleted the span it had asked for. So a cut of more than a
kilobyte would have removed from the document precisely the part the clipboard
did not keep, with **no sign of it until a paste came back short**, by which time
the text was gone and the undo log had probably rolled past it.

The fix is the rule §55 already had one level down - refuse rather than truncate,
and say so - and it needed one thing from §61 first: **the count cannot answer
the question.** A span that exactly filled the buffer returns the same number as
one that was cut off, so `rangeCopied` is a separate answer and the test that
holds it is two calls that both return four.
