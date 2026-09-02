# Plan

What is going to be built, how sure that is, what is still unsettled - and the
design of the things that are not built yet.

It opens with the destination, which is context rather than work. Then two parts.
**The index is the working half**: one line per item, a `§` pointing at its
design, and items moving between the tiers and into Done. **The designs are the
second half**, further down, and they are here rather than in `DESIGN.md` because
`DESIGN.md` describes the system as it stands, and these are not part of it yet.

When one gets built, its section moves into `DESIGN.md` and its item moves to
Done. **The number goes with it.** Section numbers are one namespace across all
three documents - §24 means interrupt handlers wherever it currently lives - so
the number tells you the topic and the file tells you the status.

## Where this is going

`DESIGN.md` opens by saying what Momo is: a fantasy console, for real hardware.
What follows from that is a tier of applications - a machine you can develop on
without leaving it - and this is where they are named.

**It is a destination, not a queue.** Nothing here is a Todo item until something
makes it one, and the list below is deliberately not sorted by when it might
happen.

| | | wants |
|---|---|---|
| `momowad` (§41) | assets in bulk, with Doom-style PWAD overrides. Compatible with WAD at the container level, carrying our own lump types | nothing - §38 landed |
| `momoed` | the editor - an explorer beside a text pane, toggled away for width, and text modes `edit.com` never had | the screen library (§43) |
| `momode` | a graphical shell and launcher. Single-tasking, and windowed by screen offsets an aware program is handed (§43) | a mouse, and §40's ES gap |
| `momove` | a small vector editor, for icons and the like | a mouse, §37's geometric booleans |
| `momopnt` | the library three image editors share - sprite, bitmap font, paint | a mouse, a palette library, §43 |
| tilemap, sfx and music editors | the rest of the shape a fantasy console is expected to have | sound, which nothing here has touched |

**Two capabilities are missing under all of it**: a mouse and sound. File I/O was
the third and is built (§38), which takes the deepest of them off this list -
`momowad` now waits on nothing. Both of the rest are close: §22's port I/O was
justified partly by the PIT and the speaker, and §24 already records that a mouse
callback is the one thing that would want `retf`.

**This is deliberately not one section number.** §21 was dissolved because it was
nine unrelated things under one number, and exactly the same mistake is available
here. Each of these takes its own number when it is designed, and enters Todo when
something wants it.

It is also the likeliest thing to reach `CONTRIBUTING.md`'s first case for a
branch, and by some margin.

## What Done means here, and what it does not

Entries reach Done two ways, and the line between them is the whole of what makes
this list trustworthy.

**A plan that was written down can be lifted here.** For a long time `DESIGN.md`
was the only place intent had anywhere to live, so several of its sections were
written as designs *before* they were built and then corrected rather than
rewritten - its preamble names §16, §17 and §19. Where such a section says plainly
what was planned, what landed and what was deferred, moving that here is
**transcription**: the claim is already on the page, and the diff can be checked
against it.

**A plan that exists only as commits cannot.** Working out from git history what
somebody must have intended is **forensics** - inference wearing the clothes of a
record - and it would produce a list nobody could rely on. **A Done section that
is almost complete reads as a record and is worse than an honestly empty one**,
because then the absence of an entry stops meaning anything.

So the test for an entry is: **does a document already say this was planned?** If
it does, lift it. If it would have to be inferred, it does not belong here - and
that is not a gap to be filled in later.

Work that was built without its plan ever being written down is therefore absent
by design. Look instead at

- **`git log`**, which is the actual record and does not drift;
- **DECISIONS §15**, which records the original acceptance bar and what met it;
- **DECISIONS §20**, which records the questions that stopped being open and how
  each was settled.

### Two kinds of entry

An item that **passed through Todo** above moves down as one line plus the date it
landed.

An item **lifted** from a section that was itself a plan carries no date, and
points at the section it came from instead. The date is not omitted out of
laziness: recovering it means going to the commits, which is exactly the
archaeology this file refuses. An undated entry is honest about what it is.

## Todo

Three tiers, by how likely a thing is to happen rather than how large it is.
**Maybe** is not a waiting room for good ideas - it is where something sits when
nothing has yet wanted it.

That last test is weaker for sugar than for anything else here, and is worth
applying with the difference in mind. **Sugar over a construct that already exists
has a visible longhand**, so the corpus can be counted: §44's 131 loops and §45's
34 are the feature written out by hand. A new capability has no longhand - nothing
looks like §23's `scope` un-had, because without it a program makes a file or does
not encapsulate at all. So for a new construct "nothing has wanted it" means what
it appears to mean, and for sugar it means only that the long form was tolerable.
What was restructured, or never written, to avoid the long form appears in no count
at all, which makes one a floor rather than a measurement.

### Definitely

- **Finish the vector library.** `shared/lib/momovec/` is the largest thing in
  `shared/` and is not done. **Built and running on the target:** the tiger
  filled and stroked, thick strokes as ribbon unions, subdivision on the 8086, a
  lines-only conformance level, rejection clipping, clip paths, a transform
  applied as geometry is read, and the text scene format end to end - `tiger`,
  `thick`, `subdiv`, `tflat`, `tpan`, `tclip`, `tzoom`, `mvdemo` and `momovec` in
  tier 2, `tigerpic` and `mvpic` golden-only because they draw and wait for a
  key. Three things are open:

  - **Geometric booleans** - the one area untouched. The sign of a difference of
    products does not survive a shift, so it wants either a `crossSign` intrinsic
    returning -1/0/1 or a real `i32`; the intrinsic is cheaper and leaves §9's
    accumulator model alone. Its case also shrank: `clippath.momo` does clip-path
    rendering by span intersection, which was the commonest reason to want a
    polygon boolean, so what is left is wanting the result *as a path* - to
    store, transform or stroke - which is an authoring need.
  - **The scene format running on DOS.** Its lexer and parser are ordinary code
    and are not written in Momo yet. §32's hazard applies.
  - **The scene format carrying a transform.** `tzoom` applies one as geometry is
    read; the format still bakes coordinates in.
- **A text adventure.** DECISIONS §15 - the last item on the original acceptance bar,
  and nothing in the language blocks it. Also what the README rewrite waits on,
  since a README that shows off wants something to show.
- **Fixed-point division.** DESIGN §25 is half built and says which half: `*` on
  8.8 lands, division does not, and §25 sets out why it is the awkward one.
- **`block`.** §47 - three routines over the word `arena` already reads, saying
  where the block DOS gave us ends and whether a region fits in it. Twenty lines
  and no compiler change, and it opens the mode 13h back buffer, §41's asset
  arena and §43's backing stores - the best ratio of downstream to surface on this
  list. It spun out of §40 the way §34 and §35 spun out of §16: the small
  buildable piece, leaving that section the genuinely blocked ES half.

### Probably

- **Named and default arguments.** §49 - `fillPath( p )` where `tidy` defaults to
  true, and `walkPath( pathIndex, wantPixels: true, ... )` where the corpus has
  three bare booleans in a row today. The named half needs no codegen change at
  all; the default half is what §48's `cfg` misreading actually needs, and it
  rests on a mechanism Momo has and stack languages do not - the callee restores
  its own defaults, which is what `cfgReset` already does by hand. Measured: max
  arity in the whole corpus is 6, a box carries 2.2 settings on average, and the
  frequent ones are not a prefix - so it is both halves or neither.
- **`alias`.** §46 - a compile-time name for one element or one group instance, at
  an index the program chooses. §45's `of` is this with the index owned by the
  compiler, so the substitution is already built and what is new is a capture rule;
  §46 takes the one the call graph can check. It reaches what `of` could not:
  `fit.momo` reads `el[ i ]` twelve times in four statements, indexed by a routine
  parameter. Here rather than Definitely because §45 pointed at the same 281 sites
  and delivered eight loops - the rule needs deciding and the reading claim needs
  measuring, in that order.
- **Memory past the segment.** §40 - and **most of it turned out not to be
  blocked**. `arena` reaches 634 KB past its own segment in tier 2 with no compiler
  change, because §35 landed the day after §40 said it was the one thing wanted;
  the allocators were always libraries; the robust `_hsize` reads the same
  `PSP:0x0002` word `arena` already reads; and the swap file wanted §38, which is
  built. What remains is a far arena library over that word, and the one genuinely
  blocked half - shrinking the program's own block, which needs a way to set ES
  that does not exist. Same shape as §38's DS problem, one register along.
- **The screen library.** §43 - a table of modes with the shape of a pixel in it,
  a yes/no/maybe query that resolves by setting a mode and reading it back, and the
  current-screen descriptor `momode` would set to put a program in a window. Mode
  13h is set by hand in five places today and `screenCols` is a constant. One thing
  wants settling before any of it is written: a runtime screen width costs nothing
  now and about 7x once §29 lands, because §26's odd-residue tier was designed for
  exactly these strides.
- **A test tier below DOSBox.** §42 - an executor that decodes the assembled
  `.COM`. The headless half is done and cost two flags rather than a project, so
  what is left is counting cycles exactly: the timing tables in §16, §26 and
  DECISIONS §27 are assembled by hand from static readings of the assembly, and an
  executor would count what actually ran.
- **A palette and colour study.** Scope undecided, and that is the first job -
  most of the model is host-side work, so the interesting Momo library is small.
  `STUDIES.md` has the register entry. Two consumers already exist and disagree:
  `tennis` reduces 8 bits to 6 on the target, `tigerpic` has it done by the
  generator, and neither lives in a library. Nothing in the repo touches the DAC
  ports, though §22 made them reachable.
- **A schema study.** A description of a data shape, rich enough that more than
  validation comes out of it. Validation is the obvious use and the least
  interesting: the same description should generate a **binary layout** - a reader
  and a writer - a **property inspector** for an editor, and the **grammar of the
  text format** that produces the data in the first place. That is the declarative
  pipeline the scene work already has one instance of, generalised from geometry to
  anything.

  Two things would use it immediately. §41 leaves the lump-type question open -
  Doom's WAD has no type field, so ours has to choose between markers, a name
  prefix and a per-lump header - and a schema is what makes that choice once
  instead of per asset kind. And `momopnt`'s three editors want property
  inspectors over three different shapes, which is exactly where generating the
  interface from the description pays for itself rather than being clever.

  Scope undecided, as with the palette study, and that is the first job. Most of it
  is host-side generation; what runs on the target is a reader, and a validator
  only where data can arrive from a file rather than from the compiler.
  There is prior work to model it on, across the author's own projects and
  elsewhere, and auditing what exists is part of the first job rather than
  something to finish before starting. `STUDIES.md` has the register entry.
- **Compile-time array parameters.** §19 - designed in full, and the case that
  most wanted it (`drawString` over many messages) was met by `peek`/`poke`
  instead.
- **`scope`.** §23 - designed in full; no program has wanted it yet.
- **Interrupt handlers.** §24 - designed in full. A raw scancode reader and
  held-key input are what would ask for it.
- **Optimise `tennis`.** It runs well on a 486 and flickers on a 286 - vsync fixed
  the flicker on fast hardware, and that is as far as it got. The intended work was
  always known and is recorded in the source rather than in any document:

  - **Word blitting.** `t_scr.momo` declares `view u16[32000] pxwords` "for later
    optimisation of `setPixel`", and `drawBackground` uses it as a demo of "the
    word blitting we will use extensively later". Nothing else does yet.
  - **Skip `pset`.** `drawLineHorizontal` and `drawLineVertical` go through it
    because that was easier; the note beside them says writing them by hand is
    much more efficient.
  - **Unroll the sprites.** `draw`/`clearPaddles` and `draw`/`clearBall` need not
    call `drawLineVertical` at all - nine direct `pixels[n]` writes each - with
    pixel doubling as the complication: one axis can be done with a word, the rows
    still have to be doubled.
  - **Dirty tracking, only if the above is not enough.** A 27-element buffer for
    the 9x2 paddle pixels and 9 ball pixels plus a count, or just each object's
    movement offset so the redraw knows exactly how many pixels changed. The
    source is explicit that this waits: *"wait and see how it plays out before
    prematurely adding this"*.

  The word blitting is §27's finding arriving in a real program - that section
  concluded word views are worth doing today with no compiler change, and this is
  the program that cares.

  **Its comments come after the code.** `STYLE.md`'s comment rule exempts `tennis`
  until this lands, because the notes above *are* the plan and tidying them first
  would delete it.
- **Rewrite `README.md`.** `CONTRIBUTING.md` records that it is provisional, in a
  register the other documents do not use, and that rewriting it waits on programs
  worth showing and on a draft written rather than generated.

### Maybe

