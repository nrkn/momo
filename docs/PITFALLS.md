# Pitfalls

Things that bite when writing Momo *programs*, as opposed to working on the
compiler - `CONTRIBUTING.md` has the gotchas for that. Every entry here cost
real time to find, and each leads with the symptom rather than the cause,
because the symptom is what you will have when you come looking.

These are historical rather than normative: each one records what happened and
why, so unlike `DESIGN.md` they do not go stale when the compiler changes. If a
future version makes one of them impossible, the entry becomes a note about
something that used to be true, which is still worth reading.

---

## DOSBox will not show you a timing bug

**Symptom.** A program that works perfectly under DOSBox misbehaves on 86Box or
real hardware, often in a way that gets worse on the faster machine.

DOSBox does not model most device timing. The keyboard controller hands over the
next byte immediately, ports respond instantly, and nothing takes a bus cycle. So
any bug whose cause is "the hardware was not ready yet" is invisible there, and
the emulator's *correctness* being good is what makes this dangerous - it passes
everything, so it feels like coverage.

Every other entry in this file is a special case of it. `CONTRIBUTING.md` records
the same shape for performance: `cycles = auto` measures your host, not the 8086.

**What to do.** Treat a DOSBox pass as "the logic is right", not "the program
works". Anything touching a device wants 86Box before you believe it, and
DESIGN §22 gives the three-tier version of this for port I/O specifically.

---

## A keyboard drain loop collects exactly one byte per call

**Symptom.** Held arrow keys stick on real hardware: the paddle stops responding,
the opposite direction does nothing either, and it clears itself if you wait or
tap the same key again. Fine in DOSBox. Fine for keys that send a single
scancode. Worse the longer the key is held.

The 8042 holds **one byte**, and the keyboard takes about a millisecond to clock
the next one over the wire. So the obvious loop:

```momo
while ( in8( kbStatus ) & kbFull ) {
  code = in8( kbData )
  // ...
}
```

reads its one byte, checks the status a microsecond later, finds the buffer empty
because the next byte is still in transit, and exits. It does not drain. Polling
once per frame therefore caps input at **one byte per frame** - about 35 a second
at 35Hz.

A held key can beat that. Grey arrows send two bytes per typematic repeat, and
four if NumLock is on, since the keyboard injects a fake shift (`E0 2A E0 48`
rather than `E0 48`). The surplus queues in the keyboard's own buffer, and the
release code sits behind it - so the key stays down for as long as the backlog
takes to drain, which is why the opposite direction is dead too. Its bytes are
in the same queue.

**What to do.** Poll far more often than once a frame. The retrace wait is idle
time and most of the frame, so draining there costs nothing and raises the rate
by orders of magnitude:

```momo
sub waitRetrace {
  while ( inRetrace() ) pollKeyboard()
  while ( !inRetrace() ) pollKeyboard()
}
```

Turning NumLock off halves the traffic and measurably helps, which is a useful
diagnostic even though it is not a fix.

**What was tried first and was wrong**, in order: an I/O delay between controller
accesses, the status register's aux bit discarding real scancodes, and HIMEM
toggling A20 through the same controller. All three were plausible, all three
matched "worse on the faster machine", and none of them was it. The thing that
settled it was putting the byte stream on screen.

---

## Waiting for retrace after drawing does not stop tearing

**Symptom.** The frame rate is right and stable, and the display still tears.

Waiting at the end of a frame paces the loop, which is what a timer does. The
point of the retrace is *when* you draw: during the vertical blanking interval
the beam is off-screen, so writes made then are not caught mid-scan. Wait first,
then draw.

```momo
sub tick {
  input()
  update()
  waitFrame()
  render()
}
```

**The honest limit.** Blanking is roughly 1.4ms of a 14.3ms frame in mode 13h, and
a full redraw takes longer than that - so this buys a head start rather than a
guarantee. Whatever is drawn last, lowest on the screen, is where the beam
catches up first.

---

## Unmasking IRQ1 while a key is held puts a keystroke at the DOS prompt

**Symptom.** You quit with Esc and the shell prints one.

While IRQ1 is masked the BIOS sees nothing. Unmask it with the key still down and
typematic repeats the make code straight into the BIOS buffer, where DOS finds it.

