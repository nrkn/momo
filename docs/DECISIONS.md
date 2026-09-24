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
across all three**, which `DESIGN.md` explains under **Numbering** at its head.

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

### Tier 2 went parallel, and the question was measured before it was answered

2026-09-24, from the question "is it the startup, and would one scripted
instance fix it". Measured first: a bare DOSBox boot-and-exit is ~1.8s, the
whole fixed cost per test ~2.5s, and `tiger` spent a further ~8s of wall time
on emulated arithmetic because `cycles = auto` is a fixed real-mode budget. So
startup was two minutes of the five, and the vector programs were the rest.

**One scripted instance was rejected on the numbers**: it saves only the boots,
keeps the compute serial, and puts every test behind one hang under one
timeout - the exact failure mode the per-test timeout was built to end. What
the tier already had was per-test isolation (each project owns its build
directory, out.txt and markers), which is the shape a pool wants: seven DOSBox
instances at once, each worker taking the next project as its last finishes.

**`cycles = max` came along for free.** The tier checks correctness, never
speed - this file's §27 and CONTRIBUTING are emphatic that DOSBox cannot
measure performance - so the emulated CPU may run as fast as the host allows.
`tiger`'s output was byte-identical at max and its run halved; `core = dynamic`
on top of max measured nothing (5.7s against 6.0s, inside the noise). The conf
is patched at runtime into `build/` rather than committed as a second file, so
there is no copy to drift and `npm start` stays playable at `auto`.

**67 programs: ~5-6 minutes serial, 38 seconds pooled.** The teeth check: a
deliberately wrong `.expected` still reports FAIL with both strings and exits
1 under the pool, and `MOMO_E2E_JOBS=1` restores the serial run exactly.

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

### Five holes nothing had reached

A unit parameter, a unit return and a typed const each lost their unit, and the
printer dropped a return's - none of it reachable from `unittest`, all of it
found because §71 could not work until it was closed. The list is under
DECISIONS §71.

### Compound assignment checked storage and nothing else

`x op= e` went through the storage rule and never met this table, so
`px x; x += someMs` compiled where `x = x + someMs` did not. §71 closed it for
`a16` only, and the general case followed in the next session: the pair now goes
through the same unit rules as `x op e`, and the result has to be the target's
unit - which is the half the plain form's assignment check does, and what refuses
`x /= w` (a plain ratio into a px) and `n *= x` (a px into a count). Shifts needed
nothing, because `x << n` already keeps `x`'s unit and ignores the count's.

No program was affected: `unittest` is the only one declaring a unit, and every
`.asm` stayed byte-identical. The `ok-unit` pair gained the compound forms that
must still compile, so the identity tier holds them as costing nothing too.

### `tennis` declared one at last, and found two more

The program that asked for units adopted them on 2026-09-23, 25 days after §39
was built: `unit grid = i16` for the subgrid, with pixels left plain because they are stored
in three different types. Its first compile found two holes. **A field of a
one-instance group dropped its unit** - the counted form kept it, the namespacing
form did not, and `ball` is the namespacing form. **Unary `-` dropped a unit**,
so `ball.speedY = -ball.speedY`, which is how a bounce is written, stopped
compiling. `-` had always kept the scale, and keeps the unit now for the same
reason; `~` still drops it, which nothing has needed otherwise.

Three casts were needed: `grid( player[ pi ].speed )` twice, because the speed is
a `u8` and a unit has one storage type, and `grid( iabs( i16( ... ) ) )` at
`std/math.momo`'s edge. `tennis.asm` changed only in its source quotes.

---
### A declared return unit never left the declaration

Found 2026-09-24, during §76's build, present since units landed. A
parameterised const declared `const px f( u16 v ) = px( v )` handed back plain
u16: the constfn symbol had an optional returnUnit nobody populated, and the
cast resolveCall wraps an expansion in carried toFrac but not toUnit - so every
caller needed the cast the declaration had already written, and §76's fixture
worked around it with an inferred return before the cause was found. Two
fields, one line each; `ok-unit-constfn-return` holds the unit arriving and
`err-unit-constfn-return-mix` holds it refusing to land in a different one.
The shape is the one §25 warned about when it made frac required rather than
optional: an optional field a construction site can forget is silent at
exactly the site that forgets it.

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

### `tennis` was the program that cared, and word views were the smaller half

2026-09-23. `tennis` ran well on a 486 and flickered on a 286, and its render
cleared the ball and both paddles and drew them again every frame through
`setPixel` - a call, a `mul` by 320 and four byte stores each reloading ES, per
logical pixel, 54 of them a frame and 99 whenever the ball neared the net, which
was redrawn whole. Three changes replaced it:

- **Draw what moved, and never clear what is about to be drawn.** A paddle draws
  the rows it entered and clears the rows it left; the ball draws its new square
  and clears only the old pixels outside it. This is DESIGN §68's finding again,
  and it is what removes the flicker whatever the timing: nothing is ever briefly
  absent for the beam to catch.
- **Clear to what is underneath.** The only thing the ball crosses is the net, so
  a cleared pixel in the net's column asks `netAt` - and the net's whole redraw
  left the frame.
- **Word stores through `pxwords`.** A logical pixel is one word on each of two
  screen rows, and a run steps 320 words a row from one multiply.

**Counted by running rather than by hand.** The render now branches on how far
each thing moved, which a hand count gets wrong, so the emitted assembly was run
in an interpreter of §1's subset (§72) with two scripted players, and each rendered
frame's instructions counted exactly. The cycle column applies the 8086 table this
section already uses; it compares the two builds and predicts no machine.

| per rendered frame, 3,000 frames | before | after |
|---|---|---|
| instructions, median | 3,523 | 763 |
| instructions, 95th percentile | 3,523 | 1,119 |
| instructions, worst | 6,349 | 1,385 |
| 8086 cycles, median | ~39,800 | ~8,300 |
| 8086 cycles, worst | ~72,400 | ~14,900 |
| `mul` executed, mean | 56 | 5.8 |

About 4.8 times less, where the estimate before drafting was ten. **The same run
compared the screen after every frame** - 3,000 frames, then 20,000 more with
lazier players so that two games were won and restarted - and every one was
identical to the old render's. `tennis` blocks on input and has no tier 2, so
that comparison is the only evidence the rewrite draws the same game.

**The row table the source proposed was measured out.** After the rewrite a frame
multiplies about six times, roughly 700 of its ~8,300 8086 cycles, and on a 286
`mul` is about 21 cycles rather than 124. **So was the 160x100 logical buffer**:
expanding it to the screen would cost more every frame than the 20-odd pixels
that actually change.

**What is left is the compiler's, not the program's.** `fillColumn` is 59% of the
new frame, and its loop is 25 instructions a row of which two store pixels - the
rest reload `w`, `k`, `n` and `c` from memory and ES twice, which is §9's memory
model and §16's reload per access. That is the next factor for every mode 13h
program here, and it is a compiler change rather than a tennis one.

**Confirmed on the machine that asked.** The same day, from `momo-3.ima` on the
286 that flickered: no flicker.

The round trip found a printer bug on the way: a parameterised const's body is
resolved per call on a copy, so the body as written never got labels, and one
naming a `local` printed it bare. `t_scr`'s `wordAt` was the first to do it.
`ok-constfn-local` holds the fix.

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

## 51. `addr()` in an initialiser

### "The whole change" was two changes, and the second was pruning

The design said that widening an array element to a number-or-label, and having
`emitData` write the label, was the whole change. That half was exactly as small
as promised - one type, one branch in the resolver, one in the emitter - and every
committed `.asm` was byte-identical afterwards.

What it did not mention was `prune`. It keeps the storage the retained program
mentions, and it finds those mentions by walking every declaration's initialiser,
live or not - which was harmless while an initialiser could only name constants,
because a constant emits nothing. An `addr()` in a table is a label, so walked
the same way it would have kept its target in the image whether or not anything
read the table. A library shipping a table would have shipped everything the
table named to every program that included it.

Nothing would have failed. The image would have been larger than it needed to
be, `npm run memory` would have reported the bytes as ordinary arrays, and the
only sign would have been a string present in a program that never printed it.
That is the shape `CONTRIBUTING.md` records for `momoc` reporting `ok`: the cost
lands somewhere no tier looks.

So an address in an initialiser is not a use; it joins the fixpoint that already
kept a live view's parent. That fixpoint had been written "so that stops being
something this has to know" about views, which collapse in one pass anyway - and
it turned out to be needed after all, one feature later, for a table that names a
table.

### Declaration order was a question the design did not ask

A probe with the table above its string failed with `"sLate" is not declared`,
which reads as a typo rather than an ordering rule. Code can name a later global;
an initialiser cannot - `const u8[] early = [ late ]` is refused the same way -
because initialisers are resolved where they stand.

Allowing a forward label would have been cheap for NASM and not for the resolver,
which would need a deferred lookup that no other initialiser has. It was left
declaration-ordered, and the refusal now says so. The design was silent on this,
and drafting was what asked.

### The PITFALLS entry was kept, against this item's own claim

PLAN said §51 "deletes a `PITFALLS` entry". `PITFALLS.md` says of itself that its
entries are historical, and that one a later version makes impossible becomes a
note about something that used to be true. The file's rule won over the plan's
prediction, and the entry gained a paragraph instead of losing its place.

### The teeth

Seven guards were neutered by line. Five are refusals, and each failed exactly
the files written for it: the writable-table refusal both of its own - a declared
array and a group column - and the byte table, the forward name, the arithmetic
and the inferred `-1` one file each. Which files failed is the part worth
reading rather than the tally.

The two pruning halves are caught differently, and the difference is the
lesson. **Walking a table as a use** changes `addrtab.asm` by exactly one line -
`sDead: db 'dead$'` - and the golden tier reports it as a failure of that one
project. That line is the whole cost the section above describes, and without a
string named only by a dead table in the fixture nothing would have shown it.

**Dropping a live table's targets** does not fail a test: it crashes the
harness. The emitter's `symbolFor` finds no symbol for `sOne` and throws
`internal: unresolved symbol`, and the golden tier does not catch per project.
So the suite goes red, which is teeth, but it goes red by stopping rather than
by naming `addrtab` - which is what a real regression here would look like too,
and is worth knowing before one arrives.

It no longer stops. Every tier-1 compile now catches a throw that is not a
diagnostic and fails that one case with its message, so the same neuter reports
`FAIL addrtab` and `FAIL round trip addrtab`, both reading
`not a diagnostic: internal: unresolved symbol "sOne"`, and then the tally. The
round trip had a second gap under the first: a case that threw was never
counted, so its line in the breakdown fell by one while the total did not.

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

## 53. Nested arrays

### The design's first build could not have been used

Its scope said a runtime `menu[i]` could be indexed again, bound by `of`, or
passed to a §19 array parameter - and §19 is not built. So as specified, a string
in a list could reach no routine taking an address, which is every string routine
in the repository, and the section's own headline example passed one to
`labelPaint`. Reading the design against momoed's menu code before writing any of
it is what found that, and `addr( menu[i] )` went into the first build.

The length spine came in the same way, from the other end. The design put it out
of scope, and momoed's rule that the action array decides how many items a menu
has is `len( actions[m] )` with a runtime `m` - so without it the first customer
would have kept a hand-written count, which was one of the things the conversion
was for.

Both are cases of a design written before its customer was examined. Neither
would have been found by building the design as written and testing it against
itself, because `nestarr` could have been written entirely inside the original
scope and passed.

### The printer decided where the child's label goes

The first spelling put the child's label on the access in place of the parent's,
which is what the emitter and pruning both want. It printed wrong for a private
list: §14's lowering finds a private by its label, and the child's is not in the
set the printer holds. So the parent's label stayed, the child's went beside it,
and pruning learned to count that one instead.

The cost of getting it the other way would not have been a failure. It would have
kept a spine that nothing reads - the same shape as §51's, where the wrong pruning
rule costs image bytes and says nothing.

### A constant index crashed the emitter, because pruning was right

The first run of `nestarr` stopped with `internal: unresolved symbol "digits"`.
`digits` is only ever indexed at constants, so nothing read its spine and pruning
dropped it - correctly - and the emitter then looked the spine up anyway, on the
way to discovering it did not need it. The fix was order: a constant child is
loaded before its parent is asked for.

It is worth recording because it is the case this section exists for, arriving
as a crash on the first program to exercise it. A fixture with only runtime
indexes would have passed.

### No second type-dependent lowering, which `CONTRIBUTING.md` was watching for

`CONTRIBUTING.md` says a second lowering that needs operand types is the point at
which hanging it off the node as `lowered` stops being cheaper than a rewrite
pass. §53 looked like that case - an access whose meaning depends on the
declaration's type - and is not one. The emitter handles a child access directly,
beside the flat path; and the one rewrite, `of`'s slot, happens in the parser
from syntax alone, because indexing a binding is only legal over an array of
arrays. So `lowered` still has one user, and the threshold has not been crossed.

### The parser's refusal moved, and its test followed without editing

Indexing an `of` binding used to be refused in the parser. It had to move to the
resolver, because the parser can no longer tell a flat target from a nested one,
and `err-for-of-indexed` passed unchanged afterwards - its expected text is a
substring of the new message on purpose, so a test written for the old stage held
the new one.

### The teeth

Every guard was neutered by line and failed the files written for it, with one
exception in method rather than result. The refusal of `menu[i]` alone could not
be neutered by condition: the code after it relies on TypeScript narrowing
`childIndex` through the `raise`, so a condition tsc cannot fold stops the build
instead. It was checked by changing its message, which proves its two tests reach
it and not that the refusal is the only thing stopping them. Without it the next
line reads an index that is not there, so the failure would be a crash rather
than a wrong program.

The pruning rule and the constant-index rule each changed `nestarr.asm` and
nothing else. That is the golden tier doing what the section says it does:
holding which tables exist, which no amount of running can see.