- **A `type` keyword.** Declare a `group`'s shape once and instantiate it in
  several places. Nothing has wanted it: no two groups in the repo share a shape,
  and `player` and `ball` in `tennis` come closest while still differing. What
  makes it worth keeping is that it is the *nominal* version of §19's group
  parameters - which that section calls structural typing and the deepest of its
  three extensions - since two groups declared from one shape match by
  construction with no structural comparison anywhere. `momopnt`, one toolkit
  under three editors, is where the want would arrive.
- **`defer`.** The other half of §48, and deliberately not folded into it. The
  resource shape is different: `fileOpen` returns a handle and `fileClose` takes it
  back, so the pair is value-carrying, and what goes wrong is an early `return`
  leaking one rather than a miscount.

  ```momo
  h = fileOpen( name, readMode )
  defer fileClose( h )
  ```

  That is also a parser rewrite - no unwinding and no exceptions, so it is "emit
  these calls before every exit from this block, in reverse" - and bare blocks
  already exist to scope it. But it is **not free**: the call is emitted once per
  exit path, so a routine with three returns pays three times, and it puts sugar
  into control flow, which nothing else here does.

  The distinction that keeps them apart is that **`defer` makes a close reliable
  and a bracket makes it mandatory.** You can forget to write a `defer`. Forgetting
  was momolo's entire problem, which is why §48 went first; leaking on an early
  return is `std/file.momo`'s, and nothing has complained about it yet. Here rather
  than in Probably for that reason, and it takes its own number if it is wanted.
- **`in` over a count.** §45 - `for ( u8 i in maxPaths )` for `0 .. maxPaths - 1`,
  which would cover §44's 131 loops and §45's thirty-four in one form. Here rather
  than in §45's first build because it makes `in` mean two things - an extent in
  one operand position and a plain value in the other - for a gain §44 has already
  mostly taken. **Not for want of a customer**: the 131 loops are this written out
  longhand, which is more evidence than anything else in this tier has, and the
  note under Todo is about exactly this case.
- **`--cpu` target levels.** §28. 186 is modest, 286 is a rounding error, 386 is
  transformative - and 386 would change §4's type rules, so it is not only a
  backend switch.
- **`-o`.** §29 - one level, comments kept, explaining the optimisation.
- **Hosted targets: JS, WASM, native.** §30 - the most designed of these; the
  abstract machine does not change, only the emitter and a shim.
- **Dropping the assembler.** §31 - emit `.COM` bytes directly. Would take DOSBox
  out of the build and 1.6MB of binaries out of the repository.
- **Self-hosting.** §32 - and §32's own hazard applies: it manufactures needs, so
  the tell for any feature is whether it still looks right with self-hosting
  struck out.
- **Other CPUs, `momo/z80` and `momo/6502`.** §33 - these do change the abstract
  machine, unlike the hosted targets.
- **Hoist the ES load.** §34 - designed, not built. Measured at 4% of a mode 13h
  fill loop, 2.1% of a `tilefill` screen and 1% of `rndpix`, so it is behind loop
  machinery, index recomputation and the push/pop pair on every measurement taken.
  Not wrong, just never the biggest thing left.
- **Align the data section.** DECISIONS §27 measured this at **-13% on a true
  8086 and nothing at all on an 8088**, whose 8-bit bus pays two cycles for a word
  access however it is aligned. Most of these machines were 8088s, so it waits for
  a reason to prefer one over the other - and Momo has nowhere to say which it is
  tuning for, since §28's CPU levels are about the instruction set and bus width
  is a second axis.

  If that reason arrives it is `align 2` at the data base **plus** a width sort,
  not the sort alone: sorting only makes every word share the parity of the block
  start, and that parity comes from the code size, which the compiler never learns
  because it emits NASM source rather than bytes. The cost to weigh is not the one
  padding byte but that sorting by width scatters each routine's locals across two
  groups, where the data section currently shows a whole frame in one place.

## Questions

Not work at low confidence - decisions that are unsettled, and that gate work.
All are set out in DESIGN §20 unless noted.

- **Real functions.** Genuine stack frames would bring back BP, `lea` and
  recursion, and would destroy the exact static memory analysis. That trade is
  what keeps them out.
- **A graphics library.** No longer blocked - `far` (§16) makes the buffers
  ordinary memory - so what is open is mode setting, sprites and clipping rather
  than any access to the hardware.
- **A direct-write path for `screen.momo`.** Every routine in it goes through
  `int 10h`, one interrupt per cell.
- **A raw scancode reader in `std`.** `key.momo` is `int 16h`, which blocks and
  cannot see a held key.
- **`asm { }` passthrough** for hand-written NASM. Probably not needed for a long
  time.
- **What precision does constant folding happen at?** The folder runs on the
  host's numbers, so it folds at a precision the language cannot express. The
  analysis is in §32; three ways out, none chosen.

- **How a nested structure should be built is answered**, and the answer is §48 -
  the record is DECISIONS §20. The half it does not touch is the config carrier,
  which is a library design waiting on a language feature nobody has designed.

- **Does Momo want a third namespacing mechanism?** Arbitrary const trees for
  organisation, whose leaves are ordinary consts - name mangling and nothing more
  by the time it reaches the emitter. The question is not whether it works. It is
  that `group` already gives dotted access and is used deliberately that way -
  `ball` in `tennis` carries a comment saying it is namespacing rather than
  structure-of-arrays - and §23's `scope` gives named blocks of declarations. A
  third would have to earn its place against both, and answer §23 directly:
  *owners are flat, which is the decision that keeps this small*. Arbitrary trees
  are exactly what that declined.

## Done

**Not a history.** Only what passed through the list above, or was lifted from a
section that was itself a plan - see the note at the top for why, and where to
look for the rest.

- **`bracket`.** 2026-09-03. §48, now in `DESIGN.md`, and the record is DECISIONS
  §48. A declaration naming an open/close pair, and a block form calling them
  around a body written in place. It does **not** lower in the parser, which the
  design said it would: a file is parsed before its includes are, so a bracket
  shipped by a library is not in scope where it is used, and the pairing runs as a
  pass over the merged program instead. That turned out to be the better seam -
  declarations are program-wide and order-free, so `mopaint.momo` names its own
  four pairs. 32 of the 34 opens in the corpus became blocks, the emitted assembly
  moved only its source quotes, and momolo still agrees with the study on every
  integer.
- **`for ( x in a )` and `for ( x of a )`.** 2026-08-29. §45, now in `DESIGN.md`,
  and the record is DECISIONS §45. Both lower in the parser, so the resolver, the
  emitter and the printer are untouched again, and the pair that has to emit the
  same instructions does - over an array, an indexed group and a `far` region. `of`
  binds a name to an access rather than to a value, which is what lets it reach a
  group at all without the record type §18 deliberately has not got.
- **Declaring the loop counter in a `for`.** 2026-08-29. §44, now in `DESIGN.md`,
  and the record is DECISIONS §44. The parser lifts the declaration and leaves the
  assignment behind, so the resolver, the emitter and the printer are all
  untouched, and the pair of files that have to emit the same instructions do -
  120 of them, identical. The one thing the design left open closed on the
  mechanism rather than on a judgement: nothing downstream ever meets an
  initialiser, so §5's rule needed no exception.
- **`unit`.** 2026-08-29. §39, now in `DESIGN.md`, and the record is DECISIONS
  §39. A named numeric type whose values will not mix with another unit's without
  a cast, and the first feature here to subtract a permission rather than add
  one. That it costs nothing at runtime is asserted rather than argued: two
  programs identical but for their units have to emit the same instructions,
  which the golden tier could not have checked. The design's one hole was where
  the knowledge that `px` is a type lives, and the lexer is where it went.
- **Teach the printer to lower `local`.** 2026-08-29. DESIGN §14, and the record
  is DECISIONS §14. The round trip went from 62 assertions to 77 - nothing is
  skipped now - and closing the gap turned up a bug that had been hiding behind
  it: the emitter keyed a routine's temporaries by name where the call graph
  keys by label, so §12's worst-case stack was under-stated for every program
  with a private sub.
- **File I/O.** 2026-08-29. §38, now in `DESIGN.md`. `shared/lib/std/file.momo`
  and `filetest`, with no compiler change of any kind - the design's central claim
  held. It takes the deepest blocker off the applications tier.
- **`_ds`, so a program can learn its own segment.** 2026-08-29. §35, now in
  `DESIGN.md`. Two bytes per read, no storage, no new mnemonic, and `dstest`
  proves it is really our segment by finding the `int 20h` at the head of the PSP
  through a far region based on it. What it unblocks is everything in §40 that
  wants memory past the segment.
- **Record where each peephole lives.** 2026-08-29. All fifteen are built, which
  was the thing worth finding out - 4 and 5 were fiction here once. `PEEPHOLES.md`
  carries a table of function names rather than line numbers, and each entry was
  located in `emitter.ts` *and* checked against the 46 committed `.asm` files,
  because a call site proves the code exists and only the output proves it fires.
  Three entries were corrected by the audit.
- **Sweep the Momo comments.** 2026-08-29. Less history than expected and more
  stale fact: two citations of §21 after §21 was dissolved, six missing section
  signs, a claim that port I/O did not exist yet, two counts in `std/io.momo` that
  had drifted, and a `mlodemo` header describing paragraphs as unwrapped after
  wrapping landed. `std/rand.momo` was the one file where the content was the
  problem, and lost two thirds of its header. `tennis` is still exempt - see
  Optimise `tennis`.
- **Finish moving the record into `DECISIONS.md`.** 2026-08-28. §15, §16, §17,
  §18, §20, §22, §25, §26 and §27 - §27 dissolved entirely rather than splitting,
  and §16 spun out two designs of its own, §34 and §35. What remained at the end
  was judgement rather than work - whether the split lands where a reader would
  put it - and it was read through and let stand.

---

# Designs

Everything below is designed and not built. Each keeps the number it will carry
into `DESIGN.md` if it is built.

## 19. Compile-time array parameters

Routines currently take scalars only, so `memcpy`, `fill`, `strLen` and
`drawString` cannot be written as reusable library code. Allowing **arrays and
views as parameters, resolved at compile time**, closes that:

```momo
sub clear( u8[] target ) {
  u16 i
  for ( i = 0; i < len( target ); i++ ) {
    target[i] = 0
  }
}

clear( mapData )
clear( entityData )
```

### `len` came with it - and landed first

**Built; see §5.** `len(x)` folds to the declared length of an array. It is
required *here*, because inside `clear` the length is only known per
specialisation - but it was independently useful, so it landed on its own, which
is what "stands on its own" in the original note was betting on.

The two cases that were waiting on their own features have both arrived with them:

- `len` on a **group** is its instance count - `for ( i = 0; i < len( mob ); i++ )`
  (§18).
- `len` on a **view** is the view's length, not the underlying array's (§17). This
  one took no code at all: a view *is* an array symbol, so it was already
  answered.

### The mechanism is monomorphisation

A routine with a compile-time array parameter is a **template**, not a routine.
Each distinct argument emits a separate specialisation:

```momo
clear( mapData )      // emits clear__mapData
clear( entityData )   // emits clear__entityData
```

This is related to parameterised consts (§8) but not the same granularity: a
const inlines an *expression* at the call site, whereas this emits copies of a
*routine body* and calls them. It is the first place one source declaration
becomes several emitted things.

**Code size scales with call-site variety** - the central cost, and the reason
this does not displace `peek`/`poke` (below).

### Rules

- **Element types must match.** `u8[] a` accepts any length; `u8[64] a` requires
  exactly that length, mirroring declarations.
- **`const u8[] s`** as a parameter is read-only, and a `const` array may only be
  passed to such a parameter.
- **Views are arrays** with an offset baked in, so they pass with no extra work.
- **Locals may be shared across specialisations.** No recursion and no
  reentrancy, so `clear__i` needs one slot regardless of how many copies exist.
- **Cycle detection moves to the specialised call graph.** `sub f( u8[] a ) {
  f( b ) }` may be acyclic in the source and cyclic after specialisation.
  Reassuringly, **specialisation always terminates**: arrays cannot be
  manufactured at compile time, so the set is bounded by what is declared.
- **Arguments must be names**, not expressions. `clear( cond ? a : b )` is an
  error.

### The one thing this makes worse

**Diagnostics grow an instantiation chain.** An error inside a specialised body
needs to say *"in `clear`, instantiated from simplerl.momo:42"* - the C++ template
error problem in miniature. Momo's diagnostics are currently precise and
single-location, and this is the only feature so far that erodes that. Worth
building the chain properly rather than reporting the definition site alone.

### It does not displace `peek`/`poke`

Both solve "a library routine over a buffer", with **opposite cost profiles**:

