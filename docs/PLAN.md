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
| `momowad` (§41) | assets in bulk, with Doom-style PWAD overrides. Compatible with WAD at the container level, carrying our own lump types | file I/O (§38) |
| `momoed` | the editor - an explorer beside a text pane, toggled away for width, and text modes `edit.com` never had | file I/O (§38), the screen library (§43) |
| `momode` | a graphical shell and launcher. Single-tasking, and windowed by screen offsets an aware program is handed (§43) | a mouse, and §40's ES gap |
| `momove` | a small vector editor, for icons and the like | a mouse, §37's geometric booleans |
| `momopnt` | the library three image editors share - sprite, bitmap font, paint | a mouse, a palette library, §43 |
| tilemap, sfx and music editors | the rest of the shape a fantasy console is expected to have | sound, which nothing here has touched |

**Three capabilities are missing under all of it**: file read and write (§38), a
mouse, and sound. Everything else composes from what is built - and none of the three is
far off. `cftest` already opens and closes a file on the target, §22's port I/O
was justified partly by the PIT and the speaker, and §24 already records that a
mouse callback is the one thing that would want `retf`.

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

### Probably

- **Memory past the segment.** §40 - the allocators are libraries and need no
  compiler change, the robust `_hsize` is specified in §13 and unbuilt, and the
  half that is genuinely blocked is shrinking the program's own block, which needs
  a way to set ES that does not exist. Same shape as §38's DS problem, one
  register along.
- **File I/O.** §38 - designed, and it needs no language feature at all: `int`,
  the register builtins, `addr()` and `_cf` are between them enough, and `cftest`
  already opens a real file on the target. The open decision is where bytes land,
  since DOS wants its buffer in DS and Momo cannot move DS. It is what `momowad`,
  `momoed`, `momode` and a swap file all wait on.
- **`unit`.** §39 - a numeric type that will not mix with another unit without a
  cast, entirely at compile time. §25 already carries scale as metadata beside the
  storage type and this is that tag generalised, so the mechanism is shipped. What
  wanted it is `tennis`, which encodes its two coordinate spaces in identifiers -
  `subPxY`, `subgridToPx`, `// subgrid units` - because nothing else can.
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

- **How should a nested structure be built?** Set out here rather than in §20.
  momolo (§36) represents nesting by convention: `boxOpen` and `closeBox` must
  pair, the caller indents to show it, and nothing checks. Worse, a wrapper may
  open more than one box - `stripOpen` opens two and `stripClose` closes two - so
  pairs are not one-to-one with call sites and a balanced-looking source can still
  be wrong. The config carrier is the same discomfort one step along: `cfg` is a
  mutable global consumed by the next builder call.

  Clay solved this with macros and hyperscript-style libraries solve it with
  functions returning values, neither of which Momo has. Three candidates, none
  chosen. **§19's routine parameters** would make closing structural, but the body
  would be a named sub written elsewhere - forty nodes becomes forty subs, which is
  worse than indentation, and writing the body *in place* is the whole ergonomic
  win. **Parser sugar** lowering `box( ... ) { ... }` to open/body/close costs
  nothing at runtime, the way `=>` already lowers, but a general form for it is a
  macro system and a specific one puts a library's name in the compiler.
  **Expressing the tree as data** and walking it removes the problem rather than
  solving it, and is where a scene format points - at the cost that a static tree
  cannot loop or take parameters, which the existing scenes do.

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

## 38. File I/O

**Designed, not built.** DOS file handles from Momo: open, create, close, read,
write and seek.

The headline is that **none of it is a language feature.** `int`, the register
builtins, `addr()` and `_cf` (§10) are between them everything this needs, and
`cftest` already opens a real file, reads the carry and closes the handle. What is
missing is a library and a decision about where the bytes land - not a compiler
change.

That makes this the second design met by what already existed, after §37's routine
indirection. It is worth noticing as a pattern rather than a coincidence: the
features that unlocked it - `int`, the registers, `_cf`, `addr()` - were each
built for something else.

### `cftest` is most of the proof already

```momo
sub openFile( u16 at ) {
  _ah = 0x3D                      // open
  _al = 0                         // read-only
  _dx = at                        // DS:DX -> an ASCIIZ name
  int 0x21
}
```

Read and write are the same shape: `AH=3Fh` and `AH=40h`, `BX` the handle, `CX` a
byte count, `DS:DX` the buffer, `AX` the count actually transferred. Seek is
`AH=42h` with the offset in `CX:DX`. Create is `AH=3Ch`.

Filenames are NUL-terminated, which `cftest` also settles - `$` is a print
convention and nothing more.

### The buffer must live in this segment, and that is the real constraint