### The measurement, and the premise it was owed on

The design said the spine against `nthStr`'s walk "belongs in `DECISIONS.md` once
something is built", and that `s6demo`'s menu is redrawn per frame. **It is not.**
`s6demo` builds each window once and waits for a key, so there is no frame to
price - the claim was written about a program nobody had read. What there is, is
one build of the scene, and that is what was measured.

Static, from the emitted assembly both sides of the conversion, with the timings
this file uses everywhere else (the accumulator forms at 10, `8 + EA` otherwise,
`jcc` taken at 16, `inc word [mem]` at 21). `nthStr` costs 128 cycles to enter
and leave, 129 per character walked and 138 per `$`; a spine read at the call
site is four instructions.

| lookups in one build | calls | before | after |
|---|---|---|---|
| menu labels | 4 | 4,996 | 292 |
| icon widths | 8 | 43,656 | 328 |
| icon labels | 8 | 43,960 | 632 |
| Finder rows, three columns | 15 | 38,475 | 1,095 |
| memory bar names | 3 | 6,120 | 219 |
| **all** | **38** | **137,207** | **2,566** |

**53 times, or 28.8 ms against 0.5 at 4.77 MHz.** The icons are two thirds of it,
because a walk to the eighth name passes the seven before it, and they are walked
twice - once to measure and once to draw. That is the shape the design predicted
in words - a fixed cost against a cost that grows with the data - and it is the
growth that the table shows: a list of eight is already most of the bill.

**Part of the saving at each call site is not the walk.** A call inside an
argument makes §7 evaluate every argument onto the stack before storing any, so
`labelPaint( nthStr( ... ), black, white )` pushed and popped all three; with no
call left in the arguments they are stored directly. The call site alone went
from 140 cycles to 73 before counting a byte of the walk. It is small beside the
walk - a few percent of a menu lookup - but nobody would have looked for it,
because the push/pop was never in the routine being replaced.

`nthStr` left the images of `s6demo`, `pmdemo` and `mlolayer` with it. It stays in
the library: `keyprobe` walks prompts that may have been read from a file, and
`momenu`'s fixture has an empty menu that §53 refuses. So the design's closing
line, that nothing further was needed "to delete `nthStr`", assumed every blob was
static, and two are not.

---

## 70. `const group`

### Drafted rather than designed, and what the draft settled

There was no design. §18 had carried "a `const` group carrying data is still a
separate question" since §52 landed, and the question became urgent only when
the binding tables moved into rows and lost the `const` their arrays had. It was
settled by writing it, and the drafting answered three things a design would have
had to argue:

- **The single-instance form is refused**, because a set of constants is already
  what `const` writes, and it folds them where a group would give each storage.
- **Every field must have data.** A read-only column of zeros is a mistake.
- **§51's addresses come in for one argument.** That rule already keyed on
  whether the array was read-only, so admitting them in a const group's column
  was passing the group's flag to the routine that folds a column.

### The pruning rule forgot the count, and the golden tier said so

A const group's column of addresses has to be table data to pruning, as §51's
arrays are, or a column nothing reads keeps every string it names. The first
version of that rule walked a group's field initialisers and nothing else - and
seventeen assertions failed, the programs among them each missing the `equ` of a
const that was only ever used as a group's count. The commit that landed this
says five, which is how many were read before the cause was plain; the number
was not counted, and this is the count.

The old walk was generic and had been counting the count without anybody meaning
it to. That is the argument its own comment makes for walking generically - *a
new node kind cannot silently be missed* - and the first special case written
against it missed exactly one child of exactly one node kind. It is walked
explicitly now, and the teeth check neutered that line and watched twelve tests
fail.

### The read-only flag on the columns shows only in the listing

Neutering the flag that marks a const group's field arrays read-only failed the
golden tier and nothing else: the arrays' `const` comment disappeared from the
data section, and every write was still refused, because the refusal is the
group's own check and fires before the array is consulted. The flag is kept - it
is what a later reader of the listing sees, and what any future path to a field
that bypasses the group would meet - but it is not what the refusal rests on.

### The menus did not need the relaxation they were blocked on

§70 was written saying `momoed`'s menus waited on one thing: a title lived in an
array of arrays, and §53 refuses `addr( menuNames[0] )` in an initialiser. The
plan was to allow a constant child there and then convert.

Writing the row first showed the relaxation was the wrong fix. `addr( menuNames[0] )`
in row 0 writes the menu's position a second time - once as the row's place in
the group and once as the index - which is the pairing the rows were built to
remove, reintroduced one level down. Naming each title for its menu, as the labels
and actions already were, left nothing indexed by hand. So the refusal stayed, and
the reason it stayed is written into §70.

The conversion was neutral in size: the five tables and the row hold the same 36
bytes, and the code grew by two, because an action is now a `peek8` through the
row's address where it was a child of an array of arrays.

### It took the length spine's only customer

§53 pulled its length spine into the first build because the menus needed
`len( menuActs[m] )`. A row carries its count, so the menus stopped asking, and
the length spine is now held by `nestarr` and used by nothing. That is the
repository's own warning about building for a consumer arriving from the other
side: the consumer was real, and was replaced within the day by a better shape
for the same data. The feature stays - it is tested, cheap when unused, and the
first ragged list somebody walks at runtime will want it - but the claim that a
program needs it is no longer true, and §53 says so.

### The drift check followed the data

The menu check now reads the group's rows by field name - a field added or
reordered moves it - and gained a column: a count must name the same list as the
actions beside it, since `len( aFile )` next to `addr( aEdit )` would count one
menu with another's length. Dropping a label, dropping an action and pointing a
count at the wrong list were each reported. The binding tables' duplicate-key
check reads rows the same way now, through one routine.

### The teeth

Every guard failed the file written for it: the single-instance refusal, the
field with no data, the write, and the admission of addresses, which also failed
`cgroup`'s round trip because the printed program could not be compiled without
it. Treating a column's addresses as table data changed exactly one line of
`cgroup.asm` - `sUnused` came back.

---

## 71. `a16`

### A reviewer's suggestion, and the one change it needed

The suggestion was a built-in unit over `u16` for addresses, with §39's mixing
rules and `addr()` returning it. The type was right and the rules were not, and
the reason could be seen before anything was written: under §39 a typed
unitless value beside a unit is an error, so `peek8( at + i )` - the line
`std/str.momo` is made of - would have needed a cast in every loop. §39 is
built for quantities that add to themselves. An address is a place, and a place
plus a place is nothing; the rules became places and distances, and the rest of
the design followed from that one substitution.

### Drafted, and what the draft settled

It was written before it was argued further, and the migration answered the
three things the discussion had left open:

- **Strict, not lenient.** A `peek` that still took a plain `u16` would have made
  the type opt-in, which is where §39 ended up - `tennis` asked for units and
  never declared one. Strict meant migrating the corpus, and the corpus was the
  measurement: 39 `.momo` files outside the tests, about 170 declarations
  retyped from `u16`, and four casts in all. Three are `a16( peek16( ... ) )`,
  reading an address that was stored as a word - `addrtab`, `win311` and
  `momoed`'s menus - and one is `u16( strFind( ... ) )`, to print one. One typed
  const, `dirtest`'s PSP offset, did the rest.
- **Registers take an address; they give one back only by a cast.** No program
  needed the second direction. `ok-addr-typed` writes it once so it is held.
- **§51's constants stay admitted.** A table ending in 0 is the sentinel shape,
  and it is the same untyped-constant rule every unit already follows.

Code already written as places and distances needed nothing. `motext`'s
`lineCells` moves three addresses through a row and took no casts, which is the
best evidence the rules match how this code was already being written.

### What naming had been carrying

The case for the type was that `at` means an address by convention only. The
migration counted it: eight parameters named `at` hold an index - `undoEntry`,
`redoEntry`, `fieldRemove`, `candRemove`, and momovec's `mapX` and `mapY` in
both `direct` and `zoom`, which take a vertex - with more among `motext`'s locals
and one in `momoed` that is a slot number, and `askAt` is a screen column.
Twenty-four `u16 at` declarations survived the migration, and a strict `peek` is
what now says none of them is read through as an address in our segment: they
are undo slots, chunk offsets, vertex indices, video and far-memory offsets, and
one table index. They were renamed in the commit after this one, so that its
`.asm` diff - parameters and locals are labels - could be read on its own, and
`at` has named an address ever since; `STYLE.md` holds the convention.

### It found five holes in §39

None of these was reachable from `unittest`, and `a16` could not work until each
was closed - which is the only reason they were found:

- a unit parameter lost its unit inside the body, in both places the parameter
  was declared;
- a call to a fn returning a unit lost it, because the routine's symbol never
  recorded `returnUnit`;
- so `return` inside such a fn checked against a plain type, and a fn declared
  to return a unit could not return a value of it at all - only a constant;
- a typed scalar const dropped its unit;
- the printer spelled a fn's return type by its storage, which the round trip
  would have caught the first time a program had one.

Each has an `err-unit-*` file now. **§39's compound assignment ignored units
too** - `px x; x += someMs` compiled - because `x op= e` checked storage only.
§71 checked it for `a16` and left the general case, which was closed in the
session after; DECISIONS §39 has it.

### The teeth

Every guard failed a file written for it, with one exception: the unit written
onto a parameter's *global* symbol. The body reads the parameter through the
routine's local scope, which has its own copy, so nothing reads the global
one's unit and neutering it changed nothing. It is kept for the same reason
`frac` sits beside it, and it is untested because it is unread.

### What it did not cost

The instruction stream is identical across every project but one, compared with
source quotes stripped: the only change is `prefixes`, which lost its `a16`
routine because a type cannot name one, and printed a smaller sum to match. The
identity pair holds that as a test from here on. Tier 2 ran all 62 programs green
on the migrated corpus.

---

## 72. The machine

### It was written to count one frame, and kept for what else it could do

2026-09-23. `tennis`'s render needed counting before and after a rewrite that
branched on movement, which a hand count gets wrong - and `tennis` blocks on input,
so there was no tier 2 run to hold the rewrite to either. A throwaway interpreter
of the emitted assembly answered both: exact counts, and the screen compared after
every frame (DECISIONS §27). Promoting it was a separate decision, made once it had
shown it could run a real program; the question was whether it could run all of
them.

### The first run matched 58 of 62, and each miss was a model gap

Every tier 2 program was run through it against its `.expected`, with the DOS
modelled as the most obvious reading of each call. Fifty-eight agreed, including
`momovec` at 51 million instructions. The four that did not were each a DOS or
hardware behaviour worth knowing:

- `dirlist`: a find inside a directory returns `.` and `..` first.
- `motrip`: a write through a handle opened to read takes nothing and reports
  zero, carry clear - which is the short write a save has to notice (§61).
- `porttest`: the VGA's index registers read back, and a word `out` writes the
  index and then the data port beside it.
- `scrtest`: `int 10h` 08, the character under the cursor.

`porttest` then failed one line more: it counts retraces over one BIOS tick and
expects three or four, and a retrace bit that alternated on every read counted
thousands. So the retrace moved onto the same instruction clock as the tick, and
a program measuring one against the other now sees a PC's ratio.

### The memory model was wrong and nothing had failed

The first version gave each segment value its own 64 KB, which is not an 8086:
segments overlap, and `0x40:0x6C` is `0:0x46C`. No test failed, because no
program here reaches one byte through two segment values - it was found by a
profile, not by a test, because `motext` opens a segment per 16-byte chunk and was
spending a quarter of its time allocating them. One linear megabyte with a window
per segment is both the machine's model and the faster one.

### Speed, measured

| | `momovec` | `motext` |
|---|---|---|
| first version | 4.3M instructions/s | 3.4M |
| per-instruction costs settled at decode | 8.1M | 4.9M |
| each instruction compiled to a closure | 14.7M | 7.3M |
| one linear megabyte | 15.1M | 10.8M |

All 62 programs run in about fifteen seconds, and tier 1 went from about 44 seconds
to about 62 on the machine that measured it. Five places in four files said
tier 1 took about a second - true once, and not for some while before this - so
they were taken out rather than updated: a duration in prose is the kind of number
`STYLE.md` says drifts.

### The teeth: a bug the golden tier had already adopted

The check this tier exists for is one the golden tier cannot make. Signed `<` was
broken in the emitter to emit `jb` - which assembles, and is wrong only for
negative operands - and `npm run momoc:all` adopted the result into seventeen
committed `.asm` files, exactly as a careless adoption would. Every golden check
then passed, since it compares against what the emitter now writes. **The machine
failed thirteen programs**, `cmptest` and the vector port's among them, each
taking the wrong branch on a negative value. Before this, only the next DOSBox run
could have said so.

The model's behaviours are held the same way: neutering the read-only handle
failed `motrip` and nothing else, which is the program that asked for it.

### What was left out

**Screens.** The interactive programs cannot be run to their end, as under tier 2,
but their routines can be called - which is how `tennis` was measured - and a
scripted game compared against a committed hash of each frame would give
`tennis`, the demos and `simplerl` a test beyond the golden text. It is the obvious
next use and was not wanted by anything today.

**A 286 table.** The cycle estimate is the 8086's. `tennis`'s question was a 286's,
and the answer came from the 286 itself.

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

### `mode 80,50`, and the bracket put back the wrong screen

Reported from the 286 rather than found by a test: `mode 80,50` at the prompt,
then `momoed`, and the screen fell to 25 rows - **and stayed there after
exiting**. Two symptoms, one fact, and the file already knew the fact. Its own
table comment says 80x25 and the tall mode are both `AL=03` and that the second
is mode 3 followed by the 8x8 font. `AH=0Fh` reports the number.

So `saveMode` recorded `3`, `restoreMode` set mode 3, the BIOS loaded the 8x16
font with it, and fifty rows became twenty-five. **The close is what did it**, so
it was never about the editor: every program using `videoMode` flattened a tall
prompt on the way out, whatever it did in between. The descriptor had been
written around this exact fact - it reads geometry back rather than stating it -
and save and restore never got the same treatment.