| | Code size | Speed |
|---|---|---|
| Compile-time array parameter | one copy per distinct argument | direct addressing, fast |
| `peek`/`poke` on an address | one copy total | indirect, slower |

`drawString` called with twenty different messages wants `peek`/`poke` - twenty
copies of a loop would be absurd. `clearBuffer` called on two large arrays wants
a compile-time parameter.

Compile-time parameters also preserve the no-pointers property that `poke8` gives
up, so where both fit, this is the more Momo-shaped answer.

### Higher-order and generic routines

This section stops at array and view parameters. Two natural extensions were left
out because each is a distinct feature rather than an increment:

- **Routine parameters** - `sub forEach( u8[] a, sub visit( u8 ) )`. Callbacks
  that cost nothing at runtime, since specialisation turns them into a direct
  `call`. Needs function *types* in parameter lists, which the grammar has no
  notion of.
- **Group parameters** - `sub update( group mobs )`, meaning "any group carrying
  these fields". That is structural typing, and the deepest of the three.

Both would reuse this section's monomorphisation wholesale; the cost is in the
type system, not the backend.

Worth recording that the case which wanted the first of these did not need it.
`tiger` and `tigerpic` differ in one routine, and the rasteriser
never learns which: a library file may call a routine the *program* defines, and
it compiles to a direct `call`. That is what routine parameters would have been
for, and it needed no language feature at all.

---

## 23. `scope`

Designed and not yet built. `local` (§11) gave a declaration an owner, and the
owner it can name today is the file that writes it. `scope` is the same idea with
a second thing that can own: a named block of declarations, at the top level of a
file, whose privates belong to it rather than to the file.

```momo
const mobCount = 64

group mob[mobCount] {
  u8   x
  u8   y
  u16  hp
  bool alive
}

scope mobIds {
  local u8 nextId = 0

  u8 newId() {
    nextId++

    return nextId - 1
  }

  u8 lastId() => nextId - 1
}
```

### The gap, stated exactly

**`local` is inert in the entry file.** Nothing includes `simplerl.momo`, so a
declaration marked private there is hidden from nobody. Which means a program
written in one file - which is how most of them start, and how the small ones end
- has exactly the encapsulation Momo had before §11: sub-locals, and then nothing
until global.

`mobIds` above is the shape that falls in the gap. `nextId` is shared by two
routines, so it cannot be a sub-local, and it should be reachable from nothing
else, so it should not be a global. The invariant is "ids only ever move forward,
through `newId`", and today any line in the program can write `nextId = 0` and
collide every future id with a live entity. That is the same guard-with-a-hole
that `randomSeed` had, one level in.

**The argument for a construct rather than a file is proportion**, not cohesion.
`mobIds` would work perfectly as `shared/lib/mobids.momo`. It is eight lines, one
variable and two routines, and making a file for that is ceremony. Nothing else
about it needs a boundary the file system can see.

### Rules

- **Top level only, and no nesting.** A scope holds declarations; a scope inside a
  scope has nothing to mean.
- **Declarations only, no statements.** That is what keeps §5's initialiser rule
  honest inside one: `local u8 nextId = 0` is a load-time value exactly as it is
  at the top level, because nothing about a scope is reached by control flow.
  Allowing statements would make it a control-flow construct and the ban would
  come back with it.
- **`local` is the only marker.** Inside a scope it means private to the scope,
  outside it means private to the file - one rule, "private to the nearest
  owner". Unmarked means visible to the program, which is what it already means.
  No `export`, and therefore none of the naming argument that word invites.
- **The scope name is not a name.** There is no `mobIds.newId()`; an unmarked
  member lands in the ordinary global namespace unqualified. The name exists to
  own the privates and to prefix their labels, `mobIds__nextId`.

### Owners are flat, which is the decision that keeps this small

A scope **replaces** the file as owner rather than nesting inside it. So lookup
stays at the three levels §11 already has - a sub's own storage, then its owner,
then the program - and an owner is either a file or a scope.

The alternative, a scope nested in its file, reads more naturally and costs more
than it is worth: lookup becomes a chain rather than a level, `local scope x { }`
starts meaning something and has to be defined, and label prefixing grows a second
axis.

**What flat owners give up is nearly free.** A scope cannot see its own file's
`local` declarations. In the entry file there are none to see, because `local` is
inert there - which is exactly the case this feature is for. It bites only in a
library file that uses both, and a library file that wants two private groups can
be two files without anyone calling that unwieldy.

Ordinary globals stay visible, which matters more than it sounds: `newId` above
should be checking `mobCount`, and `mobCount` is an ordinary const. A scope is a
privacy boundary, not an isolation boundary.

### Implementation

**Flatten scope bodies into the top-level body between load and resolve**, tagging
each member with its owner. That is what `include` already does one level up, and
it is what makes this cheap: six places assume a routine is a direct child of the
program body - `buildCallGraph`, both emitter loops, both resolver passes, and
`prune`'s filter - and a scope that stayed nested would be invisible to every one
of them. A routine nobody puts in the call graph is a routine pruned as
unreachable and never emitted, silently.

**Between load and resolve, not inside the loader**, for one reason: `desugar`
only loads, so it would still see the scope and print it. `scope` is expressible
in a single file, so unlike file-level `local` it survives the round trip (§14)
and stays covered by that assertion.

The labels, the third lookup level, the owner-per-declaration and the
label-keyed call graph all exist already. This is the smaller half of §11.

### The open question is frequency, not feasibility

Nothing here is unresolved. What is unknown is how often the shape comes up, and
the evidence so far is thin in both directions.

Against: `simplerl` is the only non-trivial single-file program here, and its
file-level state divides into scratch that wants to be **sub-locals** - `x`, `y`
and `ch` are used only inside `draw` - and state genuinely shared with the entry
sequence, which has nobody to hide from. It wants no scope at all. And the
adjacent entity-pool pattern needs none either: with `bool alive` in the group,
allocation is usually a scan for the first dead slot, which is a routine over the
pool holding no private state.

For: the text adventure (DECISIONS §15) is the remaining acceptance item, it is by nature a
larger single-file program, and a parser with scratch state, an inventory and room
flags is where clusters of this shape would appear if they appear anywhere.

So this waits on a program the way `far` waited for `tilefill` and `peek`/`poke`
waited for the string library. If two or three `mobIds`-shaped clusters turn up in
one file, that is the answer; if the candidates all turn out to be sub-locals or
genuinely program-wide state, the intuition was about tidiness, which is a real
thing and a different feature.

---

## 24. Interrupt handlers

Designed and not yet built. A handler is a routine the hardware calls: the timer
every tick, the keyboard on every press and release. Momo cannot write one today,
because a handler ends in `iret` rather than `ret` and there is no way to say so.

**What actually wants it, in the order the feature set favours.**

- **Music and sound.** A beep is fire-and-forget through §22's ports, but a tune
  has to advance while the program is doing something else. Sequencing it from
  the game loop couples the music to the frame rate - every frame that runs long
  stretches the notes, which is why so many DOS games play faster on a faster
  machine. This is the case polling genuinely cannot substitute for.
- **The keyboard**, but only with chaining below. A handler that replaces the
  BIOS one loses the buffer, the shift state and Ctrl-Alt-Del - the same damage
  as masking IRQ1, arrived at differently.
- **A crash-cleanup hook on `int 0`**, which is the least settled of the three;
  see the open question at the end.

Timing is deliberately absent from that list. Retrace polling (§22) is a finer
clock than the BIOS tick, and latching PIT channel 0 through `in8` reads the
count *within* the current tick at 838ns resolution without reprogramming
anything. Both arrived with ports, and neither needs a handler.

### The shape, and the prologue §2 says does not exist

A handler differs from a `sub` in four ways: it saves every register it touches,
it fixes up DS, it ends with `iret`, and for a hardware IRQ it acknowledges the
interrupt controller.

```nasm
onTimer:
        push    ax
        push    bx
        push    dx
        push    ds
        mov     ax, cs                      ; tiny model: our segment
        mov     ds, ax
; ---- ticks++
        inc     word [ticks]
; ---- out8( 0x20, 0x20 )
        mov     al, 32
        mov     dx, 32
        out     dx, al
        pop     ds
        pop     dx
        pop     bx
        pop     ax
        iret
```

The DS fixup is not optional. Interrupts fire while DOS is running, when DS is
DOS's, and every `[label]` in the body is DS-relative - without it a handler
reads and writes someone else's memory. **This is the first routine in Momo with
a prologue and an epilogue**, and §2's "no prologue, no epilogue" needs
qualifying rather than deleting: ordinary routines still have neither, and this
one has them because it is entered by hardware rather than by a call.

**The EOI is not emitted for you.** Whether a handler acknowledges, and whether
it does so itself or leaves it to a handler it chains to, is policy - and §22
already made `out8` visible at every use, so it costs nothing to keep this
visible too.

### What already exists and does most of the work

**The recursion check is the reentrancy check.** §2 rejects call cycles because
locals are statically allocated; an interrupt is an unplanned call into the
middle of one. Nothing reachable from a handler may also be reachable from the
entry point, and the resolver already builds a label-keyed call graph and walks
it for precisely this shape. It is one more walk and an intersection, reported in
the same terms:

```
error: putNumber is reachable from both the entry point and the handler
onTimer - locals are statically allocated, so an interrupt during a call
would overwrite that call's own variables
```

**Handlers cannot collide with each other**, which halves the check. The CPU
clears IF when it services an interrupt, so a handler runs uninterruptible until
its `iret`. Only handler-against-main matters, never handler-against-handler -
and `sti` inside a handler is therefore an error rather than a hazard, at no
cost, since nothing wants it.

**`addr` is the liveness signal.** Installation is `_dx = addr( onTimer )`, so a
handler whose address is never taken is provably never installed, and pruning
drops it. That is what `addr` already does for an array (§5): taking one keeps
otherwise unused storage alive. `addr()` rejecting routines is the single
existing rule that has to relax.

**The `int` ban falls out rather than being imposed.** A handler may not use
`int`, for two reasons pointing the same way: DOS is not reentrant, and the
reserved globals `_ax`..`_di` belong to whatever the main line was staging. For
the same reason a handler may not assign to them.

**Static locals are an advantage here.** A handler runs on whichever stack was
current - DOS's, during an `int 21h` - so it has to be frugal, and a Momo handler
needs no stack for locals at all. Only the register saves and expression
temporaries, both of which §12 already counts. That sharpens something §12 calls
out as its own weak point: the 256-byte interrupt reserve is "a documented
allowance rather than a derived number", and with handlers your half of it
becomes derived and checkable.

**The register save set is computable.** §9's contract is AX accumulator, BX
index, DX scratch, CL for shift counts, SI/DI/BP unused - and the emitter knows
whether a given handler used CL, or touched a `far` region and so needs ES. The
pushes can be the minimum that handler actually needs rather than a blanket save,
which matters when the whole body is often three instructions.

### The surface

A modifier, the way `local` is - §11 already established that any declaration
takes one:

```momo
interrupt sub onTimer {
  ticks++
  out8( 0x20, 0x20 )                  // EOI, because we are not chaining
}
```

No parameters and no return type: it is called by hardware, so there is nothing
to pass and nowhere to return a value. `return` remains a bare early exit, which
lands on the epilogue rather than emitting a `ret`.

Installation stays explicit, in the same register as `peek`/`poke` and `in`/`out`
being visible at every use site:

```momo
far u16[1024] ivt = 0x0000            // the vector table, as words

u16[2] oldTimer

// save: int 8 lives at 0000:0020, so words 16 and 17
oldTimer[0] = ivt[16]
oldTimer[1] = ivt[17]

// install: AH=25h takes DS:DX, and DS is already ours - CS is never named
_ah = 0x25
_al = 8
_dx = addr( onTimer )
int 0x21
```

That DS-implicit install is what lets a program point a vector at itself without
any way to read CS. **Restoring cannot use the same route**, because the original
vector points into the BIOS at F000 and AH=25h would need DS set to a segment
Momo cannot name - so a restore writes the two IVT words directly. See the cost
below.

### Chaining, and the far-call carve-out

A handler that replaces the previous one loses whatever that one did. Chaining
calls it instead, and the mechanism is a **far indirect call**: `call far [mem]`
reads four bytes - offset then segment - and calls that, pushing CS and IP where
a near call pushes IP alone.

One subtlety makes the idiom look strange the first time. The previous handler
ends in `iret`, which pops IP, CS **and FLAGS** - three things, where the call
pushed two. So the flags are faked first:

```nasm
        pushf                         ; the flags the interrupt would have pushed
        call    far [oldTimer]        ; its iret pops all three, returning here
```

`pushf` already exists, earning its place in §1 for `_cf` (§10).