DOS takes its buffer as **DS:DX**. Momo has no `_ds` and no `_es` among the
register builtins, `far` (§16) manages ES and nothing manages DS, so the tiny
model's `DS = CS` holds everywhere and cannot be suspended for the length of a
call. **Every read and write therefore lands in the program's own segment.**

For anything larger than the segment - a WAD lump, a swap page, a picture bound
for a back buffer - that means **staging**: read a block into a `view` of `_heap`,
copy it out to `far` memory, repeat. The copy is the cost, it is per byte, and it
should be measured rather than estimated.

The alternative is a mechanism for pointing DS somewhere else across a single
call, and it is **rejected for now** rather than overlooked. `DS = CS` is what
makes every global a bare displacement (§10), a routine that moved it would have
to restore it before touching anything at all, and §16 already records what that
discipline costs for ES - which is the register that does *not* underpin the
memory model. If staging ever proves too expensive, the answer is to design that
deliberately, not to reach for it here.

Note that §35 does not help. It reads `_ds` so a program can learn its own
segment; writing DS is a different thing and a much larger one.

### Errors are `_cf`, and the capture has to be immediate

`_cf` is the carry from the **most recent** `int`, and `cftest` already documents
what that implies: it reads its result before printing anything, because
`putNumber` goes through `int 21h` and would overwrite the flag with the carry
from writing a digit.

That is not a caller's discipline to remember - it is a rule about where the
capture belongs. **Every routine that issues a DOS call captures `_cf` and `AX`
into its own storage before it returns**, and hands back a result. A library that
left `_cf` for the caller to read would be correct exactly until somebody put a
`putStr` between the call and the check, which is the shape of bug this project
usually designs out rather than documents.

```momo
u16  fileStatus                   // the DOS error code, or 0
bool fileFailed

u16 fileRead( u16 handle, u16 at, u16 count ) {
  _ah = 0x3F
  _bx = handle
  _cx = count
  _dx = at
  int 0x21

  fileFailed = _cf                // both, before anything else runs
  fileStatus = fileFailed ? _ax : 0

  return fileFailed ? 0 : _ax
}
```

`fileStatus` and `fileFailed` are the `local` (§11) case exactly - shared by every
routine in the file, private to them, and writable by nobody else.

### The split, which is the convention rather than a choice here

A toolkit of the six calls above, returning what DOS returns, and a surface over
it: `readWhole` into a view, `fileSize` by seeking to the end and back, and
whatever line-reading an editor turns out to want. A consumer that dislikes the
surface builds its own from the toolkit, and one that wants a single call does not
pay for the rest - §11's dead code elimination is per-routine, so it does not.

### Handles are a fixed and small resource

A `.COM` inherits a twenty-entry handle table in its PSP with five already open -
stdin, stdout, stderr, stdaux, stdprn - leaving fifteen. That is ample for an
editor and thin for a shell that keeps assets mapped, so momowad should expect to
open, read and close rather than hold handles. **Both numbers want confirming on
the target before anything relies on them**, which is what the tier exists for.

### Out of scope for the first build, and one collision worth knowing

Directory enumeration, attributes, rename and delete are all out. Enumeration is
out for a specific reason rather than for tidiness: `FindFirst` and `FindNext`
write to the Disk Transfer Area, which defaults to **PSP:0080h - the command
tail**. That is the same 128 bytes a windowed program would read its rectangle
from under `momode`. So a program that enumerates a directory destroys its own
arguments unless it either reads them first or moves the DTA with `AH=1Ah`.

Neither is difficult; both are invisible until they bite, and the second one bites
in a program that worked yesterday.

### Testing needs no fixture

`cftest` opens its own assembly listing, which the build copies alongside the
`.com`. The round trip is better still and needs nothing external: create a file,
write a known pattern, close, reopen, read it back, compare, print a digest.
Everything the tier compares is a number the program produced, and the file is
gone by the end of the run.

### What it unblocks

`momowad`, `momoed`, `momode` and the swap file - four of the six things in the
tier at the top of this document, and the only capability that more than one of
them waits on.

---

## 39. `unit`

**Designed, not built.** A named alias for a numeric type whose values will not
mix with another unit's without a cast. Entirely compile time - nothing reaches
the emitter, and no program gets larger or slower for using it.

```momo
unit px      = u16
unit subgrid = u16

px      x  = 40
subgrid sy = 160

x = sy                          // error: subgrid is not px
x = px( sy >> 2 )               // fine, and now says what it is
```

### What wanted it

`tennis`, and it is already paying for the absence by hand. `t_cfg.momo` has
`const subgridScale = 4` and a comment reading `// subgrid units`; `tennis.momo`
has `subgridToPx( play, obj )` and variables called `subPxX` and `subPxY`. **The
unit is encoded in the identifier**, which is the workaround a reader has to keep
in their head and the compiler cannot check. Confusion between the two coordinate
spaces while writing that program is what put this section here.