The going-in half was the same fact from the other side. `momoed` called
`setMode( modeText )` because there was no way to ask what was on screen: the
descriptor is filled by `setMode` and by nothing else, so a program that set
nothing knew nothing. §55's rule *the program owns the mode; it does not set one
by number* was written before there was any way to obey it.

### The slice, not the query, and the refusal is what keeps it a slice

`adoptMode` describes the current text mode and refuses a graphics one. The
refusal is the whole reason it can be built now: describing a mode we did not set
means reading a table that has no row for it, which is the fallback chain, which
is the query. `false` hands that back to the caller as *ask me for one instead*,
and `momoed`'s call site is one line.

The paragraph above says the query is unbuilt because nothing could run it, and
predicted that `momoed` would be what changed that. It was - just for a smaller
piece than the prediction had in mind, and by being unable to obey a rule rather
than by wanting a bigger screen.

### What it cost, predicted from the emitted code and then measured

`isTextMode` and the font branch cannot be pruned, because `restoreMode` calls
them and every mode-setting program calls that. So the cost lands on programs
with nothing to trade for it - the same shape as `simplerl`'s eighty bytes above,
and by coincidence almost exactly the same size.

Counted off the diff before building: 15 bytes in `saveMode`, 40 in
`restoreMode`, 25 for the helper, and four bytes of data for `savedRows` and the
helper's two temporaries.

| `tilefill`, the smallest consumer | before | after |
|---|---|---|
| code | 664 | 744 |
| data | 196 | 200 |
| image | 860 | 944 |

Predicted +80 and +4; measured +80 and +4. `momoed` pays 228 for both halves,
which includes `adoptMode` itself and its call site.

**Eighty bytes is what this library costs a program that gains nothing**, twice
now, for the same kind of property both times: no program here leaves a mode it
did not find. The first eighty bought putting the mode back. These eighty bought
putting the *right* mode back.

### Describable turned out to be wider than usable, and mode 7 is the gap

Reported from the same round of testing: 40x25, 80x25, 80x43 and 80x50 all good,
`mode mono` dead. Not a hang - mode 7's frame is at 0xB000, `momoed` pins `vram`
to 0xB800 for §43's own ten-cycles-a-cell reason, and the program was writing two
thousand cells a keystroke into a segment nothing was displaying. **It was
running perfectly and invisibly**, which is the failure mode a constant frame
buys along with the cycles.

The interesting part is that this was *created* by the fix above. Before
`adoptMode` the editor imposed mode 3 and mode 7 was unreachable; teaching it to
take the mode it was launched into made a describable-but-unusable mode reachable
for the first time. **A capability widened the set of screens the program would
accept without widening the set it could draw to**, and the two sets had been the
same set for so long that nothing named them separately.

So the segment is asked about before the geometry is trusted, which is twenty
bytes. §43's rule about `screenSegment()` said it was "for a program that does
not know its mode, which is the properties query and is not built" - true when
written, and the consumer that arrived is not the one it had in mind. It reads
the segment to find out what it must refuse.

### A fixture through the BIOS, because a table row would be capacity with no consumer

`modetest` sets mode 7 with `int 0x10` directly rather than through the mode
table. Adding a row for it would mean the library advertising a mode nothing here
can draw to, which is the failure this repository is a deliberate attack on -
and the claim under test is the descriptor's honesty about a mode the caller will
turn down, not the library's ability to set one.

That is the distinction worth keeping: a test may reach past a library to arrange
a condition. It may not reach past it to get a capability.

### The e2e claim is a round trip, because 43 and 50 are both right

`modetest` already asserts the tall mode as an inequality, for the reason the
adapter decides between EGA's 43 and VGA's 50. The new test takes the height
before the bracket and compares after it, setting the short mode inside so that a
restore doing nothing would leave 25 rows to be caught. The descriptor is emptied
by the restore, so what gets asked afterwards is the hardware - through
`adoptMode`, which makes one call test both halves.

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

### `textHeap` took four values, and no caller noticed

What a program writes to say where its own regions start has had one meaning and
four numbers. The first build exported the text's byte count as `textBytes`,
because the text was what sat at `_heap[0]`. §58 moved the text past the segment
and left the records in the heap it vacated, so the claim became theirs and the
name became `textHeap`. The records followed the text out and left the undo log;
then the log went too, and the number reached zero.

The contract never changed, which is why nothing reading it had to. The comments
beside it told the sequence twice over until 2026-09-24, and now say only what it
is.

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

### Tabs, and why the row read is one loop

A file with tabs rendered one to a column until 2026-09-23. §65 had recorded the
gap as a piece of work of its own, and the work turned out to be a line between
two kinds of column: the cursor stays a byte, and the left edge and the goal
become display columns.

**Where the expansion happened was the only decision with a cost attached.** A
window that sliced a row with `lineSlice` and then expanded it would have made a
second pass over every row drawn, and priced from the emitted code a byte pass is
roughly two hundred cycles on an 8086 - it would have doubled the per-row cost
that `drawrate` was written to bring down. So the expansion is inside §54's walk,
where every byte is already being visited, and the price was taken from the
assembly both routines emit:

| per byte, no tab | cycles |
|---|---|
| `lineSlice` | 216 |
| `lineCells` | 225 |

Four percent, and not the eight cycles of a comparison added to the old loop: the
new loop needs no `at + done + i` and no `left + i`, because an output position is
its own display column once the leading part of the line has been walked, and
that arithmetic it dropped paid for most of the test it gained.

**A whole screen of selection would have been a walk of every line**, and was
caught before it was built rather than after. A selected row needs the display
column its text ends at, and the obvious way to get it is to convert the line's
length - which walks the whole line, for every row in the selection, on every
repaint while it is up. The row already knows: it was handed `n` cells, so a line
ending inside the window ends at `viewLeft() + n`, and one filling it is clipped
regardless. Only a line ending at or before the left edge is walked now, and only
the first and last rows of a selection convert a column at all.

**`motabs` passed on its first run**, with every row, cursor position and
mapping in it worked out by hand beforehand. It had one
claim that was not a number: that an insert into a full sixteen-byte chunk splits
it, so the walk meets chunks that are not full. That claim is now a number too,
the chunk count either side of the insert, because a fixture whose edges are
asserted in a comment is a fixture whose edges nobody checked.

**The tab-free programs are the regression test.** `moview`, `edfind`, `edloop`
and `edsel` exercise scrolling, the goal column and selection, and their output
did not move, which is what a change that should cost nothing on a line without a
tab looks like when it is checked rather than claimed.

**The teeth were taken in DOSBox rather than by the golden tier**, because every
guard here changes what a program prints rather than only what it emits. Each of
the ten - both mappings, the four tab cases in `lineCells`, and the window's
scroll, goal and vertical motion - was neutered by line and failed `motabs`. One
neuter was written as `b != 9 || i > 999`, which is the same condition while a
chunk is sixteen bytes, and passed; it was a neuter that changed nothing rather
than a guard that did nothing, and written the other way round it failed.

**What no tier reaches is `momoed`'s half** - the cursor, the status column, the
Tab key and the two overlays - which is the part a person checks on a screen.

### What Tab types, and a fixture that could not tell

Once tabs displayed properly, the Tab key's spaces became the odd one out: a
person tabbing through a tab-indented file got spaces to a multiple of two, which
is this repository's convention and not the file's. The key now types what the
document indents with, guessed on open, and the default for a file with nothing
to go on moved from two to four at the author's own suggestion - two had been a
preference written into an editor meant for other people's files too.

**The width is a step, not a minimum**, and that was decided before any code: the
smallest indent in a C file is the one space of a comment's ` * `, and a guess
built on it would indent every C file by one.

**Two neuters changed nothing, and they meant different things.**

- Skipping a blank line when measuring the next line's step was untested, not
  weak. The fixture's only blank line sat between two unindented lines, where
  measuring from it gives the same answer. A second fixture puts blank lines
  inside a block, where measuring from a depth of 0 turns every line after one
  into a step of four and outvotes the twos; with the skip neutered it answers
  4, and it fails.
- Counting only steps that go deeper turned out to be carried twice. A shallower
  line's difference is negative, which as an unsigned number is enormous and
  fails the bound on the step table anyway - so taking `s > last` out changes
  nothing, and nothing could, short of counting outdents by their size. Doing
  that gives the same answer on any file whose indentation goes back the way it
  came, which is every file. The explicit test stays because it says what the
  arithmetic only happens to do.

**While `typeIndent` was being written**, the old code turned out to measure the
spaces to the next stop before a selection was removed, though removing one moves
the cursor to where the selection began. It is measured where the indent lands
now.

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

### The first version that was too slow, and the claim above was never measured

It was too slow, and the paragraph above is kept because it is a clean example of
the thing this file exists to catch. "Comfortably inside the time between two
keys" reads like a result. **Nothing had timed it**, and the reasoning it rests on
- two thousand is a small number - skips the part that decides the answer, which
is what a cell costs. The emitted loop is 24 instructions per cell, one of them an
`ES` reload §16 will not hoist.

Reported from the 286: holding Down overflows the BIOS keyboard buffer and the
machine beeps after about ten lines, where `edit.com` on the same machine manages
most of a screen. **Key repeat is a BIOS setting both programs are subject to**,
which is what makes that comparison evidence rather than an anecdote - it was the
one fact needed to place the cost on our side without measuring anything.

### `drawrate`, and the thing it times is the keystroke being held down

`loadrate`'s shape again: one program, both paths, prints the ratio. What it
times is deliberately narrow - a cursor moving down one line with the window
already scrolling, which is the key a hand is holding when the beeping starts,
not drawing in the abstract. Its `viewRow` is `momoed`'s two loops without the
selection and match overlays, because both are skipped on exactly the keystroke
being measured and including them would price a different case.

500 draws each, on the machine that beeped:

| | ticks | redraws/s |
|---|---|---|
| full redraw | 401 | 22 |
| scroll + one row | 128 | 70 |

**3.1 times**, and 22 full redraws a second is the number that explains the
beeping directly: a 45-millisecond keystroke against a typematic rate that does
not wait.

### The emulator said 22 times, which was not high - it was meaningless

DOSBox reported 154 ticks against 7. **A factor of 22 where the machine says
3.1**, so the prediction was seven times out, against the 13% `loadrate` ran
high by on the same emulator two days earlier.

The difference between those two errors is the lesson, and it is sharper than
"DOSBox runs fast". **`loadrate` compares our instructions against our
instructions**; both paths are emulated at the same rate, so the ratio survives
the translation and only the absolute figures do not. This comparison crosses
the emulator's own boundary: our store loop is emulated 8086, and `INT 10h`
scroll is host code DOSBox runs at native speed. The ratio it prints is between
a 286 and a modern CPU, which is not a quantity that exists on any real machine.

**A ratio that crosses the native/emulated seam is not a measurement of
anything**, and the seam is invisible from the source - `int 0x10` looks exactly
like the rest of the program. Anything DOS or the BIOS does for us is on the far
side of it: file reads, mode sets, the scroll, the keyboard. Which retrospectively
explains a run of load-time figures that came out strange under DOSBox and sane
on the 286.

### What it did to the thing the person was complaining about

The rates are the claim; the beeping is the point. On the same 286, with the
Down arrow held: **no overflow at all**, and the test ended at four hundred
lines because the person holding the key got bored rather than because the
machine complained.

Which puts `momoed` ahead of `edit.com` on this machine at both of the two
things that had been measured against it - loading a file and scrolling through
one - and neither was won by being cleverer. §58 stopped doing ten things per
character that only an edit needs; this stopped drawing cells that had not
changed.

### Paging could not be made cheaper, so it was made rarer

Arrows stopped overflowing the buffer completely - four thousand lines held
down, and the test ended the way the last one did. **Page Down still overflowed,
at around 550 lines**, which is 23 pages, and the arithmetic fits without
anything new: a page changes every row, so it takes the full redraw, and
`drawrate` says a full redraw is 22 a second.

The question it raised - whether those scancodes put more in the buffer - has a
flat no for an answer. Every key is one word in the same fifteen. What differed
was the cost of the keystroke, not its size.

**There was nothing left to remove from a page.** The window has no rows in
common with the one before it, so every cell is genuinely new; the two fixes
above both work by finding cells that are not. So the lever moved from *draw
faster* to **draw less often**: with a key already waiting, the repaint is
skipped, because the screen it would paint is replaced before anyone could read
it. A run of Page Downs paints once, when the hand comes off.

`keyWaiting` already existed, and using it would have been a bug. It is DOS
`AH=0Bh` - reached for because `int 16h AH=01h` answers in ZF and Momo cannot
read flags - and the DOS call is in the group that does **Ctrl+C checking**.
`momoed` binds `^C` to copy. Merely *asking whether a key was waiting* could
have terminated the editor on its own copy key, and the failure would have
surfaced the first time somebody copied something rather than in any tier.

`keyPending` reads the BIOS buffer's head and tail out of the BIOS data area
instead - `0x0040:001A` and `0x0040:001C`, equal meaning empty. No interrupt,
cheaper than either call, and the same move `mode.momo` already makes for the
screen geometry: **the data area knows, so ask it rather than a function that
has opinions.**

Worth recording as a shape rather than a fact about `AH=0Bh`. The hazard was
not in what the call returns - that part was right - but in what it does on
the way. A question that has side effects is a question worth asking somewhere
else, and the BIOS data area is where this program had already learned to look.

### The refusal of mono was honest and was still wrong

`mode mono` left `momoed` drawing into a segment nobody was displaying; the fix
for that was to refuse the mode. Then: **`edit.com` works in mono, and `dir`
shows text there.** So the screen was fine, DOS was fine, and the one program
that could not cope was ours.

