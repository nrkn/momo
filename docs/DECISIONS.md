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

`momolo` and `mlodemo` emit code identical to what they emitted before, and the
count of source-quote comments is unchanged too - 674 and 588 - because each open
and each close is still exactly one statement. What changed is what those quotes
say: `panel( blue ) {` and `}` where they read `panelOpen( blue )` and
`closeBox()`. **The tree structure is now visible in the emitted assembly**, which
was not a design goal and is the nicest thing about the diff.

e2e stayed 39/39 with the swept scene, which is the check that matters: `momolo`
dumps every resolved box as numbers and holds them against the study's own.

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