```momo
interrupt sub onTimer {
  ticks++
  chain( oldTimer )                   // pushf + call far [oldTimer]
}
```

Four rules, each mirroring something that already exists:

- **Only inside an `interrupt sub`**, so a call the compiler cannot see never
  appears in ordinary code and the call graph stays complete everywhere else.
- **The operand is a named `u16[2]` global**, not an expression - the same
  restriction §16 puts on a far segment, and for the same reason: it becomes a
  direct memory operand with nothing left to compute.
- **The cost is charged to the interrupt reserve**, not to §12's worst-case
  figure. A chained BIOS handler uses an unknowable amount of stack, which is
  exactly the category that reserve was written for.
- **No EOI is emitted around it.** The chained handler sends one, and a second
  would be wrong.

`jmp far` tail-chaining is deliberately excluded. It is cheaper and never
returns, which collides with both the unreachable-code rule (§5) and the
every-path-returns analysis (§2) for a saving nothing would notice.

### What it costs

**`iret` is unavoidable - 39 to 40.** The far call adds nothing: `call far [mem]`
is the `call` mnemonic with a different operand form, and §1's table is a list of
mnemonics. `retf` would be a genuine addition, and is not needed here - it is the
other direction, a routine *called* far, which only a mouse event callback wants.

**`cli`/`sti` take it to 42, and the reason is the restore path rather than the
install.** Writing the two IVT words leaves a window where the vector is half
ours and half the BIOS's, and either order is unsafe. The alternative is to
accept a race that is vanishingly rare and catastrophic when it fires, which is
the wrong shape for a feature whose whole job is cleaning up after itself. §22's
own out-of-scope list named these two for exactly this.

**Two claims in §1 get qualified.** "CS, DS and SS are never emitted, never
overridden, never thought about" becomes true of ordinary code and false inside a
handler, which needs the DS fixup and, if it chains, leaves the segment entirely.
And "far calls" moves out of the deliberately-absent list into a carve-out. Both
were stated as pleasant consequences of the tiny model rather than as invariants,
and neither is load-bearing for anything else.

**§12 keeps its exactness**, which is the claim worth protecting. Every figure it
computes for your own code stays computed; what a chained handler costs lands in
the reserve, where BIOS handlers already sat.

### What this does not buy

Not speed: a handler is not faster than the code that would have polled, it is
only independent of it. Not timing - §22 settled that. Not general far calls,
which buy nothing in a self-contained `.COM` and would cost the call graph
everywhere.

And not, on its own, a safe keyboard. The chaining carve-out is what turns an
ISR keyboard from "the same damage as masking IRQ1, differently arranged" into
one with no hazard at all. Handlers without chaining would leave the keyboard
exactly where §22 left it.

### The open question is how a fault handler exits

`int 0` was the tidiest argument for this section - a divide by zero is
effectively Momo's only crash, and a handler could unmask IRQ1 and restore
vectors before dying, closing the one hole §22's keyboard design has to live
with. Working it through, the exit is the problem.

Terminating with `int 21h` breaks the no-`int` rule and is genuinely unsafe
mid-fault. Setting a flag and `iret`-ing is clean, and depends on where the CPU
pushed the return address: **8086 and 8088 push the address of the instruction
after the `div`, while 286 and later push the faulting instruction itself.** So
the same handler resumes cleanly on the target CPU and spins forever on the
machine most people would run it on.

That is resolvable - a flag and an `iret` is right for genuine 8086, and anything
later needs the faulting instruction skipped, which means knowing its length. It
is recorded here as unsettled rather than designed, because the other two cases
do not depend on it and this one should not hold them up.

### Testing

A timer handler is testable under tier 2 the way §22's retrace count is: install
it, let it run for a known number of BIOS ticks, print the count, and assert a
range rather than a value. That catches a handler that never fires, one that
fires at the wrong rate, and a missing EOI - which stops the interrupt line dead
and shows up as a count of one.

What tier 2 cannot check is the reentrancy rule, since a violation is a
corruption rather than a crash. That belongs in tier 1, where the compile tests
can assert the error fires for a routine shared between a handler and the entry
point - and, more importantly, that it does *not* fire for one reachable from two
handlers, which IF makes safe.

---

## 28. CPU target levels

`momo` currently emits strict 8086 and puts `cpu 8086` at the top of every file
so NASM enforces it. A `--cpu` flag would raise that ceiling. The interesting
thing is how unevenly the levels pay:

| Target | What it actually buys |
|---|---|
| **186** | `shl r/m, imm8` - we emit `mov cl, n` / `shl ax, cl` today. Also `push imm`, and three-operand `imul r, r/m, imm` for index scaling. Small but real. |
| **286** (real mode) | Almost nothing. Its additions are protected-mode machinery a `.COM` never touches. Faster timings, same instructions. |
| **386** (real mode) | Large. `setcc` removes the branchy bool materialisation. **Near `jcc`** removes the inverted-jump-over-`jmp` idiom entirely - the ugliest thing in the current output. `movzx`/`movsx` replace `xor ah, ah` and `cbw`. Scaled index addressing removes the `shl` before array indexing. |

So the useful steps are **8086 -> 186** (modest) and **-> 386** (transformative).
286 is a rounding error.

One thing to note: **386 is not purely a backend switch.** Its 32-bit registers
would make `u32`/`i32` sensible, which changes the type rules in §4 - the "all
arithmetic happens in 16 bits" core rule becomes "in the target's word size".
Everything downstream of that follows.

---

## 29. `-o`

A single level, meaning "do your best" - no `-O1`/`-O2` ladder.

Readable output currently rules out anything that breaks the line-by-line
mapping between source and assembly: register allocation across statements,
common subexpression elimination, loop-invariant hoisting. Those are what `-o`
would unlock.

**Comments would stay, and explain the optimisation** - which makes the optimised
output a teaching artifact rather than just a faster one:

```nasm
; ---- value = n / 10
; [-o] constant divisor replaced with a reciprocal multiply
        mov     ax, [n]
        mov     dx, 0CCCDh
        mul     dx
        shr     dx, 3
```

Two things worth separating out, though:

- **Some optimisations are both faster and clearer**, so they should never be
  behind a flag. Branch relaxation - a short `jcc` when the target is provably in
  range - tidies the output rather than obscuring it. Strength reduction is the
  bigger one; see below.
- **Reciprocal division is a weaker win on an 8086 than it looks.** `mul` is
  ~120 cycles against `div` at ~160, so the saving is perhaps 20%, not the 5x it
  becomes on a 486. Dividing by a power of two is the real prize.

---

## 30. Hosted targets: JS, WASM, native

These are **categorically different from a CPU port**, and the difference is the
whole reason they are tractable: Momo's abstract machine does not change. Still
16-bit, still one flat 64K, still statically allocated. The front end *and the
resolver* carry over untouched - only the emitter and a shim layer differ.

Not a new direction for the lineage, either. Momo's predecessor Yuki compiled to
**JavaScript** - vaguely VM-shaped, but a JS program rather than a bytecode
interpreter - so it reached toward a machine from inside the host. Momo starts at
a real machine and would reach back up. The same territory approached from the
opposite end, and the return trip should be the more faithful one: the machine
here is documented hardware rather than one the language implied for itself.

**The subset mindset is what makes this feasible at all.** A general DOS backend
is DOSBox - a multi-year project. Momo can only *express* a handful of things:
text mode, mode 13h, CGA, three interrupts, no port I/O, no EGA planar. So a
hosted target does not emulate a PC; it models **the four things Momo can say**.

**One design, three realisations.** All of them want the same thing: the
real-mode address space as a byte array, plus shimmed interrupts.

```
                 +-- JS      (readable, debuggable, share by URL)
~1MB linear  ----+-- WASM    (linear memory is native to it)
memory + int     +-- native  (SDL2: fullscreen, audio, gamepads)
```

Doing any one makes the others largely free, because the shim contract is shared.

### The machine is the real-mode address space

Once `far` (§16) exists, video memory is part of the addressable model - and a
real-mode address is only `segment * 16 + offset`. So the hosted machine is the
~1MB physical space, with the program's own segment placed inside it:

```
0x00000  ...  program segment (DS = CS = SS), 64K
0xA0000  ...  mode 13h framebuffer,  64000 bytes
0xB8000  ...  colour text buffer,     4000 bytes
0xFFA6E  ...  ROM 8x8 font
```

`far u8[64000] pixels = 0xA000` resolves to linear `0xA0000` on every backend.
No special case and no handle type - the same arithmetic the 8086 does.

The shim also **pre-fills what the hardware would provide**: a font at
`F000:FA6E`, so `const far u8[] font = 0xF000:0xFA6E` works unchanged. Palettes
go through `int 10h AH=1012h`, a BIOS call - one of the places where excluding
`in`/`out` from the subset turns out to help rather than hurt.

### Video is memory, not calls

The shim does not intercept drawing. It **renders from a region and blits** -
`requestAnimationFrame`, read the framebuffer, map through the palette, put to
canvas.

- **Faithful.** Real hardware has no present call either; the CRT scans memory
  continuously. A display that simply tracks memory reproduces that, including
  the tearing you would get by drawing mid-frame.
- **Fast.** No per-pixel shim overhead, and a 64KB read per frame is nothing.

This makes **`far` a prerequisite rather than an optimisation.** If graphics went
through `int 10h` per pixel, every hosted backend would have to shim each call
*and* maintain its own framebuffer. With `far`, both backends write memory and
the only difference is who reads it afterwards.

The technique is well-trodden: modelling a machine's memory-mapped interface and
rendering from it is exactly how one models an Atari TIA in a browser. The PC is
the easier case - TIA races the beam and must generate pixels per scanline, while
PC video is a plain framebuffer you blit.

### One address space, not per-global variables

`addr()`, `_heap`/`_heapw`, views (§17) and any future `peek`/`poke` all assume a
single address space. Emitting idiomatic JS - a variable per global - breaks every
one of them.

There is a pleasing accident here: **`_heap` and `_heapw` are already an
ArrayBuffer with two typed views.** The same trick keeps u16 access fast - `mem8`
and `mem16` over one buffer - provided the emitter aligns u16 storage to even
offsets, which it controls anyway. The memory report becomes the allocation plan
verbatim.

### Emit from the typed AST, not from the assembly

Momo has structured control flow - `if`, `while`, `for`, `break`, `continue` -
which maps directly onto JS. Emitting from the *assembly* would need a
program-counter dispatch loop and be unreadable; emitting from the AST gives
output that reads like the source:

```js
// ---- if( tileAt( playerX, playerY ) == '#' )
if (mem8[map + mem8[playerY] * 10 + mem8[playerX]] === 35) {
```

### The `int`-only decision pays off again

**The porting surface is exactly one function.** Every host interaction goes
through `int`, so a backend shims `int21`, `int16` and `int10` - and only the
handful of AH values the standard library actually uses.

The alternative, swapping the standard library per platform, would need an
`extern` concept and would break the "there are no externals" property from §10.
Shimming the interrupt keeps programs portable *unchanged*, including any that
call `int` directly.

**The shims are the platform.** DOS uses real DOS, JS uses a canvas, native uses
SDL2 - same program.

### Two things that fall out free

- **Headless tests.** Tier 2 currently launches DOSBox per case; a JS backend
  runs the same suite in about a second.
- **Differential testing.** Run a program on both backends and compare output.
  Any divergence is a bug in one of them, and you need not know which in advance.

### Wrinkles

- **JS integer semantics.** Numbers are doubles, so every operation needs
  masking - `& 0xFFFF` for u16, `<< 16 >> 16` to sign-extend i16, `| 0` or
  `Math.trunc` for division. A missed mask is silent divergence from the 8086,
  not a crash.
- **Division by zero diverges.** The 8086 raises `INT 0`; JS yields `Infinity`.
  Shim the check or document it.
- **Native x86 is less different than it sounds.** `ax`, `bx` and the 16-bit
  operations all still exist. The wrinkle is that 16-bit index registers cannot
  index a 64-bit address space - so either `movzx` each index, or simply use the
  same 64KB buffer as JS does, which preserves the whole model.

### Sequencing

**JS first**, since "easy to share" is the goal and it is the most debuggable.
WASM is arguably the better endpoint - linear memory is native to it - and native
buys what neither can: real fullscreen, audio latency, gamepads, a shippable
binary, at the cost of object formats, a linker, an SDL2 dependency and per-OS
builds.

---

## 31. Dropping the assembler

§1 records the toolchain as "NASM only. No linker, no `.obj`, no relocations."
The endpoint of that trajectory is **no assembler either** - emit `.COM` bytes
directly and drop the last external.

This sounds like the largest of these directions and is close to the smallest,
because of a decision taken for an unrelated reason. **The instruction subset in
§1 is the entire specification.** An assembler that handles only what Momo
itself emits needs:

