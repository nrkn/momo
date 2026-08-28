# Peepholes

Local rewrites the emitter applies to code it is about to produce. Each one takes
a shape that appears repeatedly in the output and replaces it with a shorter or
faster form that provably does the same thing.

They live here rather than in `DESIGN.md` §9 for three reasons. They are a
**catalogue with its own numbering**, cited by number from `emitter.ts` and from
`shared/lib/std/rand.momo` - so a peephole number is a stable identifier in the
same way a `§` is, and must keep meaning the same rewrite. They are a **workflow**
rather than a subsection: the list grows when somebody sweeps the emitted assembly
looking for a shape that repeats. And at 209 lines they were three quarters of
§9, which made that section "the peephole catalogue, with some codegen around it"
rather than a description of codegen.

**Numbers are stable and only ever appended**, for the same reason section numbers
are. A rewrite that is superseded keeps its number and says so.

A `§` below is a section of `DESIGN.md` or of `PLAN.md` - the numbers are one
namespace across both, so §14 is the testing tiers wherever it currently sits and
§24 is interrupt handlers, which are designed and not built.

## How one gets added

The method the entries below were found by, written down because it is not
obvious from any single one of them:

1. **Read emitted assembly for a shape that repeats.** Entry 12 came from writing
   a probe to see what a VRAM-to-VRAM copy produced; entry 13 from reading
   `simplerl`'s entry sequence and asking why an argument was widened where an
   assignment beside it was not.
2. **Establish that the rewrite cannot change behaviour**, and write that argument
   down. It is the field most likely to be wrong, and several entries below turn
   entirely on it - 8 on signedness, 14 on adjacency, 15 on reach.
3. **Measure it across the committed programs**, before and after, in instructions
   and bytes. Every figure below is counted rather than estimated, because DOSBox
   cannot time an 8086 (`CONTRIBUTING.md` records why).
4. **Adopt the golden diff case by case.** 7-11 landed together that way, and the
   point of reading every hunk is that each one should be a shape you recognise.

## What this list does not record

Each entry says what the rewrite is and, usually, why it is safe. **None says
where in the emitter it lives, or carries a field asserting that it is built at
all.** That absence is not cosmetic: entries 4 and 5 were listed here as built for
a long time and were not, and nothing in the document could have contradicted
them.

Filling that in means checking fifteen entries against the emitter, which is a
separate pass rather than part of moving the text - so it is recorded in
`PLAN.md` instead of guessed at here.

## The catalogue

### 1. Leaf RHS skips the stack

Load a variable/constant operand straight into
BX instead of `push ax` / eval / `mov bx,ax` / `pop ax`. Biggest win, and the
reason a binary expression over two variables is four instructions rather
than seven.

### 2. Constant store direct to memory

`x = 0` is `mov byte [x], 0`, with no
round trip through AX.

### 3. Single-argument calls skip the argument stack

The push/pop pair that
protects an already-filled parameter slot is only needed when there are
several arguments to protect (§7).

### 4. Same-width copy skips widening

`u8 x = u8 x1` loads AL and stores it,
with nothing in between. Only a *bare* load qualifies: `x = x1 + 1` still
widens because arithmetic happens in 16 bits, and `u16 w = x1` still widens
because the store keeps all of AX.

### 5. Truthiness of a byte skips widening

`test al, al`. A byte is zero
exactly when its widening is - neither `xor ah, ah` nor `cbw` can change
that - and only ZF is read, so the widening is dead work. `if (arr[i])` and
`if (_cf)` (§10) both take this path; `if (someU16)` still tests AX.

### 6. A cast that cannot change the bits emits nothing

`u8(x)` where `x` is
already `u8` or `bool`, `i8(x)` where `x` is already `i8`. Safe because
arithmetic is always 16-bit (§4), so nothing typed narrower can reach the
cast un-widened. `u8(i8 x)` and `i8(u8 x)` still emit: those reinterpret.

Worth having because §8's return-type rule creates the duplicate. A
parameterised const wraps its expansion in a cast to the declared type, and
`const u8 lo(u16 w) = u8(w)` already ends in that same cast - so every call
to `lo` emitted `xor ah, ah` twice.

### 7. Zero uses the zero idioms

A compare against 0 emits `test` (`cmp` with
0 clears CF and OF exactly as `test` does, so every jump reads the same), and
a constant 0 loads as `xor ax, ax`. Each a byte shorter, and each the form an
8086 reader expects.

### 8. Byte operands compare in AL

