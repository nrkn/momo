# Plan

What is going to be built, how sure that is, what is still unsettled - and the
design of the things that are not built yet.

Two parts. **The index below is the working half**: one line per item, a `§`
pointing at its design, and items moving between the tiers and into Done. **The
designs are the second half**, further down, and they are here rather than in
`DESIGN.md` because `DESIGN.md` describes the system as it stands, and these are
not part of it yet.

When one gets built, its section moves into `DESIGN.md` and its item moves to
Done. **The number goes with it.** Section numbers are one namespace across all
three documents - §24 means interrupt handlers wherever it currently lives - so
the number tells you the topic and the file tells you the status.

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
- **DESIGN §20**, whose settled entries say *"built; see §N"* beside the question
  they answered.

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

- **A text adventure.** DECISIONS §15 - the last item on the original acceptance bar,
  and nothing in the language blocks it. Also what the README rewrite waits on,
  since a README that shows off wants something to show.
- **Fixed-point division.** DESIGN §25 is half built and says which half: `*` on
  8.8 lands, division does not, and §25 sets out why it is the awkward one.
- **Finish moving the record into `DECISIONS.md`.** In progress, section by
  section, as `DESIGN.md` is read through. Done: §15, §17, §18, §26, §27 - the
  last of which dissolved entirely rather than splitting. Still to do: §16, §20,
  §22, §25, of which §16 and §25 are the large ones.

### Probably

- **Record where each peephole lives.** `PEEPHOLES.md` says what each rewrite is
  and why it is safe, but not where in the emitter it is implemented or whether it
  is built at all - which is how entries 4 and 5 stood as fiction for a long time.
  Fifteen entries to check against the emitter.
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
- **Rewrite `README.md`.** `CONTRIBUTING.md` records that it is provisional, in a
  register the other documents do not use, and that rewriting it waits on programs
  worth showing and on a draft written rather than generated.

### Maybe

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

## Done

Nothing yet. Empty rather than incomplete - see the note above for why, and where
to look instead.

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
compiler wants rather than by what the language should be. Neither of Momo's
distinguishing properties - readable commented output, an exact memory
footprint - is served by the compiler being written in itself.

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