- Those mnemonics, in the operand forms the emitter actually produces:
  immediate, `[label]`, `[label + disp]`, `[label + bx]`, register-register, and
  the `al`/`ax` accumulator forms.
- `db` `dw` `times` `equ` `org` `align`, and `cpu` as a no-op.
- Labels including NASM's `.local` scoping, and one fixup pass for forward
  jumps. Expressions no richer than `label + constant`.

No macros, no sections, no object formats, no linking. That is a component of
perhaps a thousand lines, not a rewrite of NASM. The subset was chosen so that
NASM would enforce portability mechanically; that it also makes the toolchain
self-containable is a payoff for a decision made about something else.

### What it buys, with no self-hosting at all

- **The build stops needing DOSBox.** Assembly currently happens *inside* the
  emulator, which is where the `-Z` capture, the `build.ok` marker file and
  "DOSBox exits with its own status, not NASM's" all come from. That machinery
  disappears; DOSBox is left doing only what it is for - running the program.
- **Tier 2 gets cheaper**, and a further tier becomes possible: compare emitted
  bytes without launching anything.
- **1.6MB of bundled binaries leave the repository.**
- **The 8086 becomes a viable host again.** The bundled NASM is a DPMI build
  whose own README says "nothing older than a 386 is supported"; an assembler
  written in Momo has no such floor.

### The check it costs, and how to keep it

`cpu 8086` currently makes NASM enforce the instruction subset mechanically. A
homegrown assembler enforces it *harder* - it cannot encode what it does not
implement - but it stops being an independent opinion about whether the encoding
is correct.

Keep that with **differential assembly** while NASM is still here: assemble both
ways, compare bytes, and treat any disagreement as a bug in the newcomer. The
golden `.asm` tier (§14) already establishes the shape.

The readable `.asm` stays a first-class output rather than becoming an
intermediate. It is the headline feature; emitting bytes is an addition to it.

---

## 32. Self-hosting

Momo compiling Momo - and, the actual goal, **compiling on the target rather
than on a host.** Working on a modern machine is more comfortable and will stay
the default; the appeal is having the tooling be consistent with the thing it
produces. That, and it is a genuinely fun thing to attempt, which is a permitted
reason in a project named after a cat.

Two goals get conflated here, and separating them makes the near half reachable:

| | |
|---|---|
| **Written in Momo** | Compiled by the TypeScript Momo to a hosted target (above), running with modern memory. Answers whether the *language* can express a compiler. |
| **Running on the target** | The same source as DOS binaries, in 64KB. The destination. |

The first is a stage on the way to the second, not a rival to it.

### The constraint is the memory model, not the CPU level

386 is transformative for codegen, and irrelevant to this: **386 real mode still
has 64KB segments**, and a `.COM` is still tiny model. Register width was never
the ceiling.

There is a twist, though. On-target compilation already requires a 386 *today*,
because the bundled NASM is a DPMI program. So `momo/386` is a consequence of
the machine rather than a prerequisite for the work - and if "Dropping the
assembler" above lands first, the requirement evaporates entirely and true 8086
self-hosting comes back into range.

### Recursion is not the blocker it looks like

The obvious reading is: a recursive-descent parser is dozens of mutually
recursive calls, Momo rejects recursion, therefore self-hosting needs real stack
frames - which would cost the exact memory analysis (§12), the most load-bearing
decision in the language.

It does not follow. **Shunting-yard is naturally non-recursive**: an operator
stack and an operand stack, both explicit, both on the heap. The precedence
table is already data. Statements become a flat loop over a block-nesting stack,
and the tree walks in the resolver and emitter are the same shape - with an
array-of-nodes AST there are `u16` indices rather than pointers, so a worklist is
the natural form regardless.

§2 already reports `hanoi` - hand-rolled recursion with a resume point per
frame, the genuinely awkward case - coming out fine. A parser is easier than
that. Self-hosting is evidence *for* the ban, not against it.

### Four binaries, because the pipeline already is four

The four stages are pure and separable, which is exactly the shape a
memory-constrained compiler wants: **four `.COM` files communicating through
intermediate files.** `lex` -> tokens, `parse` -> AST, `resolve` -> annotated AST,
`emit` -> `.asm`. The `lex`, `parse` and `check` tools already dump those
representations, so the on-disk formats are half-designed.

The sizing forces it. `simplerl` is ~900 bytes of code, on the order of ten bytes per
line of Momo; the compiler is ~5k lines of TypeScript, call it 6-8k lines of
Momo once recursion is unrolled into explicit stacks. That is 60-80KB as a
single binary - over the ceiling, and still uncomfortable if the estimate is
half wrong. Split four ways it is roomy.

(Deliberately rounded. Exact figures here go stale on any codegen change - the
peephole work in §9 moved `simplerl` by 18 bytes - and the conclusion is robust to
being wrong by a factor of two, which is the only precision that matters.)

### What it needs

Almost nothing new, and less than when this was written. **`group` (§18), `len`
(§5) and `_cf` (§10) are now built** - structure-of-arrays is how a token table
or an AST wants to be held on this machine, and `_cf` means a failed read can be
noticed. With `int 0x21` and `addr()` already working, file access is writable
today; `cftest` opens one.

What is still missing is §19's array parameters, for routines that take a buffer
without one copy per call site.

The one genuine gap is in §20's own table, which covers three cases of four:

| | Address known | Segment |
|---|---|---|
| `far` | compile time | another one |
| `view` | compile time | ours |
| `peek`/`poke` | runtime | ours |
| **missing** | **runtime** | **another one** |

`INT 21h AH=48h` hands back a segment at runtime, so a DOS-allocated far block
lands in the empty cell. That is the cheapest route to more memory: four
tiny-model binaries with far blocks for the tables, no `.EXE`, no relocations, no
linker, and code never split across segments.

**Momo-0.** The bootstrap compiler need only compile *enough of Momo to compile
itself*, not all of it - so drop tree-shaking, `include`, parameterised consts
and the exact memory report. That also resolves a real tension: Momo's design
has whole-program analysis baked in (the call graph for recursion and pruning,
image size for `_hsize`), while a memory-constrained compiler wants to stream.
Momo-0 simply does not owe those guarantees.

### The folder is wider than the language, and nobody decided that

Constant folding runs on the host's numbers. In the TypeScript compiler those are
JavaScript doubles, exact to 2^53 - so intermediates are evaluated at a precision
Momo itself cannot express:

```momo
const wide     = 40000 + 40000     // 80000 - too wide to store
const back     = wide - 20000      // 60000 - and this compiles

const prod     = 30000 * 30000     // 900000000
const narrowed = prod / 30000      // 30000
```

Both results land in a `u16` and both are right. Measured rather than assumed:
those emit `mov word [a], 60000` and `mov word [b], 30000`.

Only two things are checked. **Literals** must fit in 16 bits - the resolver
rejects `1193182` outright, which is why the PIT's input frequency cannot be
written down and a note table has to be generated elsewhere. And **results** must
fit wherever they land. Between those two points the folder is effectively
unbounded, and integer division folds the way runtime `/` does, so nothing
disagrees.

That is defensible and probably right: fold exactly, reject what does not fit.
But it is an accident of the host rather than a decision, and **a Momo compiler
written in Momo could not reproduce it.** Its own arithmetic is 16 bits, so it
would fold `30000 * 30000` to whatever the low word holds and quietly disagree
with the compiler that bootstrapped it - on a program both accept.

Three ways out, none chosen:

- **Narrow the promise.** Declare that folding happens in 16 bits and reject a
  wide intermediate where it occurs rather than where it lands. Costs the
  `40000 + 40000` shape, which nothing in the corpus uses, and makes the two
  compilers agree by construction.
- **Keep the promise and pay for it.** Momo-0 carries software 32-bit arithmetic
  for the folder alone - `u16[2]` and a few routines, which §19's array
  parameters would make readable. A real cost in a compiler already fighting for
  64KB, for a case most programs never reach.
- **Let them differ.** The bootstrap folds narrow, the self-hosted compiler folds
  wide. Two compilers disagreeing about a legal program is the worst of the
  three, and is listed only because it is what happens if nobody decides.

The first is cheapest, the second is the more honest to what the language does
today. What matters is that this is a **language** decision wearing an
implementation's clothes, and it wants settling before a bootstrap exists rather
than discovering it afterwards from a program that compiles differently.

### If the model has to give: a profile, not a dialect

Should far data prove insufficient, the escape hatch is `.EXE` and a laxer
memory model - but as a **target profile**, not a second language. Momo already
has a target axis (CPU levels above, `momo/z80` below); memory model is a second
axis of the same idea. A dialect means two languages to keep honest and every
guarantee quoted with an asterisk.

It costs less than it looks, and less than it did before §16 was built - ES is
already emitted, already preserved across interrupts, already in the subset.
**§12 survives** too: static allocation is static however many segments it spans,
so the figures stay exact, per segment. What actually dies is CS, DS and SS
staying uniform, and the mnemonic subset growing segment loads and `es:`
prefixes. Only `.EXE` costs "no linker, no relocations", and the four-binary
route avoids needing it.

### The hazard

Everything else here gets built when something needs it. Self-hosting
*manufactures* needs, and that is the risk: features justified by what the
compiler wants rather than by what the language should be.

An earlier draft went further, and said that neither of Momo's distinguishing
properties - readable commented output, an exact memory footprint - is served by
the compiler being written in itself. That is true, and it was answering the
wrong question. What self-hosting serves is the goal `DESIGN.md` opens with: a
machine you can develop on without leaving it. The hazard is unchanged, because
it was never about motivation - a feature justified by what the compiler wants is
a bad feature whether or not self-hosting is worth doing.

Used well it is a forcing function that exercises §16-§20 against a demanding
real program; used badly it is a reason to say yes to things. The tell is
whether a feature still looks right with self-hosting struck out.

So far the record is good, and none of it was actually driven by this section:
`len` was wanted for a map height, `group` for an entity pool, `_cf` because
DOS reports failure in carry and nothing could see it. The missing quadrant
passes the same test - it was already latent in §20's table, and the use case
only found it.

---

## 33. Other CPUs - `momo/z80`, `momo/6502`

Unlike the hosted targets above, these **do** change the abstract machine. Very
stretch, but worth knowing what would and would not carry.

**Ports unchanged:** lexer, parser, AST, loader and `include`, the whole testing
apparatus, and the call-graph analysis. Roughly the front half.

**Ports in spirit, not in detail:** the type rules. "All arithmetic in 16 bits" is
an 8086 decision - on a 6502 you would want 8-bit native with 16-bit synthesised,
which changes the promotion rules and therefore the mixing matrix.

**Does not port at all:** the emitter, the reserved register globals, `int` as
the one primitive, the heap-at-end-of-image trick, and the whole standard library.

The encouraging part is that **Momo's core model ports well**: static allocation,
no recursion, globals as the calling convention, and an exact memory report are
exactly how one hand-writes 6502 and Z80 anyway. The design is not 8086-shaped
even though the backend is.

Between the two, **Z80 is much the closer fit** - 16-bit register pairs, a flat
64K with no segments (simpler than the 8086), and `LD A,(HL)` maps onto the
existing "compute an address, then load" model. The 6502 is harder than it looks:
no 16-bit registers at all, no multiply or divide, a fixed 256-byte stack, and
`abs,X` indexing with an 8-bit index - so arrays over 256 bytes need a different
addressing scheme entirely, not just a different instruction.

---

---

## 34. Hoisting the ES load

Every far access emits `mov dx, seg` / `mov es, dx` before it. Hoisting lifts that
out of a routine that only ever names one segment, so the load happens once in the
prologue instead of per access.

**Hoist per routine, not per basic block.** A block-local tracker - "which segment
does ES hold, invalidated at any label" - sounds right and is nearly useless: **a
loop body begins at a label**, so it would reload every iteration, which is
exactly the tight-pixel-loop case worth optimising.

The simpler rule works better. Scan a routine's far accesses; if they all name one
segment - overwhelmingly the common case - emit a single load in the prologue and
none inside. No dataflow analysis, just "does this routine touch exactly one
segment?". A routine mixing two falls back to per-access loads.

This only holds because ES is callee-saved (§16): nothing the routine calls can
disturb it. And it rewards the shape you would write anyway - a routine that does
a block of work rather than scattering single writes.

**Whatever the strategy, it must key on the segment *value*, not on "ES has been
loaded".** `textCells[i] = pixels[j]` uses two different segments and must reload
between them. A naive flag would silently read the wrong memory, which §16 names
as the worst possible failure mode for the feature.

### It is not free, and often not worth it