A refusal is the right answer to *I cannot address this* and the wrong answer to
*I chose not to be able to*. §43's rule pinned the frame segment to a constant,
and the rule is right - for the program it was priced on. `tigerpic` writes
92,949 pixels and pays ten cycles for each; `momoed` writes 1,920 cells a few
times a second, and now that `drawrate` exists the difference is a number rather
than a worry. **The rule kept its reason and gained its exception**, which is
better than either leaving it absolute or quietly ignoring it.

### What the exception cost, on the same machine and the same program

`drawrate` was changed to match the editor rather than left on the cheaper form,
so the same 500 draws price the decision directly. Scroll plus one row: **128
ticks to 130**, which is the BIOS scroll dominating and the change disappearing
into it. The ratio moved 3.1 to 3.4, which puts the full redraw between 442 and
454 ticks against 401 - **about 10%**, and derived from the printed ratio rather
than read off directly.

Counted off the emitted loop beforehand: `mov bx, [hi]` added where an immediate
had been folded into the `or`, and `mov dx, [seg]` where a constant had
`mov dx, imm` - eight cycles on about eighty-four, so ten percent. That is what
the machine said, which is the first prediction this week to land on the number
rather than near it.

**Ten percent of a path that is now rarely taken, for a screen the editor could
not previously use at all.** Worth naming as a trade rather than a win: the
full redraw got slower, and the reason that is acceptable is the two changes
before it, which stopped it being the thing every keystroke does.

The attributes are the half that would have been found later and hurt more.
MDA has no colours - 0x07, 0x0F, 0x70 and 0x01 are all of them - so the
selection would have come out as something arbitrary on a screen that was
finally being drawn to. The two sets agree on text and status by accident of
the byte values, which is exactly why the status line had looked right all
along and suggested less was wrong than was.

### Where the fourteen milliseconds go, from the two numbers themselves

A full redraw is 401 ticks for 500 draws of 24 rows: **1.8 ms a row**. A scroll
plus one row is 14 ms, so the row is 1.8 of it and **the BIOS scroll is the
other 12**.

That is a long time to move 3,840 bytes - `rep movsw` would be about one - so
the BIOS is doing more than the copy, and waiting for vertical retrace is the
usual reason. It means the remaining cost of scrolling is no longer ours, and
that there is a further 7x sitting behind a call we do not control. **Not worth
reaching for until scrolling is reported as slow again**: 70 a second clears
typematic, which was the whole complaint.

### Two fixes, and both of them remove work rather than add cleverness

**A motion inside the window changes no cell of the text area.** It was redrawing
every one of them. `needText` is set in one place - `apply`, for anything that is
not a pure motion - rather than at every edit site, because the list of things
that change the screen is longer and more easily added to than the list of
motions, and being conservative the safe way costs one redraw.

**A one-line scroll changes one row.** §1 has no string instruction and this is
the second time that has turned out not to matter, because the BIOS has one:
`AH=06h` moves the window in a single interrupt and leaves exactly one row to
draw. 1,920 far stores become 80.

That is the same shape as the two load-time wins: ask DOS for 4 KB instead of
128, and stop doing ten things per character that only an edit needs. **Three
times now the answer has been to stop paying for something rather than to pay for
it faster**, and in all three cases the thing being paid for was invisible until
somebody ran the program on the slow machine.

### What a selection cost the design, and it is the frame after

A selection and an open prompt both paint into the rows themselves, so both take
the full path - and so does the frame *after* either ends. That second half is
the one worth writing down: the paint that clears a highlight has as much to do
as the one that drew it, and asking only "is something selected now" leaves the
highlight on screen after Escape. `repaint` keeps `lastSel` and `lastAsk` for
that one reason.

### Replace decided the shape of the prompt, by being two questions

`^F`, `^G`, `^O` and `^R` differ in three facts - the label, what Enter does, and
whether Enter closes - and that is a small enough difference to hold in one
mechanism. What made it *small* was allowing a command to answer Enter by asking
the next question.

Without that, replace is either a second prompt implementation or a mode inside a
mode, and the generalisation stops paying. With it, the two-part command is two
lines in the accept arm and §60 needed nothing at all.

### The label measures itself, because four more strings is four more chances

The column the field starts at was a const agreeing with the width of one string.
Five strings is four more opportunities for the caret to sit a column away from
what it is editing - which is a defect that looks like a rendering glitch and
gets noticed last.

`promptOpen` walks the label to its terminator. **A number that can be derived
from the thing it describes should be**, and the fifth consumer is where that
stopped being a preference.

### A failed open would have destroyed what it refused to replace

`^O` already refused a dirty buffer, which is §55's rule about not writing over
unsaved work. The failure path had the same defect one level in: `loadFile`
empties the buffer before it discovers the file will not fit, so refusing at that
point leaves an empty document wearing the *new* name, one `^S` from writing
nothing over it.

The fix is that the buffer was not dirty to get there, so the file on disk is
what it held and reading it back is exact. **The interesting part is that the
refusal was already written and was still wrong** - "refuse rather than truncate"
had been applied to the answer and not to the cleanup.

### The number parse went to `std/str.momo` rather than into the editor

"A digit that is not one refuses the whole answer" is a fact about numbers, not
about editors - `12x` meaning line 12 is a typo silently obeyed. So is the other
half: **past 65,535 is a refusal rather than a wrap**, which is the same failure
arriving by arithmetic instead of by a stray keystroke.

Both were written into the editor first and both had a bug there. The partial
value was left behind on failure, so a caller ignoring the bool got 12 for
`"12x"`; and the overflow was silent. Moving it to `str.momo` got it a test, and
the test is two rows either side of 65,535 - which is where an off-by-one in the
overflow check lives and nowhere else.

§55 has been noting that number *formatting* into a buffer is missing since
before the prompt existed. This is the other direction, and it arrived because a
prompt asked for a line number.

### The 286 said what a timing run is for

Two files, read from a floppy, timed from Enter to text on screen:

A 286 reading a floppy, before and after the read buffer went from 128 bytes to
four kilobytes:

| | file | | KB/s |
|---|---|---|---|
| `edit.com motext.asm` | 100 KB | 48 s | 2.1 |
| `momoed motext.asm`, 128-byte reads | 100 KB | 45 s | 2.2 |
| `edit.com momoed.asm` | 287 KB | 130 s | 2.2 |
| **`momoed momoed.asm`, 4 KB reads** | 287 KB | **65 s** | **4.4** |

The last two are the same file on the same machine, and the times are exactly
double. Before that, everything was the same rate.

### Running it from the hard disk split both costs at once

The same 287 KB file, the same machine, off `c:` instead of `a:`:

| | floppy | hard disk | so disk was | so CPU is |
|---|---|---|---|---|
| `edit.com` | 130 s | 19 s | ~111 s | ~19 s |
| `momoed` | 65 s | 45 s | ~20 s | ~45 s |

Four numbers and both halves fall out, which no pair of them could have given.

**The read buffer is worth five and a half times on floppy I/O.** The same
device, the same bytes: 111 seconds in small blocks against 20 in four-kilobyte
ones. The "exactly double" above was real and its cause was not what it looked
like - the two programs differ in how they *ask* for the file, not in how fast
the disk is.

**And our ingest is two and a half times slower than `edit.com`'s.** 45 seconds
against 19 for the same bytes with the disk taken out of it. On the floppy that
was hidden - we were ahead overall because the read buffer was winning more
than the loop was losing.

So the answer reversed twice from the same run of data. The floppy is the whole
cost; then it is not, and we are twice as fast; then the disk comes out and we
are half as fast, and were the whole time.

**`loadrate` was a prediction rather than a question**, and the prediction held.
If the 45 seconds on `c:` were essentially the loop, it should report about 225
lines a second on that machine.

It reported 8,000 lines in 605 ticks - **241 a second**, 6.8 KB/s. And the
sixteen lines a second between the prediction and the answer are the hard disk:
287 KB at 6.8 KB/s is 42 seconds of loop, against 45 measured, leaving about
three for `c:`. Every number in the table above now has a cause.

| | |
|---|---|
| floppy, small reads | ~111 s |
| floppy, 4 KB reads | ~20 s |
| hard disk, 4 KB reads | ~3 s |
| **`textLoad`, 287 KB** | **~42 s** |

So `momoed`'s file open is loop-bound on anything but a floppy, and was
loop-bound on the floppy too once the read buffer was fixed.

### The parity reading, and why it was wrong

**Two programs, files nearly three times apart in size, and the same rate.**
Which was read as: the floppy is the whole cost, and neither editor is doing
anything to it that matters.

**That was wrong, and the same machine disproved it.** One change to the
loading path - a four-kilobyte read buffer instead of 128 bytes - and the times
separate cleanly into a factor of two.

The error is worth more than the correction. **Agreement between two
implementations is not evidence that the cost is external** - it is evidence
that they are paying the same cost, and "the same cost" and "the device" are
different claims. Both programs were reading in small blocks. A comparison was
read as a measurement, and the thing it measured was a shared inefficiency.

It is an argument about the other thing it measured. Those 45 seconds were
spent showing **nothing**, while `edit.com` spent its 48 counting lines - so
what came out of a timing run was not speed but a progress dot.

`momoed.asm` failed on the same machine after about three minutes.

### The failure was not the thing the machine made it look like

The 286 reports 577 KB free, which invites the reading that the file did not fit
in memory. It is not: 577 KB gives 26,332 chunks of room past the records and the
file wanted 20,978.

**It ran out of lines.** 8,191 against a limit of 8,000, which is deterministic
and would have happened on any machine - the earlier DOSBox run that worked was a
`momoed.asm` 650 lines shorter, before this session added to it.

Three things follow, and only the last is about capacity:

- **The message was the wrong half of the answer, for the second time.** §58 opens
  by recording that the plan watched the byte figure and the line figure was the
  one that bit; the message said "does not fit in the buffer" both times. §54
  records which limit now and the editor prints it with the numbers.
- **The three minutes were spent after the answer was known.** §54 declines every
  byte once the buffer is full, and the load read on to the end of a quarter-
  megabyte file anyway. It stops at the first refusal now.
- **12,000 lines rather than 8,000.** Chunks per line runs between two and four
  across this repository, so past about twelve thousand the chunks run out first
  at any realistic shape and a larger line table buys nothing.

### A fixture passed by a hair, one commit after the rule about it

`motext` fills until the buffer refuses and checks that *lines* were what ran
out. Seventeen characters a line is two chunks, and twice the line limit is the
chunk limit - so with the line table at 12,000 the two ran out within twenty
chunks of each other, and which one won was a rounding.

Nine characters a line is one chunk, and the margin is now a factor of two. The
rule written a commit earlier was about a fixture that had to *exceed* a
constant; this is the same failure in a fixture that has to stay under a
different one, and it was found by arithmetic rather than by the test going red -
because it did not go red.

### Where the rest of the 65 seconds goes is not known, and is measurable

Seventy DOS calls for 280 KB cannot be the per-call overhead any more - that is
under a second of the 65. So what is left is the floppy and `textLoad`, in some
proportion nobody has measured.

Timing another file open cannot separate them, because it measures both again.
So `loadrate` does the half that is not the disk: the same shape of text through
§54 from memory, nothing on the disk at all. Subtract it from a real open and the
rest is the floppy.

Under DOSBox it reports 612 lines a second at 29 bytes a line - about 17 KB/s -
which is a number about DOSBox and not about a 286. **The point is that the
machine that raised the question can answer it**, and the answer decides whether
the next thing to look at is `textLoad` or nothing at all.

Which is the shape this session has hit twice: a measurement that was actually a
comparison, and then a probe that measures one half alone. `keyprobe` was the
first, for the keyboard.

The hard disk run answered it before `loadrate` was needed, and left the probe a
prediction to check rather than a question to settle. **Where the time goes is
the loop**, and what it costs against a program written in 1991 is a factor of
two and a half.

Which points somewhere specific. `textLoad` appends a character by way of
`lineInsert`, and that walks the chain from the head of the line to find where
the end is - **every character, for a line it has already walked**. Bulk loading
is the one caller that always appends to the same place it appended last, and
is the one that could be told so.

### Bulk loading: the waste was per character and the fix was per load

Yesterday's four timings left the file open loop-bound, at 241 lines a second on
a 286 against `edit.com`'s equivalent of about 570. Counted from the emitted
assembly on 2026-09-14, one loaded character costs **eleven far accesses and four
calls** - and exactly one of the eleven is the byte being stored.

The other ten are all the same mistake in different clothes: the line length is
read and written, the line head is read, the chunk's fill is read three times and
written, and `lineSeek` walks the chain to find the end of a line it walked for
the previous character. None of that is waste for an edit, which can land
anywhere. All of it is waste for a load, which always lands exactly where the
last one did.

`textBulk` keeps the position in ordinary variables for the length of a load and
writes it back at the close. `loadrate` measures both paths and prints the
ratio, on the 286 that raised the question:

| | lines/s | 287 KB of loop |
|---|---|---|
| ordinary | 234 | 43.3 s |
| `textBulk` | 917 | 11.1 s |

**3.9 times.** And the ordinary figure lands within two seconds of the 45 that
machine took to open `momoed.asm` from its hard disk, which is the disk - so the
model that said the open was loop-bound reproduces the measurement it came from.

Predicted 13 seconds from `c:` where it was 45, and 31 from the floppy where it
was 65. **Measured 12 and 26**, both better than the prediction.

`momoed.asm`, one 286, both devices, start to text on screen:

| | floppy | hard disk |
|---|---|---|
| `edit.com` | 130 s | 19 s |
| `momoed`, two days ago | 65 s | 45 s |
| **`momoed` now** | **26 s** | **12 s** |

Five times `edit.com` on the floppy and one and a half on the hard disk, from a
program that was half its speed at ingest when the week started. **Neither half
of that came from making anything cleverer** - one was asking DOS for four
kilobytes instead of 128, and the other was not doing ten things per character
that only an edit needs.