When both sides are bare byte loads of the
same signedness, or one is a constant the byte's own range holds. The
signedness check is what makes it safe: 0xC8 is 200 as a u8 and -56 as an i8,
so mixed operands still widen - even for `==`, where the bytes comparing
equal would be the wrong answer.

### 9. A constant stored through a runtime index skips the save

The value is
an immediate in the store itself, so the push/pop that protects AX while the
index is computed does nothing and is not emitted. Extends peephole 2 to
computed indices, and to far regions.

### 10. `+ 1` and `- 1` are `inc`/`dec`

A third the size of `add ax, 1` and
twice as fast. They leave CF alone where `add` would set it, which is safe
because nothing reads CF between expressions - `_cf` is captured inside the
int helpers only.

### 11. A loop test that folded to a constant emits nothing

`while (true)`
used to pay `mov ax, 1` / `test ax, ax` / `jnz` every iteration to discover
that 1 is true.

### 12. An element of a `far` region is a bare byte load too

So 4 and 5 apply
to it, and `pixels[d] = pixels[s]` no longer computes a widening it throws
away. It was excluded by an `array`-only check for as long as `far` existed,
costing one instruction in fourteen in exactly the shape a blitter has: a
VRAM-to-VRAM copy, which under EGA write mode 1 moves four planes at once.

### 13. A parameter or return slot takes the store peepholes too

2 and 4 apply
to `f( x )` and `return x` exactly as they do to `x = y`. A slot is a label
and a type like any other destination, but it was written by its own
two-line helper that had neither shortcut, so `f( 7 )` loaded 7 into AX to
store AL, and `f( byteVar )` widened a byte on its way into a byte. 226
instructions across the committed programs, and 176 bytes off the twenty
tier 2 builds.

**One shape costs a byte**, and it is worth naming rather than netting off:
a *word* slot given zero was `xor ax, ax` plus a store, which is 5 bytes,
and is now a 6-byte immediate store. Seven sites. The instruction and its
~4 cycles still go, and taking the exception would mean the assignment path
and this one disagreeing about `x = 0`, which is worse than a byte.

**A bare load reached through a parameterised const is still widened.** The
expansion of `tileAt( x, y )` *is* `map[ y * mapW + x ]`, but `byteTypeOf`
sees a `CallExpression` and stops, so `maptest` and `simplerl` each keep a
dead `xor ah, ah`. That gap is older than this peephole and sits in 4 as
much as here - `ch = tileAt( x, y )` pays it too.

### 14. A load of what the line above just stored is dead

The register already
holds it.

```nasm
        mov     [handle], ax
        mov     ax, [handle]        ; gone: AX has not been touched
        mov     [closeFile__handle], ax
```

126 instructions and 401 bytes across the committed programs (103 direct
loads at 3 bytes, 23 indexed at 4), and roughly 10 clocks each. The shape is
`handle = _ax` followed by `closeFile( handle )`, so it is a
**statement-boundary** artefact rather than a hole in any of 1-13: each
statement is compiled correctly on its own, and only the seam is wasteful.
That is also why it needed a peephole rather than a fix - nothing in the
expression path can see across the boundary.

The safety argument is one sentence: the two are adjacent, so nothing can
have touched the register in between. It looks at the previous instruction
rather than tracking liveness, and the scan skips source quotes and blank
lines because they emit nothing. **A label stops it**, because another path
can arrive there with the register holding anything.

**`far` is excluded.** An `es:` operand may be video memory or the BIOS data
area, where the bytes can change between two instructions without this
program writing them - the 8086 takes interrupts between instructions, so a
reload from there is not provably the same value. Our own segment has no
other writer while §24's handlers stay unbuilt, which is the assumption this
rests on and the thing to revisit when they are built.

**The largest single beneficiary is `nextRandom`**, which loses three loads
per call - one per xorshift step, plus the `return`. That is the routine
whose own comment in `std/rand.momo` says two thirds of its cost over the
LCG is codegen rather than algorithm, so the peephole lands exactly where
that note was pointing.

**The teeth were checked by breaking it.** Letting the backward scan cross a
label - the one protection above - makes `qsort` sort wrongly and `momolo`
hang. Two things are worth recording about that. Tier 1 said nothing, because
the golden files had been regenerated, which is the stash-and-rebuild trap
wearing a different hat: adopting output and then testing it proves only that
the compiler is self-consistent. And tier 2 caught `qsort` cleanly on its
numbers but caught `momolo` only by hanging - `e2e.ts` had no timeout, so a
non-terminating program waited for a human to close the window rather than
failing.