**What to do.** Wait for every key to be released before unmasking, then drain the
controller, then unmask - in that order. It belongs in the shutdown routine rather
than in the caller: the leak is an artefact of masking, and a program that later
moves to a chained `int 9` handler (DESIGN §24) should not have to change.

---

## Level-state key flags lose a fast tap

**Symptom.** A quick press of a quit or confirm key is occasionally ignored.

A flag that is true while a key is down is written by the poll and read by the
game, and those happen at different rates. If a make and its break both arrive
between two *reads*, the flag was true only in between and the press never
existed as far as the game is concerned. Polling more often makes this **more**
likely, not less.

**What to do.** Keep level state for things you hold - paddles, movement - and add
a sticky latch for things you tap:

```momo
bool isEsc      // true while held
bool wasEsc     // set on the press, never cleared here
```

Something has to clear the latch if the action can happen twice; if it ends the
program, nothing does.

---

## Constants wider than 16 bits cannot be written down

**Symptom.**

```
const pitHz = 1193182
              ^ error: literal 1193182 does not fit in 16 bits
```

The rule is about *literals*, not intermediates - a folded expression may exceed
16 bits as long as every literal in it fits and the result fits where it lands
(PLAN §32 records why, and what it means for self-hosting). But it does mean
the PIT's input frequency cannot appear in source, so `1193182 / hz` is not
expressible even as a constant.

**What to do.** Generate the table elsewhere and paste the values, which is what
every DOS program did anyway - note divisors all fit `u16`, from 43389 at A0 down
to 285 at C8.

---

## A loop counter stepped past its bound never leaves the loop

**Symptom.** The program hangs. Tier 2 reports a timeout and nothing else, because
a program that does not terminate prints nothing to compare.

```momo
for ( a = 0; a < 65535; a = a + 4097 ) {
```

`a` is a `u16`, and it goes 0, 4097, ... 61455 - and then 61455 + 4097 is 65552,
which wraps to 16. The test never fails, so the loop never ends. Nothing warns:
the wrap is exactly what 16-bit arithmetic is supposed to do, and `a < 65535` is a
perfectly ordinary comparison.

The trap is not the step or the bound on their own, it is that **the bound sits
close enough to the top of the range that the step can jump over it**. Any step
larger than one has this shape; a step of one only meets it at 65535 exactly.

**What to do.** Count with an index and derive the value:

```momo
for ( i = 0; i < 16; i++ ) {
  a = i * 4097
```

Found while writing `fixmul`, which compares two implementations over 256
pairs - so the loop existed to be thorough and hung instead.

---

## Adding a plain number to a fixed-point value is an error

**Symptom.**

```momo
i8.8 scale
scale = scale + 2
              ^ error: cannot apply "+" to i8.8 and 2 - 2 is a count, not a value
                with a radix point; write i8.8( 2 ) to promote it
```

This is deliberate and it is the whole point of the feature (DESIGN §25). An `i8.8`
holds 256ths, so `2` could mean two units or two 256ths, and the two readings are
256x apart. C cannot tell them apart and gives you the wrong one silently; Momo
refuses and asks which you meant.

**What to do.** `i8.8( 2 )` promotes a count, and `2.0` is the same thing written
as a value. `scale * 2` needs neither, because multiplying by a count is
"twice as big" and the scale survives - so the rule bites on `+`, `-` and
comparison and leaves `*` and `/` alone.

---

## A negative fixed-point product is rounded toward zero, not down

**Symptom.** `fixMul( -0.1, 0.1 )` gives -2 where an arithmetic shift of the same
product would give -3.

`shared/lib/std/fixed.momo` takes the magnitude of both operands, multiplies, and negates
the result - so the truncation happens on a positive number and rounds inward.
`sar` would round toward negative infinity instead.

The gain is symmetry: `fixMul( -a, b )` is exactly `-fixMul( a, b )`, which is the
more useful property for a scale factor. The cost is that a negative result can sit
one step closer to zero than the exact product.

**What to do.** Nothing, usually. If a difference of 1/256 matters in a particular
place, do the multiply on magnitudes yourself and apply the sign where you want it.
And note the other end of the same routine: **-32768 has no magnitude in an `i16`**,
so the most negative 8.8 value multiplies as though it were positive.