It is not one program's problem. `mopaint` decides a layout unit is a character
cell while the same scenes have been run at 11 and 20 pixels; a screen library
will have pixels, cells and a device aspect in the same expressions; §25 already
has scaled and unscaled values that must not meet.

### The mechanism is §25's, generalised

§25 carries scale as **metadata beside the storage type** rather than as a member
of `ValueType`, because the alternative made five unguarded `if` chains fall
through silently. `Resolved` grew a fraction width, `frac: 0` kept every existing
site working, and making the field required turned forgetting it into a compile
error - which mattered for a feature whose whole purpose was catching silent
losses.

**A unit is the same shape**: a second field beside `frac`, defaulting to none,
required for exactly the same reason. The hard question - whether this kind of tag
belongs in the type or beside it - is already asked and answered, and answered the
way this needs.

That is most of the argument for it being cheap. The rest is that §25's own
heading is *"It is a unit system, not a width system"*, so this is a shipped
mechanism widened from one tag to many rather than a new one.

### What it subtracts, which is the actual work

§4's table says what happens when two types meet. `unit` does not extend it - it
**refuses cells that table currently permits**, and it is the first feature here
to take a permission away rather than add one. The rules:

- **Same unit, any widths** - mix exactly as §4 says, and the result carries the
  unit.
- **Different units** - an error, whatever the widths, whatever the signs.
- **Comparison** yields `bool`, which carries nothing.
- **One side untyped** - the case that decides whether this is usable at all.

### Untyped constants adopt the unit, and §25 has that precedent too

§25 already says untyped constants are counts. The same has to hold here or
nothing is writable: if `x + 1` needs a cast then every expression needs one, the
casts stop being read, and the feature is worse than the naming convention it
replaces.

So **an untyped constant takes the unit of the other operand.** `x + 1` is px,
`x * 2` is px, `x > 0` is fine.

A literal suffix - `10px` - is then a disambiguator for the case with no other
operand to take from, not the main path. **Out of the first build**: it costs a
lexer change and the case for it is thin until something is stuck without it.

### Multiplication and division are where a unit system usually stops being small

`px * px` is an area, which nothing in the table names and 16 bits will overflow
anyway. `px / px` is a plain ratio with no unit. A real dimensional system answers
these; **Momo should not try**, because the answer costs a type system nobody here
wants. Four rules instead:

| | |
|---|---|
| `unit` with untyped, either order, `*` or `/` | keeps the unit |
| `unit / unit`, same unit | unitless - this is the useful one, a ratio |
| `unit * unit` | error |
| `unit` with a different `unit` | error, as everywhere else |

That covers what `tennis` and the layout code actually do, and refuses the case
that would need dimensions to be right.

### It should compose with §25, not compete

`unit fix = i8.8` wants to work: a unit riding on a storage type that already
carries a scale. Both are metadata beside the same `Resolved` and neither reaches
the emitter, so there is no reason it cannot - but it is worth designing for
deliberately rather than discovering it was excluded by accident.

### What it costs

**Nothing at runtime.** Not an instruction, not a register, not a byte. The cost
is the type checker, plus the four AST carriers §25 names as holding a bare
`TypeName` - they grew a fraction width and would grow a unit beside it.

The other cost is not technical. A unit system that is too strict becomes cast
noise, and casts that appear everywhere stop being read - at which point the
feature has made the program harder to check rather than easier. The
untyped-constant rule above is the main defence, and a small first build is the
other.

### The claim is directly testable

The central claim is that units never reach the emitter. **That is a golden-tier
assertion, not an argument**: compile a program with units and the same program
with the units stripped, and require the `.asm` to be byte-identical. The 53 type
tests take one case per rule above, which is what that tier is already for.

### Scope of the first build

In: `unit` declarations over the four integer types, unit-aware mixing, casts both
ways, and units usable wherever a type is written - globals, sub-locals,
parameters, returns, arrays and `group` fields.

Out: literal suffixes, any arithmetic beyond the four rules, and any notion of
dimension at all.

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
stores need **no DOS call at all**. They need §35, which is two bytes. That is the
single cheapest unblocking available and it is why §35 has moved out of Maybe.

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

| | |
|---|---|
| back buffer, far arena, backing stores | §35 only - no DOS call |
| runtime `_hsize` | nothing; specified in §13, unbuilt |
| arena and zone allocators | nothing - libraries, no compiler change |
| shrinking, and `AH=4Bh` | a way to set ES, which does not exist |
| swap file | §38 |

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