**That is fixed.** A case gets 120 seconds and is then killed and reported as
a timeout, before the assembly check - because a program that does not
terminate may well have assembled perfectly. It took a second occurrence to
do it: a wrong `xy` ordering in the vector port's quadratic never left its
recurrence, and cost another interruption. A gap that has been recorded twice
and hit twice is one that should have been closed the first time.

### 15. The branch expansion is taken back where the target is in reach

The
single most valuable one here, and the refinement the paragraph above spent
the whole project deferring.

```nasm
        jae     .L1     ; unsigned <              jb      target
        jmp     target                    ->
.L1:
```

**542 of 636 branches**, 542 fewer instructions and 542 fewer labels, 1,626
bytes. The cycle win is the bigger half: a taken `jcc` costs 16 clocks and an
untaken one 4, so the fall-through direction stops paying 12 clocks for a
jump it was only stepping over, and the other direction saves 3. In a loop
that is per iteration.

It runs as a pass over the finished output rather than inside `jumpIf`,
because a forward branch cannot be measured while it is being written.
Reach uses a two-bucket upper bound - 7 bytes for an instruction touching
memory, 4 for one that does not - rather than a per-mnemonic size table,
which would be a second record of §1's table and is the kind of duplicate
that has been got wrong here before. It costs 25 inversions an exact table
would find, or 75 bytes.

**Cascading was tried and reverted, and the round trip is why.** Collapsing
one expansion can leave another in its place, which is a real further
saving - but whether the three lines end up adjacent depends on whether a
`; ---- source` comment falls between them, and that depends on the source
text rather than the program. `if( done ) break` keeps the `break` on the
`if`'s line so its quote is suppressed and the cascade fires; the printed
copy puts it on its own line and the comment blocks it. Same program, same
instructions, different output - which is exactly what the desugar round trip
exists to catch, and it caught it on the first run. The candidate set is now
fixed before anything moves, so the pass is a function of the instruction
stream alone. 48 collapses, 144 bytes.

**NASM does this expansion itself, which was not known when the deferral
above was written.** `jz far` under `cpu 8086` assembles to `jnz $+3` and a
near `jmp` - silently, on NASM's default `-Ox`, using 8086 instructions - so
an out-of-reach `jcc` builds and runs correctly rather than being rejected.
Two consequences, and they pull in opposite directions:

- The bound is not protecting correctness. It is protecting the claim that
  one line of emitted assembly is one instruction, which is what makes
  counting the `.asm` a valid way to reason about speed (§26, §27) on a machine
  DOSBox cannot time.
- Emitting the tight form *always* and letting NASM expand what does not
  reach would be optimal by construction, delete this pass and the expansion
  in `jumpIf`, and take 636 labels out of the output. Measured against the
  24 tier 2 programs it is **38 bytes** better - 29,828 against 29,866.

**That option was considered and declined.** Peephole 15 already captures 98%
of it, so the question was never really about code size: it was whether the
emitted assembly may contain a line that is not the instruction that runs.
It may not. One line is one instruction, the reader can count what they see,
and the tables in §26 and §27 mean what they say - on a machine DOSBox cannot time, that
correspondence is the whole of how performance is reasoned about here, and it
is what "the output is the product, not an intermediate" (§1) is asserting.
38 bytes is not a price worth paying for it, and the expanded form stays
wherever the branch genuinely cannot reach.

The `-Ox` behaviour is still worth knowing, because it means this pass can
never break a build - the worst an under-estimate can do is leave NASM to
expand a branch, which costs the honesty above and nothing else.
## How this list has been wrong

4 and 5 were listed here as built, for a long time, and were not. That is the
argument for the golden `.asm` tier (§14): a claim about generated output that
nothing compares against is a claim about nothing. Building them took 84 bytes
off the fourteen committed programs and added no instruction anywhere. 7-11
landed together in one later sweep, adopted by reading the golden diff case by
case - every hunk in it is one of those five shapes. 12 came later still, and
only because a probe was written to see what a VRAM-to-VRAM copy emitted.

13 is a different failure from 4 and 5, and a quieter one: both were genuinely
built, and neither could be reached from the path a call argument takes, because
that path stored through a helper of its own. Nothing in the golden tier could
have caught it - the output was stable and had simply always been this. It took
reading `simplerl`'s entry sequence and asking why an argument was widened where
an assignment beside it was not.