Hoisting requires ES to be callee-saved, and `push es`/`pop es` costs 18 cycles
per call to any routine that touches ES:

| Shape | Verdict |
|---|---|
| `plot( x, y, colour )` - one far write | saves 6, costs 18 - **net loss** |
| A blitter - 64 writes per tile | saves 384, costs 18 - clear win |
| `__entry` - nothing calls it, so no preservation | pure win, and ~1% |

**Break-even is three accesses**, or a loop of three-plus iterations inside the
routine. It rewards a routine that does a block of work and penalises the
per-pixel one, which is the shape most people reach for first.

### Why it is not built

Not wrong, just never the biggest thing left. DECISIONS §16 measures it at **4% of
a mode 13h fill loop, 2.1% of a `tilefill` screen, and 1% of `rndpix`** - in every
case behind loop machinery, index recomputation and the push/pop pair. The
roadmap there says what to do first, and hoisting is last but one on it.

**Runtime segments are excluded even when this lands.** A callee that reassigns
the segment *variable* leaves a hoisted ES pointing at memory the program no
longer means, without ES itself being touched. Doing it properly needs "is this
variable assigned anywhere in the reachable call subtree", which the call graph
can answer - so it is possible rather than hard, and waits for a program that
cares.

---

## 40. Memory past the segment

**Partly designed, partly blocked.** What a program does when 64 KB is not enough:
reaching the memory it already owns, asking DOS for more, giving some back, and
the allocators over the result.

### §13 already answers the question people ask first

> *"That largest available block is typically **not** one segment but most of
> conventional memory - several hundred KB on a real machine. `_hsize` stops at
> `0FFFEh` because that is as far as it can address without a segment register,
> not because that is all DOS gave. Reaching the rest needs `far` with a runtime
> segment and nothing else: the memory is already the program's, so no allocation
> call is involved."*

So the mode 13h back buffer, a far arena for assets, and `momode`'s baked backing
stores need **no DOS call at all**. They needed §35, which is two bytes, and this
section called that the single cheapest unblocking available.

**§35 landed the day after that was written, and this section did not notice.**
The claim has been collected since: `arena` reads `PSP:0x0002` through a far region
based on `_ds`, learns where the block DOS gave it ends, and writes and reads a
region at the top of it - **40,557 paragraphs, 634 KB, two thirds of a megabyte
past our own segment**, in tier 2, on the target. Every line of it is ordinary Momo
against a compiler that already existed.

What is left for those three is a **library**, not a language change: a far arena
over that word, which is what makes a back buffer and an allocator ordinary code.

### Where asking DOS does become unavoidable

Two cases, and neither is graphics.

**You have to give memory back before you can get any.** A `.COM` already owns
everything, so `AH=48h` allocate fails until `AH=4Ah` has shrunk the program's own
block. The inversion is the part worth writing down; it reads as a bug the first
time.

**`momode` forces it.** A launcher runs child programs with `AH=4Bh`, and a child
needs somewhere to exist. So the shell must shrink, must choose how much to keep,
and must handle an allocation that fails - which is the first time in this
project's life that a memory request can be refused.

### Both of those calls need ES, and Momo cannot set it

`AH=4Ah` takes the block in **ES**. `AH=4Bh` takes its parameter block in
**ES:BX**. The register builtins are AX, BX, CX, DX, SI and DI - there is no `_es`
and no `_ds`, and `far` (§16) drives ES for its own accesses rather than offering
it.

§16 is not in the way, which is worth stating precisely because it looks as though
it should be: its int helpers already `push es` / `int` / `pop es`, so an interrupt
that *reads* ES would see whatever was in it. **The gap is only that nothing can
put a value there.**

There is an accidental route - perform a `far` access to a region at the segment
you want, then make the call before anything else touches ES - and it should not be
used. It depends on ES being reloaded per access, which is exactly the codegen §34
proposes to change, so it would work until an optimisation landed and then fail
somewhere unrelated.

So this is the same shape as §38's DS problem, one register along, and the two
should be answered together rather than separately. Neither is urgent until
`momode` is real.

### The exactness property is not threatened

§12 covers the **image** - data, stack, code - and never covered the heap: §13
already hands out memory whose indices are unchecked and whose size *"can in
principle overstate what the program owns"*. Allocation costs nothing §12 promised.

What it does want is the robust `_hsize`, which §13 specifies and nobody has built:
read the end-of-allocation segment from `PSP:0x0002`, which for a `.COM` is offset
2 of our own segment. That makes `_hsize` a runtime computation rather than an
assembly-time one, and it becomes necessary rather than merely correct the moment a
program shrinks its own block.

### Allocators are libraries, and need no compiler change

§13 is explicit - *"the language supplies the memory, the programmer supplies the
policy"* - and `heaptest` is already a bump allocator written in Momo. An arena and
a zone are the same kind of thing.

§13's other note is the real check on how much allocator anything needs:
**`view` (§17) is often the better answer**, partitioning the heap into named,
bounds-checked regions with no allocator and no runtime cost at all. A program that
knows its regions at compile time should not be allocating.

**The zone allocator and `momowad` (§41) are one design, not two.** Doom's zone
exists *because* of WADs: its tagged, purgeable blocks are what let cached lumps be
evicted under pressure, and that is what the cache tags are for. Designing the
storage format and the allocator separately would miss the reason either has the
shape it does.

### A swap file

Blocked on §38, like everything else that touches a disk. What makes it defensible
rather than desperate is stated in `DESIGN.md`'s preamble: **slow is acceptable
where the work still gets done.** A machine that pages to disk and takes its time
is the aesthetic rather than a failure of it - and it is the trade that lets a tool
handle a document larger than the memory it has.

### What is blocked on what

Four of these five were written as pending and are not. Both things they waited on
were built the following day, and the table sat unread until somebody went looking
for something cheap to unblock - which is the argument for the periodic sweep, and
a reminder that stale plans hide opportunities as well as being untidy.

| | | |
|---|---|---|
| back buffer, far arena, backing stores | §35 only - no DOS call | **open**, and `arena` proves it |
| runtime `_hsize` | nothing; specified in §13 | **open** - the same `PSP:0x0002` word |
| arena and zone allocators | nothing - libraries, no compiler change | **open** |
| shrinking, and `AH=4Bh` | a way to set ES, which does not exist | still blocked |
| swap file | §38 | **open** - §38 is built |

---

## 41. `momowad` - asset storage

**Designed, not built, and blocked on §38.** The storage format for everything a
program ships with: a container compatible with Doom's WAD, carrying lump types of
our own, with PWAD-style override.

### The format, and why it suits this machine

A 12-byte header - a four-character magic, a lump count, and the offset of the
directory - then the lumps, then a directory of 16-byte entries: a four-byte file
position, a four-byte size, and **an eight-character name**.

Three things make it a good fit rather than merely an available one.

**Eight-character names are the discipline this repository already keeps.**
Project directories and entry files are 1-8 characters because DOS requires it, so
a lump name and a Momo name are the same shape, and nothing has to be truncated or
mapped on the way in.

**It is little-endian**, which is the machine's own byte order, so every field is
read by loading it.

**The 32-bit fields never need 32-bit arithmetic.** Momo has no `i32`, and a file
position is four bytes - but DOS seek takes its offset in `CX:DX`, which is exactly
two words. The high and low halves come out of the directory entry and go straight
into the two registers without ever being added together. The one place this stops
working is a lump larger than a segment, which has to be read in chunks anyway.

**The numbers above want checking against a real WAD** before anything relies on
them.

### What compatibility buys, and what it does not

The container is readable by existing WAD tools - they can list what is in one and
extract a lump - which is worth having for inspection and for anything written on
the host side.

They will make no sense of the contents, and that is expected: the lump *types* are
ours. Worth being plain that this is compatibility of the envelope only, so nobody
later reads the claim as "our assets work in Doom".

### One decision the format does not make for us

**Doom's WAD has no type field.** A lump's kind comes from its name and from where
it sits between marker lumps - `S_START` and `S_END` around sprites, and so on.
That is a convention rather than a structure, and it is the part worth choosing
deliberately rather than inheriting:

- **markers, as Doom does** - costs nothing, stays maximally compatible, and makes
  the type a property of position, which is fragile under editing;
- **a name prefix** - one character of eight spent on the type, checkable in
  isolation;
- **a small header inside each lump** - the type where the data is, at the cost of
  every reader knowing to skip it.

No case here yet argues strongly for one. It should be settled before the first
lump is written rather than after.

### Override is the reason for the format rather than a bonus

A PWAD's lumps shadow an IWAD's of the same name, so a base set of assets can be
patched without being rebuilt. That is a mod system, and it is also how a project
carries a variant - a different palette, a bigger font - without a second copy of
everything.

The mechanism is a lookup that finds the **last** lump registered under a name,
which makes load order the whole of the policy.

### Where the bytes go

§38's constraint applies in full: DOS reads into the program's own segment, so a
lump lands in a `view` of `_heap` (§17) and is copied out to `far` memory if it is
bound for somewhere larger. That copy is the per-byte cost of every asset load and
should be measured once rather than argued about.

The directory has a cost of its own. Five hundred lumps is eight thousand bytes,
which is a lot to hold resident on a machine with sixty-four thousand. Three
options, and "slow is acceptable where the work still gets done" makes the last one
respectable: hold it all, hold names only and re-read entries on demand, or re-read
the directory per lookup.

### It is the same design as the zone allocator

§40 records this and it belongs here too: Doom's zone allocator exists **because**
of WADs. Its purgeable cache tag is what lets a cached lump be dropped when memory
runs short, which is precisely the policy a program with an asset file and 64 KB
needs. The two want designing together.

### It is the binary form the scene work has been missing

A text scene format compiles to something, and so far that something has always
been a Momo source file full of `const` arrays, baked into the program. A lump is
the other target: the same data, loaded rather than compiled in, which is what lets
a program ship more assets than fit in its own image.

### Testing

A round trip needs no fixture and no host tool: write a small WAD from Momo, read
it back, and print a digest of what came out - which is a tier 2 test of the kind
this project already has thirty-five of. A host-side writer is worth having as
well, since it is what the asset pipeline will actually use, but the test does not
depend on it.

---

## 42. A test tier below DOSBox

**Designed, not built.** An executor that decodes the assembled `.COM`, to count
cycles exactly - and, until 2026-08-29, to run tier 2 without an emulator window.

### The window half is done, and cost two flags

Tier 2 used to open and close a DOSBox window per program, thirty-five times,
taking focus each time. `SDL_VIDEODRIVER=dummy` hides the emulator window and
`-noconsole` hides the status window DOSBox opens beside it on Windows. Both are
defaults in `e2e.ts`, the driver is overridable so a run can still be watched, and
the full tier now runs with nothing on screen in the same time it took before.

**How that was checked is the part worth keeping.** A pass could not distinguish
"ran headless" from "ignored the variable", because this tier reads a file either
way. So an invalid driver name was set instead: the run failed at assembly, which
is what proves DOSBox reads the variable at all.

**86Box is SDL2 too**, so the same two flags may well reach the accurate emulator
without the fork that looked necessary. Untested.

**So the disruption argument for this section is spent**, and what remains is the
cycle counting below - which was the stronger half in any case.

### What an executor would actually have to cover

Small, and unusually knowable. Every DOS and BIOS call in the repository:

| | | |
|---|---|---|
| `int 0x10` | 31 uses | set mode, get mode, cursor shape, read char and attribute, the DAC, blink |
| `int 0x21` | 7 uses | character out, string out, input status, open, close |
| `int 0x16` | 2 uses | key |

Three interrupts and about a dozen functions, most of them reached only by the
graphics programs that would keep needing a real target anyway.

The instruction side is better. §1's subset is **39 mnemonics and a test enforces
it** - three tier 1 assertions check that the heading's count matches the table,
that nothing outside the table is emitted, and that nothing in the table goes
unemitted. That third one is a coverage claim, so every mnemonic an executor must
handle is exercised by a committed program, and nothing outside the table can turn
up. Most projects cannot write their own executor because they do not know what
they emit; here it is enforced.

### It must consume the `.COM`, not the `.asm`

This is the constraint that decides whether the tier is worth having.
`CONTRIBUTING.md` records why tier 2 exists: *"a codegen bug at the NASM boundary
is indistinguishable from success"* below it, and naming a global after an
instruction emitted `add dw 0` for the whole life of the project without anything
noticing.

An executor reading NASM source would reproduce that blind spot exactly, while
looking as though it had closed it. Decoding the assembled bytes keeps NASM inside
the loop, which is the only reason this can sit anywhere near tier 2 rather than
beside tier 1.

### The part that may be worth more than the headlessness