The floppy column also settles the last unknown: 26 against 12 is fourteen
seconds of floppy for 286 KB in four-kilobyte reads, where `edit.com`'s small
ones cost 111.

### DOSBox gave the direction and overstated the size

The same program reports 4.5 times under DOSBox and 3.9 on the 286 - the
prediction made from the emulator was 13% high, and a prediction made from it
about *absolute* speed would have been worthless.

Which is worth a line because every number in this file that was not taken on
real hardware is one of these. DOSBox is where a change is shown to work and
the 286 is where it is shown to be worth it, and the two questions have been
run together in here before.

**13% turned out to be the good case**, and `drawrate` above is the bad one: a
ratio whose two halves are both our own instructions survives the emulator,
because both are slowed by the same factor. One with DOS or the BIOS on one side
of it does not, and `drawrate` reported 22 times where the machine said 3.1. This
paragraph was written as though "overstated" were a single quantity with a size;
it is two different failures and only one of them has one.

### The test is equivalence, because a wrong fill still looks like text

A load that lost track of where it was would not crash or produce nonsense; it
would produce *plausible* text with a length or a chunk count slightly wrong.
So the test loads the same fixture through both paths and compares the lines,
the lengths and the chunk counts - the counts being where the difference would
surface first.

Keeping the unwrapped path is what makes that possible, and it is the reason to
keep it beyond compatibility: **the slow path is the oracle.**

### A teeth check that changed nothing, and the fixture that was the reason

Removing the flush from `bulkClose` entirely - the write-back the whole bracket
exists for - changed no expected line.

The fixture ended in a newline. A load ending on `\n` flushes on the newline and
then seeds a fresh empty line, so what the close writes back is a zero over a
zero. The one case that reaches the close is a file that ends *mid-line*, and
there wasn't one.

With `"alpha\nbeta"` in the test, the same neuter turns `2 5 1 4 1` into
`2 5 1 0 1` and loses `beta` completely. Third time this session that a check
came back clean and the fixture was the reason - and the third time it was found
by asking why rather than by moving on.

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
What is left is under a kilobyte, and **§58 stops being a good idea and becomes
the next one.** It was, immediately: everything below is what the ceiling looked
like for the one commit it lasted.

### Which is why the undo log is still sixty-four entries, and that is not enough

An entry is seven bytes and there is one per character. Cutting a single line of
sixty characters is sixty-one entries; two lines is past the end of the log.
Raising the number is the obvious fix and there is no room to raise it into - 942
bytes buys about 130 more entries, which is still less than two lines, and leaves
nothing for anything else.

**The fix is one byte per character rather than seven**, and it is a different
shape: a span deleted goes into a text arena and the log holds one entry saying
where it came from. That is a seven-fold difference on the text plus one entry
instead of hundreds.

**In the event the number was touched, because §58 made room for it.** Five
hundred and twelve entries is about eight lines cut, which is enough that the
arena stopped being urgent - so it is still the right shape and is now wanted
for its own sake rather than to escape a wall.

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

---

## 58. Text past the segment

### The ceiling was not where the plan said it was

PLAN §58 priced the ceiling in bytes - about 40 KB - and the thing that actually
stopped `momoed` opening its own source was the **line table**. `momoed.momo` is
26 KB against a 38 KB buffer and 2,097 chunks against 2,400; what refused it was
920 lines against 900.

Worth recording because the wrong half was being watched. A chunk holds sixteen
bytes but **a line holds at least one chunk**, so a file of short lines runs out
of lines long before it runs out of text, and source code is a file of short
lines. The byte figure was the one in the document and the line figure was the
one that bit.

### What it moved, and what that was worth

`npm run memory -- momoed`, 2026-09-13, before and after:

| | before | after |
|---|---|---|
| image | 24,490 | 14,002 |
| heap claimed | 41,728 | 45,312 |
| heap unclaimed | 942 | 5,670 |
| chunks | 2,400 | 8,192 |
| lines | 900 | 4,000 |
| undo entries | 64 | 512 |

The text is no longer in the 64 KB at all, and neither are the records. **The
image came down by ten kilobytes while capacity went up between three and eight
times**, which is the shape of the whole change: nothing was traded, something
was moved out of a room that was full.

The undo log is the visible half of the reclaim. Sixty-four entries meant a cut
of more than one line reported *too big to undo*; five hundred and twelve is
about eight lines, and it cost heap that the text used to be sitting in.

### A chunk is a paragraph, which is the one thing that had to be invented

The plan assumed `far u8[textBytes] text = seg` - the same array, somewhere else.
That does not work past 64 KB, because a far region is reached at
`segment:offset` and the offset is a `u16`. The capacity the change exists to buy
would have been unreachable by arithmetic rather than by memory.

A chunk is sixteen bytes and so is a paragraph, so chunk `c` became the paragraph
`c` past the base. No index holds more than one chunk, the cap goes away
entirely, and the address arithmetic turns from a shift into an add. It also
needs **two** windows rather than one, because a split and a merge copy between
two chunks and a single window would have to change segment between every read
and its write.

### The records in the image were measured before they were moved

Mid-change, with the text far and the records still ordinary arrays, the image
was **55,026 bytes** - about 41 KB of it `times N db 0`. A `.COM` that is three
quarters zeros on disk.

That is §54's own argument about the text, one level down, and it had been true
all along at a size where it did not matter. Moving the records into the heap the
text had just vacated took the image to 14 KB and cost nothing, because image and
heap come out of the same 64 KB either way.

**The rule it settled**: capacity lives in the heap or past the segment, and the
image is for code.

The cost is that a `group` could not come with them - a group's fields are
storage - so the records are parallel views, which is the source form §52 exists
to avoid. §18 lays a group out as parallel arrays anyway, so the layout is
identical and only the reading is worse. A real loss, taken deliberately.

### A compiler bug that had been unreachable until now

A `far` region whose segment is a `local` variable printed back out naming the
*unqualified* symbol: `far u8[...] src = srcSeg` rather than `= motext__srcSeg`.
It compiled correctly - the resolver does its own lookup and takes the right
label - and failed on the round trip, which is the tier that re-parses what the
printer wrote.

`resolveFarAddress` did not set `node.label`, which every other path that
resolves an identifier does. Nothing had reached it because every far segment in
the repository until now was a literal or `_ds`: a `local` variable as a segment
is what §58 needed and nothing before it had wanted.

Nine round-trip tests fail with the fix neutered, and the coverage is permanent
now that a library uses the construct.

### What is still capped

The records, at three bytes a chunk and four a line, out of a heap that is also
holding the undo log and the program's own regions. So the ceiling is a heap one
now rather than a byte one, and it lands in a useful place: **`momoed` opens its
own source and not its own assembly.** `momoed.asm` is 6,887 lines and 17,501
chunks against 4,000 and 8,192.

Streaming - keeping the file on disk and paging chunks - is still what to reach
for when that is not enough, and is still considerably more machinery. Far memory
is hundreds of kilobytes from being exhausted, so what caps this is a table in a
64 KB segment and not the memory it points at.

### Word selection cost nothing, which is what the fold was for

`Ctrl+Shift+Left` is bound nowhere and works. §57 folds Shift into the key space
because `Shift+Left` is byte for byte what `Left` reports; §55 folds it back out
in one place and keeps the flag; so a shifted Ctrl+arrow arrives as the ordinary
Ctrl+arrow action with `selecting` set, and the rule that a shifted motion
extends has already marked the anchor before the word walk runs.

Worth recording because the alternative was live at the time: a shifted twin of
every motion in the binding table. That would have needed a new row for this and
a new row for every motion after it, each having to agree with its twin for ever.
**One place that strips a modifier is not the same size of decision as a column
in a table, and this is the measurement of the difference: zero lines.**

### The measurements were taken, not kept, and then found

`keyprobe` asked for `Ctrl+Shift+Left` under two emulators. Nothing in the
repository says what it reported.

What survives of thirty-two combinations is four constants - the ones somebody
needed that day - and a paragraph of prose. §57 calls `keyprobe` "kept as the
record", and it is the *question*: the program is committed and its answers are
not. A measurement nobody can read back has to be taken again, and taking it
again is a person pressing thirty-six key combinations twice.

It was still sitting in `build/` from the original session, and it is now a table
in §57. Two things came out of reading it that neither the prose nor the
constants had.

**`Ctrl+Shift+Left` is `73E0` and so is `Ctrl+Left`**, differing in one flag bit -
which is what makes word selection free, and was assumed until the file turned
up rather than known.

**Every Shift+navigation pair is byte for byte its unshifted form**, not just
`Shift+Left`. §57 said only Left collided, which was one example mistaken for the
whole set - harmless, because the code masks the flags either way, and wrong in a
document whose job is to be the thing somebody trusts instead of measuring again.

### The convention was right, and that is the argument for the rule

`Ctrl+Right` is `74E0` and `Ctrl+PgDn` is `76E0` - exactly what `std/key.momo`
had written down as "conventionally 0x74 and 0x76" while refusing to make them
constants.

So the rule cost a round trip to a person and bought two numbers that were
already there. **That is the argument for it rather than against it.** Quoting
the convention produces the same constants and no way to know they are the same;
the value is not in the numbers, it is in which of them are load-bearing being
knowable afterwards. The one time a convention is wrong is not distinguishable
in advance from the times it is right.

### The flags in the record earned their place on the second run

`keyprobe` records AX *and* the shift flags. The second run's keypad rows
disagree with the first - `4B34` against `4B00` - and the flags do more than say
that NumLock was on. **They say on which row it changed.**

`0020` is clear on every row up to and including `Ctrl+PgDn` and set on both
keypad rows. So the keypress landed exactly where the prompts ask for it - and it
turned the guest's NumLock *on* while the host keyboard's light went off. DOSBox
keeps its own state and starts it clear; the host LED is not the guest, and the
two had been in opposite phase for the whole run.

None of that was assumed. It fell out of thirty-six rows that each carry a
timestamp of sorts - which is what a record of AX alone would not have had: two
runs contradicting each other about a key, with no way to tell which was the
anomaly or that either was.

**The same bits show the Insert toggle updating after the read rather than before
it** - `Insert` reports `0000` on its own row and `0080` on the next one down. §57
had that as a difference between two emulators; it is visible inside one run as
an ordering.

`keyprobe` now writes the toggles it started with, so the next run states what
this one left to be reconstructed.

### The records followed the text out, and the ceiling became a better one

Moving the text past the segment left the records behind as heap views, at three
bytes a chunk and four a line. So the limit stopped being the text and became a
table describing it, and the table was in the 64 KB.

What that cost, measured on 2026-09-13:

| | before | after |
|---|---|---|
| chunks | 8,192 | 24,000 |
| lines | 4,000 | 8,000 |
| undo entries | 512 | 2,048 |
| clipboard | 1 KB | 8 KB |
| heap claimed | 41,728 | 22,656 |
| heap unclaimed | 4,626 | 26,856 |

Every file in the repository opens now, including `momoed.asm` at 7,534 lines -
which §58 had recorded as the thing that would not fit. `DESIGN.md` is 5,849
lines and 21,000 chunks against 8,000 and 24,000.

The undo log and the clipboard went up because the heap emptied out and they were
the two things with a limit somebody had already noticed.

### The startup walk was affordable and also unnecessary

Threading every chunk onto a free list at `textInit` is a loop over `maxChunks`,
and past the segment each iteration is a far store. From the emitted assembly:
about 153 cycles an iteration and 24,000 iterations, so **roughly three quarters
of a second on a 4.77 MHz machine, on every file opened.**

That was budgeted for and accepted before the change. It did not need to be: a
high-water mark - the lowest chunk never handed out, beside the list of ones
given back - describes the same free list for nothing, and `chunkTake` prefers
the returned list so a long session reuses rather than climbing. One extra
branch, and the loop is gone.

**Worth recording because the permission to spend it was already given.** The
measurement was taken anyway, and what it showed was not that the cost was too
high but that the structure paying it was the wrong one. A budget is not a
reason to stop looking.

### A fixture had chased a const twice, so it reads it now

`morange` covers a group of edits longer than the undo log can hold, and its
fixture was sized by hand. The log went 64 to 512 and the test passed for the
wrong reason; it went 512 to 2,048 and passed for the wrong reason again. Both
times the case it existed for had silently stopped happening.

`textUndoMax` is public now and the fixture is a function of it. The general
shape: **a test whose fixture has to exceed a library's constant should read the
constant**, because the failure mode is not a red test, it is a green one.

---

## 62. `modir`

### The shape DOS has is not the shape a panel wants

`dirFirst`/`dirNext` is a walk, and a panel needs a count before it draws its
first row, a cursor that goes up as well as down, and an order. Three things a
one-at-a-time interface cannot give, and none of them about drawing - which is
the whole argument for this being a library with a headless test rather than two
hundred lines inside `momoed`.

### The sort is free because the disk is slow

Inserting each entry into sorted position as it arrives is O(n²) moves in the
worst case, which would be the wrong choice if anything else were happening. What
is happening is DOS reading directory sectors, and a binary search plus a shift of
at most 512 bytes of `u16` indices disappears into that.

**Sorting indices rather than records** is the part worth keeping: thirteen bytes
a step becomes two, with the comparisons unchanged. The same shape §58 used for
the line table - move the small thing.

### Two silent bugs in one expression

The thumb position is one line and both ways of getting it wrong are invisible in
a test small enough to write by hand.

`( track - size ) * top` wraps a `u16` at 288,000, which a twenty-four row track
and a twelve thousand line list reach without anything unusual happening. The fix
is `loadrate`'s: divide first, carry the remainder. **Second time that exact
shape has come up**, which is enough to call it a pattern rather than an incident.

Using `track` instead of `track - size` for the span leaves the thumb short of the
bottom when the list is at its end. Nobody reports it and everybody notices it.

