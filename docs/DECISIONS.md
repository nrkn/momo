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