`CONTRIBUTING.md` also says **DOSBox cannot measure performance**, and the method
here is to count instructions in emitted `.asm` and apply documented 8086 timings
by hand. The tables in §16, §26 and DECISIONS §27 were built that way.

**An executor decodes every instruction anyway**, so accumulating a documented
timing per instruction is nearly free - and it counts what actually *executed*,
loop iterations included, which a static reading of the assembly structurally
cannot. Given how much of `DECISIONS.md` is hand-assembled timing tables, this may
be the stronger motivation.

It would be a model rather than hardware - prefetch queue, bus waits, 8088 against
8086 - but the project already reasons from documented timings, so a model using
the same numbers is no worse and covers far more.

### It is §31 read backwards

§31 is dropping the assembler: emit `.COM` bytes directly, which needs an
**encoding** table for the subset. This needs a **decoding** table for the same
subset. Same knowledge, opposite directions, and either one makes the other much
cheaper. §31's stated benefit - taking DOSBox out of the build - is this section's
benefit too, which is a sign they are closer to one project than two.

### What it does not do

It does not replace tier 2. Graphics programs, `tennis`, and anything that blocks
on input still need a real target, and most of `PITFALLS.md` was found on **86Box
rather than DOSBox** - so the honest shape is four tiers: tier 1 in a second, this
in seconds, DOSBox when pixels matter, and real hardware when timing does.

### One thing that will be underestimated

Thirty-nine mnemonics understates the decoder. NASM chooses among several
encodings per mnemonic, and the decoder has to handle every form it picks, not
every mnemonic it was given. No estimate is offered here: `CLAUDE.md`'s rule about
stubs measuring floors the real design cannot reach applies to sizing a decoder
from a table of mnemonics.

---

## 43. The screen library

**Designed, not built.** What screen a program is on, what screens it could ask
for, and - because it turns out to be the same question one step along - what part
of the screen is actually its own.

### The repository is already the argument

Mode 13h is set by hand in **five** places: `mvpic`, `rndpix`, `tigerpic`,
`tilefill` and `t_scr`. The palette is loaded in two, which disagree about where
eight bits become six. `std/screen.momo` has `const screenCols = 80` and
`const screenRows = 25`, so every cell address in the repository is computed from a
number that is only true of one mode.

None of it is in `shared/lib/`. This is a consolidation with five existing
consumers rather than a new capability.

### A mode is a record, and the shape of a pixel is one of its fields

Width, height, colour depth, the framebuffer segment, the bytes per row, the data
layout, and the pixel aspect. Every DOS mode happens to be shown on a 4:3 display,
and that is exactly why the aspect belongs in the table rather than baked into the
code: it is a fact about a mode, and the first mode that breaks the pattern should
cost a row rather than a rewrite.

### Availability is yes, no, or maybe - and "maybe" resolves

Detection through `int 10h` is not reliable across cards and clones, so the design
splits along that seam rather than pretending it is not there:

- **The table is knowledge.** Static, and says what a mode *is* and whether it is
  plausible on whatever adapter was detected.
- **The query is probing.** Set the mode, read it back with `AH=0Fh`, confirm it
  took, and fall back if it did not.

"Maybe" then means "the table says plausible, go and ask", and what comes back is a
fact rather than a guess.

### Ask for properties, not a mode number

The call a program should make is *"at least 256 colours, at least 320 across, and
tell me the pixel shape"*, with a fallback chain behind it - not `0x13`.

That is the mechanism by which **a fantasy console runs on real hardware**, and it
is worth naming as such. `DESIGN.md` says the constraints here were somebody's
actual machine rather than invented ones; the price of that is that they vary, and
asking for properties is how a program keeps a fixed-specification feel on hardware
that will not cooperate.

### The stride trade, which should be settled before a line is written

`std/screen.momo` computes cell addresses as `row * screenCols + col`, and §26
prices exactly that expression:

| `x * 80` | cycles | bytes |
|---|---|---|
| `mov bx, 80` + `mul bx` | ~128 | 5 |
| factored, `(x*4 + x) << 4` | **17** | 16 |

The tier that performs that factoring is *"odd residues of 3, 5, 7 and 9, which
covers 10, 40, 80, 160 and 320 - practically every 2D stride"* - and it sits
**behind `-o`**, which is §29 and unbuilt. Only powers of two are reduced today.

So the trade is not the one it appears to be. **A runtime screen width costs
nothing now and roughly 7x later**: a `const 80` and a variable both emit `mul`
today, and the difference is that the constant keeps a door open which a variable
closes permanently. §26's `-o` tier was designed for screen strides specifically,
so a dynamic-width library would put that optimisation out of reach of the code it
exists for.

**The escape is §19.** A routine monomorphised per mode gets its constant stride
back - which hands that section the concrete want it has been missing, since it
sits in Probably as designed in full with nothing having asked for it.

### Windowing does not make that worse, which is the good news

A window's address is

```
base + (y + originY) * stride + (x + originX)
```

**Stride is a property of the mode, not of the window.** The multiply keeps a
mode-constant operand and the window contributes two adds, so the expensive part
stays reducible even when the visible width is arbitrary. What has to stay constant
is the *stride*, and it can.

The bug this invites is silent and worth naming: **width is not stride.** A windowed
program that uses its own width as the row step renders everything, skewed into a
diagonal.

### Aspect ratio, and why an editor turns it into correctness

Mode 13h is 320x200 on a 4:3 display, so a pixel is about 1.2 times taller than it
is wide and a circle drawn with equal pixel counts on both axes comes out an
ellipse. Text mode is far worse.

For a viewer that is a quality problem. **For `momove` it is a correctness problem**
- a drawing tool that shows you something other than what you are making is lying
about your own document.

The fix is nearly free and already most of the way there. `zoom.momo` applies a
transform as geometry is read, and `mapX` and `mapY` are already separate
parameterised consts - but they share one `zoomScale`. Aspect correction is a second
global and one changed line, and it is **the same work as the vector library's open
item** "the scene format carrying a transform" rather than a second piece of it.

One thing to check rather than assume: the subdivider decides how many segments a
curve flattens into, and may assume a uniform scale. A non-uniform one could want
its tolerance considered per axis.

### Layout types, and the one §22 already reaches

Linear (mode 13h), text (character and attribute pairs), interleaved (CGA's even
and odd scanlines), planar (EGA and VGA sixteen-colour, four planes behind `0x3C4`
and `0x3CE`), and banked for anything past VESA.

§16's `far` and §17's `view` already handle linear and text. **Planar is not
theoretical**: DECISIONS §22 records port I/O as built for *"EGA/VGA planar modes,
the PIT and the speaker"*, and nothing in the repository touches those ports - so
the layout field would be the first thing to use a capability that was justified by
it.

### Where the table lives is a real question

A full table as `const` arrays costs bytes in every program that includes it, and
§11's dead code elimination drops an unused array but not an unused *entry* of a
used one. Three options: §8 parameterised consts, so a program pays only for the
modes it names; a lump read at runtime (§41), which would be the first case of
`momowad` earning its keep for something that is not an asset; or choosing a mode
at compile time and carrying nothing.

### The current screen, and windows under `momode`

The same record, describing what is actually on screen, plus an origin. `momode`
sets it; an aware program is handed a rectangle and draws inside it; an unaware
program never asks and gets the whole screen. Single-tasking means a window that is
not running does not update - **it has simply left its pixels behind**, which is the
whole trick and costs nothing to implement.

Three things follow, and two of them are not obvious.

**The contract is small.** `momode` owns the mode, the palette and the screen; the
program owns a rectangle. "Aware" minimally means "does not set the video mode",
which is also exactly why an unaware program gets everything.

**The palette is the sharp edge.** Mode 13h has one 256-entry DAC shared by
everything visible, so a windowed program loading its own palette recolours its
neighbour. This is where a *structured* palette stops being a nicety: when the
layout is arithmetic, `momode` can hand out a sub-range - a hue band, a grey ramp, N
entries from K - and the program indexes inside it with no lookup table. An
unstructured palette offers no cheap way to subdivide one. The palette study is
load-bearing for windowing, which is not where anybody would have gone looking for
it.

**The handshake needs nothing new.** The rectangle can travel on the command line,
and a `.COM` reads its command tail from **PSP:0080h** - offset 0x80 of its own
segment, reachable with `peek` (§10) today. The one part of this that sounds like
infrastructure is not. Note §38's collision, though: `FindFirst` writes to the DTA,
which defaults to those same 128 bytes.

**It is cooperative, and a misbehaving program wins.** There is no MMU. A program
that ignores its rectangle scribbles over its neighbour and nothing stops it. That
is DOS-honest and fine, but the contract is discipline rather than enforcement, and
it should be written down as such rather than discovered.

**`momode` must be able to redraw what it cannot ask to redraw.** An unaware program
destroys the whole screen, and a window that is not running cannot restore itself -
so the shell has to hold a baked bitmap per window. That is §35 again, plus §41 for
where the pixels came from.

### momolo is already resolution-independent

`mopaint` decides that a layout unit is a character cell, and the same scenes have
been run against a pixel target where a unit was 11 or 20. The seam a screen library
would feed already exists and has been exercised both ways, which is most of what
`momoed` needs in order to support text modes larger than 80x25.

### What it needs that does not exist

Nothing, for the table, the query and the descriptor - they are `int 10h`, `far`,
`view` and data, and the window handshake needs nothing either. What is blocked is
the storage question if the table becomes a lump (§38, §41), and the backing stores
(§35).


---

## 46. `alias` - a name for an indexed access

**Designed, not built.** A compile-time name for one element or one group
instance, at an index the program chooses:

```momo
alias c = el[ ci ]

contentH    += c.h
minContentH += c.minH
contentW     = max( contentW, c.w )
```

No storage and no instructions. Every `c` is substituted with `el[ ci ]` in the
parser, and a write through it - `c.h = 5` - is an ordinary store, because there is
nothing to write back through.

### The mechanism is §45's, already built

`of` is this with the index supplied by a compiler-owned counter instead of by the
program. The parser's `substituteBinding` does the whole job today: it walks an
already-parsed body and rewrites every use of a binding into an indexed access,
carrying a group's field marker across untouched.

So what §46 adds is a declaration form, a scope, and the rule below. It is not a
new mechanism, which is most of the argument for it being small - and all of the
argument for being careful, because the part that is new is the part that can be
got quietly wrong.

### Where it sits against `view`, which refused exactly this

§17 excluded runtime offsets: a runtime view "is a **fat pointer** - base plus
length - and Momo has no pointers by design", and it would become the de facto way
to pass arrays to routines.

`alias` escapes both objections the way `of` did. **Nothing is stored**: the index
expression is substituted at compile time, so there is no base in memory to be half
of a pointer, and a binding cannot be passed anywhere because it does not survive
the parser. So this does not reopen §17's decision - it occupies the other half of
it:

> **`view` fixes the offset and names storage. `alias` fixes nothing and names an
> access.**

### The hazard, stated exactly

`alias c = el[ ci ]` means `c` re-reads `ci` at every use. Three cases, one
mechanism:

| | |
|---|---|
| `ci` assigned later in the block | `c` silently re-points - the hazard |
| `ci` is an enclosing loop's counter | `c` re-points per iteration - usually wanted |
| a routine called in between writes `ci` | re-points invisibly - the worst one |