So the thumb cases in `dirlist` are driven by shrinking the window rather than by
making a directory big enough - the ratios are what matter and four files reach
all of them.

### The test walked into the failure its own header describes

`dirlist` opens by saying that enumerating whatever the harness left in the
working directory would be a test of the harness. It then used `*.TXT` and picked
up `OUT.TXT`, `STDOUT.TXT` and `STDERR.TXT` - seven entries where four were
predicted.

Worth recording because the prediction is what caught it. A count written down
first turns "the harness has files too" from something to remember into something
the run says out loud, and this is the third time this week that predicting the
number first has been the thing that worked.

### The teeth check came back clean, and the mount was the reason

The fixture creates four files in an order that is not their order, which reads
like it tests a sort and does not. **Tier 2 runs under DOSBox over a mounted
host directory**, so what `FindFirst` walks is not a FAT directory in creation
order - it is the host filesystem's enumeration, and that is already
alphabetical. Every entry arrived in the position it belonged in, and neutering
the byte comparison changed not one line of output.

Fourth time in this stretch of work that a clean check was the fixture rather
than the code, and the first where the *environment* was what made it clean.
The earlier three were fixtures that happened not to reach the case; this one
could not reach it, because the thing being tested was being done for us.

**A sort is only under test where the right answer is one the source of the
data cannot already have given.** Here that is directories-first: `ZSUB` sorts
last by name and has to come out first, which no filesystem would produce. The
neuter now moves it, which is the check working.

The span check is worth a line too. `track` instead of `track - size` was
described above as leaving the thumb short of the bottom; the run says it does
something worse, putting the thumb at row 2 of a two-row track and row 3 of a
three-row one. It does not stop short, **it leaves the track entirely** - which
in a panel means drawing outside it.

### One thing the rewrite found that no neuter would have

`listLoad` did not reset the window. Loading a shorter directory left the cursor
wherever the longer one had put it, pointing past the end of a list that had
just been rebuilt - and nothing in the first version of the test loaded twice,
so nothing could have caught it. It surfaced from writing a second load into the
test for an unrelated reason.

Which is the argument for the second load being in the test permanently: the
cursor is printed beside the count there, and the only thing that makes it zero
is the reset.

### `Z*` and `Z*.*` are different patterns

One entry where two were predicted, and the reason is DOS: **a pattern with no
dot in it carries an empty extension**, so `Z*` matches `ZSUB` and not
`ZED.QQQ`. Not a library question at all, and exactly the kind of thing that
would have been a puzzling explorer bug rather than a failed prediction.

### The explorer, and what a second pane costs the rest of the program

Built in the order §55 keeps insisting on: §62 first with a headless test, then
the part no tier can reach. What that split is worth showing up as is the size of
this entry against §62's - the sort, the window and the thumb are where the
mistakes were, and they were all found by a test.

**What a second pane touched that was not obvious.** A panel is not only some
cells at the left; it is a change to what "the screen" means for everything that
was written when the editor was the whole of it:

- `viewRow` draws into a rectangle now, not a screen - an offset on the base and
  `edWidth` where it said `cols`, in five places including the selection overlay
  and the match highlight.
- **The BIOS scroll would have eaten the panel.** `scrollUp( 0, 0, cols, h )`
  moves every column, so the one-line scroll from the drawrate work had to be
  told which rectangle it owns. That is the kind of thing that looks right until
  somebody holds Down with the panel open.
- `viewSize` takes a width and has no opinion about a left edge past it, so
  toggling had to re-clamp the horizontal scroll.
- The caret. §55 had already noted there is one hardware cursor; the prompt had
  solved it once and the panel is the second customer, which is what turned a
  note into a rule.

### No arguments took the last thing tier 2 could reach

The usage line was the no-argument path, and no arguments is now a document with
nowhere to go. Removing it took `momoed` out of the e2e tier completely: every
other path opens a screen and waits for a key, which under the harness is a
timeout rather than a test.

`/?` is where it went - a DOS convention worth having on its own - and the
harness gained an optional `<project>.args` file to pass it. One line, trimmed,
appended to the command. **Most projects should not have one**: a test that needs
arguments is usually one that should have been written not to, and `momoed` is
the exception because its argument *is* the thing under test.

The test proves itself, which is the nice part: the usage line can only be
produced by `/?`, so a run that prints it is a run that got its arguments.

### One comment that was true when written and false ten minutes later

The entry block gained a paragraph saying the usage line was gone, tier 2 could
no longer reach this program, and it was now a `.momo` with no `.expected`.
Every clause of that was true when it was written and none of it survived adding
the help flag.

Worth recording because the failure mode is specific to writing the reasoning
down as you go: prose that explains a decision becomes wrong the moment the
decision is revisited, and unlike code nothing fails. The only defence is reading
back what was written rather than only what was built, which is how this one was
caught - and it is the argument for `drift` growing more of these checks rather
than fewer.

### Three reports, and two of them were the design being wrong rather than broken

Directories were missing from the panel because the editor asked for files alone,
which was deliberate and was still the wrong call. The argument for it was that an
entry you cannot enter is a control that does nothing - true, and it makes the
case for *entering* them rather than for hiding them. Hiding them makes half the
disk unreachable from a panel whose whole job is reaching files.

`^O` covered it in principle. Nobody is going to type a path to a file they can
see.

### `.` is not the same question as `..`

They were skipped together and they are not alike. `.` names the directory already
on screen and can never do anything, in any design. `..` is the only way out of a
subdirectory for a caller that does not take paths.