---

## Config set above a bracket block belongs to the block, not to the body it sits in

**Symptom.** A box comes out with settings you thought you gave to its parent, or
without settings you thought you gave it - and the source reads as though it
should be the other way round.

```momo
panel( cyan ) {
  labelPaint( addr( sMomolo ), black, cyan )

  cfgGrowW()
  cfg.gap = u
  box {
  }
}
```

Those two `cfg` lines are inside `panel`'s body and they configure the `box`
whose brace follows. That is the momolo config carrier (DESIGN §36): a `group`
written before a call and consumed by it, reset on use. It was out of band before
§48 too, and nothing about the meaning changed when blocks arrived - **what
changed is that the body now looks like a scope**, so lines sitting in one read
as belonging to it.

`bracket` closed the half of this that was a correctness problem - a missing
close - and deliberately did not touch the carrier, which is a library design
waiting on a language feature. DECISIONS §48 records the misreading as real and
confirmed by looking rather than predicted; PLAN §49's named and default
arguments are what would retire it.

**What to do.** Read the brace, not the indentation: `cfg` calls belong to the
next opening, always. Keep them immediately above it with no blank line between,
which is what the scenes do, and put a blank line *above* the group instead - so
the gap separates it from the body it is not part of.

---

## A jump *out of* a bracket body is refused

**Symptom.** A compile error naming the statement:

```
error: return inside a bracket body would skip the close - lift the block out,
or write the pair by hand where an early exit is wanted
```

```
error: break inside a bracket body would skip the close - it belongs to a loop
outside the block
```

The compiler emits the close at the end of the body, so a jump past it would
leave the pair unclosed - the exact failure §48 exists to prevent. It refuses
rather than emitting the close on every exit path; that is `defer`, a different
feature, in PLAN's Maybe tier with the reasons it stayed separate.

**Only jumps that leave the body are refused.** A loop written *inside* the block
is ordinary code and its own `break` and `continue` are fine - the parser tracks
the loop depth and only objects at zero. So this is a rule about the block
boundary, not about the keywords.

**What to do.** What the message says: lift the block out, or write the open and
close by hand at the one site that wants an early exit. Both keep the pairing
visible, which is the point - and a bracket declared for the other call sites
goes on serving them.

---

## Some names compiled and then failed to assemble - fixed

**Fixed.** The first entry here to be retired, and kept because the preamble says
it should be: it explains a rule that still applies, and the symptom is what
someone on an older build would have.

**Symptom.** The Momo compiler is happy and NASM rejects the output:

```
error: instruction expected, found `:'
```

Momo mangled NASM's directives, size keywords and register names, but not its
**prefixes** - so `sub wait`, `sub rep` and `sub lock` emitted labels NASM reads
as the start of an instruction. The rule is narrower than "avoid instruction
names", and that is why the gap survived: ordinary mnemonics are fine and
deliberately unmangled, so `add:`, `ret:`, `nop:` and `cbw:` all assemble.

Fifteen names were affected - `wait`, `lock`, `rep`, `repe`, `repz`, `repne`,
`repnz`, `a16`, `a32`, `o16`, `o32`, `xacquire`, `xrelease`, `bnd`, `nobnd` -
established by assembling one sub per candidate rather than by reading a list,
since assuming the category is what caused the bug in the first place. All are
in the mangled set now, and `prefixes` keeps them there.

**Then it happened again, in data - also fixed.** The paragraph above is right
that `add:` assembles, and that is what made it misleading: only *routines* were
emitted with a colon. A `u16 add` came out as `add dw 0`, no colon at all, so
NASM read the leading token as an instruction and reported it differently:

```
error: comma, colon, decorator or end of line expected after operand
error: invalid combination of opcode and operands
```

Variables, arrays, consts and views were all exposed - group fields were not,
since `add__x` is nobody's mnemonic - and both `add` (two operands) and `nop`
(none) failed, so it was every mnemonic rather than a quirk of one. Data labels
carry a colon now, which retires the class rather than lengthening the mangled
list; the fifteen prefixes stay mangled because a colon does not save them
either. See DESIGN §7.

**Worth knowing anyway**, because it was the shape of the next one, twice over:
nothing in tier 1 could have caught either. The program compiled, and only the
assembler objected.