This is §6's compound-assignment rule one level up. That rule refuses `x[ f() ] +=
e` because the index would be evaluated twice inside **one statement**; an alias
widens that window from a statement to a block, and the third case takes it out of
the reader's sight entirely.

### Four ways to close it, and the one to take

1. **Freeze the index into a hidden slot.** `c__at = ci` once, and `c` becomes
   `el[ c__at ]`. The hazard is gone and the semantics are the obvious ones -
   evaluate the index *here* - but it costs a word and a store, so the feature
   stops being free. Inside a loop it needs re-freezing per iteration, which is
   `of` again.
2. **Capture only what nothing can write** - constants and compiler-owned counters.
   That is `of` with a longer spelling.
3. **Refuse to capture a variable written inside the alias's scope**, directly or
   by anything called from it. Costs nothing at runtime and is mechanically
   checkable: `buildCallGraph` in `analysis.ts` already exists, which is what makes
   the third case tractable rather than a hope.
4. **Document it and move on.** Against the grain of a language that made
   `a < b < c` an error and refuses a `bool` holding 2.

**Take 3**, with 1 as the fallback if it proves too strict in practice. It refuses
rather than surprises, it is checkable with machinery that is already here, and it
keeps the property that makes the feature worth having.

### The capture rule

> An `alias` may not capture a name that is assigned anywhere in the alias's scope,
> nor by any routine reachable from a call inside it.

It rejects programs that would have been fine - a write to `ci` after the last use
of `c` is harmless, and this refuses it - which is the right direction to err for a
rule whose failure mode is silent. The error should name the write, not the alias:
the alias is where the reader looks, and the assignment is what has to move.

### What it reaches, which is what `of` could not

`momolo/fit.momo` ends a routine with twelve `el[ i ]` in four statements:

```momo
el[i].w    = clamp( insetX + contentW,    el[i].wMin, el[i].wMax )
el[i].h    = clamp( insetY + contentH,    el[i].hMin, el[i].hMax )
el[i].minW = clamp( insetX + minContentW, el[i].wMin, el[i].wMax )
el[i].minH = clamp( insetY + minContentH, el[i].hMin, el[i].hMax )
```

`i` is a **routine parameter**, which `of` cannot bind to at all, and `fitSize`
never assigns it - so the rule above admits `alias e = el[ i ]` and those four
lines become four lines. That is the shape of the 281 indexed field accesses in the
corpus: `el` 177, `player` 33, `st` 30, `held` 24.

### What §45's sweep says about that number

**Hold it to a measurement rather than a count.** §45 pointed at the same 281 and
delivered eight loops, because the sites it could reach turned out to be
single-access fills where a binding costs a reader more than `X[ i ]` did.

The same question applies here and has not been answered: `el[i].w` twelve times is
repetitive, and it is also completely explicit. Whether `e.w` reads better is a
claim about reading, and the honest way to settle it is to adopt it in one routine
and look - which is what the narrow-then-broad order is for, and what §45 was built
in time to teach.

### Rules

- **A binding, not a declaration.** No type, for §45's reason: there is nothing for
  a type to describe.
- **Scoped to the end of its enclosing block.** A binding has no storage, so unlike
  §44's counter it can be block-scoped for nothing - which §45 already established.
- **`alias m = mob[ i ]` leaves `m` bare an error**, as `of` does and as §18 words
  it: no record exists for one instance to denote.
- **The target is a name and the index is an expression**, mirroring `of`. An alias
  of an alias is refused rather than resolved - it would work by substitution and
  it names nothing a reader cannot already write.
- **Writes go through.** `c.h = 5` is `el[ ci ].h = 5`.

### Scope of a first build

In: the declaration form, block scope, the capture rule with the call graph behind
it, and `of`'s substitution reused unchanged.

Out: aliasing an expression rather than an indexed name, aliasing whole rows or
sub-arrays - that is a runtime `view` and §17 refused it for reasons that still
hold - and any spelling that lets a binding cross a routine boundary.

---

## 47. `block` - the memory past the segment, as a library

**Designed, not built.** Three routines answering where the block DOS gave us
ends and whether a region fits inside it. `arena` (§40) proved the mechanism; this
is the twenty lines that make it usable without every program re-deriving it.

**It is deliberately not an allocator.** §40 already settles that: *"`view` (§17) is
often the better answer... A program that knows its regions at compile time should
not be allocating."* A mode 13h back buffer is exactly such a program - one region,
64,000 bytes, known when it is written. The stateful arena is kept below as the
alternative to revisit when a second caller exists.

### What the language decides rather than the design

None of this is a preference, and all of it is worth stating so nobody re-opens it:

- **It hands out segments.** §16 allows a `far` region's address to be "a constant
  or a plain `u16` variable, never an arbitrary expression", so a `u16` segment is
  the only runtime currency there is.
- **The program declares the region; the library only says where.** `far`
  declarations are top-level with constant sizes, so no routine can return one.
- **Granularity is paragraphs**, because the machine's is.
- **The base is `PSP:0x0002`.** §13 names it as the robust source and nothing else
  knows where the block ends.
- **The floor is `_ds + 0x1000`.** Our own 64 KB is addressable without a segment
  register and already holds the image and the heap.
- **Failure returns 0.** Momo has no exceptions, and `dstest` already rests on DOS
  never loading a `.COM` at segment 0.
- **There is no `free`.** That is what makes it not an allocator, and §40 assigns
  the tagged, purgeable version to the zone, which it says is one design with §41.

### The surface

```momo
u16  blockEnd()                       // segment one past the end of our block
u16  blockBase()                      // first segment past our own addressable 64 KB
bool blockFits( u16 seg, u16 bytes )  // does a region of that size fit there?
```

and the whole of the back buffer case:

```momo
include "lib/std/block.momo"

u16 bufSeg
far u8[64000] backBuffer = bufSeg

bufSeg = blockBase()
if ( !blockFits( bufSeg, 64000 ) ) { ... no room, say so and stop ... }
```

### One arithmetic trap, worth writing down before it is hit

Rounding bytes up to paragraphs is `( bytes + 15 ) >> 4`, and that **overflows a
`u16` above 65,520** - which is inside the range a caller can pass. Write it as
`( bytes >> 4 ) + ( ( bytes & 15 ) != 0 ? 1 : 0 )` instead. The same care applies
to `seg + paragraphs` in `blockFits`: compare against the space remaining rather
than computing the end, or a high segment wraps and the answer comes back true.

### It initialises itself, which is a pattern this repo does not have yet

A `far` region needs a `u16` holding `_ds`, and `_ds` is not known at assembly
time - so §5 forbids initialising that variable in its declaration, and §2 has no
prologue to do it in.

**A library's own top-level statement solves it.** An included file's top-level
statements are spliced where the include stands, and they run before the
program's own: `blockSeg = _ds` at the head of `block.momo` lands at the head of
`__entry`. That is verified rather than assumed.

Two things follow, and the second is the reason this has a heading. It carries an
ordering rule - the include must precede any use, which is where includes go
anyway. And **no file in `shared/lib/std/` has a top-level statement today**, so
this establishes the pattern rather than following it. Worth deciding deliberately
rather than discovering later that the standard library grew a startup sequence.

### Alternatives, kept for when this is built

Each was weighed and set aside rather than missed. The recommendation is the
surface above; these are what to reconsider if it does not survive contact.

| | for | against |
|---|---|---|
| **A stateful bump arena** instead of three pure routines | earns its place with two or more regions, or sizes computed at runtime; `heaptest` shows the idiom is at home here | needs state, an init story and a policy, for a case §40 says should not be allocating at all |
| **An explicit `blockInit()`** instead of self-initialisation | no new pattern in `std/`, no ordering rule, nothing runs that a program did not ask for | forgetting it hands out garbage segments, which on this machine is silent corruption - the worst failure shape available |
| **Paragraphs** rather than bytes in the interface | the full 1 MB range, and it matches the machine | every caller writes the rounding by hand, which is where the trap above lives |
| **Starting at the heap top** rather than above our own segment | uses the tail of our own 64 KB instead of stranding it | §13's `_hsize` is a conservative floor, so the boundary between two allocators would be fuzzy - and a fuzzy boundary between allocators is how heaps get corrupted |
| **Verifying by write and read-back** rather than trusting `PSP:0x0002` | catches an emulator or a loader that lies | the word is the DOS contract, and `arena` already round-trips once, which may be all the checking anyone needs |
| **Naming it `arena`** | the obvious word | taken by the test project, and §40 reserves *zone* for §41's - `block` says what it is, which is the thing DOS handed us |

### Testing

`arena` already covers the mechanism. What this adds is a project exercising the
three routines against known-invariant answers - `blockEnd() > blockBase()`,
`blockFits` true for a small region and false for one that cannot fit under any
allocation - none of which depends on how much memory the machine has.

The rounding trap wants a unit-style case of its own at 65,521 bytes, which is the
smallest value where the naive expression is wrong.

### What it unblocks

A double-buffered mode 13h back buffer, which is what DESIGN §20's open graphics
question keeps circling; the far arena for assets that §41 wants; and §43's
backing stores. All three are §40 rows that have been open since §35 landed.

---

## 49. Named and default arguments

**Designed, not built.** Two halves of one feature, which can land separately and
have different customers:

```momo
sub walkPath( u16 pathIndex, bool wantPixels, bool wantEdges, bool closeSubpaths )

walkPath( pathIndex, wantPixels: true, wantEdges: false, closeSubpaths: false )

sub fillPath( u16 pathIndex, bool tidy = true )

fillPath( p )
```

Named arguments say which parameter a value is for. Default arguments let one be
left out. Neither is new as a language idea; what is worth writing down is that
Momo's memory model gives the second an implementation no stack-based language
can use, and that the corpus has already written both out by hand.

### The measurements, because the premise this inherited is wrong

`momolo/build.momo` explains the `cfg` carrier by saying a fourteen-parameter sub
"would be unreadable at every call site". That is a claim about a shape nothing
here has. Across **277 routines in 92 files, the maximum arity is 6**:

```
0: 129   1: 51   2: 49   3: 32   4: 10   5: 2   6: 4
```

And a box does not carry fourteen settings. Over the 32 bracket opens (§48):

```
settings before an open   0: 11   1: 1   2: 7   3: 4   4: 5   5: 3   7: 1
                          69 settings, mean 2.2, max 7
```

Ten of the fourteen fields are ever set, and five setters carry 50 of the 69 -
`cfgGrowW` 13, `cfg.gap` 12, `cfgGrowH` 9, `cfgCol` 8, `cfgInset` 8.

**They are not a prefix**, which is the finding that shapes the design: setting
`alignMain` means passing six things nobody cares about. Trailing defaults alone
do not reach this. It is both halves or neither.

### `cfgReset` is default arguments, hand-rolled

Parameters are mangled globals and a call is stores-then-`call` (§5), so a
parameter slot persists between calls. That allows an implementation a language
with stack frames cannot have: **the callee restores its own defaults on exit**,
and a caller stores only what it changes.

`pushElement` copies `cfg` onto the element and then calls `cfgReset`, so every
box starts from the defaults and a call site sets only what differs. That is the
mechanism above, written by hand, in a `group` rather than in parameter slots only
because parameter slots are not nameable from outside the routine.

So this is less "give the openers fourteen parameters" than "delete a library's
copy of a missing language feature". `cfgReset`'s fifteen instructions become
compiler-generated and momolo loses a global.

### Two customers, and they are unequal

**momovec wants names.** `walkPath` takes three booleans after its index and is
called three times, once as `walkPath( pathIndex, true, false, false )` - the shape
the argument for named arguments is usually made about. `fillPath` takes one, and
of its twelve call sites **eleven pass `true` and one passes `false`**, so it wants
a default as well.

Those two are quoted rather than a total, because "how many call sites pass a bare
boolean" is a number whose value depends on how the question is filtered - three
attempts at it here gave 16, 17 and 19. A figure like that drifts the moment
anybody recounts it differently, so the section names routines instead.

**momolo wants both**, and is the reason the section exists - §48 sharpened a
misreading it deliberately did not fix, and this is what fixing it needs.

The corpus has also paid for the absence in duplicated wrappers: `swatchGrow`,
`swatchFixed` and `swatchCapped` differ only in how they set `cfg` before calling
`swatchBody`, and `pathEdges`/`pathEdgesSorted` are the same shape one library
along.

### The halves cost very differently

**Named arguments are nearly free.** Reordering into declaration order happens in
the parser, so the emitter sees exactly what it sees today - no codegen change at
all, and the identity tier can assert it. One real decision: `f( b: g(), a: h() )`
must choose between written order and declared order, which matters because §5
evaluates left to right and spills to the stack when any argument contains a call.
Written order is the honest answer and costs nothing; it just has to be decided
rather than fallen into.

**Defaults are the expensive half.** Callee-restore means every defaulted routine
pays a reset on every call, whether or not a default was used - `cfgReset`'s cost,
generalised to anything that opts in. Defaults must be foldable constants, which
the resolver already supports and which is a clean line rather than a compromise.
The conceptual cost is the one to weigh: parameter slots become observably live
state between calls. That is true today and currently invisible, and a default
makes it something a reader has to know.

The alternative implementation, **caller-fills**, is the obvious one and the wrong
one here: fourteen stores at each of 32 call sites instead of fourteen in one
routine.

### What is not known, and how to find out

Whether the swap is smaller or larger is **not** settled by argument. `call cfgCol`
is three bytes against roughly six for the inline store it replaces, but it deletes
ten routine bodies and `cfgReset`. The measurement is one scene written both ways,
compared with `npm run memory` - and per the stub trap in `CLAUDE.md` it has to be
the real thing, since a sketch measures a floor the real design cannot reach.

### Probably, not Definitely

Named arguments have a customer today and cost almost nothing, and would go in
Definitely on their own. Defaults have one real customer, and building them to fix
a misreading in one library is the floor-not-a-measurement problem the note under
Todo describes - the same one §48 was careful about and this would be careless
about. The two are here together because the measurement above says momolo needs
both or neither, and splitting them is a decision to make on the way in rather
than a conclusion already reached.