**The path grows and shrinks rather than being resolved.** Up from `sub\` drops a
component; up from nothing appends `..\`; up from `..\` appends another. DOS
resolves what that means, so this needs no idea of where it started and no
absolute path anywhere - two small routines and a rule.

### Escape was asymmetric, and Tab is what everybody already presses

Escape left the panel and nothing brought focus back but `^B` twice. A pair of
gestures that only works one way is a pair somebody has to remember.

Tab both ways, which is what Tab does in every dialog ever written. **`Ctrl+Tab`
is deliberately left free** for cycling documents once there is more than one -
that is what it does in every program that has both, and spending it on panes now
would mean taking it back later.

It also needed no probe. §57 measured `Tab` as `0F09` and `Shift+Tab` as `0F00`
and never measured `Ctrl+Tab` - so one of the two candidates was a fact and the
other was a guess, which settles it without any appeal to taste.

**The asymmetry in the pair is worth naming**: `Tab` arrives as a character and
`Shift+Tab` as a scancode, so the two cannot be tested as one thing at a call
site. Nobody designed that; it is what the hardware does.

### `edit.com` cannot open it either, which was the missing half of the week

`momoed.asm` has been the capacity benchmark since Monday and every refusal was
read as a limit of ours. It is not: `edit.com` reports *Out of memory* on the
same file and drops back to DOS.

That reframes three days of numbers. The editor is not behind the thing it is
measured against on capacity any more than it is on loading or scrolling - **373
KB of text needs 600 KB with §54's overhead and the machine has 577** - and every
DOS editor has a ceiling for the same reason. The interesting question stopped
being *why can ours not open this* and became *what would it take for anything to*,
which is PLAN §63 and is not urgent.

Worth recording because the fixation was reasonable and still produced a wrong
frame. The file was the largest text to hand rather than a file anybody needed to
edit - **the thing actually edited in this editor is `momoed.momo`, at 59 KB and
135 KB with records** - and a benchmark nobody has to pass is a benchmark that can
quietly set the agenda.

### The measurement that makes the choice concrete

Chunk fill is 78.2%. A line never shares a chunk, so the last chunk of each is
part empty, and 373 KB of text occupies 477 KB. Packing lines into an arena
recovers about 104 KB and would fit this file today.

**It buys headroom and not a ceiling**, which is the whole of the decision in
PLAN §63: a quarter of the work for one file's worth of growth, against a storage
model that has no limit and a seam that already exists to hold it - `lineSlice`
and `lineLength` are per line, so nothing above §54 would know.

### The undo log was the last thing inside the segment

It stayed through both earlier moves because the principle they settled said so:
capacity lives in the heap, code lives in the image. **A principle is only as good
as the condition it was formed under**, and the condition was that the heap had
room. By the time the clipboard, the read buffer and §62's directory list were all
in there, the log's fourteen kilobytes were the largest thing left and the least
deserving - written once a keystroke, read when somebody presses `^Z`.

Out it went, and `textHeap` is zero: `motext` claims no near memory at all.
`momoed` went from 10,778 bytes of heap unclaimed to 24,666, and the view count
fell from nine to four.

The cost was measured before it was paid rather than after: five `ES` reloads on
a push against a keystroke `drawrate` puts in tens of milliseconds. Not a trade
that needed thinking about, which is only obvious because the keystroke had
already been measured for a different reason.

### Doing it first, because the second document is what it is for

This is the prerequisite rather than a tidy-up. A second document needs a second
log, and inside the segment that was the end of the conversation - fourteen
kilobytes each, against a heap that had under eleven left.

Which also names the design question the next piece has to answer. Every region
§54 lays out is either **per document** - the line tables and the log - or
**shared** - the chunk store and its free list. Splitting the chunks per document
would halve the capacity of each; sharing them means a chunk belongs to whichever
document's line points at it, and the free list never learns there is more than
one. The second is obviously right and is worth writing down before it is
discovered halfway through.

### Seven rows, and two of them settled a feature to one comparison

The second `keyprobe` run, asked for by a config file rather than by a rebuild.

**Alt with the numeric keypad is composed by the BIOS.** `Alt+0233` came back as
`00E9` and `Alt+0165` as `00A5` - the finished character in `AL` with a
scancode of zero, which is exactly what an ordinary letter looks like. So §57's
key space already delivered it and had done all along; the only thing in the way
was `momoed` deciding "is this a character" with `k < 127`.

The prediction was written down before the run and held, which is worth one line
because the week's earlier predictions mostly did not.

**There is a hole in that range and the record already knew.** 127 is a printable
glyph in codepage 437 *and* what `Ctrl+Backspace` reports - `0E7F`, measured
months ago and sitting in the table. A range alone types a house where somebody
meant to delete a word.

The neighbouring collision was already handled for a different reason. `Alt+0224`
is `à`, which is 0E0h, which is also how `AH=10h` flags a grey navigation key -
and `keyNorm` tests the scancode as well, because 0E0h is a real character. That
test was written for the arrow keys and turns out to be exactly what composed
high characters need.

**`Ctrl+Tab` and `Ctrl+Shift+Tab` are one scancode.** Both `9400`, separated
only by the shift flag - `0124` against `0126` - which is the shape every
Shift+navigation pair already has. So tab cycling needs no change to the key
space at all: the fold §57 does for Shift carries it, and forward and backward
cost one binding and a flag test.

`^T`, `^W` and `^P` are 20, 23 and 16, which is what they were expected to be
and is cheap to have confirmed while the machine was in front of somebody.

### The config was bigger than the buffer, and nothing said so

Eight prompts were asked for and seven came back. `TABS.CFG` is 1,312 bytes,
`cfgMax` was 1,024, and the read stopped mid-comment with the last question past
the cut.

A probe list quietly missing its last row is the failure the *whole file* exists
to prevent - a record that looks complete. The buffer is four kilobytes now, and
more to the point the size is **asked before the read**, because a read that
fills its buffer cannot tell a file that fitted exactly from one that did not.
`fileSize` was already there.

Worth noting where the fault sat: not in the parse, which had a test, and not in
the run, which was done correctly. In the one line that chose a number, in a
program whose output is a record, with nothing checking the number against the
thing it was a number for.

### The emoji key is not a key, and the Windows key is not reachable

`3920 032E`: Space, with left shift, ctrl and alt in the flags. **No trace of
the Windows key**, which is what the keyboard also sends - the key is a hardware
macro for Ctrl+Alt+Shift+Win+Space and only four fifths of it survives the trip.

Two things worth separating, because the obvious reading of that is wrong.

**It is not the number of keys.** A keyboard reports make and break per key
independently and five at once is unremarkable. What fails is one key in
particular: the Windows key is `E0 5B`, an AT-era BIOS has no entry for it in
its translation table, and `AH=12h` has no bit for it either. It is not
*dropped*; it was never in the interface.

**It is reachable, in principle, and the price is the whole input path.** §22's
`in`/`out` and §24's interrupt handlers are both built, so an `INT 09h` of our
own reading port 60h would see the raw scancodes - Windows key included. That is
a keyboard driver, replacing `int 16h` everywhere, for one key on hardware the
target does not have.

### What it means for the picker, which is that nothing changes

As far as any DOS program is concerned, **the emoji key *is* Ctrl+Alt+Shift+Space**
- they are the same event. So it is bindable without any driver, and the cost is
the one §57 was designed to avoid: the key space carries Shift and nothing else,
on the argument that "folding Shift in costs one comparison and removes the need
for a modifier column anywhere above". Ctrl and alt would be that column, added
for one binding.

So `^P` stays the candidate - WordStar and Borland's "take the next character
literally", free in this key space, and on a keyboard the 286 actually has. The
emoji key is recorded because the question was asked and the answer is a fact
about the machine, not because anything is waiting on it.

**The row is in §57 either way**, which is the point of asking: a question asked
and answered is worth more than a question left open, even when the answer is no.

### The field got a selection, and that is what let the prompt pre-fill

Two requests that turned out to be one piece of work, and the second was waiting
on the first without either of them knowing.

§60 gains a mark and a point - §56's shape on one line, for §56's reason: a range
would be a second coordinate system to keep in step with a cursor that exists
anyway. Shift with a motion extends and the same motion without it collapses,
which is one rule in one place rather than a shifted twin of every arm.

**The clipboard is the program's**, through §37's seam, and that is the whole
point rather than an implementation detail. A field with a clipboard of its own
would agree with the document's *sometimes*, which is worse than not having one -
what a person expects is to copy in the document and paste into the find prompt,
and only asking can do that.

A paste stops at the first line, and **the program enforces it** because the
program is what knows its clipboard can hold several: §61 puts newlines between
them. Losing the lines after the first is a rule somebody can predict; joining
them would put text on the line that was copied from nowhere.

### The comment that said no was right, and had said why

`^F` emptied its field rather than pre-filling it, and the arm said exactly why:

> VS Code pre-fills and *selects*, so typing replaces it; with no selection here a
> pre-filled field would quietly append to the last search instead.

That objection was correct and is now answered by the other half of the same day's
work. The pre-fill selects, so the first character typed replaces it, which is
what VS Code does and what the comment was describing as unavailable.

**Worth recording as a shape.** A refusal that says what it is waiting for turns
into a to-do list by itself, and this one was written months before the thing it
was waiting for existed.

Single-line selections only, and that is a boundary rather than a shortcut:
§59's pattern is 64 bytes with no newline in it, so a span across two lines is not
a term it could search for.

### `fieldFrom` and `fieldTo` answer with the cursor when nothing is marked

Found by a wrong prediction rather than a failure: the test said `0 4 4` and the
run said `0 0 4`, because the mark was still sitting at 0 from never having been
set. Every caller checks `fieldSelected` first, so nothing was broken - and a
range that means nothing is a range somebody will eventually use.

They answer with the cursor now, so `from == to` is the whole definition of an
empty selection. §56 has the same property and the same callers; it is worth a
look there too.

### The screen picked the grid, and the chart convention agreed

Four rows of 64 and eight of 32 were the two shapes on the table, and the answer
was neither. 40-column mode is the narrowest this can be launched into, and 64
glyphs do not fit in it at all; 32 fit only with no space between them, and the
space is load-bearing, because box-drawing characters butted together form one
continuous line with no seam to see.

16x16 fits with the space, and then turns out to be the shape a codepage is
always drawn in anyway: row is the high nibble, column is the low one, and the
cursor's position is the code. **A constraint and a convention pointing the same
way is worth noticing** - the constraint is what decided it, and the convention is
why it reads well.

### What the picker cost, measured after it was built

1,597 bytes of code and 1,782 of image, which comes off §54's chunk store since
that is what the heap is. Fourteen routines and seven strings for a grid, a
frame, an information line and eight keys.

Worth saying plainly because §58's ceiling is the live constraint on this program
and every feature is now priced against it. This one is a feature somebody asked
for; the next one gets the same arithmetic.

### Type-ahead was cut twice, on the same argument

Both kinds were considered and neither survives contact with what the picker is
for. Typing a letter to jump to it helps nobody, because a character you can type
is a character you did not need a picker for. Typing a decimal code is worse:
somebody who knows the code already has `Alt`+code, which is fewer keystrokes
than opening a grid at all.

**The picker is for not knowing**, and that is what the information line answers -
decimal, hex and the `Alt` sequence, so browsing teaches the shortcut that makes
browsing unnecessary. A feature that competes with the faster path is not a
feature.

### §54's storage decided which characters the picker may offer

The question was which of 256 bytes actually survive being inserted, saved and
loaded back, and it was answered by reading §54 rather than by guessing.

Nothing in that library is terminated - a line is a length and a chain of chunks,
and `textSave` writes by length - so **zero is an ordinary character**. But
`textLoad` drops a carriage return and starts a line at a newline, which makes 10
and 13 the two bytes a text file's lines are *made of*. Those are refused.

Both halves matter. Blocking zero as well would have been the cautious-looking
choice and would have been wrong, and it is the kind of wrong nobody ever finds,
because the feature simply does less than it could and says nothing about it.

### Tab types spaces, and the literal tab is a bigger question than a key

Giving Tab back to the document was the stated reason for moving to `Ctrl+Tab`
cycling, so it had to actually come back. It types spaces to the next stop.

A literal tab character is one byte and the arithmetic of a whole editor. Today a
document column **is** a screen column, and the cursor, the horizontal scroll,
the selection paint and the match highlight all depend on that being true. A tab
breaks it in every one of them at once.

What settles it as separate work rather than a shortcut taken here: **a file
containing tabs already renders one to a column.** The gap is not something this
change introduces or could avoid - it is a §56 feature that has been missing all
along, and the Tab key merely arrives at it from a second direction.

Two spaces, because that is what every source file in this repository is indented
with and this editor's first job is those files. One constant.

### The switch that had to be one call

`viewSwitch` calls `textSwitch` from inside itself rather than sitting beside it
in the caller. That is the whole reason the routine exists - the window's own
state could have been eight arrays in `momoed` just as easily.

**Two switches a caller has to remember to make together are two that will one
day be made apart.** The symptom would be one document's cursor and scroll offset
over another document's text, which does not read as a missed call: it reads as a
corrupt buffer, and it would be chased in §54 for an afternoon.

The same shape as §64's refusal to clip, and as the drift check on the binding
tables: where the form can make a mistake impossible, it should.

### What multiple documents cost

Fourteen routines in `momoed`, eight arrays and a switch in §56, and 240 bytes of
names. The buffers were already there and already paid for.

The one number worth keeping is that **nothing was copied**: §54's text was never
in this segment, so a switch is a dozen counters and seven segment registers, and
§56's is eight more numbers. A document you are not looking at costs its line
table and its log, which §58 bought in advance.

### `vidprobe`, and the attribute the datasheet was wrong about

The probe was written to settle which bytes a mode-7 adapter can tell apart, on
the grounds that the menu bar needed a fifth state and mode 7 looked like it had
four. Run on a 286 with a VGA, in four modes.

**The expected answer was wrong and the useful answer was better.** Underline -
`0x01`, the classic MDA attribute and the obvious mark for an `Alt` letter - does
not render at all: it is indistinguishable from `0x07`, and `0x09` from `0x0F`.
What does render is the **intensity bit over a white background**, `0x7F`, which
nothing in the reading suggested and which turns out to be legible in colour as
well.

So the mark is one byte in both schemes rather than one per adapter. That makes
three bytes the two schemes agree on - `0x07`, `0x70`, `0x7F` - and every one the
chrome needs is in that set, which is a better position than the design asked
for.

**The probe drew a real bar rather than swatches**, with the first letter of each
of four words in the candidate, and that is why the answer is trustworthy at the
size it will be used. A swatch would have passed `0x74` and `0x71`, which vanish
completely at one character on a white ground.

Two more answers for nothing. `mode bw80` is indistinguishable from `co80` on this
hardware - `edit.com` treats it the same way - and `bw40` differs only in width,
so there are two schemes rather than four. And mode 7 has no state for "disabled":
`0x08` is invisible rather than dim, so the menu cannot be designed around greying
items out.

### `Alt`+letter, and a modifier that is not a key

`keyprobe menus.cfg`: `Alt+F` is `2100`, `Alt+E` `1200`, `Alt+S` `1F00`, `Alt+V`
`2F00`, `Alt+X` `2D00`, `F10` `4400`, `F1` `3B00`. Each `Alt`+letter is the
letter key's own scancode with nothing in the low byte.

**The shape is the finding, not the numbers.** `Alt`+numpad is the BIOS composing
a character and reporting no scancode; `Alt`+letter is a scancode reporting no
character. They are exact opposites, and §57's key space already separates them
on the low byte - so a menu on `Alt` and a document taking composed characters
cost nothing to have at once.

`Alt` held on its own reported nothing. A modifier never becomes a key to
`int 16h`, so a program that opens its menu bar on a bare `Alt` is watching the
shift flags in the BIOS data area rather than reading the keyboard. `F10` is the
route that needs none of that, which is why every DOS editor has it.

## 4. Type rules

### The folder disagreed with the machine, and the fit check could not see it

Found in a 2026-09-24 review of the resolver, then confirmed with a probe before
anything was changed. §32's analysis of folding width said "nothing disagrees",
on the argument that a literal is checked when it is read and a result is checked
where it lands. The gap is that **a folded comparison never lands anywhere**: no
assignment, no argument, no fit check. With `const u16 k = 65535`, `k + 1` folded
to 65536 on the host's numbers, and `k + 1 == 0` folded false - emitted as an
unconditional jump to the else branch - where the `inc` it stands in for wraps to
0 and the machine says true. The same expression over a `u16` variable compiled
to the add and took the true branch. One expression, two meanings, decided by
whether an operand happened to be a typed const.

The unary folds already truncated - `-` through `truncate(..., 'i16')`, `~` to
the promoted type - so the binary and shift folds were the exception rather than
the rule. The fix is one clamp at each of those two annotate sites: when the
operands combine to a concrete type, the folded value truncates to it, every
step. Untyped folds are deliberately left exact, because the fit check *does* see
those - every untyped value eventually lands - and exactness is what makes
`u16 x = 40000 + 40000` an overflow report rather than a silent 14464.

**Measured: zero emitted instructions changed across the corpus.** Every
committed golden `.asm` came out byte-identical, so no program had ever leaned on
the wide fold - the divergence was lying in wait rather than adopted. `foldwrap`
now pins the agreement: eleven values computed once through typed consts and once
through variables, and the fixture's claim is that the pairs of output lines are
identical. Teeth checked by neutering the clamp with a condition tsc cannot fold
and reading which tier failed.

## 74. `require`

### "Emits nothing" was true of the emitter and not of pruning

Built 2026-09-24, the day it was designed. The design said a require "emits no
bytes" and that the resolver work was folding an expression it already knew how
to fold, and both held for the resolver. What neither said is that a const is
written out as an `equ` whenever pruning finds its label used, and pruning walks
the retained program generically - so a require would have counted as a use of
every const it named, and a program would have come out different from itself
without its requires. This was seen reading the emitter before any code was
written, and the fix is one line in `prune`'s walk.

Neutering that line fails three tests, which is the evidence it was needed
rather than a guess that it was: `reqtest`'s golden gains four `equ` lines -
`viewRows`, `libChunkBytes`, `libArena` and `k`, the consts only its requires
name - `ok-require-checked`'s gains three, and the identity pair fails on the
first of them.

### Teeth

Each guard neutered with a condition tsc cannot fold, the suite read for which
test failed, and the file restored with `git checkout` and rebuilt.

- **The zero check** (`resolved.value !== 0 || node.line > 0`):
  `err-require-false-compare` and `err-require-false` fail with "expected an
  error containing ... but it compiled". Nothing else can: every require in
  `reqtest` holds.
- **The top-level refusal** (`&& node.line < 0`): `err-require-in-sub` and
  `err-require-in-block` fail the same way. The neuter showed what the refusal
  is guarding against, which is worse than a nested require being allowed:
  nothing else in `resolveStatement` handles one, so its expression is never
  folded, and the emitter's skip hides it completely. A require in a routine
  would read as a claim and never be asked.
- **The prune skip**, as above.

### Two things the design did not say

**A fixed-point side prints as its stored integer.** `speed > i8.8( 2.0 )` with
`speed` a `const i8.8` of 1.5 fails with "the left side folds to 384 and the
right to 512". Found by a probe, not held by a fixture, and left as it is: the
numbers are the machine's, and DESIGN §74 says so.

**A message argument needed its own refusal.** Without one, `require x <= 8,
"why"` failed with `expected end of statement but found ","`, which enforces the
rule without saying where the why goes. One check in the parser and one fixture,
modelled on the comma refusal a `for` declaration already has.

### Measured

Tier 1 went from 748 assertions to 766: seven `err-require-*` files and the two
`ok-` files of the identity pair (283 compile tests to 292), three goldens, one
capacity, three round trips, one identity pair and one machine run. Every
golden `.asm` that existed before came out byte-identical under
`npm run momoc:all`, by `git diff --stat`.

The spelling question was a grep: `\brequire\b` over every `.momo` file matched
nothing, the word appearing only inside `requires`, `required` and `requirement`
in comments. Tier 2 was left for the merge, because the worktree the build ran
in had no DOSBox configured and the emitter writes nothing new outside the new
fixtures.

### The sweep, for all three

2026-09-24, the day §74-§76 landed. `shared/` and `projects/` were swept for
places the three features could hold what a comment was holding, under two
rules: a require states a relationship a comment or a document already stated,
never a new one; and no committed `.asm` changes an instruction.

**Eighteen requires, in nine files.**

- `motext.momo`: `chunkSize == 16`, because a chunk is a paragraph; `maxChunks
  <= 32767`, the link array's offset bound; and the four fixed regions -
  `headParas`, `lenParas`, `opParas`, `lineParas` - each times sixteen against
  the bytes it holds. **The last four are the one latent hazard the sweep
  found.** Every fixed region is sized by a division that rounds down, while
  `textInit` rounds only the chunk regions up, on the stated grounds that a
  region short of its last entry overlaps its neighbour. `textMaxLines = 12001`
  compiled clean, with the line-head table two bytes short; it now fails with
  "the left side folds to 24000 and the right to 24002". The shipped values
  divide, so nothing was wrong at the time.
- `momovec/types.momo`: `maxCoord <= 32767 / 2`. Divided rather than doubled,
  because `maxCoord` is an `i16`: a probe confirmed that `bound * 2 <= 32767`
  with a bound of 16,384 folds true, since the double wraps as §4 says it must.
- `momovec/edges.momo`: `screenH <= 256`, for the scanline byte in `cy`.
- `mofind.momo`: `findWindow > findMax`, the relationship its comment said was
  "enforced by both being consts" - which it was not until this.
- `momoed.momo`: `expCols == 1 + expName + 1`, and the picker's 37x21 inside
  40x25.
- `system6.momo`: the two runs parallel to `sRowNames`, and `barSize` against
  `sBarNames`, by `len`.
- tennis: the middle angle zone wider than the six around it, and
  `subgridScale == 1 << 2` beside the `>> 2` in `subgridToPx`.
- `mode.momo`: `modeCount == 3`, which ties §75's literal bound to the count.

**Declined**: the heap chains - motext to modir to momoed, and keyprobe's and
qsort's - each written as the claim before plus its size, so they cannot
disagree; DESIGN §74 listed them as a customer and now says otherwise.
`maxCrossings` against the tiger's measured 692, which the digest already
catches. `ticksPerMinute` against the PIT's clock, a derivation nothing edits.
DOS's find-block offsets, which DOS fixes.

**Ranged units, measured in casts.** §39 makes a typed unitless value into a
unit an error, so a unit costs a cast for every variable that flows into it.

- tennis's set 1 make codes, `unit scancode = u8 < 0x80` in `t_kbd.momo`: one
  cast, at `applyKey`'s only call site. The nine codes are typed, so each is
  held against the break bit.
- `mode.momo`'s table rows, `unit modeId = u8 < 3`, taken by `setMode`: no
  casts, since all fourteen callers pass a named constant. `setMode( 3 )`
  compiled before and read past the table. A bound cannot name `modeCount`,
  because §75 folds it before any const exists, hence the require above.
- Intensity, skipped. No hand-written six-bit table exists: tennis's palette is
  eight-bit through `dac8`, and the six-bit ones are `tiger.momo`'s and
  `mvpic.momo`'s, both generated. Typing `setDac` would cost three casts in
  `tigerpic` and three in `mvpic`, which is generated and cannot take them. The
  case §75 was designed around waits on the generator.
- Columns and rows, skipped. Typing `screen.momo`'s routines would add ten casts
  - eight in `simplerl`, two in `scrtest` - and re-spell fifteen `u8( ... )` in
  `momoed`, which also runs in 43- and 50-row modes, so `row < 25` would be
  false. The bound is the mode's, and it is known at runtime.
- `key.momo`'s scancodes, skipped. They are added into the `u16` key space as
  `keyExt + keyLeft` over a hundred times and compared against plain keys.

`tennis.asm` moved in two comments and no instruction: the source quote for the
call, and the note on its store, which reads `u16 -> u8, no widening` now that
a cast declares the narrowing the argument used to do implicitly. No other
`.asm` in the corpus moved; the requires changed no source-quoted line.

**Comprehensions: none converted.** The only committed tables that are a
function of their index are in fixtures whose subject is the written form -
`consttst`'s squares are the one project covering a parameterised const called
as a written element, and `smoke`'s are its inference case. `vidprobe`'s
`hotPos` is six times its index only because of the bar string's spacing, so
the string is what it is derived from. The rest - palettes, sprites, tiles,
attribute candidates, `motabs`'s probes, `unitrng`'s ramp - are specifications
as written. DESIGN §76's customer line said such tables were being emitted into
the corpus by a host script; none were, and it now says so.

**Teeth.** `chunkSize == 16` flipped to `!=` fails every program that includes
motext, each at `motext.momo:68` with "the left side folds to 16 and the right
to 16". `scW` raised to `0x91` fails with "value 145 does not fit in scancode,
which is u8 < 128", and `setMode( 3 )` in tennis with "value 3 does not fit in
modeId, which is u8 < 3". No ranged *table* was adopted, so the
element-numbered message has no customer outside the fixtures yet.

One stale comment turned up and was left: `subdiv.momo` still gives the
coordinate bound as 8,191, "a factor of four spare", which is the figure
`types.momo` records as wrong and replaced with 16,383.
---

## 75. Ranged units

### The design left out when a range becomes known

2026-09-24. PLAN §75 said where the range is checked and not when it is
registered, and the two collide. A unit is program-wide (§39), so a const may
be typed with one declared further down the merged program - in a file included
after the one using it - and the resolver takes top-level consts in order. A
range registered where its declaration stood would be absent when that const was
checked, and the constant would pass without a word. So units are resolved in a
pass of their own, before every other declaration.

That decided the second question with it. A bound folded before any const
exists cannot name one, so **a bound is arithmetic on literals** and a name in
one is refused with that reason. Folding the bounds lazily, at a unit's first
use, would have allowed a const in a bound at the price of an ordering rule to
explain; every bound any known customer writes - 63, 80, 25, `80 * 25` - is a
literal, so the simpler rule was taken.

### Two sites the design did not list

A group's datum and a string's characters. Both already pass §4's fit check and
neither is in the design's list, so a ranged unit would have accepted
`group lamp { intensity glow = 64 }` while refusing the same constant anywhere
else. Each is checked now and has a fixture.

### A unit declaration has no newline to end it

The bound made the declaration the first one that can end in an expression, so
it seemed to want the end-of-statement check every other statement makes. It
failed twenty-six tier-1 assertions: a type token cannot end a statement, so the
lexer writes no newline after `unit px = u16`, and there was none to take. The
check runs only after a bound, which ends in something that can.

### Two holes in §39, found here and closed the same day

An array element and a group datum were held against their unit only when their
scale differed, so `const ms k = 3` went into a `px` table, or a `px` group
field, without a word. A range still spoke there - the value was checked
whatever unit it came from - but the unit mismatch is §39's to refuse, and
nothing did. Closed by making the element and datum checks unconditional, with
the element-numbered range message kept ahead of the general one so a 768-entry
table still says which element; `err-unit-mix-element` and `err-unit-mix-field`
hold it.

**The closure over-reached for one commit.** An INFERRED const array has no
declared type, and the unconditional check ran against a u16 stand-in - so
`const t = [ -1, 0, 1 ]`, which inference exists to widen, was refused. Found
during §76's build, and the fix keeps the closure only where a type was
declared: an inferred array runs the old scale-mismatch check and nothing else,
because there is no declared unit or width for an element to disobey.
`ok-const-infer-negative` and `err-const-infer-scaled` hold the two halves.

A top-level variable initialised by a call, and read by nothing, was an internal
error rather than a program: `u8 level = bright()` alone reported
`unresolved symbol "level"`. A neutered range check led an err- fixture into it,
which is how it was found. The cause was pruning's "a declaration's own label is
not a use" rule meeting §5's store-at-declaration: the store was emitted and its
target was not. A runtime initialiser now counts as its own use;
`ok-unused-call-init` holds it.

### The teeth, and three fixtures that were passing for the wrong reason

Each guard was neutered by line with a condition tsc cannot fold, and the test
that failed was read rather than the tally.

- **The constant check in `checkAssignable`** failed five: the argument,
  assignment, initialiser, order and return fixtures. The first run had the
  return fixture fail with the internal error above instead, which counts as a
  failure and says nothing about the check - so it was rewritten to need no
  call.
- **The check on a typed constant already in the unit** failed the fold fixture
  alone, which is the `peak + 10` case it exists for.
- **Registering ranges in pass 1's order instead of their own pass failed
  nothing.** The order fixture had its include *above* the constant, so the unit
  was declared first either way and the fixture held nothing about order. With
  the include moved below, the same neuter fails it and nothing else. The
  positive `unitrng` includes its units last as well, but every constant in it
  is in range, so it can show only that the order compiles - the err- fixture is
  what shows the check was made.
- **The cast check** was covered by the assignment behind it: the cast fixture
  still failed, on the assignment's wording. It casts into a plain `u16` now, so
  only the cast can refuse it, and the neuter makes it compile.
- **The element check** failed the element fixture.
- **The printer's bound** failed nothing but the assertion written for it. The
  round trip compares instructions, and a range has none.

### What it did not cost

Every committed `.asm` came out byte-identical, and the identity pair holds a
program with and without its bounds to the same instructions. No existing
fixture's diagnostic moved, although units are now resolved before every other
declaration rather than in order among them.

---

## 76. Table comprehensions

### The design did not say what a comprehension is a use of

Built 2026-09-24, the day it was designed. PLAN §76 said the body is a
parameterised const evaluated n times and that every element passes a written
element's checks, and both held as written: the elements are §8's substitution
with a compiler-made binding, and they flow through the resolver's existing
element loop rather than a copy of it.

What it left out was the two passes that walk the tree after the resolver. Both
walk generically, and a comprehension node holds a count and a body template
that is never resolved. Walked as they stand, the template's call to `curve`
has no label and becomes a call-graph edge to nothing, and a const named only by
the count becomes a use and keeps an `equ` line. Neither is true of the table
written out, so the resolved node carries its elements and both passes walk
those instead - the same arrangement a const call's `expansion` already has.
The teeth below are the evidence that each was needed.

A variable initialised by a comprehension also needed adding to the rule §75's
build wrote for pruning: an array initialiser is data, not a store, so it is not
its own use. Without it a writable comprehension table nothing reads is kept
where its written twin is dropped - which the pair did not show until it was
given one, `spare`, after the build.

### One decision the design did not make

**The counter takes no type.** `for ( u8 i in 4 )` is §45's loop spelling and
the obvious thing to try, but the binding is an untyped literal per element, and
a type there could only be checked against a value it has no way to disagree
with. Refused by name rather than ignored.

### Teeth

Each guard neutered by line with a condition tsc cannot fold, the failing tests
read, and the file restored with `git checkout` and rebuilt.

- **The per-element checks** (skipping the loop's tail for a comprehension):
  `err-comp-range` and `err-comp-fit` fail with "expected an error containing
  ... but it compiled". Nothing else in the suite reaches that tail through a
  comprehension with a value it would refuse.
- **The binding, off by one** (1 to n): `err-comp-call`, `err-comp-range` and
  `err-comp-runtime` fail on the index or the argument in their messages, and
  `gentable`, `ok-gentable-comp`, their round trips and the identity pair fail -
  but all of those on `value 256 does not fit in u8`, because `curve`'s
  parameter is a byte and the last element overflows it. That is a failure for a
  reason other than the data, so the binding was also **reversed** (n-1 down to
  0), which keeps every element in range. Then the goldens fail on the data
  itself - `gamma` starts `239, 237, 235` against `0, 0, 0` - and so does the
  identity pair, on the same line.
- **The splice refusals**, both neutered: `err-comp-splice` fails with
  `expected an expression but found "for"` and `err-comp-splice-after` with
  `expected "]" but found ","`. The language refuses either way; the refusals
  are what say why.
- **Pruning walking the node generically**: `gentable` gains `cols: equ 8` and
  `ok-gentable-comp` gains `steps: equ 6`, the consts only a count names, and
  the identity pair fails on that line.
- **The call graph walking the node generically**: `ok-gentable-comp`'s stack
  reserve goes from 2 bytes to 4, and the identity pair fails on `_hstack`.
  `gentable` does not move, because its deepest path already runs through
  `putNumber` and a phantom edge one call deep is not deeper - so the pair is
  what holds this, not the project.
- **A comprehension initialiser counted as its own use**: `ok-gentable-comp`
  keeps `spare: db 1, 2, 3, 4`, and the identity pair fails on that line.

### Measured

Tier 1 went from 803 assertions to 830: fifteen `err-comp-*` files and the two
`ok-` files of the identity pair (317 compile tests to 334), three goldens, one
capacity, four round trips - one of them the text assertion from both sides -
one identity pair and one machine run. Every golden `.asm` that existed before
came out byte-identical under `npm run momoc:all`, by `git diff --stat`.

Fold time does not matter at the sizes a table has. Median of five compiles on
the build machine: a one-element table 2.6 ms, `curve` over 256 elements 9.2 ms as
a comprehension and 8.8 ms written out, and a 4,096-element `u16` table 19.5 ms.
The cost is the resolving, which a written table pays too.

Tier 2 was left for the merge, because the worktree the build ran in had no
DOSBox configured; the emitter writes nothing it did not write before, and the
machine tier ran `gentable` against its `.expected`.

## 49. Named and default arguments

### The measurements, because the premise this inherited was wrong

Lifted from the PLAN section on the day it was built, frozen dates intact.
`momolo/build.momo` explained the `cfg` carrier by saying a fourteen-parameter
sub "would be unreadable at every call site" - a claim about a shape nothing
here had. Across the roughly 260 routines in the 92 `.momo` files under
`projects/` and `shared/`, **the maximum arity was 6, and exactly two routines
reached it** - `quadSpan` and `quadLimited`, the six coordinates of a
quadratic. One routine took five. Nothing else took more than four.

```
0: 123   1: 49   2: 44   3: 32   4: 8   5: 1   6: 2
```

The histogram is fixed at its date and the tail is the only part worth
trusting - both ends were checked by enumerating headers, the buckets between
are a snapshot. The first version of that table did not survive being
recounted (`277 routines ... 5: 2   6: 4`, double the true tail), which is the
same failure §48's wrapper table had.

Over the 32 bracket opens, measured the same day and fixed there:

```
settings before an open   0: 11   1: 1   2: 7   3: 4   4: 5   5: 3   7: 1
                          69 settings, mean 2.2, max 7
