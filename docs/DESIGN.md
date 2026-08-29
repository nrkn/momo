# Momo - language design

A small imperative language that transpiles to commented NASM source for a
minimal 8086 subset. Source files use the `.momo` extension.

Named after a cat, continuing the tradition set by
[Yuki](https://github.com/nrkn/yuki-js) - the earlier language. The Pong in
`_reference/yuki.txt` is written in it, and is the reference point for "level of
language" we are aiming at.

**What it is.** A fantasy console, for real hardware.

The phrase contradicts itself and both halves are load-bearing. A fantasy console
invents its constraints - a fixed screen, a fixed palette, a memory ceiling -
because working inside them is the point. Momo takes that posture toward
constraints nobody invented: the 8086 subset, the 64 KB segment, the `.COM` in
tiny model and the DOS underneath were somebody's actual machine. The aesthetic is
the same; the authority is not.

The difference runs the opposite way to how it sounds. A fantasy console can
revise its specification when the specification turns out to be annoying, and this
one cannot - so a design that meets the machine is finished rather than tuned.

It is also the reason behind decisions the sections below argue for one at a time:
the subsetted ISA (§1), no recursion (§2), output that is commented NASM meant to
be read (§9), an exact static footprint (§12). Each has a local justification and
each is also this. Where a decision looks austere, the constraint is doing work,
and it is doing it deliberately.

Two consequences are easy to mistake for carelessness. **Slow is acceptable where
the work still gets done** - a small machine that takes its time is the aesthetic
rather than a failure of it, and that licenses trades which would otherwise read
as bad engineering. And **self-hosting is a goal rather than a stunt**: a machine
you can develop on without leaving it is what the phrase describes. That is a
different argument from the one §32 makes for itself, and §32 now says so.

None of this is new. Yuki, named above, wrote its Pong for a fantasy console
outright - `_reference/yuki.txt` is that program - so what changed in Momo is the
hardware rather than the intent. What follows from it is a tier of applications,
and that lives in `PLAN.md`; this file stays the language as it stands.

**Why.** Three reasons, and this document is mostly the third.

Primarily, to write small games and tools. Secondarily, to show that x86
assembly is not overwhelming if you start with a small subset and work up -
which is why the ISA is subsetted at all (§1), why the target is a DOS `.COM` in
tiny model, and why the output is commented NASM meant to be read rather than an
intermediate meant to be trusted. Where a decision below looks austere, that is
usually the reason: the constraint is doing work.

And to settle language ideas that have been rattling around for a decade or
more, across a series of small prototypes - Yuki above is the one that survived.
That is why this file argues rather than specifies, and why §16, §17 and §19 were
written out in full before being built: an idea worked through is worth having on
paper even when nothing needs it yet. Momo is where they finally have to compile -
and §16 and §17 both did, close enough to what was written down that the sections
needed correcting rather than rewriting.

**Numbering.** Section numbers are stable and only ever appended. `group` was
built where it sat rather than renumbered into the built range, because the
numbers are cited from source comments and from each other - there are around 140
such citations outside this file, so §17 means `view` permanently. §21 is a
redirect rather than a section for the same reason: what was there is now §26-§33,
and the number is kept because deleting it would break references while reusing it
would silently point them somewhere else.

The numbers are **one namespace across the documents**, not this file's alone.
This file holds the system as it stands; `PLAN.md` holds the designs for things
that are not built yet, and a section carries its number across if it is ever
built. `DECISIONS.md` holds the record for a section - what it cost, what was
measured, what was tried and rejected - under that same number. So §24 means
interrupt handlers wherever it currently sits: the number tells you the topic, and
the file tells you which aspect.

A number therefore appears in `DECISIONS.md` *as well as* here, which is intended.
What cannot happen is the same aspect in two places.

Two consequences worth stating plainly. **Numeric order is not topic order**, and
it never will be - what a section is about is in its heading. And **a number
missing from this file has not been deleted**; it is in `PLAN.md`.

---

## 1. Target

| | |
|---|---|
| Output | Commented NASM source, assembled with `nasm -f bin` |
| Format | `.COM`, `org 100h` |
| Memory model | Tiny - `CS = DS = ES = SS`, one 64KB segment |
| CPU | **Strict 8086.** No 186+ instructions. Revisit later. |
| Toolchain | NASM only. No linker, no `.obj`, no relocations. |

Tiny model means CS, DS and SS are never emitted, never overridden, never thought
about - one segment holds code, data and stack, so nothing in ordinary Momo has a
segment to name.

**ES is the one exception, and only where `far` (§16) is used.** A far region
names memory outside our segment, so the emitter loads ES and prefixes the access
with `es:`. Nothing else touches it, the int helpers preserve it, and a program
with no `far` declaration emits no segment register at all.

### Instruction subset - 39 mnemonics

| Group | Instructions |
|---|---|
| Move | `mov` `push` `pop` |
| Arith | `add` `sub` `inc` `dec` `neg` `cmp` `mul` `div` `idiv` `cbw` `cwd` |
| Logic | `and` `or` `xor` `not` `test` `shl` `shr` `sar` |
| Control | `jmp` `je` `jne` `jl` `jle` `jg` `jge` `jb` `jbe` `ja` `jae` `call` `ret` |
| System | `int` `pushf` `in` `out` |

`jz`/`jnz` also appear in the output. They are the same instructions as
`je`/`jne` - NASM assembles both spellings to one opcode - and the emitter uses
the z-spelling after a `test`, where "zero" is the honest reading, and the
e-spelling after a `cmp`. Spellings, not additions: the count stays 39.

**All 41 spellings are emitted by some committed program, and nothing outside
them is emitted by any** - and `npm test` asserts it, reading this table rather
than a copy (§14). It did not hold until `cmptest` was written: `jle`, `jg` and
`jz` had no program behind them, because nothing did a signed `<=` or `>`. The
count in the heading is checked against the table too, which is the mistake
`pushf` made once already.

`in` and `out` were the last additions and the largest single one since the
table was written - 37 to 39. They arrived the way §22 said they would: only
once a program wanted them, and `porttest` is that program.

Deliberately absent:

- **`lea`** - no pointers, and `[disp16 + bx]` covers array indexing in one instruction.
- **`imul`** - the low 16 bits of a multiply are identical signed and unsigned in
  two's complement, so `*` always emits `mul`. The second half of this reason used to
  be "with no 32-bit type we never read `DX`", and §25 spent it: `mulshr8` reads the
  high half of a product. `imul` still stays out, for a different and smaller reason -
  the unsigned kernel plus magnitude-and-sign in `shared/lib/std/fixed.momo` already covers
  signed fixed multiply, so `imul` would buy one instruction and cost a mnemonic.
- **`enter`/`leave`, `pusha`/`popa`, 3-operand `imul`, `push imm`, `shl r,imm8`** - all 186+.
- **`setcc`** - 386+. This is why conditions compile in control-flow context (§9).
- Segment ops, BCD/ASCII adjusts, `xlat`, far calls.
- **`rep` and the string instructions**, including the string port forms - more
  mnemonics, and nothing has wanted them; DECISIONS §22 says why for `rep outsb`.
- **Flag manipulation**, with one exception. `pushf` earns its place by being the
  only way to read carry without `setcc` (386+), and carry is how DOS and BIOS
  report failure - see `_cf` in §10. It appears once per int helper and nowhere
  else. `popf`, `clc` and `stc` stay out, which is what keeps `_cf` read-only.

Width extension needs no extra mnemonics: `u8->u16` is `xor ah,ah`, `i8->i16` is
`cbw`, `u16->u32` (before `div`) is `xor dx,dx`, `i16->i32` (before `idiv`) is `cwd`.

---

## 2. Execution model

**Nothing lives on the stack except return addresses and expression
temporaries.** Every variable is a fixed label - a link-time constant.
Consequences:

- **No frame pointer.** BP is never used. No prologue, no epilogue; a sub is a
  label and a `ret`. Routine parameters are mangled globals, not stack slots.
- **No stack frames.** The stack holds return addresses and expression
  temporaries only.
- Variables declared inside a sub body are statically allocated with a scoped
  label. Same codegen as a global, just name-scoped - which is why they may not
  carry an initialiser (§5): there is no per-call storage to initialise.
- **Recursion is a compile error.** Because locals are static, a recursive call
  overwrites its own caller's variables - it is never useful, only ever a bug.
  The resolver builds the call graph and rejects any cycle, naming it:

  ```
  error: recursion is not supported: a -> b -> a - locals are statically
  allocated, so a recursive call overwrites its own variables
  ```

  Proving the graph acyclic also makes worst-case stack usage a static
  quantity - see §12.
- Top-level statements form the entry point, emitted at `org 100h`.

### What banning recursion costs

Less than it sounds. A recursive algorithm simply carries its own stack, which
the heap already provides:

- `qsort` keeps `(lo, hi)` ranges as pairs of words - a plain worklist.
- `hanoi` needs a **resume point** per frame, so each frame is four words
  (`n`, `from`, `to`, `stage`) and the loop becomes a state machine. This is the
  genuinely awkward shape of hand-rolled recursion, and it came out fine.

Both were written straight through with no compiler changes. What the ban buys in
exchange is the exact stack figure in §12 - `hanoi` reports 10 bytes worst case
along `entry > solve > pushFrame > frameSet > slotOf`, which would be unknowable
with real recursion.

### Three callable forms

| | | |
|---|---|---|
| `sub tick { }` | no arguments, no return | may omit the empty parameter list |
| `sub move( u8 dx ) { }` | arguments, no return | *private* mangled globals, real `call` |
| `u16 add( u8 a ) { }` | arguments and return | type-led, like a variable |
| `const sqr( u8 n ) = n * n` | arguments, single expression | substituted, no call emitted |

They differ by what they *are*: a `sub` returns nothing, a typed routine returns
a value, and a `const` is not called at all - it is substituted.

The split is also a teaching order: `sub` alone is a usable language, arguments
and return types add checking on top of it, and `const` adds compile-time
evaluation on top of that.

`return` is a bare early exit in a `sub`, and carries a value in a routine with
a declared return type.

**Every path must return.** A routine with a return type that can reach its own
end is a compile error, not a zero. There is nothing sensible to fall through
to: the return value is a mangled global, so falling off the end hands the
caller whatever the previous call happened to leave in that slot - a wrong
answer with no diagnostic anywhere, which is the worst shape a bug can take
here.

An endless loop counts as returning, because control never leaves it to arrive
at the end empty-handed:

```momo
u16 waitForKey() {
  while (true) {
    if (ready()) return readKey()
  }
}
```

A `break` inside that loop takes it back, since the break lands exactly at the
end of the routine.

---

## 3. Types

`u8` `i8` `u16` `i16` `bool`

- `bool` is one byte with `true`/`false` literals; comparisons produce it.
- **Only a bool may be assigned to one.** The store is a raw byte - no
  normalisation is emitted - so admitting a scalar would let a bool hold 2,
  where `if (b)` says true and `b == true` says false at once. Write the test
  (`x != 0`) or the cast (`bool(x)`), both of which produce a real 0-or-1.
  Constants follow §4's fit rule against bool's range of {0, 1}: `b = 1` is
  fine, `b = 2` is an error. A `?:` whose arms are both bool stays bool - the
  result is one of the arms, not arithmetic over them. Applies wherever a value
  meets a declared type: initialisers, assignments, arguments and returns.
  Reading a bool into arithmetic remains free, since it is genuinely 0 or 1.
- `if` accepts any scalar - non-zero is true, so `if (arr[i])` works.
- Fixed-size arrays only. No pointers, no structs, no floats.

**Core rule: all arithmetic happens in 16 bits; narrowing happens only on store.**
`AL`/`AH` are never used as independent registers. Bytes exist as a memory width,
not a register width.

---

## 4. Type rules

**Four scalar types plus `bool`, and a fixed-point spelling over the top of them.**
`i8.8` and its 47 siblings are the same four types with a documented scale (§25): the
rules below decide the storage, and a fraction width travels beside it deciding the
units. Everything in this section is about the storage half and holds unchanged - a
reader who never writes a `.` in a type name will not meet the other half.

### Only four operations care about signedness

Sign-agnostic in two's complement: `+ - * << & | ^ ~ == !=` and unary `-`.

| Op | Unsigned | Signed |
|---|---|---|
| `/` `%` | `xor dx,dx` + `div` | `cwd` + `idiv` |
| `>>` | `shr` | `sar` |
| `<` `>` `<=` `>=` | `jb` `ja` `jbe` `jae` | `jl` `jg` `jle` `jge` |

### Mixing: smallest type containing both value ranges

|  | `u8` | `i8` | `u16` | `i16` |
|---|---|---|---|---|
| **`u8`** | `u16` | `i16` | `u16` | `i16` |
| **`i8`** | `i16` | `i16` | error | `i16` |
| **`u16`** | `u16` | error | `u16` | error |
| **`i16`** | `i16` | `i16` | error | `i16` |

> **`u16` does not mix with signed types.** Everything else widens to the
> smallest type that holds both.

The two error cells are honest - no 16-bit type holds both a signed range and
`u16`. Use an explicit cast. Note `u8 op u8 -> u16`, which is free (we're in AX
anyway) and makes `if (a + b > 255)` behave sensibly.

### Narrowing

Promotion is always upward, so **narrowing can only occur at an assignment or a
cast** - never inside an expression.

Assignment truncates implicitly, and the transpiler notes it in the output:

```nasm
        mov     [y1], al        ; y1 = (x * 9) + playfieldTop + 2  [narrowed u16 -> u8]
```

Free in codegen (compute in AX, store AL), and declaring `u8 y1` is the
programmer stating the value is small. Requiring casts here would add noise to
~30 lines of the reference file.

**But a constant that does not fit is an error, not a narrowing.** That
permission is about *runtime* values, where declaring `u8 y1` is the programmer
asserting something the compiler cannot check. There is nothing to assert about
a literal whose value is right there:

```momo
u8 x = 300          // error: value 300 does not fit in u8
u8 x = u8(300)      // 44, said deliberately
```

`u8 x = 300` has no use as anything but a typo, and the cast already exists to
say otherwise. This also catches negatives going into unsigned targets - `u16 m
= -1` was silently 65535. It applies wherever a value meets a declared type:
initialisers, assignments, arguments and returns all pass through the same
check.

### Untyped means constant

`untyped` is not just "not yet decided" - it means *this is a constant whose type
is not fixed yet*. An expression that comes out untyped but whose value cannot be
computed is a contradiction, and two forms can produce one:

```momo
out = 1 << (n & 7)      // untyped literal, runtime shift count
out = flag ? 1 : 2      // both arms untyped, runtime test
```

Both settle to a concrete type built from the constituent values rather than
staying untyped. Before this was handled, the first leaked
`internal: untyped value without a constant` to the user.

### Literals and consts are untyped

Integer literals adopt the type of whatever they are used with, falling back to
self-inference in isolation. **Scalar `const` is untyped too** - it is a named
literal with no storage, emitted as a NASM `equ`.

This is what makes the strict `u16` rule livable: most mixing in real code is
variable-against-literal, so the error only fires when two genuinely
incompatible *variables* meet.

Array consts need storage, so they need a real element type - inferred from the
widest value, or stated.

### Casts

`u8(expr)`, `i16(expr)` - function-style; type names are reserved words so there
is no ambiguity. Pure truncate/reinterpret, no range check, no runtime cost.
`u8(300)` is 44, `i8(200)` is -56.

---

## 5. Syntax

```
const xMax = 127                        // untyped, emits `xMax equ 127`
const u8[] sprites = [ 1, 0, 1 ]        // storage; element type inferred or stated

u8 x                                    // zero-initialised
u8 y = 42
i16 ballX
bool winScreen

u8[4] buf                               // sized, zero-filled
u8[] table = [ 2, 4, 6, 8 ]             // size inferred from initialiser
u8[10] partial = [ 1, 2, 3 ]            // tail zero-filled
u8[playfieldWidth] row                  // const-folded size

view u8[4] head  = buf[0]               // a window into storage that exists (§17)
view u8    first = buf[0]               // no [n]: a scalar alias for one element

local u16 seed = 42                     // private to this file (§11)
local sub reseed { }                    // any declaration takes the modifier

sub clearScreen {                       // no arguments, no return
  for (y = 0; ; y++) {
    if (y == yMax) break
  }
}

u16 add( u8 a, u8 b ) => a + b          // arguments and a return type

const sqr(u8 n) = n * n                 // parameterised const: one expression
```

- Type-first declarations are unambiguous because the type set is **closed and
  finite** - one token of lookahead, no symbol table. `let` is not needed.
- Array type stays contiguous (`u8[4] foo`, not C's `u8 foo[4]`) - parse a type,
  then a name. No declarator grammar.
- `u8[] foo` with no initialiser is an error. Count mismatch on
  `u8[4] foo = [1,2,3,4,5]` is an error.
- **An initialiser is a load-time value, and is only allowed at the top level.**
  It is written into the data section and never executed, so it is honest only
  where "before the program runs" and "when control reaches this line" are the
  same moment - the program's own statement sequence, unnested. Inside a routine
  or any block, declare and then assign:

  ```momo
  sub putBar {
    u8 n                      // u8 n = 0 would set n once, at load
    n = 0
    do { putChar('-') n++ } while (n < 3)
  }
  ```

  Nothing about this is specific to loops: a sub-local is static, so a *second
  call* to `putBar` would find `n` still at 3 and print one dash. The rule covers
  arrays by the same reasoning rather than by an exception - with no `rep movsb`
  in the subset there is no cheap way to re-initialise an array, so load-time is
  the only thing an array initialiser could ever be, and a rule that held only
  for scalars would make the same syntax mean two things.

  The alternative - emitting the initialiser as code where it is written - was
  rejected for that asymmetry, and hoisting for a sharper reason: running an
  initialiser on routine entry is a **prologue**, and §2 has none.

  **A `for` is the one place `TYPE name = value` may be written below the top
  level, and it is not an exception to any of the above.** §44 lifts the
  declaration to the top of the body and leaves the assignment in the clause, so
  what reaches this rule is a declaration with no initialiser beside an ordinary
  store - and the store runs every time control arrives, because everything in
  that clause does. `npm run desugar` shows the two statements.
- **`sub name { }`** for routines that return nothing; a leading type for those
  that return a value. `=>` introduces a single-expression or single-statement
  body. There is no `->`.
- **Parameter lists are shared** between routines and consts: type-first, scalars
  only (`u8[] a` as a parameter is an error). One `parseParameterList`.
- **No semicolons.** A newline ends a statement only when bracket depth is zero.
  Multi-line `if` conditions and array literals work for free.
- `==`, not `===`.
- String literals `"Hello$"` and char literals `'H'` are sugar for `u8` arrays /
  `u8` values. Lexer-only.
- **Adjacent string literals concatenate**, across newlines, so ASCII art can be
  laid out as it will appear:

  ```momo
  const u8[] map = "#####"
                   "#   #"
                   "# @ #"
                   "#####"
  ```

  This is C's rule and needs no new token. It is unambiguous because no statement
  can begin with a string literal - the parser looks past newlines for another
  one and, finding anything else, consumes nothing.
- **`len(a)`** folds to an array's declared length, as an untyped constant - so a
  map's height is counted rather than stated, and adding a row cannot
  desynchronise it:

  ```momo
  const mapH = len( map ) / mapW
  ```

  It needs no storage, so unlike `addr` it does not keep an otherwise unused
  array alive. `len` on the heap is an error - that size is not known until NASM
  has assembled, so use `_hsize` (§13) - and `len` on a scalar is an error. It
  resolves in declaration order like any name, so it cannot appear above the
  array it measures. Designed as part of §19 and landed ahead of it.
- Comments: `//` to end of line, and `/* ... */` block comments. **Block comments
  do not nest** (C behaviour). A block comment spanning lines counts as a newline
  for statement termination.
- Numeric literals: decimal `42`, hex `0x7F`, binary `0b1010_1010`. `_` is a
  digit separator, allowed between digits only - not leading, trailing, or
  doubled.

Control flow: `if`/`else`/`else if`, three-clause `for` (any clause may be
empty), `while`, `do { } while (...)`, `break`, `continue`, `return` (bare or
with a value). `while` and `do while` are sugar - they share the `for` emitter,
but keep distinct AST nodes so the generated source comment matches what was
written.

**Unreachable code is an error.** Anything after a `return`, `break`, `continue`
or endless loop cannot run. With no preprocessor, no goto and no labels there is
no shape where that is deliberate, so - as with recursion - the thing that is
never useful is rejected rather than tolerated. Momo has no warnings to
downgrade it to, and would not want one here.

---

## 6. Operators

C's shape, with the two bugs every post-C language fixed: **bitwise ops bind
tighter than comparison** (so `flags & 1 == 0` means what it looks like), and
**shifts bind with the multiplicatives** (so `1 << 2 + 3` is 7, not 32).

Tightest first:

| | Operators | Assoc |
|---|---|---|
| 1 | `f()` `a[i]` `u8(x)` | left |
| 2 | `!` `~` `-` (unary) | right |
| 3 | `*` `/` `%` `<<` `>>` | left |
| 4 | `+` `-` | left |
| 5 | `&` | left |
| 6 | `^` | left |
| 7 | `\|` | left |
| 8 | `<` `<=` `>` `>=` `==` `!=` | **none** |
| 9 | `&&` | left |
| 10 | `\|\|` | left |
| 11 | `?:` | right |

Right associativity on `?:` means nested ternaries chain the way you expect:
`a ? b : c ? d : e` is `a ? b : (c ? d : e)`.

Structural decisions that matter more than the table:

- **Assignment is a statement, not an expression.** No `=` in the table at all.
  Kills `if (x = 5)`; expressions have no side effects except sub calls.
- **`++`/`--` are statements**, so prefix and postfix collapse into one form.
  Every use in the reference file is already a bare statement.
- **Comparison is non-associative** - `a < b < c` is a compile error.
- Compound assignment (`+= -= *= /= %= &= |= ^= <<= >>=`) desugars to
  `x = x op e`, which loads through the index and stores through it again. If the
  index calls a routine it would run twice - possibly landing on a *different*
  element the second time - so that is rejected. Plain `=` and `++`/`--` evaluate
  the index once and are unrestricted.
- Unary `+` does not exist.
- `&&`, `||`, `!`, `?:` are the only expression forms that emit labels.

---

## 7. Routines: `sub` and typed functions

```momo
sub draw { }                          // no arguments, no return
sub move( u8 dx, u8 dy ) { }          // arguments, no return
sub log( u16 n ) => putNumber( n )    // one statement
u16 add( u8 a, u8 b ) { return a + b }
u16 add( u8 a, u8 b ) => a + b        // the expression is returned
```

**A `sub` is a routine with no return type** - one AST node covers both forms.
Declarations are type-led, matching variables, parameters and casts:

```momo
u16 count                             // a variable of type u16
u16 add( u8 a, u8 b ) => a + b        // a routine of type u16
```

One token of lookahead past the name tells them apart: `(` means a routine,
anything else means a variable. **Only `sub` may omit an empty parameter list** -
`u16 getValue {` opens exactly like a variable declaration, so typed routines
require `()` and get a dedicated error if they lack it.

`=>` desugars entirely in the parser: a typed routine wraps the expression in a
`return`, a sub wraps the statement as-is. The resolver and emitter never see it.

### It is sugar over globals

Parameters and the return value become mangled globals (`add__a`, `add__ret`); a
call stores the arguments and `call`s. No stack frame, no BP, no recursion - so
the static memory analysis survives intact.

What that buys over bare globals is checking: arity, argument types, and a
declared return type.

### Argument evaluation order

When no argument contains a call, arguments are evaluated and stored one at a
time. When any does, **every argument is evaluated onto the stack first and
stored afterwards**:

```nasm
        call    add             ; inner call
        mov     ax, [add__ret]
        push    ax              ; argument evaluated before any is stored
        ...
        pop     ax
        mov     [add__b], ax
        pop     ax
        mov     [add__a], ax
        call    add             ; outer call
```

Without this, `outer(f(), g())` where `g` also calls `outer` would have `g`
overwrite a slot already filled for the outer call. Evaluation is left to right.

### What routines changed elsewhere

- **The call graph must walk expressions.** Calls now hide inside them; missing
  that would let a recursive routine through the cycle check *and* let
  tree-shaking delete a reachable one. Both silent, both fatal.
- **Through a const, it must walk the expansion and not the arguments.** A const
  call emits its expansion and nothing else, so the expansion is the whole
  account of what happens there: the calls written in the const's own body, plus
  the caller's argument nodes spliced in wherever a parameter was used. Walking
  the arguments as well double-counts them; walking them *instead* - which is
  what the first version did, to avoid exactly that double count - loses every
  call the const's body makes. That cost a hard `internal: unresolved symbol`
  when the emitter called a fn pruning had deleted, and it silently hid
  `f -> aConst -> f` from the cycle check, which is the worse half. An argument
  bound to a parameter the body never mentions is correctly *not* a call - it is
  the zero-times end of the caveat in §8.
- **Cycle detection covers unreachable code.** A recursive routine is a bug when
  it is written, not when it first becomes reachable.
- **Worst-case stack sums down the call path** rather than taking the max across
  it, since a call can now happen while temporaries are live.
- **A const's argument may not call a routine if the parameter is used more than
  once.** `sqr(f())` would expand to `f() * f()`.

### NASM reserved words

Momo identifiers can collide with the assembler's vocabulary. `u16 absolute(...)`
emits `absolute:`, which NASM parses as the `ABSOLUTE` directive and rejects.
Colliding names get a trailing underscore (`absolute_`), which keeps the output
readable. Instruction mnemonics are deliberately *not* mangled - `add:` assembles
fine, and `add` is far too natural a name to disfigure.

**Prefixes are the exception, and this paragraph used to imply otherwise.** A
prefix may legally precede an instruction on the same line, so NASM reads a bare
`wait` or `rep` as one and then meets a colon it cannot place. That makes the
rule narrower than "mnemonics are safe": `add:`, `ret:`, `nop:` and `cbw:` all
assemble, while `wait:`, `lock:`, `rep:` and the rest do not. All fifteen are in
the mangled set, checked one name at a time rather than taken from a list - the
count is worth stating because the shape of the mistake was assuming the
category rather than testing it.

**The colon is what makes a mnemonic safe, and the sentence above was half
right.** `add:` does assemble - as a *routine* label, which is the only place the
claim was ever tested. Storage was emitted with no colon at all:

```nasm
add             dw      0        ; u16
```

so NASM read the leading token as an `ADD` whose operands were `dw 0`. The
program compiled and the assembler rejected it, which is the prefix mistake
again in a different place: the category was assumed from the one case that had
been checked. Every data line now carries its colon - `add: dw 0`, `push: equ
256`, `pop: equ cmp` - and the class goes away for variables, arrays, consts and
views at once. Extending the mangled set was the alternative and is strictly
worse: it would disfigure exactly the names the rule exists to protect, and it
would have to enumerate NASM's whole instruction table rather than Momo's 39.

**The colon rescues mnemonics and nothing else**, which is why none of the list
above came out. `wait: dw 1`, `absolute: dw 1`, `word: dw 1` and `es: dw 1` are
all still errors - a prefix is consumed as a prefix, a directive as a directive,
and a register is not a name - so the two mechanisms are complementary rather
than overlapping. Stated honestly: a word NASM knows *only* as an instruction is
fine once it is followed by a colon; a word it can read as anything else at the
start of a line has to be mangled.

Group fields never needed either. `group add { u8 x }` emits `add__x`, and a
suffix is enough to make a name nobody's mnemonic - only a label that reaches
the output unmangled and unsuffixed is exposed.

**Tier 1 can see the spelling but not the verdict.** The program compiles; only
NASM objects, and tier 1 never assembles. What tier 1 does have is the golden
output (§14): `prefixes.asm` is committed, so dropping the colon again fails
`npm test` at the diff rather than silently. That pins the spelling this section
arrived at - it cannot tell you that some *new* spelling assembles. Only tier 2
can, and `prefixes` is the program that asks: it now declares a variable, an
array, a const, a view and a group field under mnemonic names alongside its
mnemonic-named routines, and prints a sum that only comes out right if every one
of them landed at its own address.

---

## 8. Parameterised consts

```momo
const     sqr( u8 n )            = n * n          // return type inferred
const u16 min( u16 a, u16 b )    = a < b ? a : b
const u8  hi( u16 w )            = u8( w >> 8 )
const     isDigit( u8 c )        = c >= '0' && c <= '9'
```

A parameterised const is exactly what the keyword says: **a `const` that takes
parameters.** Same nature as a scalar const - compile-time, no storage, never
assignable - it just has arguments. That framing settles the whole design:

- **Its own keyword, not `pure`.** It emits no call and allocates no
  argument storage, so it is not a flavour of function. (`pure` would also
  overclaim: in Haskell, Rust and D that word describes a full function which may
  loop and recurse.)
- **The body is a single expression.** Blocks would need an interpreter for
  compile-time evaluation and real substitution for inlining. One expression
  means the constant folder we already have does the job.
- **The separator is `=`**, matching `const`.
- **The return type goes in front**, where a variable's or a routine's type
  goes. It may be omitted and inferred from the body; when declared, it narrows
  exactly like an assignment target.

Four `const` shapes, all told apart by one token of lookahead past the name:

| Source | Distinguished by |
|---|---|
| `const u8[] a = [...]` | type, then `=` |
| `const k = 20` | ident, then `=` |
| `const f( u8 n ) = n * n` | ident, then `(` |
| `const u8 f( u8 n ) = n * n` | type, then `(` |

The type sits in the same place in all of them, so there is nothing special to
remember - and no arrow. `->` no longer exists in the language.

### Three things it can do that are not obvious, and one design rests on them

Established by probing rather than by reading, because the zoom transform in
`shared/lib/momovec` needed all three at once - and if any had been false the transform would
have had to be a routine, which is a call per coordinate read for every program whether
it transforms or not.

- **It binds late.** A parameterised const may be *called* before it is declared, and
  from a different file - so a library can read through a name the program supplies.
  Same property routines have, and for the same reason: declarations are collected
  before any body is resolved.
- **The body may index an array**, folding to a direct displacement where the index is
  constant.
- **The body may call a fn.** The expansion contains the call; the const itself still
  emits none of its own.

Which is what makes `momovec/direct.momo` free: `const i16 mapX( u16 at ) = px[ at ]`
substitutes to exactly the array index it replaced, measured as byte-identical
instructions across ten geometry projects.

**The trap in the same area** is §8's repeated-parameter rule, one paragraph down: an
argument that calls a fn cannot be bound to a parameter the body uses more than once.
That is why `fixMulUParts` in `shared/lib/std/fixed.momo` is a routine and not a const - its
kernel uses each operand four times, so `a * b` with a call on either side would have
failed for a reason the programmer never wrote.

**And one consequence worth knowing:** a const's body is resolved when it is *expanded*,
not when it is declared. So a const over names that do not exist compiles cleanly until
something calls it - which is how `subdiv` carried an include of
`momovec/direct.momo`, over `px` and `py` it does not have, for a whole commit without
anything complaining.

### How it compiles

The resolver substitutes the const's body - deep-cloned, with parameter
references replaced by the caller's argument expressions - and stores the result
on the call node. The emitter emits that expansion. **No call is ever generated.**

When the arguments are constant the whole expansion folds, which is where
compile-time table generation comes from:

```momo
const u16[] squares = [ sqr(0), sqr(1), sqr(2), sqr(3), sqr(4), sqr(5) ]
```

```nasm
squares:        dw      0, 1, 4, 9, 16, 25        ; u16[6] const
```

and `value = sqr(7)` becomes `mov word [value], 49`.

Called with a runtime value it substitutes inline instead - `sqr(x)` becomes
`x * x` with no call, no argument storage, and no return slot.

### Caveats

**Recursion is rejected** - a const is substituted, not called, so a recursive
one would expand forever. Detected with an expansion stack.

**An omitted return type is inferred per call site, not recorded.** Each
expansion types correctly, but the declaration itself never computes a type, so
`npm run check` shows `-> inferred` rather than the real one. Displaying it would
need a speculative resolution at declaration time, binding parameters to their
declared types rather than to arguments. Cosmetic only - no effect on codegen.

**A parameter used twice evaluates its argument twice.** `sqr(f())` expands to
`f() * f()`. Harmless today because Momo expressions have no side effects, but
**this is a real hazard now that routines exist**: substitute directly only when
the argument is itself side-effect-free, otherwise evaluate once into a
temporary.

---

## 9. Codegen

**Register contract:** `AX` accumulator; `BX` second operand / index;
`DX` scratch, clobbered by `mul`/`div`, never live; `CL` shift counts;
`SI`, `DI`, `BP` **unused** (available to the ABI, and a future register-allocation hook).

**Conditions compile in control-flow context** - `emitCond(expr, trueLabel,
falseLabel)` - not by materialising a bool. This is mandatory, not an
optimisation, because 8086 has no `setcc`. `&&`/`||` short-circuit to shared
labels; `!` is a label swap. Value context is the fallback for
`bool b = x < y`, which costs a branch.

**Conditional jumps are emitted expanded where they have to be**, because 8086
`jcc` is +/-127 only and there is no near form until the 386:

```nasm
        jbe     .for1_body              ; inverted
        jmp     .for1_end               ; near jmp, unlimited range
.for1_body:
```

Costs 2 bytes and a label per branch; always correct. `jumpIf` still emits this
shape for every branch, because at the moment a forward jump is written there is
nothing yet between it and its target to measure - and peephole 15 then takes it
back wherever the target turns out to be in reach. 542 of 636 branches across the
committed programs end up as a single `jcc`. The expanded form is what remains
where the body really is long, which is not theoretical: several bodies in the
reference file exceed 128 bytes under this codegen.

**Peepholes.** Fifteen local rewrites, catalogued in `PEEPHOLES.md` rather than
here. They carry their own numbering, are cited by number from `emitter.ts`, and
the list grows whenever somebody sweeps the emitted assembly for a shape that
repeats - a workflow rather than a subsection, and at 209 lines it was three
quarters of this section.

Two of them shape what the output looks like rather than merely shortening it,
so they are worth knowing about from here. **14** removes a load of what the line
above just stored: a statement-boundary artefact that nothing in the expression
path can see, because each statement is compiled correctly on its own and only
the seam is wasteful. **15** takes back the inverted-jump expansion described
above wherever the target turns out to be in reach - 542 of 636 branches - which
is why the output is not littered with the idiom that paragraph describes.

**Data wraps at 72 characters of values**, continuing with a fresh `db`/`dw` at
the same indentation, and the comment naming the array stays on the label's line.

That is a formatting rule with a tier behind it. Arrays used to emit as one line
however long they were, which is unremarkable at momolo's 64 elements and stops
being so above a few hundred: a probe with 8,014 `i16` points came out as a single
37,360-character line. NASM assembles that perfectly well - it was built and run
to check - but the golden `.asm` tier compares *text*, so a one-element change
reports as one unreadable line and `git diff` is no better. A tier whose whole
purpose is that a human reads the diff cannot have a line nobody can read.

The budget is characters rather than elements because elements are not the same
width - printable byte runs emit as quoted strings, so one part can be a whole
word and the next a single digit. Two committed programs wrap under it, `tennis`
and `tilefill`, which is what keeps the path exercised now that the probe is gone.

**Comment style:** source line as a section header, *not* echoed per
instruction. Inline comments reserved for width conversions, why `jbe` and not
`jle`, and the branch-expansion idiom.

```nasm
drawLineHorizontal:
; ---- for (x = x1; x <= x2; x++) {
        mov     al, [x1]
        mov     [x], al                     ; u8 -> u8, no widening
.L1:
        mov     al, [x]
        cmp     al, [x2]                    ; byte operands, no widening
        jbe     .L4                         ; unsigned <=
        jmp     .L3
.L4:
; ---- setPixel()
        call    setPixel
.L2:
        inc     byte [x]
        jmp     .L1
.L3:
        ret
```

NASM's `.local` labels scope to the enclosing non-local label, so per-sub label
namespacing is free.

---

## 10. Runtime / ABI

**There are no externals.** The reserved globals *are* the machine registers, and
`int` is the only primitive that bridges them. Everything else - the entire
standard library - is ordinary subs written in the language, shipped as a prelude.

```nasm
_ax:    dw 0
_al:    equ _ax                         ; little-endian: low byte first
_ah:    equ _ax + 1
_bx:    dw 0
_bl:    equ _bx
_bh:    equ _bx + 1
        ; ... _cx, _dx, _si, _di
```

`int <literal>` is a statement form (the only encoding is `int imm8`). It syncs
all reserved globals in and out:

```nasm
; ---- int 0x21 ----
        mov     ax, [_ax]
        mov     bx, [_bx]
        mov     cx, [_cx]
        mov     dx, [_dx]
        mov     si, [_si]
        mov     di, [_di]
        int     0x21
        mov     [_ax], ax               ; results return the same way
        mov     [_bx], bx
        mov     [_cx], cx
        mov     [_dx], dx
        mov     [_si], si
        mov     [_di], di
```

Chunky, but an `int 21h` costs thousands of cycles - the sync is free in
relative terms and needs no dataflow analysis.

### `_cf` - the carry flag

DOS and BIOS report failure in carry, so `bool _cf` holds it after every `int`:

```momo
_ah = 0x3D                    // open, read-only
_al = 0
_dx = addr( filename )
int 0x21

if ( _cf ) { ... }            // failed; _ax holds the error code
```

Captured at the end of the helper, once AX is free again - no `mov` disturbs
flags, so CF is still the handler's:

```nasm
        mov     [_di], di
        pushf
        pop     ax
        and     al, 1                       ; carry is bit 0
        mov     [_cf], al
```

It survives `IRET` only because DOS and BIOS handlers arrange it - `RETF 2`
discards the saved FLAGS image rather than restoring it. Universal convention,
but not something the instruction semantics imply.

Three decisions:

- **Read-only.** Every other reserved global is bidirectional, but no DOS or
  BIOS call reads carry on the way *in* - the convention is uniformly
  carry-as-error-out. A writable `_cf` would let you write something that
  silently means nothing, so assigning to it is an error. This costs the
  `pushf`/`popf` restore an earlier draft of §20 budgeted for.
- **Captured only when read.** The registers are synced unconditionally because
  the helper references them regardless; `_cf` is pruned like an ordinary global
  when nothing mentions it, and the four instructions are emitted only if it
  survives. A program that ignores carry pays neither the byte nor the
  instructions, and adding the feature moved no existing output at all.
- **`bool`, not `u8`.** It is genuinely 0 or 1, and the type is also what tells
  the emitter this reserved global is real storage: every `u8` one is a byte
  alias into a register pair by construction, so a `u8 _cf` would have come out
  as `equ _cx + 1`.

**It is the carry from the most recent `int`, not from the one you care about.**
Anything that prints goes through `int 21h` and replaces it, so read it out
immediately - `cftest` demonstrates both the reading and the trap.

**Emit one helper sub per distinct INT number**, not the sync inline at every
call site. The literal is baked into the helper, so `int 0x21` becomes
`call int21` - 3 bytes instead of ~40. The shape was proven by hand in
`keytest` before the transpiler depended on it; among compiled
programs, `smoke` emits two helpers and runs under tier 2.

**`addr(x)` builtin** returns a global's `u16` offset. In a `.COM` this is a
link-time constant, so it compiles to `mov ax, msg` - an immediate. `lea` stays
dead. Needed because DOS string calls take `DS:DX`.

### `peek` and `poke` - the runtime address

**Built.** `addr` produces an address; these four consume one. They are the only
construct in Momo that reaches memory the compiler cannot name, which is what
makes `shared/lib/std/str.momo` possible at all - see §20 for why they exist and why they
are four names rather than a `_mem` array.

```momo
b = peek8( at )               peek16( at )
poke8( at, value )            poke16( at, value )
```

- **`peek` is an expression, `poke` is a statement.** §6 keeps effects out of
  expressions, and a store is an effect. `peek8(at) = 5` is rejected with a
  message naming `poke8`, since that is what it was reaching for.
- **The address is a `u16` offset in our own segment.** Signed types are rejected
  rather than widened: a negative offset means nothing, and §4 already refuses to
  mix `u16` with signed, so an `i16` address would need a cast somewhere - better
  at the call than silently. Another segment is `far`'s job (§16).
- **The value follows the same fit rule a declared `u8` or `u16` would**, bool rule
  included, because a raw byte store is exactly the case that rule exists for.
- **Nothing is bounds-checked, and nothing can be.** There is no length to check a
  runtime address against. That is the whole trade, and it is why these are spelled
  visibly at every use site instead of being dressed up as an array.

**Three ways to name memory, and they do not overlap.** `far` (§16) and `view`
(§17) both address at compile time; only these reach an address computed while the
program runs:

| | Address known | Segment |
|---|---|---|
| `far` | compile time | another one |
| `view` | compile time | ours |
| `peek`/`poke` | **runtime** | ours |

**Which is why a runtime `view` is refused and these are not** (§17). A runtime
view would be a declared, typed, tracked construct - it would bless pointers as a
first-class concept, and everything would then want to be one. `peek` and `poke`
are explicit unsafe operations that look unsafe at every use site. That is the
`unsafe { *ptr }` distinction rather than a contradiction, and Turbo Pascal drew
the same line: no pointer arithmetic in ordinary code, but `Mem[]` and `MemW[]` as
visible escape hatches.

What they unlock is **library routines that take a buffer**. `shared/lib/std/str.momo`
is `strLen`, `strCopy`, `strCmp`, `strFind`, `memCopy` and `memFill`, and
`screen.momo` has a coloured `writeStrAt`. §19 solves the same problem by a
different route and the two are complements rather than rivals: compile-time
parameters emit one copy per distinct argument, fast and larger; `peek`/`poke`
emit one copy total, smaller and indirect. Twenty different messages want these;
two large buffers want §19.

```momo
sub fill( u16 at, u16 count, u8 value ) {
  for ( i = 0; i < count; i++ ) {
    poke8( at + i, value )
  }
}
```

Codegen is two instructions plus the address:

```nasm
        mov     ax, [at_]
        mov     bx, ax
        mov     al, [bx]                    ; peek8 - unchecked, by design
```

BX because it is the only register the 8086 will index through in this addressing
mode - there is no choice to make and no `lea` to avoid. Two refinements fell out
of shapes that already existed:

- **A constant value skips the save** - `poke8( at, 42 )` puts the value in the
  store as an immediate, so the push that would protect it does not happen. That is
  peephole 9 of §9, through a runtime address this time.
- **`poke8( to, peek8( from ) )` emits no widening.** The store keeps only AL, so
  a byte source is a bare byte load exactly as a variable or array element is -
  the same rule as a byte-to-byte assignment. It matters because that line *is*
  the inner loop of `memCopy`.

**The address is evaluated first**, which §7 requires of arguments generally and
which nothing in the emitted code reveals. `peektest` therefore calls
a fn on both sides and prints the order it observed - the one case in that program
that the golden tier structurally cannot check.

Prelude sketch:

```
u8 char

sub putChar {
  _ah = 0x02
  _dl = char
  int 0x21
}

u8 key

sub waitKey {
  _ah = 0x00
  int 0x16
  key = _al
}
```

Complete working program:

```
const u8[] msg = "Hello, world!\r\n$"

_ah = 0x09
_dx = addr(msg)
int 0x21

_ax = 0x4C00                            // DOS exit, code 0
int 0x21
```

---

## 11. Code reuse: `include`

```momo
include "lib/std/io.momo"
```

Top level only. Resolved entirely at compile time, so NASM still sees one flat
file and the DOSBox toolchain is unaffected. Search order is relative to the
including file, then `shared/`. The standard library lives in `shared/lib/std/`
as ordinary `.momo` files and arrives by exactly the same path as your own code -
there is no implicit prologue and no special case.

`shared/` is the include root rather than `lib` because it is not only
libraries: `shared/lib/` is code, and data that more than one project reads lives
beside it rather than inside whichever project happened to be written first.
Kept to ONE root deliberately - a second search path would let a name resolve two
ways, and the paragraph above ends "no special case".

**Includes are always once-only.** No guards, no `#ifndef`. There is no
legitimate reason to include a file twice in Momo; the only language that
benefits is C with X-macro tricks, and we have no macros. Two details make it
hold:

- Files are identified by `realpathSync.native()`, not by string. Windows
  filesystems are case-insensitive, so `std/io.momo` and `Std/IO.momo` are one
  file under two names - naive dedupe would include it twice and produce
  duplicate-declaration errors that look insane.
- A file is marked seen *before* its own includes are visited, so cycles
  terminate rather than looping.

Each file is parsed separately and its statements spliced in, so every node keeps
its own file's line numbers. An error inside an included file reports against
that file, with its own source line and caret.

### Why not named imports, and what `local` is instead

A module system exists to control visibility, and the argument here used to be
that there was nothing left to control. That argument has since expired, and it
is worth recording why rather than quietly replacing it.

It ran: a sub's "parameters" are globals - `putChar` reads `char` - so importing
`putChar` without `char` gives something unusable, every import list degenerates
to the whole module, and the parameter globals *must* be public or the library
does not work. **Real parameters (§7) made that false.** A parameter is mangled
*and* absent from scope: `add__a` is not a name any other file can write. So
"there is nothing left to hide" stopped being true the day routines gained
parameters, and nobody noticed because the conclusion still felt right.

What was left to hide is **state shared by several routines and private to
them**. A sub-local is persistent but belongs to one routine; a global is shared
but belongs to everything; there was nothing in between. `shared/lib/std/rand.momo` was
the standing example, and not a hypothetical one: it maps a zero seed to 1
because zero is a fixed point that would return zero forever - and then left
`randomSeed` writable, so any program could assign 0 directly and walk past the
guard.

**`local` is the answer, and it is not a module system.** A declaration marked
`local` is private to the file that writes it: visible to its siblings there,
invisible everywhere else.

```momo
local u16 randomSeed = 42

sub seedRandom(u16 s) => randomSeed = s == 0 ? 1 : s
```

- **The file is the boundary**, because the file is already a unit here -
  includes are once-only and identified by `realpathSync.native()`, and every
  node keeps the file it was written in. No container, no nesting, nothing to
  name.
- **Labels are mangled by the file's base name**, so `randomSeed` becomes
  `rand__randomSeed` - the same shape as `mob__x` and `add__a`, which a reader of
  the output already knows. Two files with one base name collide there, and
  `claimLabel` says so rather than emitting it twice.
- **Lookup has three levels**: a sub's own storage, then its file's privates,
  then the program. Each is read off where the name is *written* rather than
  from any nesting the source shows.
- **A local may shadow a global**, and must: otherwise adding a global to your
  program could break a library you included. It is the one-way case - a local
  can hide a global, and can never be reached from outside its file at all. The
  reverse, a local and a global of one name in *one* file, is an error, since the
  name would be ambiguous in the file that owns both.
- **`local` inside a sub is an error.** Storage there is already private, and
  accepting the word would give it two meanings depending on where it sat.

**The file is the only owner it can name today**, which leaves one gap: nothing
includes the entry file, so `local` is inert there and a single-file program gets
nothing from it. §23 designs the second owner - a named block of declarations
inside a file - and it is deliberately the same marker and the same three-level
lookup rather than a mechanism of its own.

It also displaced part of the prefix convention - but less of it than this used to
claim, and the difference is worth drawing because it decides what `local` may be
applied to.

`ioBase` is the real case: it is read only inside `std/io.momo`, so the prefix
there is a file boundary written out by hand, one identifier at a time, which is
what "as C managed for fifty years" meant - C's `static` being the same idea under
a worse keyword.

**`screenCols` and `strEnd` are not that**, and were listed here as though they
were. `screenCols` is read by `std/screen.momo` and `shared/lib/mopaint.momo`;
`strEnd` by those two and `std/str.momo`. Their prefix is a *namespace* rather
than a hidden boundary - it says which library a public name belongs to - and
`local` on either would break the files that read it. A prefix on a shared name
and a prefix standing in for a private look identical in the source, and only the
readers tell them apart.

**What it cost elsewhere.** The call graph and pruning were keyed on a routine's
*source name*, which `local` makes ambiguous: two files may each declare
`sub helper` and mean different routines. Merged into one vertex that gives wrong
reachability and invents cycles between routines that never call each other. Both
are keyed on labels now, and the emitter is too - it had a name-to-label map that
would have emitted one routine's body under another's label.

### Dead code elimination

Momo has no linker, so without pruning every `include` would pay for the whole
library. The call graph built for the recursion check gives reachability for
free: unreachable subs are dropped, then a walk over the retained AST collects
referenced labels and drops unused globals and arrays with them.

This makes the call graph load-bearing twice over - it decides what survives as
well as what is legal - so anything that hides an edge from it deletes code the
emitter still calls. Parameterised consts are the subtle case; see §7.

`heaptest` includes `std/io.momo` and uses three of its five subs;
`putStr` and `space` do not appear in the output at all, and neither does
`putStr`'s parameter slot `putStr__at`, which lives or dies with it.

---

## 12. Static memory analysis

Momo has no dynamic allocation of any kind, so a program's entire memory
footprint is known at compile time (`npm run memory -- <project>`):

- **Data** - exact. Every scalar and array has a fixed width and length.
- **Stack** - exact, given the acyclic call graph. Two contributors: 2 bytes per
  call level (longest path through the graph), plus expression temporaries.
  Counted from the pushes the emitter actually emits, not from a model of them.
- **Code** - exact, but comes from NASM, so it needs a build. Since the `.COM`
  file is code plus data and data is known, `code = fileSize - dataSize`.

**Temporaries sum down the call path**, they are not maxed across it:

```
cost(S) = 2 (its return address) + 2 x temporaries(S) + max(cost of callees)
```

This section used to give `2 x callDepth + 2 x max(temporaries)`, which was true
while a call could only be a statement - the expression stack was empty at every
call site, so no two routines ever had temporaries live at once. Typed routines
(§7) ended that: a call inside an expression happens with the caller's
temporaries still pushed. §7 records the change; §12 did not, and the two
disagreed in the doc for as long as it took to notice.

It is conservative rather than tight, assuming a routine's peak temporaries are
live at its deepest call, which they need not be.

**One thing sits outside the figure.** `int` is not a call-graph edge, so the
2-byte return address of the helper it calls is not counted, nor is the `pushf`
that `_cf` capture uses. Both are comfortably inside the 256-byte interrupt
reserve below, which is why this is a footnote rather than a bug - but "exact"
means exact about the parts that are computed.

The one figure that is not computed is the interrupt reserve. DOS switches to an
internal stack for most `int 21h` calls but BIOS handlers generally run on ours,
so 256 bytes is a documented allowance rather than a derived number.

---

## 13. The heap

Since the footprint is fully known, the compiler hands the remainder back as an
ordinary array. Three names are generated into every program:

| Name | Type | |
|---|---|---|
| `_heap` | `u8[]` | Byte view of all free memory |
| `_heapw` | `u16[]` | The same bytes, word view - same address |
| `_hsize` | `u16` | Size of the heap in bytes |

**No storage is emitted for the heap.** A `.COM` owns everything past its image
in the segment, so `_heap` is just a label at the very end of the file and the
binary does not grow by a single byte. `_hsize` costs two bytes; the `align 2`
before `_heap` costs at most one.

```nasm
_hstack:        equ     262        ; 6 worst-case + 256 interrupt reserve
_htop:          equ     0FFFEh - _hstack

_hsize:         dw      _htop - _heap        ; NASM computes this
        align   2
_heap:
_heapw:         equ     _heap        ; same bytes, u16 view
```

The word view exists because a byte-only heap makes allocators miserable -
every 16-bit block header would have to be hand-composed from two bytes. Both
views work with the existing codegen: `_heap[i]` emits `[_heap + bx]`,
`_heapw[i]` emits `[_heapw + bx]` with the index pre-scaled.

`_heapw` is an alias of `_heap`, and since §17 it carries that the way any `view`
does rather than as a line of NASM the emitter knew to write. It is still a
builtin: the language spells a view's parent as an array with a length, and the
heap has neither.

Momo provides no allocator. `heaptest` is a bump allocator written
in Momo, which is the intended shape: the language supplies the memory, the
programmer supplies the policy. **`view` (§17) is often the better answer** -
`view u8[16] mapData = _heap[0]` partitions the heap into named, bounds-checked
regions with no allocator at all, and no runtime cost.

### Two limitations, both deliberate

**Heap indices are not bounds-checked.** The resolver checks constant indices
against a known length, but `_hsize` is not known until NASM has assembled.

**`_hsize` assumes the full 64K segment.** DOS grants a `.COM` the largest
available block and this is not guaranteed to reach the top of the segment, so
`_hsize` can in principle overstate what the program owns. The robust version
reads the end-of-allocation segment from `PSP:0x0002` at startup - which for a
`.COM` is simply offset 2 of our own segment, since the PSP occupies `0x00`-`0xFF`
and code starts at `0x100`. That would make `_hsize` a runtime computation rather
than an assembly-time one.

Nothing stands in the way of reading it. `arena` does exactly that - a `far u16`
region based on `_ds` (§35), index 1 - and reports the block DOS actually gave it,
which under DOSBox is 40,557 paragraphs where this `equ` assumes 4,096. So the
value here is the conservative floor rather than the answer, and what is unbuilt is
the decision to compute it at startup, not the means.

The error usually runs the other way, and it matters to §16. That largest
available block is typically **not** one segment but most of conventional memory -
several hundred KB on a real machine. `_hsize` stops at `0FFFEh` because that is
as far as it can address without a segment register, not because that is all DOS
gave. Reaching the rest needs `far` with a runtime segment and nothing else: the
memory is already the program's, so no allocation call is involved.

### A NASM trap worth recording

`_hsize` is emitted as `dw`, not `equ`, and that is load-bearing. Under
`-f bin` with `org 100h`, NASM resolves a label correctly inside a **data**
expression but **section-relative** inside an `equ`:

| Form | Result |
|---|---|
| `dw _heap` | correct |
| `dw _htop - _heap` | correct |
| `equ _htop - _heap` | **0x100 too large** |
| `equ _heap + 16`, used as a displacement | correct, even declared *after* every use |

Verified empirically, all four. Written as an `equ`, the heap would silently
overlap the stack reserve by 256 bytes.

The last row is what §17's views rest on, and it is worth keeping next to the
trap: it is a label **difference** inside an `equ` that goes wrong, not a forward
reference and not label-plus-constant. Views of `_heap` can only be emitted after
`_heap` - the last label in the file - so if that row had gone the other way the
feature would have needed a different shape entirely.

---

## 14. Testing

Three tiers, plus two deliberately small sets of unit assertions - the type lattice, and
the lexer's decode of a decimal literal and a fixed type name (§25), which nothing else
consumes until a target scale appears. The first two tiers run together in about a second
and touch nothing outside Node.

One wrinkle worth knowing about the round trip: it prints the **post-resolve** program,
because `*` on two fixed-point values lowers to a call and that lowering needs types.
Every case printed identically when that changed, since the resolver otherwise only
annotates - but it means the round trip now depends on the resolver as well as the parser
and the printer.

**And the two tiers disagree about comments, deliberately.** The golden tier compares the
whole `.asm`, `; ---- ` source quotations included; the round trip filters those lines out,
because the printed source is different text by construction. So a change that alters only
what a statement *looks like* moves every golden and no round trip - which is exactly what
happened when momovec's coordinate reads became `mapX( at )`: 24 lines moved in each of ten
projects and not one instruction changed. Reading the diff is how you tell the two apart,
and it is why `npm run momoc:all` asks you to.

```
npm test          # tiers 1 and 1.5 + type lattice - about a second, no DOSBox
npm run test:e2e  # tier 2 - launches DOSBox per case
```

**Tier 1 - `tests/compile/*.momo`.** Each file either compiles clean or declares
the error it expects, in itself:

```momo
// EXPECT-ERROR: recursion is not supported: a -> b -> a
```

Keeping the expectation inside the file means test and assertion cannot drift
apart, and there is no manifest to forget.

**Tier 1.5 - the committed `.asm` is the expectation.** Every project under
`projects/` is compiled and compared against the assembly committed beside
it. Nothing is written: a deliberate change is adopted by running
`npm run momoc:all` and committing the diff, so **every codegen change has to be
looked at by someone.**

This exists because tier 1 asks only *whether* a program compiles, never what it
emits, and tier 2 needs DOSBox - so between them nothing was watching codegen at
all. "`smoke` must stay byte-identical" was a rule enforced by remembering to
read `git status`, which is not a test. It also gives `simplerl` regression coverage
for the first time, since it is interactive and can never have a `.expected`.

Line endings are normalised before comparing. The emitter writes CRLF while git
stores LF, so a clone that checks out LF would otherwise fail every case for a
reason that has nothing to do with the compiler.

**Tier 2 - any project with a `<name>.expected` file.** Compiled, assembled and
actually run under DOSBox with stdout redirected to a file, then compared
exactly. This is the tier that catches what unit tests structurally cannot:
bugs at the NASM boundary, and bugs that only appear when real 8086 code runs.

**Graphics is testable, which is not obvious.** Video memory is readable as well
as writable, so a program can draw, read specific cells or pixels back into
variables, and print what it found - and under the tier 2 harness the printing
is redirected to a file while the drawing still goes to the screen. No
screen-scraping, no image comparison, fully deterministic. `fartest` does it for
text cells; `tilefill` was checked the same way, five pixels covering both tiles,
two rows and a tile at a non-zero position to catch stride arithmetic.

What it cannot cover is anything that waits for a key - tier 2 has no way to
press one - so everything interactive is golden-tier only. That is six projects
now: the three demos (`rndtext`, `rndpix`, `tilefill`), the two games (`simplerl`
and `tennis`), and `mlodemo`, which draws a layout and waits. `mlodemo` is the
case worth noting, because it is the only one whose *numbers* are covered
elsewhere: `momolo` runs the same scenes through the same engine and
prints every resolved box, so only the drawing is untested rather than the whole
program.

**Comparison had eight jump mnemonics and no coverage.** `cmptest` fixes that, and
its shape is worth copying: `-1` is `0xFFFF`, so every comparison in it answers the
opposite way signed and unsigned *on identical bits*, and each is compiled twice -
once as a jump, once as a materialised bool, which are opposite spellings of the
same test. The two halves catch different mistakes, which was verified by making
both: signed `<` using `jb` moves only the `-1`-against-`1` lines, and `<=` using
`jl` moves only the equal-operand lines. Either half alone would have passed the
other bug.

**A tier 2 program is the worked example for its feature**, and the two written
this way - `fartest` and `viewtest` - are worth reading as much as running. The
shape falls out of the tier rather than being an extra effort: a test whose every
write is read back through a *different* name has to explain why the two name the
same bytes before it can assert anything, and that explanation is the tutorial.
So the sections below point at their program, and the program is where to look
first when the prose is not enough. They also cannot go stale, which is more than
a code sample in a document can promise.

**Unit tests, only for `types.ts`.** `combineRanges`, `truncate` and
`naturalType` encode facts about 16-bit integers rather than design choices, so
their contract will not move. Everything else is tested end to end.

**The desugar round trip is the only test of the parser.** `npm run desugar`
prints a program back as Momo from its AST, by which point the parser has already
lowered `=>`, `else if`, prefix and postfix `++` and adjacent string literals, and
the loader has spliced every `include`. Tier 1 prints every program and compile
test, compiles the printed copy, and requires the same code from both.

It asserts nothing about how the AST is arranged - only that printing and parsing
are inverse - so it survives every refactor that keeps the meaning, which is the
churn objection below answered rather than excepted.

**It cannot compare the assembly byte for byte**, because the emitter quotes the
source line above the code it produced and the printed source is different text
by construction: no comments, different wrapping, sugar lowered. So the `; ---- `
lines come out and everything else has to match - every instruction, every label,
every inline comment about a widening or a jump choice.

**`local` used to be the one thing it could not round-trip**, and the test skipped
every program that loaded a private - about a fifth of the corpus, including
`tennis`, `momolo`, `simplerl` and the file that exists to test `local`. Printing
splices every include into one file and `local` names a file as its owner, so the
boundary that gives a private its identity was exactly what printing destroyed.

**The printer lowers it instead**, and nothing is skipped now. A private prints
under the mangled name the resolver already gives it - `rand__randomSeed` - and
the modifier goes, which is what the printer already does to `=>` and to `*` on
two fixed values. Two files that each declare `local u16 hidden` come out as two
distinct names rather than colliding. `npm run desugar` shows those names, which
is the tool doing its job: §11 implements `local` as precisely this rename, and it
was the one mechanism the output hid.

**What the skip cost while it lasted** is worth keeping, because it shaped code.
A program was skipped if any statement it *loaded* was private, so one `local` in
a widely included file removed every consumer from the only test the parser has -
which made a private in a library something to price rather than to reach for:

- Marking `putNumber`'s three consts private in `std/io.momo` was tried and
  reverted. 22 programs included that file at the time, so it cost 19 of the 48
  assertions then standing - most of the tier - to enforce something the `io`
  prefix already achieves for three values nothing can write.
- `std/file.momo` was written with a private status pair and had it taken back
  out for the same reason, before anything but its own test could feel it.

Both were the right call against the tool as it stood. `file.momo` has its private
status pair back; `io.momo`'s three consts were tried private once the bill went,
and are public for a different reason set out below.

**The rule that replaces it: `local` is free in testing and not in output.** A
private's mangled name is what the assembly says, so `local` on a const in a
widely included file puts `io__ioBase` where `ioBase` was in every program that
includes it - 35 of them - and the assembly is the product rather than an
intermediate (§1).

So the question is no longer what privacy costs the suite, but whether there is
something to protect. `randomSeed` is `local` because a program could otherwise
write past the guard that keeps the generator alive. `fileBad` is, because a
program could otherwise hand itself a result no call produced. `ioBase` is not:
nothing can assign a const, the `io` prefix already separates it, and a program
that declares its own is told so by name at compile time. A loud collision is not
a hole.

**Closing it found a bug that had been hiding behind the skip**, which is the
argument for not leaving a fifth of a corpus untested. The emitter recorded each
routine's expression temporaries under its *name* while the call graph is keyed on
its *label*, so for every `local` routine the lookup missed and the temporaries
counted as zero. §12's worst-case stack was under-stated for any program with a
private sub that uses one, and `_hstack` reserves the stack the heap then starts
below - so the heap was over-stated by the same amount. `momolo` and `mlodemo` were
both out by two bytes.

Nothing had ever failed. The skip meant the only test that compares one program
against a second compilation of itself never ran on the programs that could show
it, and the golden tier compares committed output against itself, so it agreed
with the wrong number.

`tests/compile/ok-precedence.momo` exists for it. Bracketing is where a printer
goes wrong, and a program only catches that if it contains an expression whose
meaning depends on brackets: of the whole corpus, **two did**. That file pairs
each grouping against the other one, and it found a real bug immediately - a
conditional used as the *test* of another conditional was printed unbracketed,
where the parser can only produce one in the alternate.

**Three assertions test the documentation.** §1's instruction table is the only
record of the subset and `cpu 8086` cannot enforce it, so tier 1 parses that table
out of `DESIGN.md` and checks the heading's count against it, that no committed
`.asm` emits anything outside it, and that nothing in it goes unemitted. The last
is a coverage claim rather than a correctness one: a mnemonic the emitter can
produce that no program exercises is a codegen path nothing has ever run.

This is the only place a test reads the prose, and it is worth the oddity. The
alternative was a practice in `CONTRIBUTING.md`, which lasted one commit and was
performed wrongly three times - the check is fiddlier than it looks, and the
failure mode is a silent pass.

### Why not unit tests elsewhere

Over the course of building Momo we removed sub return values, added a file
dimension to every AST node, added `include`, added tree-shaking and added
parameterised consts. Each would have invalidated a large body of unit tests on
the lexer, parser and resolver - and in every case the end-to-end output stayed
byte-identical. Those tests would have been pure churn.

Meanwhile the three real bugs found were: scalar initialisers silently dropped,
an `i8` path with a no-op double `xchg`, and `_hsize` emitted as an `equ` that
was 0x100 too large. **None would have been caught by a unit test on a compiler
stage** - two of them exist only in what NASM does with our output.

### Keeping expectations stable

Tier 2 compares exact output, so tests must not print values that move for
unrelated reasons. `heaptest` originally printed `_hsize`, which shifts with any
codegen change; it now asserts a bound instead. `smoke` uses `int 16h` AH=01
(non-blocking key check) rather than AH=00, so it terminates without input while
still exercising a second interrupt helper.

DOS is 8.3, so tier 2 project names are limited to 8 characters. Tier 1 never
touches DOS and can use long descriptive names.

---

## 15. Acceptance test

**A record rather than a standard, and it is in `DECISIONS.md` §15.** An early
list of programs that would show the subset was useful enough - hello world,
fizzbuzz, a sieve, a string library, a text adventure - with a table of what met
it. Only the text adventure is outstanding, and it is a `PLAN.md` item.

It is kept as history because it is a true account of how the project decided it
was working, and moved out of here because it long ago stopped describing the
system and started being quoted as though it governed it.

---

## 16. `far` regions and ES

**Built.** Every access reloads ES; `fartest` exercises it against the real text
buffer, and is the worked example for this section (§14) - read it alongside the
rules below. Hoisting those reloads is designed and not built: §34.

```momo
far       u16[2000] textCells = 0xB800          // text buffer, 80x25 cells
far       u8[64000] pixels    = 0xA000          // mode 13h
const far u8[]      font      = 0xF000:0xFA6E   // ROM 8x8 font, read-only
```

> **A hosted backend (§30) needs this.** If graphics went through `int 10h` per
> pixel, every hosted target would have to shim each call and maintain its own
> framebuffer. With `far`, both DOS and hosted backends simply write memory. That
> moves this up the priority list - it is not only the fast path on real hardware.
>
> **Decided:** a hosted target emulates the buffer rather than shimming the
> calls. `int 10h` survives for mode setting, which is one call; everything
> per-cell and per-pixel goes through memory. That is less work than shimming
> and a better fit - a framebuffer is what the host has anyway.

### The address, and what may be a segment

Both forms, since the constant one alone cannot double-buffer mode 13h:

```momo
far u8[64000] pixels     = 0xA000      // constant segment
far u8[64000] backBuffer = bufferSeg   // runtime, from a u16 variable
```

- **The segment must be a constant or a plain `u16` variable**, never an
  arbitrary expression. It keeps the load to one `mov`, mirrors §19's
  "arguments must be names", and settles that `= bufferSeg` is a **live
  reference re-read per access**, not a load-time snapshot - a snapshot would
  be useless, since `far` declarations are top-level and run before anything
  could have produced a segment.
- **A runtime segment is never hoisted.** Hoisting (§34) is safe for a constant
  because ES is callee-saved. A runtime segment breaks that reasoning in the one
  way this section calls the worst possible failure: a callee that reassigns the
  *variable* leaves a hoisted ES pointing at memory we no longer mean, without ES
  itself being touched. Doing it properly needs "is this variable assigned
  anywhere in the reachable call subtree", which the call graph can answer. Not a
  discipline: the compiler simply does not hoist them.
- **The text buffer's address is itself a runtime decision.** It is at `B800` on
  CGA and later but `B000` on MDA and Hercules, read from the BIOS data area.
  `screen.momo` sets mode 3 and so assumes colour; a more robust library would
  not, and would want the runtime form.

Three properties hold the two forms together, and are worth stating because they
are what makes the runtime one a relaxation rather than a second feature: the
symbol carries *where the segment comes from* rather than a constant; the syntax
does not distinguish the two; and any ES tracking keys on the segment **source**,
never on "ES has been loaded".

### Loading ES, and the order that makes it safe

**ES loads go through DX, not AX.** §9 documents DX as scratch and never live, so
the load disturbs neither the accumulator nor a computed index:

```nasm
        mov     dx, 0xB800                  ; segment of cells
        mov     es, dx
        mov     [es:bx], ax
```

A far store with a constant index needs no register saved at all.

**Ordering is what makes nested access safe, and it is not optional.** ES is
loaded *after* the index expression, never before, because the index may itself
have read a different far region:

```nasm
; ---- v = cells[pixels[i]]
        mov     dx, 0xA000                  ; segment of pixels
        mov     es, dx
        mov     al, [es:bx]
        ...
        mov     dx, 0xB800                  ; segment of cells
        mov     es, dx
        mov     ax, [es:bx]
```

Get that backwards and the outer access silently reads the inner region's
segment - the failure this section names as the worst possible. It is handled by
emission order rather than by analysis.

**Nothing is paid by programs that do not use it.** `push es`/`pop es` appear in
the int helpers only once something has actually put a segment in ES.

### The pieces

**The address.** A compile-time constant, optionally `segment:offset`. The
offset is free: it folds into the displacement of an addressing mode we already
emit.

```nasm
        mov     al, [es:bx + 0FA6Eh]     ; runtime index
        mov     al, [es:0FA70h]          ; constant index, no register at all
```

**The optional size** buys exactly what a normal array's size buys - compile-time
checking of *constant* indices. Momo has no runtime bounds checks anywhere, so
this is consistent, not a special case. It is a declaration of intent that the
compiler cannot verify; `far u16[2000] ... = 0xB800` is trusted.

**`=`, not a new keyword**, even though everywhere else `=` means "has these
contents" and here it names an address. `far` already announces that an address
follows.

**`const far`** makes a region read-only, reusing the `readonly` flag arrays
already carry. The ROM font is genuinely immutable.

### Smaller rules

- **`addr()` on a far array is an error** - it has no meaningful offset in our
  own segment.
- **`far` declarations are top-level only.** A fixed hardware address is not
  scoped to a routine.
- **Overlapping views are legal and useful** - `far u8[] textBytes = 0xB800`
  alongside `far u16[] textCells = 0xB800`, the same pattern as `_heap` and
  `_heapw`.
- **A `far` declaration emits zero bytes.** Segment and offset bake into the
  instructions; there is no storage and no `equ`.
- Index arithmetic wraps within the segment, as the hardware does.

### The invariants that break

**`int` may destroy ES.** BIOS and DOS handlers may trash any register they do
not document as preserved, and some *use* ES as input. The fix is two bytes in
each int helper:

```nasm
int10:
        push    es
        ...
        int     0x10
        ...
        pop     es
        ret
```

ES then survives every interrupt, which removes the hazard rather than
documenting it. The cost is that an ES *returned* by a DOS call cannot be read
back - that affects two obscure functions and can get its own mechanism if ever
needed.

It also puts calls that take ES as **input** out of reach - `int 10h AH=13h`
(write string) wants `ES:BP`. Nothing in the standard library needs one, and
recording it as a known consequence is better than rediscovering it later.

**ES is callee-saved.** Any routine whose body touches ES wraps it in
`push es` / `pop es`, exactly as the int helpers do. Two bytes, only in routines
that use it - and it makes "ES is never disturbed by anything you call" an
invariant rather than a discipline. That in turn is what makes the hoisting
below simple.

**Every far access reloads ES**, at ~6 cycles against ~16 for the store itself
(`9` + EA `5` + override `2`). Hoisting those reloads is designed and not built -
§34 - and DECISIONS §16 has the measurements that put it low on the list.

**The mitigation that needs no compiler work.** Put the loop *inside* a routine
that sets ES once, exactly as `repeatCell` amortises one interrupt over a whole
run today. Good library shape recovers most of the cost, whatever the compiler
later does.

**Setting ES needs AX**, which may hold the value being stored. The existing
`push ax` in the computed-index store path already covers this - set ES while the
value is saved - so it costs nothing extra beyond the load itself.

**Far regions sit outside the static analysis.** No runtime bounds check, not
part of the heap, not counted in the image. Defensible - video memory is not
yours, it is hardware - but §12's "you know your entire footprint" gains the
footnote that it covers *your segment*.

### What this unlocks, and what it does not

| Target | Address | Needs |
|---|---|---|
| Text buffer | `B800:0000`, 4000 bytes | ES only |
| Mode 13h | `A000:0000`, 320x200x1 | ES only |
| CGA 4-colour | `B800:0000` | ES, plus interleaved banks - even rows at `+0`, odd at `+0x2000`. A library problem, not a language one. |
| EGA/VGA 16-colour planar | `A000:0000` | ES **and `in`/`out`** to the sequencer at `3C4h` - port I/O is deliberately outside the subset |

So `far` unlocks text mode, CGA and mode 13h. Sixteen-colour planar modes are a
separate decision costing two more instructions and a different mental model.

**Mode 13h cannot be double-buffered in one segment.** The frame is 64000 bytes
and the whole segment is 65536; `simplerl` currently has a little under 64,000
free, so a back buffer in `_heap` would leave under 1.5KB for the image. It needs
a second segment, and therefore the runtime form - but not `AH=48h`: the memory
past ours is already the program's (§13).

**A `.COM` cannot learn its own segment**, which is what actually blocks a second
one. DOS does not report it - the program knows it only because CS=DS=ES=SS at
entry - and the PSP holds the *parent's* PSP and the environment segment, neither
of which is ours. Both routes to more memory are blocked by the same thing:
reaching past our segment needs our segment number. A read-only `_ds` closes it
and is designed but not built - §35.

Worth separating from "unlocks graphics", which the constant form does on its
own. What the runtime form buys is **space**, not addressing.

Text mode is 4000 bytes, so double buffering there is comfortable - and for a
roguelike that is the interesting case anyway.

The record for this section - what it cost, what the design got wrong about its
own cost, and the measurements that put ES hoisting near the bottom of the
list - is `DECISIONS.md` §16.

---

## 17. `view`

**Built.** `viewtest` exercises every shape, and one deliberately
unused view, because pruning one is part of the feature. It is the worked example
for this section (§14) and reads in the same order - every case below appears
there, writing through one name and reading back through another. The one block
that is there for the test rather than the language is the unused view; it says so.

```momo
u8[100] bar
view u8[50] top    = bar[0]
view u8[50] bottom = bar[50]
view u8[]   tail   = bar[75]     // length omitted: the remainder, so 25
view u8     first  = bar[0]      // no [n]: a scalar alias
```

A view is a **named window into an existing array at a constant offset**. It is
sugar, and it is free: with a compile-time offset, a view is nothing but an
assembly-time label.

```nasm
bottom:         equ     bar + 50
```

`bottom[i]` emits `[bottom + bx]`, which NASM folds to `[bar + 50 + bx]`. No
storage, no instructions, no indirection. This is the `_heapw equ _heap` trick
already used for the heap, promoted from a special case into the language.

**`const view`** is a read-only window onto storage that is otherwise writable,
spelled as the adjective on `view` exactly as `const far` is on `far`. Read-only
is *inherited* from a const parent either way; this one is for handing out part of
a mutable buffer as read-only.

### What it is actually for

**A buffer that is meaningful as a whole *and* in parts.** Splitting it into
separate arrays would give you the parts and lose the whole - nothing guarantees
separate declarations are contiguous, and nothing lets you address across them.

```momo
const u8[] tiles = "...64 bytes..." "...64 bytes..." "...64 bytes..."

view u8[64] wallTile  = tiles[0]
view u8[64] floorTile = tiles[64]
view u8[64] doorTile  = tiles[128]
```

Blit one tile by name, or copy the whole sheet in one operation. The intent - a
sheet composed of tiles - is in the code rather than in a comment.

**Records without structs.** A scalar view is a named field:

```momo
u8[8] player

view u8  playerX  = player[0]
view u8  playerY  = player[1]
view u16 playerHp = player[2]
```

`view u8 x` against `view u8[4] x` mirrors `u8 x` against `u8[4] x`. The record
stays contiguous and copyable as a unit, and every field access is a plain label.

For most records **`group` (§18) is the better answer** - it declares the fields
rather than requiring a buffer and hand-written offsets. Reach for scalar views
when the buffer already exists and must stay contiguous: reinterpreting a block
of memory, or naming halves of a word, as `_al` and `_ah` do over `_ax`.

**Static heap partitioning** is the same idea applied to `_heap`:

```momo
view u8[mapBytes]  mapData  = _heap[0]
view u16[entBytes] entities = _heap[mapBytes]
```

Named, typed regions with **no allocator at all**. For many programs this removes
the need for `halloc` entirely.

**Type punning without a cast** - `view u16[50] words = bytes[0]`.

**Copying two bytes at a time**, which is the same thing put to work. A `u16` view
over a byte array or a far region halves a copy loop, and needs no compiler
support at all: `view u16[64] tileWords = tiles[0]` beside `view u16[32000]
pixelWords = pixels[0]`, with the constants halved rather than divided - 320
becomes 160, 8 becomes 4. The saving is not two bytes per `mov`, it is running the
loop's whole preamble half as many times, which is why it holds up on an 8088 too.
Measured at -48% for a tile blit; `DECISIONS.md` §27 has the counts.

**An extent check arrays cannot give you.** A view knows its parent's length, so
`view u8[50] q = bar[75]` on a `u8[100]` is rejected at the declaration -
`75 + 50` overflows. The mistake is caught once, where it is written.

### Rules

- **A view without `[n]` is a scalar**, aliasing one element. `view u16 hp =
  bytes[3]` lands on an odd address; the 8086 permits that at a few cycles' cost.
- **The offset is in the parent's elements.** `bar[25]` on a `u16[100]` starts at
  byte 50. Consistent with indexing everywhere else.
- **An omitted length means the remainder of the parent**, rounded down when the
  element sizes differ. A view of `_heap` must state its length, since the heap
  has none at compile time.
- **Mismatched element types are fine.** `view u16[5] w = bytes[3]` starts at an
  odd address; the 8086 permits unaligned word access at a few cycles' cost.
- **A view of a `const` array is read-only**, or the const guarantee is a lie.
- **Views compose** - `view u8[25] inner = bottom[10]`, offsets adding.
- **Views of `far` regions inherit the segment**, so §16 composes with this.
- **Views may overlap freely.** No aliasing analysis exists, and none is implied.
- **Views into `_heap` cannot be extent-checked**, consistent with heap indexing
  being unchecked today. Their own length *is* checked, though - a view has to
  state one there, so `mapData[16]` on a `view u8[16]` is caught even where
  `_heap[i]` is not. The view is the stricter way to use the heap.

Three more, settled while building:

- **A view must be declared at the top level**, like `far` and `group`. It names
  storage rather than being storage, and a per-call scope for a name that has no
  lifetime would mean nothing.
- **The offset may be any constant expression** - `tiles[64 * 2]`. A far
  *segment* is restricted to a literal or a name because it loads into a
  register; this one folds into an `equ`, so there is nothing to restrict.
- **A scalar view of a `far` region is an error.** `far u16 port` already is -
  the far path has no scalar form to land in, since a far access is always an
  `es:` operand built from an index. `view u16[1]` says the same thing and works.

Implementation is an array symbol carrying an alias - `label = parent + offset` -
which the emitter writes as an `equ` instead of storage. A **scalar** view is the
same alias on a `var` symbol. Carrying it on the existing kinds rather than adding
a `view` kind is what made this small: a view of an array *is* an array, so
indexing, bounds checks, `len`, `addr` and the const rules all took no new case,
and codegen took none at all - `[tail + bx]` is what an ordinary array emits.

### How they are emitted

Views are written last in the file, after the heap, because a view of `_heap` can
only be written after `_heap` is - which makes every view a forward reference from
the code that uses it. NASM resolves a forward-referenced `equ` correctly as a
displacement under `-f bin`; the §13 trap is a *difference* of labels inside an
`equ`, which is a different shape.

Tree-shaking keeps a live view's parent alive, and a view's own declaration is
not a use of its parent - so an unused view in an included library costs nothing,
and neither does the array it points at.

**Two compiler special cases are gone.** `_heapw` is an unsized view of `_heap`,
which the rules above make an error, and the register halves alias a *scalar*
rather than an array, which no view can do. What they can be is the same
*mechanism* - `_heapw` and `_al`..`_dh` carry an alias like any view, and the
emitter's byte-alias arithmetic (reconstructing `_ax + 1` from the spelling of
`_ah`) and its hardcoded `_heapw equ _heap` line are both gone.

The record for this section - what it cost, what the design did not anticipate,
and the one-byte bug it turned up - is `DECISIONS.md` §17.

### Runtime offsets are deliberately excluded

`view u8[n] window = _heap[runtimeOffset]` would need a base held in memory and an
extra `add` per access. That is affordable, but a runtime view is a **fat
pointer** - base plus length - and Momo has no pointers by design. It would also
become the de facto way to pass arrays to routines, which is a much larger
decision than sugar for naming a region.

Static views stay sugar. That is the whole appeal.

---

## 18. `group`

**Built.** Sugar over the **structure-of-arrays** pattern - an entity pool is the
shape almost every game reaches for, which is why this was the first of §16-§19
to be wanted. `grptest` exercises it.

```momo
const mobCount = 64

group mob[mobCount] {              // many
  u8   x
  u8   y
  u16  hp
  bool alive
}

group player {                     // one - no [n], so no index
  u8  x
  u8  y
  u16 hp
}

mob[i].hp = 100
player.hp = 100
if ( mob[i].alive && mob[i].x == player.x ) { ... }
```

**The presence of `[n]` decides between one and many**, exactly as it does for
`u8 x` against `u8[4] x` - so no second keyword is needed. `group` still reads
correctly either way: it groups *fields*, and optionally instances them.

Each field becomes its own array - or plain variable, for the single form -
mangled the way sub-locals already are:

```momo
u8[64]   mob__x        u8  player__x
u8[64]   mob__y        u8  player__y
u16[64]  mob__hp       u16 player__hp
bool[64] mob__alive
```

`mob[i].x` is `mob__x[i]`, and `player.x` is `player__x`. **The index expression
passes through untouched** - it is a name substitution, not layout arithmetic.

### Why structure-of-arrays, and why on this machine especially

**No multiply.** Array-of-structures indexing is `i * recordSize + fieldOffset`.
`mul` is ~120 cycles on an 8086, so unless every record is padded to a power of
two, that cost is paid on every field access. SoA is:

```nasm
        mov     bl, [i]
        xor     bh, bh
        mov     al, [mob__x + bx]      ; field offset folded into the label
```

Zero arithmetic beyond the index for byte fields, one `shl` for word fields.

**No mixed-width wart.** Records over a byte array need a second index space for
`u16` fields - a `u8` view and a `u16` view of the same buffer, two units for one
record. Under SoA each field is its own array with its own element type, so
`mob__hp[i]` is an ordinary `u16` index.

**Tree-shaking works per field.** Never read `.hp` and `mob__hp` disappears -
128 bytes not paid for. A record carries every field whether used or not, and
the memory report shows exactly which fields cost what.

### Why this is smaller than records

No struct type in the type system, no offset computation, no record arrays. Every
field is already an ordinary array that the resolver and emitter fully understand,
so `.` never reaches them - it is gone by the end of parsing, exactly like `=>`.

Assignment falls out for free: `mob[i].hp = 100` **is** `mob__hp[i] = 100`, an
ordinary array store. Bounds checks on constant indices work per field, unchanged.

### Rules

- **`mob[i]` and `player` alone are not expressions** - only `mob[i].field` and
  `player.field` are. Honest, since no record exists for them to denote. It also
  pushes toward the idiomatic SoA style of passing *indices* rather than entity
  references, which suits a language with no pointers.
- **The AST keeps the original names** for diagnostics. The parser *could* rewrite
  straight to `mob__x` with no symbol table, but a typo would then report
  `"mob__z" is not declared` for source that says `mob[i].z`.

  As built, the parser hangs an optional `field` marker on the identifier and the
  resolver does the lookup - so `.` survives parsing as one string, and the
  message is `"z" is not a field of group "mob"`, which neither alternative could
  manage. The emitter is still untouched: by then only `label` matters, so a
  field access and an array index are the same thing to it. An earlier draft of
  this section claimed `.` was "gone by the end of parsing" *and* that names were
  kept - those cannot both hold, and diagnostics won.
- **Field globals are not in scope.** `mob__x` cannot be named from source, the
  same way a routine's `add__a` cannot. Both labels are manufactured rather than
  declared, so the resolver claims them in a shared set - two symbols wanting one
  label is caught from whichever side is written second. That check found a
  pre-existing hole: a global literally named `add__a` alongside `sub add(u8 a)`
  emitted the label twice, silently, before `group` existed.
- **Fields are scalars.** `u8[4] inventory` as a field would need arrays of
  arrays, which is a separate problem.
- **The count must be a constant**, as for any array.
- **Top-level only** in v1. Entity pools are inherently global.
- **No field initialisers** in v1 - arrays zero-fill, matching `u8[4] buf`. Const
  groups carrying data are a separate question.
- **A view of a field is still not expressible**, and §17 landing did not change
  that. A field *is* an ordinary array, so nothing in the mechanism objects - but
  `view u8[16] firstWave = mob__x[0]` names a label deliberately out of scope
  (above), and `mob.x[0]` means *element 0 of field x*, not *the field array*. The
  missing piece is a way to say the whole field array, which is `mob.x` with no
  index, and that is an error today because the indexed form requires one. Left
  alone: it is a change to what a group name denotes, not a gap in `view`.

### `group` is namespacing, not views

`group player { u8 x  u8 y }` creates two separate globals. **Nothing guarantees
they are adjacent.** That is a different promise from a scalar view (§17), which
names a field *inside a buffer you already have* and keeps the whole thing
contiguous and copyable:

```momo
u8[8] saveSlot                        // stays copyable as a unit
view u8  slotX  = saveSlot[0]
view u16 slotHp = saveSlot[2]
```

Today nothing can tell the difference - Momo has no array assignment and no
`memcpy` - but the two diverge the moment `peek`/`poke` exist. So they remain two
features doing two jobs: **`group` names fields it creates; `view` names what
already exists.**

For the same reason `group` does *not* retire the `_al`/`_ah` register aliases.
Those are genuinely views over `_ax`'s storage - and `view` does not retire them
either, in the language: a view's parent is an array, and `_ax` is a scalar, so
`view u8 al = _ax[0]` has nothing to index. They now share `view`'s *mechanism*
without being expressible in it (§17), which is the honest half of a claim this
file used to make in full.

The record for this section - what `group` displaced, and why that idea dropped
from compelling to occasionally handy - is `DECISIONS.md` §18.

---

## 19. Compile-time array parameters

**Designed, not built - the section is in `PLAN.md`.** Routines take scalars only,
so `memcpy`, `fill` and `drawString` cannot be written as reusable library code;
allowing arrays and views as parameters, resolved at compile time, is what would
close that.

The number stays here so the gap does not read as something deleted, and so the
citations that use it keep resolving.

---

## 20. Open questions

**At the end of this file**, where it reads better: it is a postamble rather
than a step in the sequence. The number is unchanged.

---

## 21. Longer-term directions

Dissolved. What was here was nine unrelated things under one number, and one of
them - strength reduction - was the specification `emitter.ts` cites for codegen
that ships, inside a section opening with the words "directions rather than
designs".

They are now sections of their own, so that each can be cited, and so that a
plan item can point at one rather than at all nine:

| | |
|---|---|
| §26 | Strength reduction - built, with the tiers behind `-o` and the one refused |
| §27 | Word copies and data alignment, measured |
| §28-§33 | the six that are not built - CPU levels, `-o`, hosted targets, dropping the assembler, self-hosting, other CPUs. These live in `PLAN.md` |

Higher-order and generic routines moved into §19, which it extends rather than
stands beside. This number is kept rather than reused: it is cited from outside
this file, and a number that changes meaning is worse than one that redirects.

## 22. Port I/O

**Built.** `porttest` exercises all four builtins and is the worked
example for this section (§14) - read it alongside the rules below.

```momo
out8( 0x3C4, 0x02 )              // sequencer index: map mask
out16( 0x3C4, 0x0F02 )           // index and data in one instruction
u8 status = in8( 0x3DA )
```

### Most of the technique already works

Worth establishing first, because it makes this much smaller than it sounds. Of
what adaptive tile refresh needs:

- **The framebuffer** is `far u8[] ega = 0xA000` (§16).
- **Naming a tile or a row inside it** is `view` (§17).
- **The latch copy** - the hot loop, four planes moved per byte access under write
  mode 1 - is `ega[dst] = ega[src]`, which emits a read from video memory and a
  write back to it, with no widening in between. Nothing was added for this; it
  was verified by compiling it and reading the output.
- **Mode setting** is `int 10h`, one call.
- **The dirty-tile bookkeeping** is ordinary Momo. `simplerl` already does the
  idea in text mode.

**Only the control registers are missing.** That is the whole feature.

**Retrace polling is the other thing `in` buys, and it is worth naming here.**
`time.momo` reads the BIOS tick counter, which the timer interrupt advances
18.2065 times a second - so 55ms is the finest wait that library can express. That
paces a roguelike and cannot pace an animation, and no library can improve on it:
the rate is the PIT's divisor, and changing that is `out` and nothing else.

Mode 13h refreshes at 70Hz, so waiting on bit 3 of `0x3DA` is both a finer clock
than the BIOS tick and the cure for tearing - one loop for two problems, and it
touches the PIT not at all:

```momo
sub waitRetrace {
  while ( in8( 0x3DA ) & 8 ) { }        // let a retrace in progress finish
  while ( !( in8( 0x3DA ) & 8 ) ) { }   // then wait for the next to start
}
```

### What actually needs a port

| | port | why |
|---|---|---|
| CRTC start address | `0x3D4/5` idx `0x0C`, `0x0D` | coarse scroll - 8px across, one scanline down |
| Attribute pixel panning | `0x3C0` idx `0x13` | fine horizontal scroll, 0-7px |
| Input status 1 | `0x3DA`, **read** | resets the attribute flip-flop; also retrace polling |
| Sequencer map mask | `0x3C4/5` idx `0x02` | which planes a write reaches |
| Graphics controller mode | `0x3CE/F` idx `0x05` | selects write mode 1, which is what makes the latch copy a latch copy |
| Graphics controller bit mask | `0x3CE/F` idx `0x08` | partial-byte writes at a tile edge |

The third row is why **`in` is not optional.** The attribute controller shares one
port for index and data and alternates between them through a flip-flop that only
a read of `0x3DA` resets - so fine horizontal scrolling is impossible with `out`
alone. Retrace polling, which a scroll wants anyway to avoid tearing, is the same
register.

### Four builtins, mirroring `peek` and `poke`

The shape is identical to §10's: a numeric target the compiler cannot check, one
read and one write, unsafe and visibly so at every use. So the spelling is the
same and for the same reasons - four names rather than a `_port` array, since a
`_portw` would scale its index and a port number is not scaled.

- **`in8`/`in16` are expressions, `out8`/`out16` are statements.** §6 keeps effects
  out of expressions, and a port write is an effect. Reading a port is *also* an
  effect on some hardware - `0x3DA` resets the flip-flop by being read - but it
  produces a value, so it stays an expression; §6's rule is about expressions
  having no effect on Momo's own state, which this does not.
- **The port is `u16`.** Signed is rejected as it is for an address.
- **The value follows the fit rule** a declared `u8` or `u16` would.
- **`out16` is not just symmetry.** `out dx, ax` writes an index and its data in
  one instruction, which is the standard EGA idiom and halves the cost of every
  register poke.

Codegen is the same shape as `poke`: the port into DX, the value into AL or AX,
then the instruction. The order is the other way round from how it reads, though,
and that is not arbitrary:

```nasm
; ---- out16( 0x3C4, 0x0F02 )
        mov     ax, 3842
        mov     dx, 964
        out     dx, ax
```

**A constant port is loaded last**, because `mov dx, imm` cannot disturb what the
value left in AX, and doing it the other way would need the value computed around
a live DX. **A computed port is pushed** rather than held in DX while the value is
worked out:

```nasm
; ---- out8( port, u8( n * 3 ) )
        mov     ax, [port]
        push    ax                          ; save the port while the value is computed
        mov     ax, [n]
        mov     bx, 3
        mul     bx
        xor     ah, ah
        pop     dx
        out     dx, al
```

That is the same push §10 uses to protect a `poke` address, for the same reason
one step removed - see the correction under "What it cost".

**The `imm8` port form is deliberately skipped.** `out 0x21, al` exists and is
shorter, but every port above is greater than 0xFF, so it would never fire on the
code this feature is for.

### On danger, stated once and accurately

This is the first construct in Momo that can affect something outside the
program's own state, and the documentation should neither overstate it nor bury
it.

**The stdlib is the right mitigation, but for correctness rather than safety.**
What goes wrong in practice is a *sequence*: the attribute flip-flop, the
index-then-data pairing, the write of `0x20` to `0x3C0` that re-enables video and
without which the screen simply stays black in a way that reads as a hang. Those
belong in `shared/lib/std` written carefully once, so that most programs never spell a
raw `out8` at all.

**But the registers that can actually damage anything are the ones no wrapper
would ever touch.** The destructive group is CRTC `0x00`-`0x07` - horizontal
total, sync start and end, vertical total - where out-of-spec values could drive a
fixed-frequency CRT outside its range. A scrolling library writes start address
and pixel panning, which are harmless by construction. So the danger lives
precisely in the paths a library does not cover, and a program that writes them is
doing so deliberately. Under DOSBox, 86Box, or any modern display the realistic
failure is a black screen or a hang, not hardware.

That is the whole warning. It is the `unsafe { }` bargain §10 already made for
`peek`/`poke`, one step further out.

### Testing has three tiers here, and only the first is automatic

Worth writing down, because it is otherwise easy to over-read a passing e2e run:

| | asserts |
|---|---|
| tier 2, under DOSBox | we emitted the right `out` |
| 86Box | the hardware model agrees |
| a real 486 | the timing is real |

Tier 2 can write a register and read it back where the register is genuinely
readable - the sequencer and graphics controller indices are - and that is worth
having, but it tests DOSBox's emulation as much as Momo's codegen, and readback is
not reliable on real hardware even where DOSBox permits it. A scrolling demo
cannot be checked from stdout at all, so it joins the existing demos as
golden-tier only. **The honest claim for an automated test here is "the right port
instruction was emitted", not "the hardware agreed"** - and any test added should
say so in its own comment rather than implying otherwise.

The record for this section - what wanted it, what it cost, what the design got
wrong about DX, and the incident that settled the hierarchy above rather than
arguing it - is `DECISIONS.md` §22.

## 23. `scope`

**Designed, not built - the section is in `PLAN.md`.** `local` (§11) gave a
declaration an owner, and the only owner it can name is the file that writes it.
`scope` is the same idea with a second: a named block of declarations whose
privates belong to it rather than to the file.

---

## 24. Interrupt handlers

**Designed, not built - the section is in `PLAN.md`.** A handler is a routine the
hardware calls - the timer every tick, the keyboard on every press and release.
Momo cannot write one, because a handler ends in `iret` rather than `ret` and
there is no way to say so. Music is the case polling cannot substitute for.

---

## 25. Fixed-point types

**The type and its rules are built. Everything that needs a shift is not.** A type whose
scale the compiler knows, so that it can insert the shifts and reject the mismatches, and
**lowered to Momo that could have been written by hand**.

Built: the lexer, the 48 legal splits, the mixing rules, the count rule, comparison,
same-scale `+` and `-`, `*` and `/` against a count, and casts of *constants* across the
scale boundary. `fixed` is all of it in one program, and it is a project rather
than a compile test because the claim being made is about emitted code and the golden
tier is the only one that watches that.

Also built: decimal literals, which scale wherever a target scale is in view; `raw`, the
reinterpreting cast; `*` between two same-scale values, which lowers to `fixMul` in
`shared/lib/std/fixed.momo` and is checked on the 8086 by `fixmul`; and `mulshr8`, the
widening-multiply intrinsic this section held in reserve as its escape hatch.

Not built: `/` between two fixed values, which wants the 24-bit numerator this section
says Momo cannot express. And a runtime value still cannot cross scales *preserving its
value*, because that is a shift - `raw` is the other half of that pair and needs none.
Only 8.8 has a multiply; another fraction width would want its own helper with its own
baked shift.

An earlier draft of this section said "lowered entirely in the parser". That is wrong,
and it is wrong in a way that reaches as far as which test tier can see the feature at
all: `*` has three different outcomes depending on its operand types, and the parser has
no symbol table. See "Where the lowering lives" below.

```momo
i8.8 scale  = 1.5
i8.8 height = 20.0

i8.8 scaled = height * scale     // 30.0
i16  pixels = i16( scaled )      // 30
```

### It is a unit system, not a width system

The arithmetic is trivial and the arithmetic is not the point. Same-scale `+` and `-`
are integer addition and subtraction unchanged; comparison is integer comparison; `*`
is a multiply and a shift; `/` is a pre-shift and a divide.

**The bug fixed point causes is a units bug.** In C a 16.16 value and a plain `int`
are the same type, so adding a scaled thing to an unscaled thing compiles silently and
gives an answer 65,536 times wrong. The compiler could catch every instance and cannot,
because it cannot see the scale.

Momo already has exactly this kind of rule. §4's *"u16 does not mix with signed types;
use an explicit cast"* exists to turn a silent wrong answer into a compile error, and
this is that idea applied to scale:

```
i8.8 * i8.8   ->  scaled multiply, shift after      i8.8
i8.8 * i16    ->  plain multiply, no shift          i8.8
i16  * i16    ->  plain multiply, as today          i16
i8.8 * i4.4   ->  error, mixed scales, needs a cast
i8.8 + i16    ->  error, needs a cast
```

Every case is decided by the operand types, so there is nothing ambiguous to resolve
and nothing for a caller to remember. **That is the feature.** A version where the
programmer has to call `fixMul` by hand would be worse than nothing: writing `a * b`
and getting an integer multiply is the 256x error this exists to prevent.

**`i8.8 * i16` treats the integer as a count** - "three times as big" - so no shift and
the scale is preserved. The other reading promotes the `i16` to `i8.8` first, and the
two answers are 256x apart. Count is the useful one, and promotion is what a cast is
for: `a * i8.8( n )`. §4 has no implicit promotion anywhere and this adds none.

### Untyped constants are counts too

The table above has a row for every named type and none for `untyped`, which is the type
a literal carries until something fixes it - and the commonest expression in real code. `combineOperands` decides by *range* rather than by
name, so nothing above catches `scale * 2`: the ranges combine, the result is a plain
`i16`, and the scale is gone. That is the 256x error this section exists to prevent,
arriving through the mechanism §4 added for convenience.

So the rule has to be stated rather than inherited. **An untyped integer constant is a
count**, exactly as an `i16` is:

```
i8.8 * 2      ->  twice as big, no shift            i8.8
i8.8 + 2      ->  error, 2 has no scale, needs a cast
```

`i8.8 + i8.8( 2 )` is the promotion, exactly as it is for an `i16`, so the cast carries
the whole difference between "two units" and "two 256ths" and nothing has to be inferred
from context.

Assignment takes the matching rule, and it lives in a different place in the code from
the operator table: `i8.8 x = someI16` is an error for the same reason `i8.8 + i16` is.

**So `i8.8 x = 2` is an error and `i8.8 x = 2.0` is how it is written.** That looks
pedantic beside §4, where a literal adapts to its target and `u8 y = 2` is ordinary. It
is the count rule holding: `2` is a count everywhere, including here, and a count is not
a value with a radix point. The decimal point is what says which was meant, and it costs
one character.

### Spelling

`i8.8` and `u8.8`. The signedness letter stays because §4's whole rule turns on it,
the dot reads as a radix point because that is what it is, and the parts add to the
storage width - so `i8.8` is 16 bits, consistent with `i16` being 16 bits, and a reader
can do the sum.

Rejected: `fix8.8` loses signedness and would need `ifix`/`ufix` to say the same thing,
and Momo does not prefix with category words - it is `u16`, not `uint16`. `q8.8` is the
correct DSP convention and completely opaque, where Momo's names are self-explanatory.

The dot is unambiguous in a type position: a type starts with a letter, a number starts
with a digit, and Momo has no member access to collide with. The cost is that the
lexer's identifier rule must admit a dot, or the parser assembles three tokens.
**`i8_8` is the fallback** if that proves to be grief - less pretty, no lexer question.

### The parts must sum to a storage width

`i12.4`, `i10.6`, `i4.4`, `i2.6`, `u0.16` - all legal, and all of them are a type that
already exists with a documented scale. `i12.4` **is** an `i16`. That is the rule doing
the work: no new storage, no new codegen, and the sugar is type checking plus shift
amounts. The valid set is finite and small.

- **`i6.6` is rejected.** Twelve bits matches no storage width, so it would live in
  sixteen and the four spare bits would be a lie: the type would claim a range it does
  not enforce, and overflow would wrap at sixteen rather than at twelve. It offers
  nothing `i10.6` does not, and `i10.6` is honest about where it lives.
- **`i16.0` is rejected** - that is `i16`, and two spellings for one type is worse than
  one.
- **`i0.16` is allowed.** A pure fraction in [-1, 1) is genuinely useful: a normalised
  value, a sine table entry.

### Scale rides beside the storage type, and never reaches the emitter

The obvious implementation is to add the spellings to `ValueType` - `'i8.8'` alongside
`'u16'` - and it is the wrong one. Two reasons, and the second decides it.

The valid set is 48, not five: eight signed and eight unsigned splits at one byte,
sixteen of each at two. That is still finite and small, but it turns `rangeOf`,
`isSigned`, `widthOf`, `promote` and `truncate` into tables.

And **nothing would make a new member fail loudly.** Those five functions are `if` chains
with unguarded fall-through - `rangeOf` ends by returning i16's range, `widthOf` returns
1 for anything that is not `u16` or `i16`, `isSigned` returns false for anything that is
not `i8` or `i16`. Adding `'i8.8'` produces no TypeScript error at all, and hands it
i16's range, width 1, and unsigned comparisons. The emitter reads the same type through
`typeOf`, with several sites keyed on exact equality with `'i8'` - the `cbw` widening and
three peephole guards among them - so an `i4.4` would silently miss the sign extension a
byte-stored signed value needs. Wrong instructions, no diagnostic, and only the golden
tier or tier 2 could notice.

So scale is **metadata beside the storage type**, not a member of it. Taking literally
the claim above that `i12.4` *is* an `i16`: `Resolved` grows a fraction width, `frac: 0`
means every existing site keeps working unchanged, and making the field required turns
forgetting it into a compile error rather than a silent loss of scale - which matters for
a feature whose whole purpose is catching silent losses of scale.

The cost is real and worth naming. Four AST carriers hold a bare `TypeName` today and
each needs the fraction width alongside; and any site that prints `resolved.type` raw
will say `i16` where the source said `i8.8` until it is taught otherwise.

**Promotion preserves the scale**, which falls out of this representation and would have
been 48 table entries under the other one. All arithmetic happens in 16 bits, so `i4.4`
computes as `i12.4`: the storage widens and the radix point does not move.

**And the scale is erased before the emitter.** Every scale-dependent operation is either
a call or an explicit shift, so `resolvedType` stamped on AST nodes stays a five-member
`ValueType` and the emitter never learns the feature exists. That is what makes "no new
codegen" a property rather than a hope.

### Where the lowering lives, and what the round trip can actually see

`+`, `-` and comparison need no lowering at all. Only `*` and `/` lower, to a call:

```momo
i8.8 c = a * b        // lowers to
i8.8 c = fixMul( a, b )
```

`fixMul` is an ordinary hand-written `sub` in `shared/lib/std/fixed.momo`, so the printed form
*is* the hand-written Momo - the same route `=>`, `else if`, `++`, adjacent string
literals, compound assignment and `group` all arrive by.

But **the decision to lower needs the operand types**, and the parser has no symbol
table. So this happens in the resolver, which today annotates and never rewrites - and
both `npm run desugar` and the §14 round trip print the output of `load()`, so a
resolver-side rewrite is invisible to both.

Fixable cheaply, and cheaply for a specific reason: **print the post-resolve program
instead.** Since the resolver only annotates today, the printed text comes out
byte-identical for every existing round-trip case, so the change is a no-op that then
covers the lowering.

**Done, and the prediction held**: `desugar` and the round trip now resolve first, and
all 58 existing cases printed identically. `npm run desugar -- fixmul` shows
`raw i8.8( fixMul( raw i16( x ), raw i16( y ) ) )` where the source said `x * y`, and the
round trip compiles that printed form to the same instructions - which is the whole of
the "the printed form IS the hand-written Momo" claim, and the reason `raw` had to exist.

One thing the round trip still cannot see, and it is worth knowing where the tier ends:
`x * y` and the call it lowers to produce the same assembly, so the harness cannot tell
whether the printer showed the lowering or the multiply. That takes an assertion on the
printed *text*, which `fixmul` now carries.

**Literals are the half that really is parse-time, and only where the scale is
adjacent.** `i8.8 x = 1.5` has the type right there, so 1.5 becomes 384. `const k = 1.5`
and `f( 1.5 )` do not, so a decimal has to stay an untyped fixed value carrying an exact
rational until a scale appears. That is the `untyped` mechanism again rather than a
parse-time constant, and it is the same rule as the count above seen from the other side.

**"Exact" is a property of 1.5, not of the scheme**, and an earlier draft of this section
said otherwise. 0.1 in 8.8 is 25.6, and most decimals anyone writes are not
representable. So a literal **rounds to nearest, ties away from zero**. Ties are
reachable rather than theoretical - 0.001953125 is half a unit in 8.8 and a finite
decimal - and the cost of the choice is a small upward bias in magnitude that
round-half-to-even would not have. It is the rule that is easiest to state and to check
by hand, which is worth more here than the bias costs.

Rejecting an inexact decimal was the alternative, and it would make the feature awkward
in exactly the proportional cases it exists for. `0.1` is an ordinary thing to write.

**And the round trip does not verify this feature.** An earlier draft of this section
claimed it did, in those words, without a new tier. It cannot: the harness compiles the
original and the printed copy and requires matching assembly, so it is symmetric. Lower
`>> 7` where `>> 8` belongs and both copies get `>> 7`, the assembly matches, and the
test passes. Its own comment says what it is - the only test of the parser. It proves
the lowering is *representable*, which is worth having, and says nothing about whether it
is *right*.

So this feature needs tier 2 numbers. That was always going to be true of a section which
goes on to say that signed magnitude-and-sign is where the bugs would live; claiming the
round trip covered it was a sentence that sounded like a reason.

### Casts across the scale boundary, and the reinterpret that has to exist

Two conversions, and both read best as ordinary casts:

```momo
i16  pixels = i16( scaled )   // 30 from 30.0 - a shift right
i8.8 three  = i8.8( 3 )       // 768 - a shift left
```

One rule - **a cast across the scale boundary preserves the value** - and not a new
principle: Momo's casts are about values already, and `u8( 300 )` truncating is the
documented failure mode rather than the intent.

It does collide with what a cast does today. Everything arrives in AX widened to 16 bits,
and the emitter has no branch for a `u16` or `i16` target, so a 16-to-16 cast is zero
instructions - a pure reinterpret. `i16( scaled )` currently gives 7680, not 30. Adopting
the rule means the resolver inserts an explicit shift, which is legal printable Momo and
so sits inside the round trip's reach, and the emitter stays untouched. The constant fold
has to insert the same shift, signed rounding included, or a constant and a runtime value
give different answers for one source line.

**Which spends the only bit-preserving spelling there is, and the lowering needs one.**
`fixMul` is hand-written in plain 16-bit Momo, so its call site has to hand over the raw
words and its body has to hand back a fixed result. Four conversions exist: the two
value-preserving ones are the casts above, and the two bit-preserving ones have no
spelling at all once `i16( fixed )` starts shifting.

Two things nearly serve. `peek16( addr( x ) )` is bit-preserving today, but it costs an
address and a memory read where a reinterpret should cost nothing, and its inverse
`poke16` is a statement - so it does not compose inside an expression, which is the shape
problem this section raises against 16.16 below. And `view` (§17) is a zero-instruction
bit-preserving reinterpretation, proven enough that it retired the emitter's byte-alias
arithmetic - but it needs an array to window onto rather than a scalar, and it is a
declaration rather than an expression.

**So a reinterpreting cast is part of the feature**, cast-shaped because it needs a target
type. It fits an existing family: `peek`, `poke`, `in` and `out` are all deliberately
unsafe and visibly so at every use, and this is that.

**It is spelled `raw`**, an adjective in front of an otherwise ordinary cast:

```momo
u16  bits = raw u16( scale )    // the word behind an i8.8, unchanged
i8.8 back = raw i8.8( bits )    // and read as 8.8 again
```

The adjective reads the way `const far` and `const view` do, and it produces the same
`CastExpression` the plain form does with a flag set - so there is one cast node, one
emitter path, and nothing new in the back end at all. Both lines above emit a `mov` and
no shift, which is the whole point of having it.

`raw` cannot target `bool`: a cast to bool normalises to 0 or 1, which is a decision
about the value rather than a reading of the bits, so there is nothing for the adjective
to mean.

**It cost 51 lines across five files**, and 30 keywords rather than 29. Against the 189
§22 spent on four intrinsics that is cheap, and the reason is that it reuses the cast
node instead of adding a construct - the same trade §17 made when `view` absorbed the
emitter's byte-alias arithmetic.

A parameterised const would have avoided it, and does not work. The unsigned kernel is a
single expression, so one declaration with the shift as a parameter would fold for every
scale at once. But the resolver rejects an argument that calls a fn when a parameter is
used more than once, and the kernel uses each operand four times - so `a * b` with a call
on either side would fail for a reason the programmer never wrote, and fixing that needs
an invented temporary with storage and §12 accounting. Which is the exact cost this
section rejects 16.16 for, arriving by a different road. The helper has to be a real
`sub`.

### No new register pressure, which is the whole reason it is shaped this way

`a * b` on 8.8 wants `(a*b) >> 8`, and §9 discards `DX` - so the naive lowering is
silently wrong the moment the product exceeds a word.

**The specification is a four-multiply synthesis.** A 16x16->32 multiply builds from
four narrower ones:

```
a*b = ah*bh*65536 + (ah*bl + al*bh)*256 + al*bl
```

so `(a*b) >> 8` is `ah*bh*256 + (ah*bl + al*bh) + (al*bl >> 8)`, all in 16-bit ops.
Signed needs magnitude-and-sign around the unsigned kernel, which is where the bugs
would live. `shared/lib/std/fixed.momo` keeps this as `fixMulUParts`.

**The fast path is `mulshr8( a, b )`** - the unsigned product of two words, shifted
right by eight - and `fixMulU` is one line over it. The two are held against each
other rather than trusted: `fixmul` runs both over 256 pairs on the target and
requires agreement on every one.

It needs **no new mnemonic**. The whole 32-bit product lives in `DX:AX` and is never
named, which is exactly what §9 has always permitted, and `(a*b) >> 8` out of `DX:AX`
is one byte from each half - two `mov`s, no shift, because no 8086 shift reaches
across the pair anyway:

```nasm
        mul     bx
        mov     al, ah
        mov     ah, dl
```

It is named for the machine operation rather than for fixed point, the way `peek8` is
named for the machine rather than for "read a byte".

**The sugar's meaning is defined by its lowering**, so a faster implementation of the
same meaning is an optimisation and no program changes.

**Two properties of the multiply, both worth knowing before relying on it.** It
truncates toward zero rather than toward negative infinity, which buys
`fixMul( -a, b ) == -fixMul( a, b )` at the cost of differing by one from an
arithmetic shift; and -32768 has no magnitude in an `i16`, so the most negative 8.8
value multiplies as though it were positive.

**This is why fixed point is the right shape and a 32-bit type is not.** DECISIONS
§22 records what happened when port I/O assumed `DX` was free because §9 called it
*"scratch and never live"*: a port has to stay in `DX` from the load until the `out`,
and `mul` and `div` both write it. A *stored* 32-bit value is that problem
everywhere - it needs `DX` live across arbitrary code - and that is a change to the
accumulator model, which fifteen peepholes and every golden `.asm` stand on. Fixed
point never stores a wide value: the 32-bit intermediate exists inside one expression
and is never named.

### Division is the half this does not cover cleanly

`i8.8 / i8.8` is `(a << 8) / b`, which needs a 24-bit numerator - exactly what `div`
wants in `DX:AX`, and exactly what Momo cannot express since it zeroes `DX`.
Synthesising it in pure Momo means long division, which is a great deal worse than 3x,
and the quotient can exceed a word and fault.

Two standard mitigations, and they are enough to start: division by a **constant**
becomes a multiply by a reciprocal at compile time, which covers most real uses; and
division by a **variable** is where a `mulDiv` intrinsic would first earn its place.
So `/` is where a `mulDiv` intrinsic would first earn its place, behind the multiply
helper above rather than ahead of it, and until then it is the operation to use sparingly.

### Scope of the first build

Every example in this section is 8.8, and so is the requirement that produced the
feature. So the type checking takes all 48 spellings and **only 8.8 gets a multiply**: a
scale with no helper is a clear "no multiply for this scale yet" rather than a wrong
answer, and the choice between one helper per width and one taking the shift as a
parameter then gets made against real callers instead of guessed at now.

`i0.16` and `u0.16` want care whichever way that goes: a shift of 16 puts the entire
product in `DX`, so the pure-fraction types are not one more row in the table.

### Why not 16.16

Not for want of use - the vector work wanted exactly that precision for a zoom
transform. **A type wider than a machine word cannot be an expression value here,
because a routine returns one word.** So `x = a + b` on 16.16 cannot lower to a call
returning the sum; it lowers to `fixAdd( addr(x), addr(a), addr(b) )`, a statement. The
sugar then stops composing: `x = (a + b) * c` needs a temporary the desugarer invents,
storage allocated for it, and §12's analysis to account for it.

8.8 composes perfectly because it fits a word, and that is the entire difference.

**And the precision can live in the operation instead of in the type.** A scale passed
as two words, kept at 32 bits internally, returning 8.8 - `fixMulWide( a, hi, lo )` -
gets 16.16 precision exactly where the transform wanted it without a 16.16 type
existing. Precision in the operation is not the same as precision in the type, and the
first is much cheaper here.

### What this opens in existing code

The opportunity is not wider numbers, it is **proportions without overflow**, and there
is more of that waiting than expected.

- **`shared/lib/momolo` has no proportional arithmetic at all**, and percent sizing was one of
  the things explicitly cut from the clay port. This is what it needs.
- **`tennis`** carries shifts documented as port fidelity - `obj >> 2` - which
  a fixed type would express as what they mean rather than as what they do.
- Gauges, aspect ratios, progress bars: the whole `(a*b)/c` family.

The record for this section - what the multiply cost against what was predicted,
why the design had the difficulty backwards, and a header this section quoted from
a file that no longer had it - is `DECISIONS.md` §25.

## 26. Strength reduction: how far to go

**Factor, do not bit-decompose.** The obvious split of `x * 80` into `64 + 16`
needs two shift chains and a temporary. Factoring as `5 << 4`, with `5` as
`(x << 2) + x`, is better on both counts:

| `x * 80` | cycles | bytes |
|---|---|---|
| `mov bx, 80` + `mul bx` | ~128 | 5 |
| bit split, `64 + 16` | 25 | 24 |
| factored, `(x*4 + x) << 4` | **17** | **16** |

The rule is: pull out the largest power of two, then handle the odd residue.

`simplerl`'s `tileAt` is `map[y * mapW + x]` with `mapW = 20`, and today that
emits `mov bx, 20` / `mul bx`. Factored, `20 = 5 << 2` and `5 = (y << 2) + y`:

```nasm
        mov     bx, ax
        shl     ax, 1
        shl     ax, 1           ; y * 4
        add     ax, bx          ; y * 5
        shl     ax, 1
        shl     ax, 1           ; y * 20
```

13 cycles against ~128 - about 10x, for seven extra bytes, and `draw` runs it
`mapW x mapH` = 200 times per full redraw.

Three tiers, with the cutoff between the first two:

- **Unconditional - built.** Powers of two for `*`, and for unsigned `/` and `%`.
  Division is the clear case: `x / 8` as `shr` is ~24 cycles against ~160, and it
  is *smaller*. `x % 8` becomes `and ax, 7`. There is no tradeoff to weigh.

  **Every** power of two, at any shift width. `mov bx, n` + `mul bx` is 5 bytes
  and ~125 cycles; `mov cl, k` + `shl ax, cl` is 4 bytes and at worst 68, so the
  shift wins on both counts however wide the shift is.

  Signed `/` and `%` are deliberately left as `idiv`, which is what the trap
  below asks for. Signed `*` **is** reduced - `shl` is bit-identical to a
  multiply in the low 16 bits, so the sign never enters into it.
- **Behind `-o`.** Odd residues of 3, 5, 7 and 9, which covers 10, 40, 80, 160
  and 320 - practically every 2D stride is `2^k x small`, so this catches almost
  everything real with no search.
- **Never.** General shift-add chain search. GCC ships tables for this; the
  return past the tier above is negligible.

Two traps:

- **`shl ax, cl` is slow on an 8086** - 8 + 4n cycles, so shifting by four
  through CL costs 24 where four separate `shl ax, 1` cost 8. The current rule
  ("unroll if the count is 2 or less, otherwise use CL") is *size*-optimal and
  actively poor for speed. Under `-o` it should unroll to about 8.

  **Strength reduction made this trap load-bearing rather than theoretical.**
  Reducing `* 8` produces a shift of three, which is exactly where CL becomes
  slow - 20 cycles against 6 unrolled, for 2 bytes. So the reduction delivers
  about 80% of what it could, and the remainder is one policy decision away.
  Left alone deliberately: unrolling trades size for speed everywhere, not only
  in reduced multiplies, and that is what `-o` is for.
- **Signed division by a power of two is not just `sar`.** `sar` rounds toward
  minus infinity while division rounds toward zero, so `-7 / 2` yields -4 rather
  than -3. The value must be biased by `2^k - 1` when negative first - about five
  instructions, still far cheaper than `idiv`, but a correctness trap rather than
  a tuning detail. The same applies to `%`. Handling only the unsigned case is a
  reasonable first cut.

Two consequences fall out for free:

- **The static analysis adapts automatically**, because it counts the pushes
  actually emitted rather than modelling where pushes ought to be. Fewer
  temporaries under `-o` simply produce a smaller number.
- **The e2e suite becomes an optimiser test.** Every program must produce
  byte-identical output with and without `-o`. That is a strong correctness
  property, and it costs nothing beyond running the suite twice.

The record for this section - what the reduction measured, and the cap this
section originally set and had to lift - is `DECISIONS.md` §26.

## 27. Word copies and data alignment

**Not a section of this document - the analysis is `DECISIONS.md` §27.** It is a
question somebody asked about `tilefill`, measured and answered: could a `u16`
view copy two pixels at a time and halve the loop?

Both halves of the answer have landed somewhere more useful. The word view is a
technique and is described in §17. The alignment work is deferred with a stated
trigger and is a `PLAN.md` item. What remains is the measurement that settled it,
which is a record rather than a rule.

---

## 35. `_ds`, the program's own segment

**Built.** A read-only reserved global whose read emits `mov ax, ds`. Two bytes,
no storage, no startup code, and no new mnemonic - `mov` already gained a
segment-register operand class with §16.

```momo
u16 ourSeg
far u16[1] memTop = ourSeg:2        // PSP:0002 - the end of what DOS granted
far u8[64000] backBuffer = bufSeg

ourSeg = _ds
```

**What it unblocks is a second segment.** A `.COM` cannot learn where it is any
other way: DOS does not report it, the program knows it only because CS=DS=ES=SS
at entry, and the PSP holds the *parent's* PSP and the environment segment rather
than ours. So both routes to memory past our own were blocked by the same missing
number, and `far` with a runtime segment (§16) is the other half of each.

**It is read-only, and the reason is not the same as `_cf`'s.** Carry is a report
with nothing to say back to it; DS is where DOS put us, and the tiny model rests
on it staying there. Both refuse assignment and each says why.

**No storage is emitted**, which is a claim three places have to agree on: the
symbol is neither real storage nor an alias of a parent, the data section skips
it, and `npm run memory` skips it when counting. A builtin's width goes into the
reserved figure by default, so this one would otherwise report two bytes that do
not exist.

### Testing it needs something other than its value

`dstest` is the worked example (§14). DOS loads a `.COM` wherever there is room,
so the segment differs between machines, DOS versions and whatever is resident -
there is no number to put in a `.expected`.

What does not vary is the PSP. Its first two bytes are always `CD 20`, an
`int 20h` left there so a program can exit by jumping to offset 0. So `dstest`
declares `far u8[2] psp = ourSeg` and prints them, and finding 205 and 32 is what
proves `_ds` is *our* segment rather than some other plausible number. It rests on
§16's runtime segment, which is the half this was built to be useful with.

---

## 36. `momolo` - layout

**Built.** An immediate-mode layout engine in `shared/lib/momolo/`, ported from a
study of [Clay](https://github.com/nicbarker/clay) - `STUDIES.md` has the
provenance and the method. `momolo` runs six scenes and prints every resolved box
as bare numbers; `mlodemo` draws one of them at 80x25.

**It is pure geometry.** No text, colour, borders or drawing, which is the largest
single departure from Clay. `shared/lib/mopaint.momo` is the layer it deliberately
does not have: a border lives there rather than in the engine because a border is
not geometry - it is a decision to draw something in space the caller already
reserved, and what the engine gets told is an inset it would have needed anyway.

**Elements are one flat array**, pushed as they open, a parent collecting its
children when it closes. Every entry point returns the element's index, and that
index is the only handle momolo hands out - which is how a caller joins its own
tables onto the geometry without the engine knowing they exist. `mopaint` keeps
its style table exactly that way.

**Four passes, and the caller drives them.**

| | |
|---|---|
| fit | a container wraps tightly around its children. Runs from `closeBox` rather than a traversal of its own, since children necessarily close first - which is what makes it free |
| size | settle every child's extent along one axis, breadth-first, once per axis. Surplus and deficit are mirror images |
| refit | re-accumulate heights after the caller has changed some, between `sizeX` and `sizeY` |
| place | turn sizes into positions, depth-first over an explicit stack |

**momolo never calls out.** Clay reaches a measure callback from inside its own
pass; momolo stops between passes, lets the caller wrap text, and carries the
answer up when it resumes. That is what `refit` is for.

**What it asked of the language: nothing.** It was written against §18's `group`,
§11's `include` and `local` and §8's parameterised consts, and needed no compiler
change - which is the strongest evidence any one program has given that the
language is finished enough to build on. §18 is why: momolo's element is a flat
record of integers with no nesting, so each field becomes its own array and
`el[i].w` is `el__w[i]`, with no multiply for the index.

**The config is a `group`, and single-use.** Fourteen optional fields with
defaults is an object literal in TypeScript and has no spelling here, so the
config is one `group` written before the call and consumed by it. The builder
copies it onto the element and resets, so a call site sets only what differs and
nothing has to remember to reset. The first design asked the caller to reset, and
the first scene written against it forgot - `build.momo` records what that cost.

**Nesting is a convention, and that is the open part.** `boxOpen` and `closeBox`
must pair and nothing checks; worse, a wrapper may open more than one box, so
pairs are not one-to-one with call sites - `stripOpen` opens two and `stripClose`
closes two. `PLAN.md` carries this as a question.

**It is resolution-independent.** The caller decides what a unit is: `mopaint`
makes it a character cell, and the same scenes have been run against a pixel
target where a unit was 11 or 20. Both programs include `shared/scenes/shell.momo`
rather than either owning it, so the picture is made of the tree the numbers
verified.

The detail is in the file headers, which are the record for this library.

---

## 37. `momovec` - vector rasterisation

**Built, and not finished** - `PLAN.md` has what is open. Normalized paths in,
pixels out, integers throughout, in `shared/lib/momovec/`, ported from a study of
Alois Zingl's curve algorithms; `STUDIES.md` has the provenance. Nine programs
exercise it in tier 2 and two more draw.

**The interface is two routines, and the library never learns what they do.** A
program supplies `plot` and `emitSpan`; `tiger` accumulates a digest and
`tigerpic` writes mode 13h, and none of that difference reaches the rasteriser. A
library file may call a routine the *program* defines, and it compiles to a direct
`call`. **That is what §19's routine parameters would have been for, and it needed
no language feature at all** - the clearest case here of a design being met by
what already existed.

**Alternatives are chosen by which file you include.** `direct.momo` or
`zoom.momo`, never both; `quadflat.momo` or `subdiv.momo` likewise. Each pair
defines the same names and the program picks. Because they are parameterised
consts (§8), a program that does not transform pays nothing - not a call, not a
compare - and the golden `.asm` of every project that does not use them is
unchanged by the indirection existing.

**A transform is applied as geometry is read, not baked into data.** A translation
can be baked, because it does not change how many points there are. A zoom does:
the 3x tiger needs 13,982 points against 8,014, which came to 84,914 bytes against
a 64 KB segment - it built, ran, and printed zeros. So `tzoom` scales on read, and
the extra segments a curve flattens into are generated on the fly and never
stored.

**It is why §25 exists.** The multiply behind that zoom is what wanted fixed
point, and `mulshr8` is what makes it about 181 cycles rather than 901.

**Filling is a nonzero walk with an unsigned accumulator**, which is the whole
argument for nonzero on this machine: nonzero asks only whether the winding is
zero, never what it is. Clipping comes in two kinds - rejection, where a path
outside the view is dropped whole (`tpan`), and clip paths, done by span
intersection with no sweep line at all (`tclip`).

The detail is in the file headers, which are the record for this library.

### Why these two and not `shared/lib/std/`

`std` has accumulated as programs needed it rather than being designed, and it is
still moving. A section describing it would be drift surface bought at full price,
for a description likely to be wrong within a few commits - and keeping documents,
comments and code in step is already a standing cost here rather than a spare one.

So the criterion is not size or importance. **These two have sections because they
were designed in full, elsewhere, before they were written** - there is a settled
thing to describe, and citations that need somewhere to land. `std` has file
headers, which are the right weight for something still finding its shape.

---

## 38. File I/O

**Built.** DOS files by handle, in `shared/lib/std/file.momo`: open, create,
close, read, write and seek, with `fileSize` over the top. `filetest` is the
worked example (§14).

**None of it is a language feature**, which is the thing worth knowing about this
section. `int`, the register builtins, `addr()` and `_cf` (§10) are between them
everything file handles need, and `cftest` had already opened a real file before
any of this existed. It is the second design met by what was already there, after
§37's routine indirection.

```momo
handle = fileCreate( addr( name ) )
n      = fileWrite( handle, addr( out ), 64 )
fileClose( handle )
```

### A buffer has to live in this segment

DOS takes it as **DS:DX**. The register builtins are AX, BX, CX, DX, SI and DI -
there is no `_ds` to write and no `_es` at all, `far` (§16) drives ES for its own
accesses rather than offering it, and `_ds` (§35) reads DS without moving it. So
`DS = CS` holds everywhere and cannot be suspended for the length of a call.

Every read and write therefore lands in the program's own segment, and anything
larger stages through a `view` of `_heap` (§17) and copies out to `far` memory.
A mechanism for pointing DS elsewhere across one call is **rejected rather than
overlooked**: `DS = CS` is what makes every global a bare displacement (§10), and
§16 already records what that discipline costs for the register that does *not*
underpin the memory model.

### The capture rule, which is where the design earned its keep

`_cf` holds the carry from the **most recent** `int`, so a library that left it
for the caller to read would be correct exactly until somebody put a `putStr`
between the call and the check.

So every routine captures before it returns. `fileCapture` does it once and the
six share it - safe because a `call` cannot disturb `_cf` or `_ax`, only another
`int` can, and the emitted sequence is `call int21` then `call fileCapture` with
nothing in between.

`fileFailed()` and `fileError()` are what a caller asks. A short read is not a
failure: it is end of file, and telling the two apart is what the status pair is
for.

### What is out of scope, and one collision

Directory enumeration, attributes, rename and delete. Enumeration is out for a
reason rather than for tidiness: `FindFirst` writes to the Disk Transfer Area,
which defaults to **PSP:0080h - the command tail**. A program that enumerates a
directory destroys its own arguments unless it reads them first or moves the DTA
with `AH=1Ah`. Neither is hard; both are invisible until they bite.

Handles are finite: a `.COM` inherits twenty with five already open, leaving
fifteen. Ample for an editor, thin for a shell that keeps assets mapped.

### The test needs nothing on the disk

`filetest` creates its own file, writes a pattern, closes it, reopens it, reads it
back and compares - so every number it prints is one that run produced, and there
is no fixture to go missing or stale. The pattern is deliberately not one repeated
byte, because a short read or a buffer that was never written would compare equal
against a run of zeroes.

It also opens a file that is not there, and checks the failure reports DOS error
2. A library that reported everything as fine would pass every other check in it.

---

## 39. `unit`

**Built.** A named numeric type whose values will not mix with another unit's
without a cast. Entirely compile time - nothing reaches the emitter, and no
program is a byte larger or a cycle slower for using one. `unittest` is the worked
example (§14).

```momo
unit px = u16
unit ms = i8.8

px x = 40
ms t = 1.5

x = t              // error: cannot put ms in px - it needs a cast
x = px( u16( t ) ) // fine, and now says what it is
```

### What it is checked against

Storage comes from §4's table and scale from §25; a unit is a third axis, decided
by neither. `null` - unitless - is what every value was before this existed.

| | |
|---|---|
| same unit | mixes as §4 says, and the result carries the unit |
| different units | an error, whatever the widths or the scales |
| comparison | `bool`, which carries nothing |
| an untyped constant | takes the unit of whatever it meets |
| a *typed* unitless value | an error - it means something, and what it means is the question |
| `unit` with a plain count, `*` or `/` | keeps the unit |
| `unit / unit`, same unit | unitless: a ratio is a plain number |
| `unit * unit` | an error - that is an area, and there is no name for one here |
| a shift | keeps the unit; the count counts bits |

**An untyped constant adopting the unit is what makes this usable**, and it is
§25's conclusion reached again: without it `x + 1` needs a cast, every expression
grows one, and casts nobody reads are worse than no checking at all.

**The design widened one rule during the build.** It had said a unit combines with
an *untyped* value under `*` and `/`; it takes any unitless value. A runtime count
is exactly as dimensionless as a literal one, and `w * n` in a loop is ordinary
code that the narrow rule would have rejected.

### `unit` subtracts a permission, which nothing else here does

Every other feature in this document adds something. This one refuses expressions
§4 currently allows, and that is the whole of its value: the mistake it catches is
one the type checker previously had no opinion about.

`tennis` is what asked for it, and had been paying for the absence by hand -
`subgridToPx`, `subPxY`, and a comment reading `// subgrid units`. The unit was in
the identifier, which is the part a compiler cannot check.

### Where the knowledge that `px` is a type lives

**The design did not settle this, and it is the one architecturally interesting
part.** Type names are a *lexer* decision here - `u8` and friends become a distinct
token kind, which is what lets the parser tell a declaration from an expression
with one token of lookahead, and `u8( x )` from a call. A unit name is a user
identifier and gets no such help.

It is settled in the lexer, not the parser. After a file is scanned, its
`unit NAME = TYPE` declarations are collected and matching identifiers are
promoted to type tokens, carrying the storage spelling with them. **The parser
gains no symbol table**, which is what a parser-side answer would have meant: C's
typedef problem, where `px x` is a declaration or not depending on what came
before it.

The loader needed a first walk for it. A file is parsed before the includes inside
it are visited, so by the time an included unit was known the file using it would
already be an AST. That walk finds includes in the token stream rather than by
parsing, which is what keeps it cheap, and it makes units **program-wide rather
than include-ordered** - so a unit may be used above its own declaration, which is
one rule fewer than the alternative.

### What it cost

Nothing at runtime, which is asserted rather than argued: `ok-unit-typed.momo` and
`ok-unit-plain.momo` are the same program with and without units, and tier 1
requires them to emit the same instructions. The golden tier cannot make that
check - it compares committed output against itself, and would agree with a leak.

In the compiler, a `unit` field beside `frac` on `Resolved` and on every symbol
that carries a type, and it is **required** for the reason §25 made `frac`
required: a forgotten one is a silent loss of exactly what the feature exists to
catch. Thirty-two construction sites, all found by the type checker.

And one cost with no way to avoid it: **a new keyword takes a name away from
programs.** One test file was using `unit` as a variable.

### Units are viral at a library boundary

Worth knowing before reaching for one. Everything in `shared/lib/std/` takes plain
types, so a unit value has to be cast to be printed, poked, or passed anywhere -
`putNumber( u16( width + height ) )` rather than `putNumber( width + height )`.

That is the feature working: the cast marks where a measured quantity stops being
one and becomes a number. But it means a unit is most useful inside a body of code
that shares it, and least useful at the edge where that code meets a library that
does not.

---

## 44. Declaring the counter in a `for`

**Built.** The counter of a three-clause `for` is declared in its init clause
rather than on the line above. `ok-for-decl-sugar.momo` is the worked example, and
`ok-for-decl-plain.momo` beside it is the same program written the long way:

```momo
for ( u8 i = 0; i < n; i++ ) { ... }
```

It lowers by lifting the declaration to the enclosing declaration space and
leaving the assignment where it was written:

```momo
u8 i
for ( i = 0; i < n; i++ ) { ... }
```

which is how **131 of the 170** `for` statements under `projects/` and `shared/`
were spelled when this was designed. That count is the whole case for it: nothing
here is expressive, and the feature is that a convention every C-family language
shares stops being spelled in two lines. The figure is fixed at the date rather
than maintained, because adoption moved it immediately: **129 loops across 37
files** took it in the first sweep, leaving seven counters that are read after
their own loop and keep their declarations.

### It is sugar, and that is assertable rather than arguable

No instruction changes. The lifted declaration takes the same static slot the
hand-written one takes, and the init clause emits the same assignment it emits
today. §39's method applies unchanged: a pair of files identical but for the
spelling, required to emit the same instructions. The golden tier cannot make that
check on its own - it compares committed output against itself and would agree with
a leak.

**Measured**: 120 instructions, identical.

**Storage does move, though, and only the corpus showed it.** Lifting to the top of
the body puts a counter *before* the declarations it was written after, so the data
section comes out in a different order - **34 labels repositioned across 23 of the
47 projects**, against not one changed instruction anywhere. Same labels, same
widths, same footprint; §12's analysis is untouched, because reordering identical
storage cannot change what it adds up to. The one thing it could touch is which
words land on even addresses, and DECISIONS §27 already measured that as -13% on a
true 8086 and nothing on an 8088 - unmanaged today either way, since the parity
comes from the code size and the compiler emits text rather than bytes.

The pair could not have caught that, and it is worth knowing why: its twin is
written in the *lifted* order on purpose, so the two agree about the data section
by construction. That makes it a clean test of the instruction claim and no test at
all of the ordering one. The golden tier is what covers the second, and it did so
the first time real code adopted the sugar.

### Two loops, one name, which is the common case rather than the corner

Scoping is flat, global and per-sub, with no block scope, and `locals` is one map
per routine. So a second `for ( u8 i = 0; ... )` in the same routine collides with
`"i" is already declared in this scope` - and two counting loops in a row is
ordinary code, not an edge.

**Two `for` declarations of the same name and type in one body share the slot.** A
mismatch - `u8 i` in one and `u16 i` in the next - is an error rather than a silent
second variable. That is one rule and no new concept, and it is *smaller* than C's
semantics rather than equal to them: C gives each loop its own variable, this gives
them one slot, and for a counter initialised on entry there is no observable
difference.

**The sharing is between two `for` declarations, and the design did not say so.**
Against a declaration written out in full - `u8 i` at the top of a routine and
`for ( u8 i = 0; ... )` below it - the answer is the collision it already was,
because scoping is flat and there is nothing for the second to shadow. That reading
is the better one anyway: the two spellings in one body are confusing code, and
`"i" is already declared in this scope` says what to drop.

It also keeps the whole feature in the parser. The sharing is a dedupe of the
frame a body's lifted declarations collect in, so **the resolver is untouched** -
it never sees a second declaration and needs no rule of its own, the same way it
never learns about `=>`.

Real block scope is the alternative and the resolver already declines it, at the
top of `resolver.ts`: locals are statically allocated, so a block-scoped variable
would be another static slot under a different name, all cost and no benefit. That
reasoning is unchanged here.

### The scope is flatter than the spelling suggests, and that is not new

`i` outlives the loop and holds its terminal value. Every other C-family language
scopes it to the braces, so the spelling imports an expectation the language does
not honour.

It is not a new exception, though. §5 already requires the reader to know that a
declaration inside a routine is static: its `putBar` example exists to say that a
*second call* finds `n` still at 3. This extends a rule that is already load-bearing
to one more position rather than adding a second rule beside it. It still wants a
sentence in §5, because the reader arriving from C will not have that rule in hand.

### No initialiser reaches a for-init, which is what §5's rule turns on

§5 says an initialiser is a **load-time value and is only allowed at the top
level**, and records that emitting one as code where it is written was rejected for
its asymmetry. `for ( u8 i = 0; ... )` looks like exactly that alternative, and
whether it is was the last thing this section had open.

It is not, because the parser lowers it. What reaches the resolver is a declaration
carrying no initialiser and an ordinary assignment statement in the init clause, so
**no initialiser exists in a for-init position at any point anything downstream can
see.** `resolveVariableDeclaration` refuses one with a single guard - `!atTopLevel
&& node.init` - and a lowered declaration has no `init` for that guard to find. The
resolver never learns this happened.

That is the mechanism the language already runs on rather than a special case built
for it. `=>`, `else if`, compound assignment, prefix and postfix `++`, adjacent
string literals and `group`'s `.` are all surface forms the parser turns into
something else, and §7 says of `=>` that the resolver and emitter never see it.

**§5's reasoning points the same way**, read closely. An initialiser is honest only
where "before the program runs" and "when control reaches this line" are the same
moment - and inside a for-init clause they are emphatically not, which is precisely
why the form has to lower to an assignment. The rule decides which of two readings
applies; it does not forbid the characters. What §5 rejected was a declaration in a
body silently *staying* an initialiser and running once. This one runs every time,
visibly, because everything in that clause does.

So what is left is a reading cost rather than an exception to own: `u8 i = 0`
inside the parentheses is two statements, and a reader has to know it. That is one
sentence in §5, and `npm run desugar` shows it, which is what that tool is for.

### Where the lifted declaration goes

**To the top of the routine body**, or of the file's own statement sequence for a
loop written at the top level.

This wanted deciding rather than discovering, because both candidates are valid
Momo, both reparse to the same AST and both emit the same instructions - so the
**round trip cannot catch an inconsistent choice**, which is unusual here. The
other candidate is immediately before the loop that declared it, which is more
faithful to what was written. It loses to the sharing rule above: one slot can
serve two loops in different blocks, scoping is flat, and placing the declaration
inside whichever block came first would put it inside an `if` while serving a loop
outside it. Valid, and misleading. The top of the body cannot read wrong.

The design put this on the printer, and it is the parser's. The parser collects a
body's lifted declarations and unshifts them when the body closes, so the position
is in the AST before the printer sees it - and **the printer needed no change at
all**, which is the strongest thing anyone can say about a claim to be sugar. The
round trip covers the new syntax because it already compiles every `ok-` file.

### Rules

- **Three-clause `for` only.** A declaration in the init clause, never in the test
  or update.
- **One declaration**, not a list. `for ( u8 i = 0, j = 0; ... )` is an error;
  there is no comma declarator anywhere else in the language and this is not the
  place to introduce one.
- **An ordinary scalar variable, and nothing else** - which follows from §5 rather
  than being stipulated here. `for ( u8[4] buf = [ 1, 2, 3, 4 ]; ... )` cannot
  lower at all: Momo has no array assignment, so there is nothing to lower the
  initialiser *to*, and load-time is the only thing an array initialiser could ever
  be. That is §5's own argument, unchanged. The same test disposes of the rest -
  `const` has no storage to assign, a `view` is a compile-time alias with nothing
  to assign, a `far` region is top-level-only because a hardware address is not
  scoped, and `local` inside a routine is already refused with its own message.
- **The initialiser is required.** `for ( u8 i; ...; ... )` declares without
  assigning, which is the load-time reading this section spent a heading avoiding.
- **Same name and type reuses the slot; a mismatch is an error.**
- **A sub-local still shadows a global**, exactly as a hand-written declaration in
  a routine does. No new rule.

### What it cost, and what is still out

**The parser and nothing else.** One function, a stack of frames for a body's
lifted declarations, and the exclusions. The resolver, the emitter and the printer
are untouched.

The error messages were most of the work, which is worth recording because it is
not where the effort was expected. Nine ways to write it wrong were probed. Five
already said something useful - four purpose-written, and the collision against a
full declaration reusing the resolver's existing message. The other four failed as
`expected ";" but found ","` or `expected ident but found "const"`, which say what
the parser wanted rather than what the writer should do, and got messages of their
own. That is `STYLE.md`'s bar rather than a nicety: each of those four excludes
something for a reason §5 supplies, and an error that names none of it leaves the
reason unreachable.

Out: block scope, comma declarators, and any inference of the type. Momo is
type-first everywhere and a counter's type is observable in §4's mixing - `u8 i`
against `u16 i` is a different program - so it is written rather than derived.

---

## 45. `for ( x in a )` and `for ( x of a )`

**Built.** Two sugars over the three-clause `for`, for the case where the bound is
a thing rather than a number. `ok-for-iter-sugar.momo` is the worked example, and
`ok-for-iter-plain.momo` beside it is the same program written the long way:

```momo
for ( u8 i in mob ) { mob[ i ].hp = 100 }     // i counts
for ( m of mob )    { m.hp = 100 }            // m names
```

`in` binds a **counter**; `of` binds a **name for the indexed access**. They are
different enough to be worth both, and the difference is visible in the spelling:
`in` takes a type because it declares storage, `of` takes none because it declares
nothing. `for ( u8 m of mob )` is an error.

### `in` is `len`, and `len` already answers every shape

```momo
for ( u8 i in buf ) { ... }
->
u8 i
for ( i = 0; i < len( buf ); i++ ) { ... }
```

`len` folds to an untyped constant, so the bound is a NASM `equ` and the emitted
code is what the hand-written loop emits. It needs no resolver work at all: `len`
already spans arrays, sized `far` regions and indexed groups - returning the
instance count for the last of those - and already refuses the heap and the
single-instance group form with messages written for exactly this question. `in`
inherits the coverage and the diagnostics.

The declaration is §44's. `for ( i in buf )` with `i` already declared is the
other half, and the same rule decides which one is happening.

### `of` binds a name to an access, not a value, and that is the whole design

The obvious reading - `of` binds a copy of the element - is the wrong one here,
and it is worth saying why, because it is the reading every other language
supplies.

A copy needs storage, costs a load and a store per iteration, is worse than
indexing when the body reads the element once, and silently discards writes:
`for ( v of buf ) { v = 0 }` would not clear the array. It also cannot reach a
`group` at all, because §18 has no record for `mob[i]` to denote.

Binding the **name** instead has none of those properties:

```momo
for ( m of mob ) { m.hp = 100 }
->
u8 __i
for ( __i = 0; __i < len( mob ); __i++ ) { mob[ __i ].hp = 100 }
```

`m.hp` resolves to `mob__hp[__i]`, which is what §18 already does with `.` - the
parser hangs a field marker on the identifier and the resolver does the lookup. `m`
is a symbol carrying a target and an index expression, and nothing about it reaches
the emitter. No copy, no storage, no record, no change to `ValueType`.

Writes work, because there is nothing to write back through: `m.hp = 100` is an
ordinary array store. The same holds for an array, where `v` is `buf[__i]` and
`v = 0` clears the element.

### §17 does not object, and both halves of its objection are answered

§17 excludes runtime view offsets deliberately, on two grounds. A runtime view is
a **fat pointer**, base plus length, and Momo has no pointers - but this binding
stores nothing at runtime; the index expression is substituted at resolve time and
the only storage is the counter. And it would become **the de facto way to pass
arrays to routines** - but a binding cannot be passed anywhere, since routines take
scalars and the name is confined to the loop body.

Static views stay sugar, which §17 says is their whole appeal. This is the same
claim one step along.

### `group` is the best case, and §18's rule survives unchanged

`mob[i]` alone is not an expression, because no record exists for it to denote.
**`m` alone is not one either** - only `m.field` is, and the error says so. So this
does not widen §18's rule; it reuses it under a shorter name.

That matters more than it sounds. §18 says the design pushes toward passing
*indices* rather than entity references, and nothing here pushes back: an index is
still what crosses a routine boundary, because a binding cannot.

### `of` covers a `far` region, and the reload it seems to hide is already priced

This reads like the one case to carve out, and it is not. `rndpix` already walks a
far region end to end - `for( i = 0; i < len( pixels ); i++ )` over mode 13h - so
the use case exists and is the obvious one.

The objection is that `p` does not announce a far access the way `pixels[i]` does,
so the ES reload per access goes unmarked. But **the lowering is the longhand**:
`for ( p of pixels )` produces exactly the statement that file already contains, so
nothing is hidden that `pixels[i]` does not hide and no cycle is paid that was not
being paid. §34 has already priced that reload - break-even for hoisting it is
three accesses, a routine doing one far write is a net loss, and the whole effect
measured 1-4% and was called never the biggest thing left. §16's premise is that
`far` makes hardware memory *ordinary memory*, so `p` reading like a name is that
design continuing rather than leaking through.

What settles it is the shape of the rule. Every exclusion in §44 is derived from
something the reader already knows; excluding `far` here could only be remembered,
because nothing generates it. Contrast the exclusion this language did make - `len`
on a single-instance group errors, because answering 1 would compile a loop that
reads as iteration and is not. That one is semantic. This one would not be.

### It can be scoped properly, which §44 cannot

The resolver declines block scope because a block-scoped variable would be another
static slot under a different name. **This binding has no slot**, so the reasoning
does not reach it: push the name on entry to the body, pop it on the way out, and
it genuinely dies at the closing brace.

So the two forms answer the scoping question differently, and for a reason rather
than by inconsistency. §44's counter has storage and stays flat; `of`'s name has
none and does not.

### What it costs

One static slot per `of` loop, for a counter the program never named and cannot
name. §12's footprint stays exact and stops being fully attributable - `npm run
memory` reports a byte or a word that appears in no source line. Naming it after
the loop target makes it legible in the report without making it reachable.

That is the whole cost. If the body needs the index, that is what `in` is for,
which makes the two complementary rather than competing.

### What wanted it, and the prediction that was wrong

**34 of the 170 `for` statements walk a container's full extent**, which is what
these two forms serve - a fifth of the loops here, rather than the handful a
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

Where `of` earns its place is density rather than count. There are 281 indexed
field accesses - `el` 177, `player` 33, `st` 30, `held` 24, `mob` 8 - and they
cluster: a five-line body in `momolo/fit.momo` reads `el[ci]` four times, and the
four statements below it read `el[i]` twelve times. That is what `of` is for.

### What adoption actually found, which is thinner than the above

Classifying all 160 loops put 12 on a `len( X )` bound, 39 on a const that also
sizes some X, and 109 on neither. **Eight took `in` and one file took `of`**, which
is the honest yield and is worth writing down beside the paragraph promising more.

The 39 do not adopt in bulk. `screenH` and `maxPaths` are a dimension and a
capacity that several arrays share, so `for ( y in rowPixels )` would be correct
and would name one of six co-sized arrays as though the loop were about it. The
loop is about screen rows, and `screenH` says so.

**And `of` has almost no site here.** Every array loop it can reach turned out to
be a single-access fill or clear - `pathPixels[p] = 0` six times over, `pixels[i] =
u8( nextRandom() )` - where naming a binding costs a reader more than `X[ i ]` did.
`of` pays for itself on a *group*, where the binding names an entity, and on a body
dense enough to repeat the access; the corpus's dense bodies are momolo's, and
those are indexed by computed indices that `of` cannot reach at all.

That is the measurement rather than a disappointment: `of` is built, costs nothing,
and `grptest` uses it. But a reader deciding whether to reach for it should know
that one program in the repository does.

### The general form this is a special case of, and why it is not here

Most of those 281 are **not reachable by `of`**, and that is the finding rather
than a caveat. In the `fit.momo` loop the index is `ci = childAt( i, k )`, computed
rather than counted; the block below it indexes by `i`, a routine *parameter*. The
index histogram is `i` 195, `pi` 23, `ci` 19, `rightPlayer` 16, `leftPlayer` 16,
and several of those are plainly not counters.

What the corpus is asking for is **naming an instance at an arbitrary index**, of
which "the current iteration" is one case:

```momo
alias c = el[ ci ]
contentH    += c.h
minContentH += c.minH
```

Same mechanism, same absence of storage, and it reaches all 281 sites rather than
thirty. It is not here for one reason: **the binding would capture a variable it
does not own.** `alias c = el[ ci ]` followed by an assignment to `ci` silently
re-points `c`, which is §6's compound-assignment hazard one level up - that rule
already refuses an index that could be evaluated twice and mean two things. The
`for` forms are immune by construction, because the compiler owns the counter and
no statement in the body can write it.

So the loop forms are buildable now and the general one needs a rule about what a
binding may capture. If that rule gets written it takes its own number, the way §16
spun out §34 and §35.

### The count form, which is deliberately out

`for ( u8 i in maxPaths )`, meaning `0 .. maxPaths - 1`, would cover the 131 loops
§44 covers and the 12 that `in` covers with one form. It is out of the first build
because it makes `in` mean two things - an extent in one operand and a value in the
other - for a gain that §44 has already mostly taken. It is in Maybe rather than
rejected: nothing has wanted it, which is exactly what that tier is for.

### Rules

- **`in` declares a counter** and follows §44 for whether the type is written.
  `for ( i in a )` uses an existing `i`.
- **`of` declares nothing** and takes no type. Its name is scoped to the loop body.
- **Neither is a keyword.** After the name in a `for` header, one token of
  lookahead accepts a contextual `in` or `of`, so both stay available to programs -
  and there are no collisions in the corpus today to grandfather. §39 had to pay a
  name for `unit`; this does not have to pay two.
- **`of` names an element or an instance, never the whole.** `m` alone is an error
  and says what to write instead, as §18's group rule already does.
- **The operand is a name**, not an expression - an array, a sized `far` region, or
  an indexed group. The heap and the single-instance group form are errors, and
  `len` already writes both messages.
- **Nothing may assign to the counter inside the body.** It is the compiler's, and
  the `of` form's immunity to the capture hazard above depends on it.

### What it cost, and the three things the design did not settle

**The parser, again, and nothing else.** `in` builds the three clauses against
`len`; `of` builds the same clauses and then rewrites every use of its binding in
the already-parsed body into an indexed access. The resolver and the emitter are
untouched, and **the printer needed no change** - it prints the lowered loop,
which is ordinary Momo that reparses to the same program.

**The `of` counter is always `u16`.** Its bound is `len( a )`, a constant the
parser cannot see, and a counter narrow enough for one array would be wrong for
the next - so `in` is where a program that cares chooses the width.

That was written expecting it to cost something, and the measurement went the
other way. `grptest` took `in` once and `of` twice, and came out **three
instructions shorter at exactly the same 492 bytes**. A word counter costs a byte
on each `cmp` and each initialising `mov`, and saves the `xor ah, ah` that
widening a `u8` index into BX needs - one instruction per indexed access, and a
body indexes more often than its header compares.

**Sequential `of` loops share a counter**, the way two §44 declarations of one
name do. A counter already lifted into this body is handed out again unless it
appears inside the loop being built - bodies are parsed before their headers are
constructed, so a counter turning up in there belongs to something nested and is
still live.

That is measured rather than assumed too, and it is why the rule exists: without
it `grptest` was two bytes *larger*, paying for two dedicated slots where the
hand-written form had reused one `i` across three loops. Nested loops keep
distinct counters, which the identity pair holds by carrying a nested case.

**The counter's name carries the file it came from** - `of__tiger__0` and so on.
The loader splices every file's top level into one program, so two files each
holding a top-level `of` would otherwise declare the same name twice. The number
runs in construction order rather than source order, so an inner loop gets the
lower one; that shows up in `npm run desugar` and nowhere else.

**And `of`'s errors name the target rather than the binding**, which the design
claimed otherwise. Nothing survives the lowering for a diagnostic to point at, so
`m` written bare reports against `mob`. What it says was worth fixing anyway: §18
answered `mob[ i ]` with "not an array", which tells a reader nothing, and it now
names a field to write instead. That helps the ordinary group case as much as this
one, which is the argument for having gone and changed it.

Out: the count form, the general `alias` binding, and any spelling that hands `of`
its index - `for ( m, i of mob )` is the shape that will be asked for, and `in`
already answers it.

---

## Sections designed, but not built

Twelve sections carry numbers but no text here, because what they describe does
not exist yet. All are in `PLAN.md`. The heading names no range deliberately - the
set stopped being contiguous the moment one of them was built.

| | |
|---|---|
| §28 | CPU target levels - what `--cpu` would buy, and why 386 is not only a backend switch |
| §29 | `-o` |
| §30 | Hosted targets: JS, WASM, native |
| §31 | Dropping the assembler |
| §32 | Self-hosting |
| §33 | Other CPUs - `momo/z80`, `momo/6502` |
| §34 | Hoisting the ES load, which §16 leaves reloading per access |
| §40 | Memory past the segment |
| §41 | `momowad` - asset storage |
| §42 | A test tier below DOSBox |
| §43 | The screen library |
| §46 | `alias` - a name for an indexed access, which §45's `of` is one case of |

---

## 20. Open questions

What is genuinely unsettled. Questions that have since been answered are not
kept here with the answer attached - they are in `DECISIONS.md` §20, because a
list of open questions that is mostly closed ones stops being a list of open
questions.

- **Real functions.** a typed routine is sugar over globals, so it still cannot recurse or
  be reentrant. Genuine stack frames would bring back BP, `lea` and recursion -
  and would destroy the exact static memory analysis, which is the trade that
  keeps them out.

- **A graphics library.** Access to the hardware is no longer the question - `far`
  (§16) makes the text buffer and mode 13h ordinary memory, and `view` (§17) names
  a row or a tile inside either. What is open is the library over it: mode setting,
  sprites, clipping, and the scroll bookkeeping. `shared/lib/mopaint.momo` is the
  nearest thing and is deliberately narrow.

- **A direct-write path for `std/screen.momo`.** Every routine in it goes through
  `int 10h`, which is an interrupt per cell. That was the only option when the
  file was written; `far` (§16) and `view` (§17) have since made the B800:0000
  text buffer ordinary memory, and `shared/lib/mopaint.momo` writes it directly - so the
  capability is built and demonstrated, and only the library has not moved.

  What stops it being obvious is that the two have different obligations.
  `std/screen` must not disturb ES, because any caller may be mid-`far` access;
  `mopaint` owns its whole frame and can. So the question is not "is direct
  writing faster" - it is whether one library can offer both without the fast
  path quietly breaking the slow one's guarantee, or whether the honest answer is
  that `mopaint`'s existence already *is* the answer and `std/screen` should stay
  what it is. Nothing has needed it yet: the programs that want speed are the
  ones that already reach for `far` themselves.

- **A raw scancode reader in `std`.** `std/key.momo` is `int 16h`, which blocks
  and reports one key at a time. `tennis/t_kbd.momo` has the other
  thing - IRQ1 masked, the 8042 polled directly, make and break tracked as level
  state per player, plus the sticky latch a tap needs. Every hard-won entry in
  `PITFALLS.md` came out of writing it, and none of that knowledge is in `shared/lib/`.

  Port I/O (§22) is what made it possible, and it landed after `std/key.momo` was
  written, so this is a gap rather than a decision. Against moving it: a raw
  reader is not a drop-in for a blocking one, it needs shutdown discipline the
  BIOS version does not (unmasking with a key held puts a keystroke at the DOS
  prompt), and one game is a thin basis for an interface. A second program that
  wants held-key input is the thing to wait for, and §24's chained `int 9` would
  change the shape again.

- **`asm { }` passthrough** for hand-written NASM. Probably not needed for a long time.

- **What precision does constant folding happen at?** - **open; the analysis is
  in §32.** The folder runs on the host's numbers, so `30000 * 30000 / 30000`
  folds exactly and lands in a `u16`, at a precision the language itself cannot
  express. That is defensible, but it is an accident of the host rather than a
  decision, and it is listed here because it is a *language* question that
  happens to have been noticed while thinking about self-hosting. Three ways out
  are set out there; none is chosen.