```

Ten of the fourteen `cfg` fields were ever set, and five setters carried 50 of
the 69. **They are not a prefix**, which is the finding that shaped the design:
trailing defaults alone reach none of this, so it was both halves or neither.

### What the build added to the design

- **Pure arguments store in declaration order; effects evaluate in written
  order.** The design said "written order is the honest answer"; the build
  found the split that also keeps the identity claim - a reordering of pure
  stores is unobservable, so it is normalised, and only effects pin the
  written order, through the stack path that already existed.
- **The count message grew a range** (`takes 1 to 2 argument(s)`) only where
  defaults exist; the exact-count message survives untouched for every call
  shape that existed before, which one legacy fixture held it to.
- **An emitted comment mangled itself.** The reset comment first read
  "defaults restored on the way out (§49)", and the golden tier failed against
  the fresh compile: the tools write `.asm` as ascii, so the section sign's
  byte came back as an apostrophe on disk while the in-process compare held
  the real character. Emitted text is 7-bit now, by rule in the DESIGN
  section - CLAUDE.md's opening re-encoding trap, met in a second format.

### What is not yet measured

Whether momolo's swap - openers with defaults against `cfg`, `cfgReset` and
the wrapper subs - comes out smaller or larger. The design refused to settle
it by argument: the answer is one scene written both ways under
`npm run memory`, and it belongs here the day the adoption lands.
