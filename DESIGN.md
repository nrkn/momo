# Momo — language design

A small imperative language that transpiles to commented NASM source for a
minimal 8086 subset. Source files use the `.momo` extension.

Named after a cat, continuing the tradition set by
[Yuki](https://github.com/nrkn/yuki-js) — the earlier language. The Pong in
`_reference/yuki.txt` is written in it, and is the reference point for "level of
language" we are aiming at.

**Why.** Three reasons, and this document is mostly the third.

Primarily, to write small games and tools. Secondarily, to show that x86
assembly is not overwhelming if you start with a small subset and work up —
which is why the ISA is subsetted at all (§1), why the target is a DOS `.COM` in
tiny model, and why the output is commented NASM meant to be read rather than an
intermediate meant to be trusted. Where a decision below looks austere, that is
usually the reason: the constraint is doing work.

And to settle language ideas that have been rattling around for a decade or
more, across a series of small prototypes — Yuki above is the one that survived.
That is why this file argues rather than specifies, and why §16, §17 and §19 were
written out in full before being built: an idea worked through is worth having on
paper even when nothing needs it yet. Momo is where they finally have to compile —
and §16 and §17 both did, close enough to what was written down that the sections
needed correcting rather than rewriting.

**Status.** §1–§18 describe what is built. §19 is designed and not yet built, and
says so in its heading. §20 collects open questions,
§21 longer-term directions. Section numbers are stable — `group` was built where
it sits rather than renumbered into the built range, because the numbers are
referenced from source comments and from each other.

---

## 1. Target

| | |
|---|---|
| Output | Commented NASM source, assembled with `nasm -f bin` |
| Format | `.COM`, `org 100h` |
| Memory model | Tiny — `CS = DS = ES = SS`, one 64KB segment |
| CPU | **Strict 8086.** No 186+ instructions. Revisit later. |
| Toolchain | NASM only. No linker, no `.obj`, no relocations. |

Tiny model means CS, DS and SS are never emitted, never overridden, never thought
about — one segment holds code, data and stack, so nothing in ordinary Momo has a
segment to name.

**ES is the one exception, and only where `far` (§16) is used.** A far region
names memory outside our segment, so the emitter loads ES and prefixes the access
with `es:`. Nothing else touches it, the int helpers preserve it, and a program
with no `far` declaration emits no segment register at all.

### Instruction subset — 37 mnemonics

| Group | Instructions |
|---|---|
| Move | `mov` `push` `pop` |
| Arith | `add` `sub` `inc` `dec` `neg` `cmp` `mul` `div` `idiv` `cbw` `cwd` |
| Logic | `and` `or` `xor` `not` `test` `shl` `shr` `sar` |
| Control | `jmp` `je` `jne` `jl` `jle` `jg` `jge` `jb` `jbe` `ja` `jae` `call` `ret` |
| System | `int` `pushf` |

`jz`/`jnz` also appear in the output. They are the same instructions as
`je`/`jne` — NASM assembles both spellings to one opcode — and the emitter uses
the z-spelling after a `test`, where "zero" is the honest reading, and the
e-spelling after a `cmp`. Spellings, not additions: the count stays 37.

Deliberately absent:

- **`lea`** — no pointers, and `[disp16 + bx]` covers array indexing in one instruction.
- **`imul`** — the low 16 bits of a multiply are identical signed and unsigned in
  two's complement, and with no 32-bit type we never read `DX`. `*` always emits `mul`.
- **`enter`/`leave`, `pusha`/`popa`, 3-operand `imul`, `push imm`, `shl r,imm8`** — all 186+.
- **`setcc`** — 386+. This is why conditions compile in control-flow context (§9).
- Segment ops, BCD/ASCII adjusts, `in`/`out`, `xlat`, far calls.
- **Flag manipulation**, with one exception. `pushf` earns its place by being the
  only way to read carry without `setcc` (386+), and carry is how DOS and BIOS
  report failure — see `_cf` in §10. It appears once per int helper and nowhere
  else. `popf`, `clc` and `stc` stay out, which is what keeps `_cf` read-only.

Width extension needs no extra mnemonics: `u8→u16` is `xor ah,ah`, `i8→i16` is
`cbw`, `u16→u32` (before `div`) is `xor dx,dx`, `i16→i32` (before `idiv`) is `cwd`.

---

## 2. Execution model

**Nothing lives on the stack except return addresses and expression
temporaries.** Every variable is a fixed label — a link-time constant.
Consequences:

- **No frame pointer.** BP is never used. No prologue, no epilogue; a sub is a
  label and a `ret`. Routine parameters are mangled globals, not stack slots.
- **No stack frames.** The stack holds return addresses and expression
  temporaries only.
- Variables declared inside a sub body are statically allocated with a scoped
  label. Same codegen as a global, just name-scoped — which is why they may not
  carry an initialiser (§5): there is no per-call storage to initialise.
- **Recursion is a compile error.** Because locals are static, a recursive call
  overwrites its own caller's variables — it is never useful, only ever a bug.
  The resolver builds the call graph and rejects any cycle, naming it:

  ```
  error: recursion is not supported: a -> b -> a - locals are statically
  allocated, so a recursive call overwrites its own variables
  ```

  Proving the graph acyclic also makes worst-case stack usage a static
  quantity — see §12.
- Top-level statements form the entry point, emitted at `org 100h`.

### Three callable forms

| | | |
|---|---|---|
| `sub tick { }` | no arguments, no return | may omit the empty parameter list |
| `sub move( u8 dx ) { }` | arguments, no return | *private* mangled globals, real `call` |
| `u16 add( u8 a ) { }` | arguments and return | type-led, like a variable |
| `const sqr( u8 n ) = n * n` | arguments, single expression | substituted, no call emitted |

They differ by what they *are*: a `sub` returns nothing, a typed routine returns
a value, and a `const` is not called at all — it is substituted.

The split is also a teaching order: `sub` alone is a usable language, arguments
and return types add checking on top of it, and `const` adds compile-time
evaluation on top of that.

`return` is a bare early exit in a `sub`, and carries a value in a routine with
a declared return type.

**Every path must return.** A routine with a return type that can reach its own
end is a compile error, not a zero. There is nothing sensible to fall through
to: the return value is a mangled global, so falling off the end hands the
caller whatever the previous call happened to leave in that slot — a wrong
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
- **Only a bool may be assigned to one.** The store is a raw byte — no
  normalisation is emitted — so admitting a scalar would let a bool hold 2,
  where `if (b)` says true and `b == true` says false at once. Write the test
  (`x != 0`) or the cast (`bool(x)`), both of which produce a real 0-or-1.
  Constants follow §4's fit rule against bool's range of {0, 1}: `b = 1` is
  fine, `b = 2` is an error. A `?:` whose arms are both bool stays bool — the
  result is one of the arms, not arithmetic over them. Applies wherever a value
  meets a declared type: initialisers, assignments, arguments and returns.
  Reading a bool into arithmetic remains free, since it is genuinely 0 or 1.
- `if` accepts any scalar — non-zero is true, so `if (arr[i])` works.
- Fixed-size arrays only. No pointers, no structs, no floats.

**Core rule: all arithmetic happens in 16 bits; narrowing happens only on store.**
`AL`/`AH` are never used as independent registers. Bytes exist as a memory width,
not a register width.

---

## 4. Type rules

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
| **`i8`** | `i16` | `i16` | ❌ | `i16` |
| **`u16`** | `u16` | ❌ | `u16` | ❌ |
| **`i16`** | `i16` | `i16` | ❌ | `i16` |

> **`u16` does not mix with signed types.** Everything else widens to the
> smallest type that holds both.

The two error cells are honest — no 16-bit type holds both a signed range and
`u16`. Use an explicit cast. Note `u8 op u8 → u16`, which is free (we're in AX
anyway) and makes `if (a + b > 255)` behave sensibly.

### Narrowing

Promotion is always upward, so **narrowing can only occur at an assignment or a
cast** — never inside an expression.

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
say otherwise. This also catches negatives going into unsigned targets — `u16 m
= -1` was silently 65535. It applies wherever a value meets a declared type:
initialisers, assignments, arguments and returns all pass through the same
check.

### Untyped means constant

`untyped` is not just "not yet decided" — it means *this is a constant whose type
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
self-inference in isolation. **Scalar `const` is untyped too** — it is a named
literal with no storage, emitted as a NASM `equ`.

This is what makes the strict `u16` rule livable: most mixing in real code is
variable-against-literal, so the error only fires when two genuinely
incompatible *variables* meet.

Array consts need storage, so they need a real element type — inferred from the
widest value, or stated.

### Casts

`u8(expr)`, `i16(expr)` — function-style; type names are reserved words so there
is no ambiguity. Pure truncate/reinterpret, no range check, no runtime cost.
`u8(300)` is 44, `i8(200)` is −56.

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

sub clearScreen {                       // no arguments, no return
  for (y = 0; ; y++) {
    if (y == yMax) break
  }
}

u16 add( u8 a, u8 b ) => a + b          // arguments and a return type

const sqr(u8 n) = n * n                 // parameterised const: one expression
```

- Type-first declarations are unambiguous because the type set is **closed and
  finite** — one token of lookahead, no symbol table. `let` is not needed.
- Array type stays contiguous (`u8[4] foo`, not C's `u8 foo[4]`) — parse a type,
  then a name. No declarator grammar.
- `u8[] foo` with no initialiser is an error. Count mismatch on
  `u8[4] foo = [1,2,3,4,5]` is an error.
- **An initialiser is a load-time value, and is only allowed at the top level.**
  It is written into the data section and never executed, so it is honest only
  where "before the program runs" and "when control reaches this line" are the
  same moment — the program's own statement sequence, unnested. Inside a routine
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
  arrays by the same reasoning rather than by an exception — with no `rep movsb`
  in the subset there is no cheap way to re-initialise an array, so load-time is
  the only thing an array initialiser could ever be, and a rule that held only
  for scalars would make the same syntax mean two things.

  The alternative — emitting the initialiser as code where it is written — was
  rejected for that asymmetry, and hoisting for a sharper reason: running an
  initialiser on routine entry is a **prologue**, and §2 has none.
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
  can begin with a string literal — the parser looks past newlines for another
  one and, finding anything else, consumes nothing.
- **`len(a)`** folds to an array's declared length, as an untyped constant — so a
  map's height is counted rather than stated, and adding a row cannot
  desynchronise it:

  ```momo
  const mapH = len( map ) / mapW
  ```

  It needs no storage, so unlike `addr` it does not keep an otherwise unused
  array alive. `len` on the heap is an error — that size is not known until NASM
  has assembled, so use `_hsize` (§13) — and `len` on a scalar is an error. It
  resolves in declaration order like any name, so it cannot appear above the
  array it measures. Designed as part of §19 and landed ahead of it.
- Comments: `//` to end of line, and `/* ... */` block comments. **Block comments
  do not nest** (C behaviour). A block comment spanning lines counts as a newline
  for statement termination.
- Numeric literals: decimal `42`, hex `0x7F`, binary `0b1010_1010`. `_` is a
  digit separator, allowed between digits only — not leading, trailing, or
  doubled.

Control flow: `if`/`else`/`else if`, three-clause `for` (any clause may be
empty), `while`, `do { } while (...)`, `break`, `continue`, `return` (bare or
with a value). `while` and `do while` are sugar — they share the `for` emitter,
but keep distinct AST nodes so the generated source comment matches what was
written.

**Unreachable code is an error.** Anything after a `return`, `break`, `continue`
or endless loop cannot run. With no preprocessor, no goto and no labels there is
no shape where that is deliberate, so — as with recursion — the thing that is
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
- **Comparison is non-associative** — `a < b < c` is a compile error.
- Compound assignment (`+= -= *= /= %= &= |= ^= <<= >>=`) desugars to
  `x = x op e`, which loads through the index and stores through it again. If the
  index calls a routine it would run twice — possibly landing on a *different*
  element the second time — so that is rejected. Plain `=` and `++`/`--` evaluate
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

**A `sub` is a routine with no return type** — one AST node covers both forms.
Declarations are type-led, matching variables, parameters and casts:

```momo
u16 count                             // a variable of type u16
u16 add( u8 a, u8 b ) => a + b        // a routine of type u16
```

One token of lookahead past the name tells them apart: `(` means a routine,
anything else means a variable. **Only `sub` may omit an empty parameter list** —
`u16 getValue {` opens exactly like a variable declaration, so typed routines
require `()` and get a dedicated error if they lack it.

`=>` desugars entirely in the parser: a typed routine wraps the expression in a
`return`, a sub wraps the statement as-is. The resolver and emitter never see it.

### It is sugar over globals

Parameters and the return value become mangled globals (`add__a`, `add__ret`); a
call stores the arguments and `call`s. No stack frame, no BP, no recursion — so
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
  the arguments as well double-counts them; walking them *instead* — which is
  what the first version did, to avoid exactly that double count — loses every
  call the const's body makes. That cost a hard `internal: unresolved symbol`
  when the emitter called a fn pruning had deleted, and it silently hid
  `f -> aConst -> f` from the cycle check, which is the worse half. An argument
  bound to a parameter the body never mentions is correctly *not* a call — it is
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
readable. Instruction mnemonics are deliberately *not* mangled — `add:` assembles
fine, and `add` is far too natural a name to disfigure.

---

## 8. Parameterised consts

```momo
const     sqr( u8 n )            = n * n          // return type inferred
const u16 min( u16 a, u16 b )    = a < b ? a : b
const u8  hi( u16 w )            = u8( w >> 8 )
const     isDigit( u8 c )        = c >= '0' && c <= '9'
```

A parameterised const is exactly what the keyword says: **a `const` that takes
parameters.** Same nature as a scalar const — compile-time, no storage, never
assignable — it just has arguments. That framing settles the whole design:

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
remember — and no arrow. `->` no longer exists in the language.

### How it compiles

The resolver substitutes the const's body — deep-cloned, with parameter
references replaced by the caller's argument expressions — and stores the result
on the call node. The emitter emits that expansion. **No call is ever generated.**

When the arguments are constant the whole expansion folds, which is where
compile-time table generation comes from:

```momo
const u16[] squares = [ sqr(0), sqr(1), sqr(2), sqr(3), sqr(4), sqr(5) ]
```

```nasm
squares         dw      0, 1, 4, 9, 16, 25        ; u16[6] const
```

and `value = sqr(7)` becomes `mov word [value], 49`.

Called with a runtime value it substitutes inline instead — `sqr(x)` becomes
`x * x` with no call, no argument storage, and no return slot.

### Caveats

**Recursion is rejected** — a const is substituted, not called, so a recursive
one would expand forever. Detected with an expansion stack.

**An omitted return type is inferred per call site, not recorded.** Each
expansion types correctly, but the declaration itself never computes a type, so
`npm run check` shows `-> inferred` rather than the real one. Displaying it would
need a speculative resolution at declaration time, binding parameters to their
declared types rather than to arguments. Cosmetic only — no effect on codegen.

**A parameter used twice evaluates its argument twice.** `sqr(f())` expands to
`f() * f()`. Harmless today because Momo expressions have no side effects, but
**this is a real hazard now that routines exist**: substitute directly only when
the argument is itself side-effect-free, otherwise evaluate once into a
temporary.

---

## 9. Codegen

**Register contract:** `AX` accumulator · `BX` second operand / index ·
`DX` scratch, clobbered by `mul`/`div`, never live · `CL` shift counts ·
`SI`, `DI`, `BP` **unused** (available to the ABI, and a future register-allocation hook).

**Conditions compile in control-flow context** — `emitCond(expr, trueLabel,
falseLabel)` — not by materialising a bool. This is mandatory, not an
optimisation, because 8086 has no `setcc`. `&&`/`||` short-circuit to shared
labels; `!` is a label swap. Value context is the fallback for
`bool b = x < y`, which costs a branch.

**All conditional jumps are emitted expanded**, because 8086 `jcc` is ±127 only
and there is no near form until the 386:

```nasm
        jbe     .for1_body              ; inverted
        jmp     .for1_end               ; near jmp, unlimited range
.for1_body:
```

Costs 2 bytes and a label per branch; always correct. A later refinement can
count emitted instructions and use the tight form when the skipped region is
provably short. This is not theoretical — several bodies in the reference file
exceed 128 bytes under this codegen.

**Peepholes:**

1. **Leaf RHS skips the stack** — load a variable/constant operand straight into
   BX instead of `push ax` / eval / `mov bx,ax` / `pop ax`. Biggest win, and the
   reason a binary expression over two variables is four instructions rather
   than seven.
2. **Constant store direct to memory** — `x = 0` is `mov byte [x], 0`, with no
   round trip through AX.
3. **Single-argument calls skip the argument stack** — the push/pop pair that
   protects an already-filled parameter slot is only needed when there are
   several arguments to protect (§7).
4. **Same-width copy skips widening** — `u8 x = u8 x1` loads AL and stores it,
   with nothing in between. Only a *bare* load qualifies: `x = x1 + 1` still
   widens because arithmetic happens in 16 bits, and `u16 w = x1` still widens
   because the store keeps all of AX.
5. **Truthiness of a byte skips widening** — `test al, al`. A byte is zero
   exactly when its widening is — neither `xor ah, ah` nor `cbw` can change
   that — and only ZF is read, so the widening is dead work. `if (arr[i])` and
   `if (_cf)` (§10) both take this path; `if (someU16)` still tests AX.
6. **A cast that cannot change the bits emits nothing** — `u8(x)` where `x` is
   already `u8` or `bool`, `i8(x)` where `x` is already `i8`. Safe because
   arithmetic is always 16-bit (§4), so nothing typed narrower can reach the
   cast un-widened. `u8(i8 x)` and `i8(u8 x)` still emit: those reinterpret.

   Worth having because §8's return-type rule creates the duplicate. A
   parameterised const wraps its expansion in a cast to the declared type, and
   `const u8 lo(u16 w) = u8(w)` already ends in that same cast — so every call
   to `lo` emitted `xor ah, ah` twice.

7. **Zero uses the zero idioms** — a compare against 0 emits `test` (`cmp` with
   0 clears CF and OF exactly as `test` does, so every jump reads the same), and
   a constant 0 loads as `xor ax, ax`. Each a byte shorter, and each the form an
   8086 reader expects.
8. **Byte operands compare in AL** — when both sides are bare byte loads of the
   same signedness, or one is a constant the byte's own range holds. The
   signedness check is what makes it safe: 0xC8 is 200 as a u8 and −56 as an i8,
   so mixed operands still widen — even for `==`, where the bytes comparing
   equal would be the wrong answer.
9. **A constant stored through a runtime index skips the save** — the value is
   an immediate in the store itself, so the push/pop that protects AX while the
   index is computed does nothing and is not emitted. Extends peephole 2 to
   computed indices, and to far regions.
10. **`+ 1` and `- 1` are `inc`/`dec`** — a third the size of `add ax, 1` and
    twice as fast. They leave CF alone where `add` would set it, which is safe
    because nothing reads CF between expressions — `_cf` is captured inside the
    int helpers only.
11. **A loop test that folded to a constant emits nothing** — `while (true)`
    used to pay `mov ax, 1` / `test ax, ax` / `jnz` every iteration to discover
    that 1 is true.

4 and 5 were listed here as built, for a long time, and were not. That is the
argument for the golden `.asm` tier (§14): a claim about generated output that
nothing compares against is a claim about nothing. Building them took 84 bytes
off the fourteen committed programs and added no instruction anywhere. 7–11
landed together in one later sweep, adopted by reading the golden diff case by
case — every hunk in it is one of those five shapes.

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
`int` is the only primitive that bridges them. Everything else — the entire
standard library — is ordinary subs written in the language, shipped as a prelude.

```nasm
_ax:    dw 0
_al     equ _ax                         ; little-endian: low byte first
_ah     equ _ax + 1
_bx:    dw 0
_bl     equ _bx
_bh     equ _bx + 1
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

Chunky, but an `int 21h` costs thousands of cycles — the sync is free in
relative terms and needs no dataflow analysis.

### `_cf` — the carry flag

DOS and BIOS report failure in carry, so `bool _cf` holds it after every `int`:

```momo
_ah = 0x3D                    // open, read-only
_al = 0
_dx = addr( filename )
int 0x21

if ( _cf ) { ... }            // failed; _ax holds the error code
```

Captured at the end of the helper, once AX is free again — no `mov` disturbs
flags, so CF is still the handler's:

```nasm
        mov     [_di], di
        pushf
        pop     ax
        and     al, 1                       ; carry is bit 0
        mov     [_cf], al
```

It survives `IRET` only because DOS and BIOS handlers arrange it — `RETF 2`
discards the saved FLAGS image rather than restoring it. Universal convention,
but not something the instruction semantics imply.

Three decisions:

- **Read-only.** Every other reserved global is bidirectional, but no DOS or
  BIOS call reads carry on the way *in* — the convention is uniformly
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
immediately — `data/projects/cftest` demonstrates both the reading and the trap.

**Emit one helper sub per distinct INT number**, not the sync inline at every
call site. The literal is baked into the helper, so `int 0x21` becomes
`call int21` — 3 bytes instead of ~40. The shape was proven by hand in
`data/projects/keytest` before the transpiler depended on it; among compiled
programs, `smoke` emits two helpers and runs under tier 2.

**`addr(x)` builtin** returns a global's `u16` offset. In a `.COM` this is a
link-time constant, so it compiles to `mov ax, msg` — an immediate. `lea` stays
dead. Needed because DOS string calls take `DS:DX`.

### `peek` and `poke` — the runtime address

**Built.** `addr` produces an address; these four consume one. They are the only
construct in Momo that reaches memory the compiler cannot name, which is what
makes `lib/std/str.momo` possible at all — see §20 for why they exist and why they
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
  mix `u16` with signed, so an `i16` address would need a cast somewhere — better
  at the call than silently. Another segment is `far`'s job (§16).
- **The value follows the same fit rule a declared `u8` or `u16` would**, bool rule
  included, because a raw byte store is exactly the case that rule exists for.
- **Nothing is bounds-checked, and nothing can be.** There is no length to check a
  runtime address against. That is the whole trade, and it is why these are spelled
  visibly at every use site instead of being dressed up as an array.

Codegen is what §20 predicted, two instructions plus the address:

```nasm
        mov     ax, [at_]
        mov     bx, ax
        mov     al, [bx]                    ; peek8 - unchecked, by design
```

BX because it is the only register the 8086 will index through in this addressing
mode — there is no choice to make and no `lea` to avoid. Two refinements fell out
of shapes that already existed:

- **A constant value skips the save** — `poke8( at, 42 )` puts the value in the
  store as an immediate, so the push that would protect it does not happen. That is
  peephole 9 of §9, through a runtime address this time.
- **`poke8( to, peek8( from ) )` emits no widening.** The store keeps only AL, so
  a byte source is a bare byte load exactly as a variable or array element is —
  the same rule as a byte-to-byte assignment. It matters because that line *is*
  the inner loop of `memCopy`.

**The address is evaluated first**, which §7 requires of arguments generally and
which nothing in the emitted code reveals. `data/projects/peektest` therefore calls
a fn on both sides and prints the order it observed — the one case in that program
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
include "std/io.momo"
```

Top level only. Resolved entirely at compile time, so NASM still sees one flat
file and the DOSBox toolchain is unaffected. Search order is relative to the
including file, then `lib/`. The standard library lives in `lib/std/` as ordinary
`.momo` files and arrives by exactly the same path as your own code — there is no
implicit prologue and no special case.

**Includes are always once-only.** No guards, no `#ifndef`. There is no
legitimate reason to include a file twice in Momo; the only language that
benefits is C with X-macro tricks, and we have no macros. Two details make it
hold:

- Files are identified by `realpathSync.native()`, not by string. Windows
  filesystems are case-insensitive, so `std/io.momo` and `Std/IO.momo` are one
  file under two names — naive dedupe would include it twice and produce
  duplicate-declaration errors that look insane.
- A file is marked seen *before* its own includes are visited, so cycles
  terminate rather than looping.

Each file is parsed separately and its statements spliced in, so every node keeps
its own file's line numbers. An error inside an included file reports against
that file, with its own source line and caret.

### Why not named imports

A module system exists to control visibility. But a Momo sub's "parameters" are
globals — `putChar` reads `char` — so importing `putChar` without `char` gives
you something unusable, and every import list degenerates to the whole module.

More decisively: **Momo already has the encapsulation that matters.** Sub-locals
are private and mangled today, so a library's internal scratch is already hidden.
What remains — the parameter globals — *must* be public or the library does not
work. There is nothing left for a module system to hide. Collision avoidance is
handled by a prefix convention, as C managed for fifty years.

### Dead code elimination

Momo has no linker, so without pruning every `include` would pay for the whole
library. The call graph built for the recursion check gives reachability for
free: unreachable subs are dropped, then a walk over the retained AST collects
referenced labels and drops unused globals and arrays with them.

This makes the call graph load-bearing twice over — it decides what survives as
well as what is legal — so anything that hides an edge from it deletes code the
emitter still calls. Parameterised consts are the subtle case; see §7.

`data/projects/heaptest` includes `std/io.momo` and uses three of its five subs;
`putStr` and `space` do not appear in the output at all, and neither does
`putStr`'s parameter slot `putStr__at`, which lives or dies with it.

---

## 12. Static memory analysis

Momo has no dynamic allocation of any kind, so a program's entire memory
footprint is known at compile time (`npm run memory -- <project>`):

- **Data** — exact. Every scalar and array has a fixed width and length.
- **Stack** — exact, given the acyclic call graph. Two contributors: 2 bytes per
  call level (longest path through the graph), plus expression temporaries.
  Counted from the pushes the emitter actually emits, not from a model of them.
- **Code** — exact, but comes from NASM, so it needs a build. Since the `.COM`
  file is code plus data and data is known, `code = fileSize − dataSize`.

**Temporaries sum down the call path**, they are not maxed across it:

```
cost(S) = 2 (its return address) + 2 × temporaries(S) + max(cost of callees)
```

This section used to give `2 × callDepth + 2 × max(temporaries)`, which was true
while a call could only be a statement — the expression stack was empty at every
call site, so no two routines ever had temporaries live at once. Typed routines
(§7) ended that: a call inside an expression happens with the caller's
temporaries still pushed. §7 records the change; §12 did not, and the two
disagreed in the doc for as long as it took to notice.

It is conservative rather than tight, assuming a routine's peak temporaries are
live at its deepest call, which they need not be.

**One thing sits outside the figure.** `int` is not a call-graph edge, so the
2-byte return address of the helper it calls is not counted, nor is the `pushf`
that `_cf` capture uses. Both are comfortably inside the 256-byte interrupt
reserve below, which is why this is a footnote rather than a bug — but "exact"
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
| `_heapw` | `u16[]` | The same bytes, word view — same address |
| `_hsize` | `u16` | Size of the heap in bytes |

**No storage is emitted for the heap.** A `.COM` owns everything past its image
in the segment, so `_heap` is just a label at the very end of the file and the
binary does not grow by a single byte. `_hsize` costs two bytes; the `align 2`
before `_heap` costs at most one.

```nasm
_hstack         equ     262        ; 6 worst-case + 256 interrupt reserve
_htop           equ     0FFFEh - _hstack

_hsize          dw      _htop - _heap        ; NASM computes this
        align   2
_heap:
_heapw          equ     _heap        ; same bytes, u16 view
```

The word view exists because a byte-only heap makes allocators miserable —
every 16-bit block header would have to be hand-composed from two bytes. Both
views work with the existing codegen: `_heap[i]` emits `[_heap + bx]`,
`_heapw[i]` emits `[_heapw + bx]` with the index pre-scaled.

`_heapw` is an alias of `_heap`, and since §17 it carries that the way any `view`
does rather than as a line of NASM the emitter knew to write. It is still a
builtin: the language spells a view's parent as an array with a length, and the
heap has neither.

Momo provides no allocator. `data/projects/heaptest` is a bump allocator written
in Momo, which is the intended shape: the language supplies the memory, the
programmer supplies the policy. **`view` (§17) is often the better answer** —
`view u8[16] mapData = _heap[0]` partitions the heap into named, bounds-checked
regions with no allocator at all, and no runtime cost.

### Two limitations, both deliberate

**Heap indices are not bounds-checked.** The resolver checks constant indices
against a known length, but `_hsize` is not known until NASM has assembled.

**`_hsize` assumes the full 64K segment.** DOS grants a `.COM` the largest
available block and this is not guaranteed to reach the top of the segment, so
`_hsize` can in principle overstate what the program owns. The robust version
reads the end-of-allocation segment from `PSP:0x0002` at startup — which for a
`.COM` is simply offset 2 of our own segment, since the PSP occupies `0x00`–`0xFF`
and code starts at `0x100`. That would make `_hsize` a runtime computation rather
than an assembly-time one.

The error usually runs the other way, and it matters to §16. That largest
available block is typically **not** one segment but most of conventional memory —
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
`_heap` — the last label in the file — so if that row had gone the other way the
feature would have needed a different shape entirely.

---

## 14. Testing

Three tiers, plus a deliberately small set of unit assertions. The first two run
together in about a second and touch nothing outside Node.

```
npm test          # tiers 1 and 1.5 + type lattice - about a second, no DOSBox
npm run test:e2e  # tier 2 - launches DOSBox per case
```

**Tier 1 — `tests/compile/*.momo`.** Each file either compiles clean or declares
the error it expects, in itself:

```momo
// EXPECT-ERROR: recursion is not supported: a -> b -> a
```

Keeping the expectation inside the file means test and assertion cannot drift
apart, and there is no manifest to forget.

**Tier 1.5 — the committed `.asm` is the expectation.** Every project under
`data/projects/` is compiled and compared against the assembly committed beside
it. Nothing is written: a deliberate change is adopted by running
`npm run momoc:all` and committing the diff, so **every codegen change has to be
looked at by someone.**

This exists because tier 1 asks only *whether* a program compiles, never what it
emits, and tier 2 needs DOSBox — so between them nothing was watching codegen at
all. "`smoke` must stay byte-identical" was a rule enforced by remembering to
read `git status`, which is not a test. It also gives `simplerl` regression coverage
for the first time, since it is interactive and can never have a `.expected`.

Line endings are normalised before comparing. The emitter writes CRLF while git
stores LF, so a clone that checks out LF would otherwise fail every case for a
reason that has nothing to do with the compiler.

**Tier 2 — any project with a `<name>.expected` file.** Compiled, assembled and
actually run under DOSBox with stdout redirected to a file, then compared
exactly. This is the tier that catches what unit tests structurally cannot:
bugs at the NASM boundary, and bugs that only appear when real 8086 code runs.

**Graphics is testable, which is not obvious.** Video memory is readable as well
as writable, so a program can draw, read specific cells or pixels back into
variables, and print what it found — and under the tier 2 harness the printing
is redirected to a file while the drawing still goes to the screen. No
screen-scraping, no image comparison, fully deterministic. `fartest` does it for
text cells; `tilefill` was checked the same way, five pixels covering both tiles,
two rows and a tile at a non-zero position to catch stride arithmetic.

What it cannot cover is anything that waits for a key — tier 2 has no way to
press one — so the three demos are golden-tier only.

**A tier 2 program is the worked example for its feature**, and the two written
this way — `fartest` and `viewtest` — are worth reading as much as running. The
shape falls out of the tier rather than being an extra effort: a test whose every
write is read back through a *different* name has to explain why the two name the
same bytes before it can assert anything, and that explanation is the tutorial.
So the sections below point at their program, and the program is where to look
first when the prose is not enough. They also cannot go stale, which is more than
a code sample in a document can promise.

**Unit tests, only for `types.ts`.** `combineRanges`, `truncate` and
`naturalType` encode facts about 16-bit integers rather than design choices, so
their contract will not move. Everything else is tested end to end.

### Why not unit tests elsewhere

Over the course of building Momo we removed sub return values, added a file
dimension to every AST node, added `include`, added tree-shaking and added
parameterised consts. Each would have invalidated a large body of unit tests on
the lexer, parser and resolver — and in every case the end-to-end output stayed
byte-identical. Those tests would have been pure churn.

Meanwhile the three real bugs found were: scalar initialisers silently dropped,
an `i8` path with a no-op double `xchg`, and `_hsize` emitted as an `equ` that
was 0x100 too large. **None would have been caught by a unit test on a compiler
stage** — two of them exist only in what NASM does with our output.

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

The original bar: the subset is "useful enough" if it compiles hello world,
fizzbuzz, bubble sort, sieve of Eratosthenes, a string library and a text
adventure. Yuki (`_reference/yuki.txt`) is the stretch target — nothing in that
file trips the type rules.

Where that stands:

| | |
|---|---|
| Hello world | `data/projects/hello` — hand-written asm, and trivial in Momo |
| Fizzbuzz | inside `data/projects/smoke`, verified end to end |
| Arithmetic, arrays, loops, branches | `smoke` — every construct in one program |
| A standard library | `lib/std/io.momo` |
| Dynamic allocation | `data/projects/heaptest` — a bump allocator in Momo |
| Compile-time tables | `data/projects/consttst` |
| Sieve of Eratosthenes | `data/projects/sieve`, and `data/projects/bitsiev` bit-packed on the heap |
| Recursive algorithms | `data/projects/qsort` (quicksort) and `data/projects/hanoi` — explicit stacks on the heap |
| Text-mode screen library | `lib/std/screen.momo`, verified by `data/projects/scrtest` |
| String library | `lib/std/str.momo`, verified by `data/projects/strtest` |
| Text adventure | not yet attempted |

**Only the text adventure is left**, and nothing in the language blocks it. The
string library was the last item with a missing feature behind it: routines take
scalars, so it needed a runtime address, which is what `peek`/`poke` (§10) are.
Graphics is not blocked either — §16 is built, so the text buffer and mode 13h are
both addressable as memory.

Two things have since joined the list that were never on the original bar:
`data/projects/grptest` for entity pools (§18), and `data/projects/cftest`,
which opens a file and notices when that fails — the first Momo program that
could find out the machine said no. `data/projects/viewtest` (§17) and
`data/projects/peektest` (§10) make four.

**Dynamic allocation has an answer that is not an allocator.** `view` partitions
the heap into named regions at compile time, so `heaptest`'s bump allocator is now
the interesting case rather than the default one.

### On banning recursion

The ban costs less than it sounds. A recursive algorithm simply carries its own
stack, which the heap already provides:

- `qsort` keeps `(lo, hi)` ranges as pairs of words — a plain worklist.
- `hanoi` needs a **resume point** per frame, so each frame is four words
  (`n`, `from`, `to`, `stage`) and the loop becomes a state machine. This is the
  genuinely awkward shape of hand-rolled recursion, and it came out fine.

Both were written straight through with no compiler changes. What the ban buys in
exchange is the exact stack figure in §12 — `hanoi` reports 10 bytes worst case
along `entry > solve > pushFrame > frameSet > slotOf`, which would be unknowable
with real recursion.

The bit-packed sieve is the most demanding program written so far — 1000
candidates in 126 bytes of heap, using `_heap[n >> 3]` with a runtime shift
count. Writing it found two real bugs (§4, §6), which is exactly what it was
for.

---

## 16. `far` regions and ES

**Built, except the hoisting below.** Every access reloads ES; `data/projects/fartest`
exercises it against the real text buffer, and is the worked example for this
section (§14) — read it alongside the rules below.

```momo
far       u16[2000] textCells = 0xB800          // text buffer, 80x25 cells
far       u8[64000] pixels    = 0xA000          // mode 13h
const far u8[]      font      = 0xF000:0xFA6E   // ROM 8x8 font, read-only
```

> **A hosted backend (§21) needs this.** If graphics went through `int 10h` per
> pixel, every hosted target would have to shim each call and maintain its own
> framebuffer. With `far`, both DOS and hosted backends simply write memory. That
> moves this up the priority list — it is not only the fast path on real hardware.
>
> **Decided:** a hosted target emulates the buffer rather than shimming the
> calls. `int 10h` survives for mode setting, which is one call; everything
> per-cell and per-pixel goes through memory. That is less work than shimming
> and a better fit — a framebuffer is what the host has anyway.

### Scope for v1

Both forms of the address, since the constant one alone cannot double-buffer
mode 13h:

```momo
far u8[64000] pixels     = 0xA000      // constant segment
far u8[64000] backBuffer = bufferSeg   // runtime, from a u16 variable
```

- **The segment must be a constant or a plain `u16` variable**, never an
  arbitrary expression. It keeps the load to one `mov`, mirrors §19's
  "arguments must be names", and settles that `= bufferSeg` is a **live
  reference re-read per access**, not a load-time snapshot — a snapshot would
  be useless, since `far` declarations are top-level and run before anything
  could have produced a segment.
- **Runtime segments are never hoisted in v1.** The hoisting rule below is safe
  for constants because ES is callee-saved. A runtime segment breaks that
  reasoning in the one way §16 calls the worst possible failure: a callee that
  reassigns the *variable* leaves our hoisted ES pointing at memory we no longer
  mean, without ES itself being touched. Doing it properly needs "is this
  variable assigned anywhere in the reachable call subtree", which the call
  graph can answer — but nothing needs the speed yet, so v1 reloads per access
  and the analysis waits for a program that cares. Not a discipline: the
  compiler simply does not hoist them.
- **`AH=48h` is dropped, not deferred.** It buys DOS's bookkeeping — a memory
  control block the system knows about — which matters only for `EXEC` or going
  resident, neither of which Momo can do. Meanwhile DOS has already granted a
  `.COM` far more than its own segment (see §13), so `AH=48h` fails until the
  program shrinks its own block with `AH=4Ah`, and shrinking invalidates
  `_hsize`. Cost with no benefit. Reaching into that memory at all is out of
  scope for now; when it returns it brings its own section.
- **The first real user of the runtime form is probably not the back buffer.**
  The text buffer is at `B800` on CGA and later but `B000` on MDA and Hercules,
  which is a runtime decision read from the BIOS data area. `screen.momo` sets
  mode 3 and so has always assumed colour, but a robust library would not.

**What must stay true for the runtime form to drop in cleanly**, since v1 leads
with the constant one: the symbol carries *where the segment comes from* rather
than a constant; the syntax does not distinguish the two forms, so allowing a
variable is a pure relaxation; and the ES tracker keys on the segment **source**,
never on "ES has been loaded".

### What it cost

The instruction cost was near zero, as expected — `mov`, `push` and `pop` gain a
segment-register operand class, and memory operands gain a `26h` prefix. No new
mnemonics: the subset in §1 is unchanged.

**ES loads go through DX, not AX**, which is better than this section originally
sketched. §9 has always documented DX as scratch and never live, so the load
disturbs neither the accumulator nor a computed index:

```nasm
        mov     dx, 0xB800                  ; segment of cells
        mov     es, dx
        mov     [es:bx], ax
```

That removes the push/pop this section budgeted for under "setting ES needs AX".
A far store with a constant index now needs no register saved at all.

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
segment — the failure this section names as the worst possible. It is handled by
emission order rather than by analysis.

**Nothing is paid by programs that do not use it.** `push es`/`pop es` appear in
the int helpers only once something has actually put a segment in ES, so adding
the whole feature moved no existing generated output.

### The pieces

**The address.** A compile-time constant, optionally `segment:offset`. The
offset is free: it folds into the displacement of an addressing mode we already
emit.

```nasm
        mov     al, [es:bx + 0FA6Eh]     ; runtime index
        mov     al, [es:0FA70h]          ; constant index, no register at all
```

**The optional size** buys exactly what a normal array's size buys — compile-time
checking of *constant* indices. Momo has no runtime bounds checks anywhere, so
this is consistent, not a special case. It is a declaration of intent that the
compiler cannot verify; `far u16[2000] ... = 0xB800` is trusted.

**`=`, not a new keyword.** Everywhere else `=` means "has these contents",
whereas here it names an address — Turbo Pascal used a dedicated word for exactly
this (`absolute $B800:$0000`). Rejected anyway: `far` already announces that an
address follows, and one more keyword is not worth the small gain in precision.

**`const far`** makes a region read-only, reusing the `readonly` flag arrays
already carry. The ROM font is genuinely immutable.

### Smaller rules

- **`addr()` on a far array is an error** — it has no meaningful offset in our
  own segment.
- **`far` declarations are top-level only.** A fixed hardware address is not
  scoped to a routine.
- **Overlapping views are legal and useful** — `far u8[] textBytes = 0xB800`
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
back — that affects two obscure functions and can get its own mechanism if ever
needed.

It also puts calls that take ES as **input** out of reach — `int 10h AH=13h`
(write string) wants `ES:BP`. Nothing in the standard library needs one, and
recording it as a known consequence is better than rediscovering it later.

**ES is callee-saved.** Any routine whose body touches ES wraps it in
`push es` / `pop es`, exactly as the int helpers do. Two bytes, only in routines
that use it — and it makes "ES is never disturbed by anything you call" an
invariant rather than a discipline. That in turn is what makes the hoisting
below simple.

**Redundant ES loads — a performance question, and a smaller one than this
section first claimed.** Every far access emits `mov dx, seg` / `mov es, dx`
first: ~6 cycles against ~16 for the store itself (`9` + EA `5` + override `2`),
so a third again *on the store in isolation*.

**That isolation was the error.** Measured against what Momo actually emits
around the store, in a constant fill of mode 13h — the best case, no generator
involved:

| | cycles | share |
|---|---|---|
| Loop machinery — memory counter, expanded branch, `jmp` back | 85 | 55% |
| `push`/`pop` saving AX while the index is computed | 27 | 18% |
| The store itself | 16 | 10% |
| **The ES load** | **6** | **4%** |

So the ES load is the smallest item in the loop, and the loop machinery is
fourteen times larger. `rndpix` is worse still: its generator costs ~421 of ~588
cycles per pixel, leaving the ES load at **1%**.

**And hoisting is not free, because it requires ES to be callee-saved.**
`push es`/`pop es` is 18 cycles per call to any routine that touches ES, so:

| Shape | Verdict |
|---|---|
| `plot( x, y, colour )` — one far write | saves 6, costs 18 — **net loss** |
| A blitter — 64 writes per tile | saves 384, costs 18 — clear win |
| `__entry` — nothing calls it, so no preservation | pure win, and ~1% |

Break-even is three accesses, or a loop of three-plus iterations inside the
routine. It rewards a routine that does a block of work and penalises the
per-pixel one, which is the shape most people reach for first.

**And the blitter shape does not rescue it.** `data/projects/tilefill` is that
shape — 64 far writes per call, one segment — and measured over a full screen of
1000 tiles at ~19.7M cycles:

| | share | |
|---|---|---|
| Inner loop machinery | 30.2% | register counter, short jumps (§21) |
| Index recomputation | 23.4% | `dest`/`src` reloaded per pixel; SI and DI are free (§9) |
| `push`/`pop` per pixel | 9.6% | saving AL while the index is computed |
| The remaining `* 320` | 5.7% | odd residue 5, so behind `-o` (§21) |
| **ES load** | **2.1%** | what hoisting removes, net of `push es`/`pop es` |
| The two `shl` reduction left behind | 2.1% | unrolling would make this ~0.6% |

Hoisting is last but one, in the shape it was designed for. That table is *after*
§21's strength reduction, which took the screen from 19.7M cycles to 18.0M — the
row that read "multiplies in row setup, 15.2%" is gone, and the two shifts that
replaced it are now smaller than the ES load itself.

So ES hoisting stays unbuilt: not wrong, just never the biggest thing left. The
order to work down is the table — a register-held loop counter, then holding
`dest` and `src` in SI and DI instead of reloading them, then the odd-residue
multiply. **This table is the performance roadmap; keep it measured rather than
estimated, since every entry on it has been wrong at least once.**

> **Benchmarking note.** DOSBox cannot measure this. `cycles = auto` makes it
> adjust its budget against host load, so wall-clock time measures the host; and
> pinned to a fixed count, its normal core charges roughly per *instruction*
> rather than modelling `mul` at 118 cycles against `shl` at 2. The numbers above
> are counted from the emitted code against documented 8086 timings, which is
> both exact and closer to real hardware. Run it under DOSBox to check
> correctness, not speed.

**The larger mitigation needs no compiler work.** Put the loop *inside* a routine
that sets ES once, exactly as `repeatCell` amortises one interrupt over a whole
run today. Good library shape recovers most of the cost; a tracker then collects
the remainder.

**Hoist per routine, not per basic block.** A block-local tracker — "which
segment does ES hold, invalidated at any label" — sounds right and is nearly
useless: **a loop body begins at a label**, so it would reload every iteration,
which is exactly the tight-pixel-loop case worth optimising.

The simpler rule works better. Scan a routine's far accesses; if they all name
one segment — overwhelmingly the common case — emit a single load in the prologue
and none inside. No dataflow analysis, just "does this routine touch exactly one
segment?". A routine mixing two falls back to per-access loads.

This only holds because ES is callee-saved: nothing the routine calls can disturb
it. And it rewards the shape you would write anyway — a routine that does a block
of work rather than scattering single writes.

> Whatever the strategy, it must key on the segment **value**, not on "ES has
> been loaded". `textCells[i] = pixels[j]` uses two different segments and must
> reload between them. A naive flag would silently read the wrong memory — the
> worst possible failure mode for this feature.

**Setting ES needs AX**, which may hold the value being stored. The existing
`push ax` in the computed-index store path already covers this — set ES while the
value is saved — so it costs nothing extra beyond the load itself.

**Far regions sit outside the static analysis.** No runtime bounds check, not
part of the heap, not counted in the image. Defensible — video memory is not
yours, it is hardware — but §12's "you know your entire footprint" gains the
footnote that it covers *your segment*.

### What this unlocks, and what it does not

| Target | Address | Needs |
|---|---|---|
| Text buffer | `B800:0000`, 4000 bytes | ES only |
| Mode 13h | `A000:0000`, 320×200×1 | ES only |
| CGA 4-colour | `B800:0000` | ES, plus interleaved banks — even rows at `+0`, odd at `+0x2000`. A library problem, not a language one. |
| EGA/VGA 16-colour planar | `A000:0000` | ES **and `in`/`out`** to the sequencer at `3C4h` — port I/O is deliberately outside the subset |

So `far` unlocks text mode, CGA and mode 13h. Sixteen-colour planar modes are a
separate decision costing two more instructions and a different mental model.

**Mode 13h cannot be double-buffered in one segment.** The frame is 64000 bytes
and the whole segment is 65536; `simplerl` currently has a little under 64,000
free, so a back buffer in `_heap` would leave under 1.5KB for the image. It needs
a second segment, and therefore the runtime form — but not `AH=48h`: the memory
past ours is already the program's (§13).

**One primitive is missing, and it is not the one this section expected.** A
`.COM` cannot learn its own segment. DOS does not report it — the program knows
it only because CS=DS=ES=SS at entry — and the PSP holds the *parent's* PSP and
the environment segment, neither of which is ours. So both routes are blocked by
the same thing: memory past our segment needs our segment number, and `AH=48h`
needs `AH=4Ah` first, which wants ES set to our own PSP.

A read-only `_ds` whose read emits `mov ax, ds` closes it. Two bytes, no storage,
no startup code, and `mov` already gained a segment-register operand class here,
so no new mnemonic. Everything else already exists:

```momo
u16 ourSeg
far u16[1] memTop = ourSeg:2        // PSP:0002 - the end of what DOS granted
far u8[64000] backBuffer = bufSeg

ourSeg = _ds
```

Worth doing after something can put pixels in a buffer — a back buffer with no
blitter is memory with nothing to write into it.

Worth separating from "unlocks graphics", which the constant form does on its
own. What the runtime form buys is **space**, not addressing.

Text mode is 4000 bytes, so double buffering there is comfortable — and for a
roguelike that is the interesting case anyway.

### Rough sizing

Comparable to the heap work, slightly more: a `far` keyword and declaration form,
a new symbol kind carrying segment/offset/extent, ES handling plus the tracking
peephole in the emitter, and `push es`/`pop es` in the int helpers.

---

## 17. `view`

**Built.** `data/projects/viewtest` exercises every shape, and one deliberately
unused view, because pruning one is part of the feature. It is the worked example
for this section (§14) and reads in the same order — every case below appears
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
bottom          equ     bar + 50
```

`bottom[i]` emits `[bottom + bx]`, which NASM folds to `[bar + 50 + bx]`. No
storage, no instructions, no indirection. This is the `_heapw equ _heap` trick
already used for the heap, promoted from a special case into the language.

**`const view` was added, which this section did not ask for**: a read-only
window onto storage that is otherwise writable, spelled as the adjective on
`view` exactly as `const far` is on `far`. Read-only is *inherited* from a const
parent either way — this is for handing out part of a mutable buffer as
read-only, which the rules below had no way to say.

### What it is actually for

**A buffer that is meaningful as a whole *and* in parts.** Splitting it into
separate arrays would give you the parts and lose the whole — nothing guarantees
separate declarations are contiguous, and nothing lets you address across them.

```momo
const u8[] tiles = "...64 bytes..." "...64 bytes..." "...64 bytes..."

view u8[64] wallTile  = tiles[0]
view u8[64] floorTile = tiles[64]
view u8[64] doorTile  = tiles[128]
```

Blit one tile by name, or copy the whole sheet in one operation. The intent — a
sheet composed of tiles — is in the code rather than in a comment.

**Records without structs.** A scalar view is a named field:

```momo
u8[8] player

view u8  playerX  = player[0]
view u8  playerY  = player[1]
view u16 playerHp = player[2]
```

`view u8 x` against `view u8[4] x` mirrors `u8 x` against `u8[4] x`. The record
stays contiguous and copyable as a unit, and every field access is a plain label.

For most records **`group` (§18) is the better answer** — it declares the fields
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

**Type punning without a cast** — `view u16[50] words = bytes[0]`.

**An extent check arrays cannot give you.** A view knows its parent's length, so
`view u8[50] q = bar[75]` on a `u8[100]` is rejected at the declaration —
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
- **Views compose** — `view u8[25] inner = bottom[10]`, offsets adding.
- **Views of `far` regions inherit the segment**, so §16 composes with this.
- **Views may overlap freely.** No aliasing analysis exists, and none is implied.
- **Views into `_heap` cannot be extent-checked**, consistent with heap indexing
  being unchecked today. Their own length *is* checked, though — a view has to
  state one there, so `mapData[16]` on a `view u8[16]` is caught even where
  `_heap[i]` is not. The view is the stricter way to use the heap.

Three more, settled while building:

- **A view must be declared at the top level**, like `far` and `group`. It names
  storage rather than being storage, and a per-call scope for a name that has no
  lifetime would mean nothing.
- **The offset may be any constant expression** — `tiles[64 * 2]`. A far
  *segment* is restricted to a literal or a name because it loads into a
  register; this one folds into an `equ`, so there is nothing to restrict.
- **A scalar view of a `far` region is an error.** `far u16 port` already is —
  the far path has no scalar form to land in, since a far access is always an
  `es:` operand built from an index. `view u16[1]` says the same thing and works.

Implementation is an array symbol carrying an alias — `label = parent + offset` —
which the emitter writes as an `equ` instead of storage. A **scalar** view is the
same alias on a `var` symbol. Carrying it on the existing kinds rather than adding
a `view` kind is what made this small: a view of an array *is* an array, so
indexing, bounds checks, `len`, `addr` and the const rules all took no new case,
and codegen took none at all — `[tail + bx]` is what an ordinary array emits.

### What it cost

**One emitter change, two tool changes, and no codegen.** Views are written last
in the file, after the heap, because a view of `_heap` can only be written after
`_heap` is — which makes every view a forward reference from the code that uses
it. That was measured before it was relied on, with a hand-written probe: NASM
resolves a forward-referenced `equ` correctly as a displacement under `-f bin`.
The §13 trap is a *difference* of labels inside an `equ`, which is a different
shape.

Tree-shaking keeps a live view's parent alive, and a view's own declaration is
not a use of its parent — so an unused view in an included library costs nothing,
and neither does the array it points at.

**Two compiler special cases went away**, which is the argument this section was
originally making. Not as source, as it guessed: `_heapw` is an unsized view of
`_heap`, which the rules above make an error, and the register halves alias a
*scalar* rather than an array, which no view can do. What they can be is the same
*mechanism* — `_heapw` and `_al`..`_dh` now carry an alias like any view, and the
emitter's byte-alias arithmetic (reconstructing `_ax + 1` from the spelling of
`_ah`) and its hardcoded `_heapw equ _heap` line are both gone. All 19 committed
programs stayed byte-identical across that, which is what makes it a refactor.

It also found a one-byte bug. The memory report counted only word-width reserved
globals, on the reasoning that every byte-width one was an alias — true until
`_cf` arrived, which is real storage. Any program reading the carry flag
under-reported its data by the one byte `_cf db 0` occupies. Asking the symbol
whether it is an alias, rather than inferring it from a width, fixes it: `cftest`
went from 53 bytes to 54.

### Runtime offsets are deliberately excluded

`view u8[n] window = _heap[runtimeOffset]` would need a base held in memory and an
extra `add` per access. That is affordable, but a runtime view is a **fat
pointer** — base plus length — and Momo has no pointers by design. It would also
become the de facto way to pass arrays to routines, which is a much larger
decision than sugar for naming a region.

Static views stay sugar. That is the whole appeal.

---

## 18. `group`

**Built.** Sugar over the **structure-of-arrays** pattern — an entity pool is the
shape almost every game reaches for, which is why this was the first of §16–§19
to be wanted. `data/projects/grptest` exercises it.

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
`u8 x` against `u8[4] x` — so no second keyword is needed. `group` still reads
correctly either way: it groups *fields*, and optionally instances them.

Each field becomes its own array — or plain variable, for the single form —
mangled the way sub-locals already are:

```momo
u8[64]   mob__x        u8  player__x
u8[64]   mob__y        u8  player__y
u16[64]  mob__hp       u16 player__hp
bool[64] mob__alive
```

`mob[i].x` is `mob__x[i]`, and `player.x` is `player__x`. **The index expression
passes through untouched** — it is a name substitution, not layout arithmetic.

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
`u16` fields — a `u8` view and a `u16` view of the same buffer, two units for one
record. Under SoA each field is its own array with its own element type, so
`mob__hp[i]` is an ordinary `u16` index.

**Tree-shaking works per field.** Never read `.hp` and `mob__hp` disappears —
128 bytes not paid for. A record carries every field whether used or not, and
the memory report shows exactly which fields cost what.

### Why this is smaller than records

No struct type in the type system, no offset computation, no record arrays. Every
field is already an ordinary array that the resolver and emitter fully understand,
so `.` never reaches them — it is gone by the end of parsing, exactly like `=>`.

Assignment falls out for free: `mob[i].hp = 100` **is** `mob__hp[i] = 100`, an
ordinary array store. Bounds checks on constant indices work per field, unchanged.

### Rules

- **`mob[i]` and `player` alone are not expressions** — only `mob[i].field` and
  `player.field` are. Honest, since no record exists for them to denote. It also
  pushes toward the idiomatic SoA style of passing *indices* rather than entity
  references, which suits a language with no pointers.
- **The AST keeps the original names** for diagnostics. The parser *could* rewrite
  straight to `mob__x` with no symbol table, but a typo would then report
  `"mob__z" is not declared` for source that says `mob[i].z`.

  As built, the parser hangs an optional `field` marker on the identifier and the
  resolver does the lookup — so `.` survives parsing as one string, and the
  message is `"z" is not a field of group "mob"`, which neither alternative could
  manage. The emitter is still untouched: by then only `label` matters, so a
  field access and an array index are the same thing to it. An earlier draft of
  this section claimed `.` was "gone by the end of parsing" *and* that names were
  kept — those cannot both hold, and diagnostics won.
- **Field globals are not in scope.** `mob__x` cannot be named from source, the
  same way a routine's `add__a` cannot. Both labels are manufactured rather than
  declared, so the resolver claims them in a shared set — two symbols wanting one
  label is caught from whichever side is written second. That check found a
  pre-existing hole: a global literally named `add__a` alongside `sub add(u8 a)`
  emitted the label twice, silently, before `group` existed.
- **Fields are scalars.** `u8[4] inventory` as a field would need arrays of
  arrays, which is a separate problem.
- **The count must be a constant**, as for any array.
- **Top-level only** in v1. Entity pools are inherently global.
- **No field initialisers** in v1 — arrays zero-fill, matching `u8[4] buf`. Const
  groups carrying data are a separate question.
- **A view of a field is still not expressible**, and §17 landing did not change
  that. A field *is* an ordinary array, so nothing in the mechanism objects — but
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

Today nothing can tell the difference — Momo has no array assignment and no
`memcpy` — but the two diverge the moment `peek`/`poke` exist. So they remain two
features doing two jobs: **`group` names fields it creates; `view` names what
already exists.**

For the same reason `group` does *not* retire the `_al`/`_ah` register aliases.
Those are genuinely views over `_ax`'s storage — and `view` does not retire them
either, in the language: a view's parent is an array, and `_ax` is a scalar, so
`view u8 al = _ax[0]` has nothing to index. They now share `view`'s *mechanism*
without being expressible in it (§17), which is the honest half of a claim this
file used to make in full.

### What it displaces

An earlier idea — allowing a parameterised `const` whose body is an lvalue to be
**assigned through** — was motivated almost entirely by wanting typed field
accessors with a runtime index:

```momo
const u16 hpOf( u16 i ) = party[ i * 4 + 2 ]
hpOf( target ) = 100                              // assigning "to a const"
```

`group` delivers that directly, with better syntax and without the squint of
apparently assigning to a constant. Assignable lvalue-consts remain conceivable
for other named computed locations, but they drop from compelling to occasionally
handy — not worth the confusion on their own.

---

## 19. Planned: compile-time array parameters

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

### `len` came with it — and landed first

**Built; see §5.** `len(x)` folds to the declared length of an array. It is
required *here*, because inside `clear` the length is only known per
specialisation — but it was independently useful, so it landed on its own, which
is what "stands on its own" in the original note was betting on.

The two cases that were waiting on their own features have both arrived with them:

- `len` on a **group** is its instance count — `for ( i = 0; i < len( mob ); i++ )`
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

**Code size scales with call-site variety** — the central cost, and the reason
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
needs to say *"in `clear`, instantiated from simplerl.momo:42"* — the C++ template
error problem in miniature. Momo's diagnostics are currently precise and
single-location, and this is the only feature so far that erodes that. Worth
building the chain properly rather than reporting the definition site alone.

### It does not displace `peek`/`poke`

Both solve "a library routine over a buffer", with **opposite cost profiles**:

| | Code size | Speed |
|---|---|---|
| Compile-time array parameter | one copy per distinct argument | direct addressing, fast |
| `peek`/`poke` on an address | one copy total | indirect, slower |

`drawString` called with twenty different messages wants `peek`/`poke` — twenty
copies of a loop would be absurd. `clearBuffer` called on two large arrays wants
a compile-time parameter.

Compile-time parameters also preserve the no-pointers property that `poke8` gives
up, so where both fit, this is the more Momo-shaped answer.

---

## 20. Open questions

- **Real functions.** a typed routine is sugar over globals, so it still cannot recurse or
  be reentrant. Genuine stack frames would bring back BP, `lea` and recursion —
  and would destroy the exact static memory analysis, which is the trade that
  keeps them out.
- **Graphics** — **no longer blocked; see §16.** `int 10h` needs no extra ISA but
  costs an interrupt per cell, and direct buffer access replaces that: `far` is
  built, so the text buffer and mode 13h are ordinary memory, and `view` (§17)
  names a row or a tile inside either. What is still open is a *library* — mode
  setting, sprites, clipping — rather than any access to the hardware.
- **Port I/O (`in`/`out`).** Two instructions, needed for EGA/VGA planar modes,
  the PIT, and the speaker. Out of scope until a program wants one of those.
- **`bool _cf`** — **built; see §10.** DOS and BIOS report failure in carry, and
  nothing in Momo could see it. Read-only, and captured only when something
  reads it, so a program that ignores carry pays nothing.
- **`peek8`/`poke8`/`peek16`/`poke16`** — **built; see §10.** The only route to a
  **runtime** address. `far` (§16) and `view` (§17) are both compile-time
  addressing, so neither overlaps with this:

  | | Address known | Segment |
  |---|---|---|
  | `far` | compile time | another one |
  | `view` | compile time | ours |
  | `peek`/`poke` | **runtime** | ours |

  What they unlocked is **library routines that take a buffer** — `lib/std/str.momo`
  is now `strLen`, `strCopy`, `strCmp`, `strFind`, `memCopy` and `memFill`, and
  `screen.momo` finally has a coloured `writeStrAt`, which the note below spent a
  long time explaining the absence of.
  §19 solves the same problem by a different route, and the two are complements
  rather than rivals: compile-time parameters emit one copy per distinct
  argument (fast, larger), `peek`/`poke` emit one copy total (smaller, indirect).
  Twenty different messages want these; two large buffers want §19.

  ```momo
  sub fill( u16 at, u16 count, u8 value ) {
    for ( i = 0; i < count; i++ ) {
      poke8( at + i, value )
    }
  }
  ```

  **Not a blocker for colour, contrary to an earlier note here.** Writing
  coloured text works today as long as the string is in scope, because indexing a
  known array is ordinary:

  ```momo
  for ( i = 0; msg[i] != '$'; i++ ) {
    writeAt( col + i, row, msg[i], attr )
  }
  ```

  Inline works; only *factoring it into a library* needs an address parameter —
  which it now has, so `screen.momo` carries the routine and no program needs the
  loop above.

  **On the tension with rejecting runtime views (§17):** a runtime view would be
  a declared, typed, tracked construct — it would bless pointers as a first-class
  concept, and everything would then want to be one. `peek`/`poke` are explicit
  unsafe operations that look unsafe at every use site. That is the
  `unsafe { *ptr }` distinction, not a contradiction. Turbo Pascal drew the same
  line: no pointer arithmetic in ordinary code, but `Mem[]`/`MemW[]` as visible
  escape hatches.

  **Spelling:** four builtins rather than a `_mem` array at offset zero. `_mem[at]`
  reads nicely for bytes, but a `_memw` would scale its index by two, which is
  wrong when the index is a byte address — and that inconsistency sinks it.

  Codegen is trivial: roughly `mov bx, ax` / `mov al, [bx]`. It was — that is
  exactly what it emits.
- **`asm { }` passthrough** for hand-written NASM. Probably not needed for a long time.
- **Strength reduction for powers of two** — **built; see §21.** `i * 4`
  emitted a `mul` (~120 cycles on an 8086) where two `shl` do, and `x / 8` a
  `div` (~160) where `shr` does. Faster *and* smaller, so it lives in the
  normal emitter rather than behind a flag; §21 records how far to take it and
  the two traps involved.

---

## 21. Longer-term directions

Not planned like §17 and §19 — these are directions rather than designs.

### CPU target levels

`momo` currently emits strict 8086 and puts `cpu 8086` at the top of every file
so NASM enforces it. A `--cpu` flag would raise that ceiling. The interesting
thing is how unevenly the levels pay:

| Target | What it actually buys |
|---|---|
| **186** | `shl r/m, imm8` — we emit `mov cl, n` / `shl ax, cl` today. Also `push imm`, and three-operand `imul r, r/m, imm` for index scaling. Small but real. |
| **286** (real mode) | Almost nothing. Its additions are protected-mode machinery a `.COM` never touches. Faster timings, same instructions. |
| **386** (real mode) | Large. `setcc` removes the branchy bool materialisation. **Near `jcc`** removes the inverted-jump-over-`jmp` idiom entirely — the ugliest thing in the current output. `movzx`/`movsx` replace `xor ah, ah` and `cbw`. Scaled index addressing removes the `shl` before array indexing. |

So the useful steps are **8086 → 186** (modest) and **→ 386** (transformative).
286 is a rounding error.

One thing to note: **386 is not purely a backend switch.** Its 32-bit registers
would make `u32`/`i32` sensible, which changes the type rules in §4 — the "all
arithmetic happens in 16 bits" core rule becomes "in the target's word size".
Everything downstream of that follows.

### `-o`

A single level, meaning "do your best" — no `-O1`/`-O2` ladder.

Readable output currently rules out anything that breaks the line-by-line
mapping between source and assembly: register allocation across statements,
common subexpression elimination, loop-invariant hoisting. Those are what `-o`
would unlock.

**Comments would stay, and explain the optimisation** — which makes the optimised
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
  behind a flag. Branch relaxation — a short `jcc` when the target is provably in
  range — tidies the output rather than obscuring it. Strength reduction is the
  bigger one; see below.
- **Reciprocal division is a weaker win on an 8086 than it looks.** `mul` is
  ~120 cycles against `div` at ~160, so the saving is perhaps 20%, not the 5x it
  becomes on a 486. Dividing by a power of two is the real prize.

### Strength reduction: how far to go

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

13 cycles against ~128 — about 10x, for seven extra bytes, and `draw` runs it
`mapW × mapH` = 200 times per full redraw.

Three tiers, with the cutoff between the first two:

- **Unconditional — built.** Powers of two for `*`, and for unsigned `/` and `%`.
  Division is the clear case: `x / 8` as `shr` is ~24 cycles against ~160, and it
  is *smaller*. `x % 8` becomes `and ax, 7`. There is no tradeoff to weigh.

  **Every** power of two, not just up to eight as this section first said: that
  cap was more conservative than the numbers need. `mov bx, n` + `mul bx` is
  5 bytes and ~125 cycles; `mov cl, k` + `shl ax, cl` is 4 bytes and at worst 68,
  so the shift wins on both counts at any shift width.

  Signed `/` and `%` are deliberately left as `idiv`, which is what the trap
  below asks for. Signed `*` **is** reduced — `shl` is bit-identical to a
  multiply in the low 16 bits, so the sign never enters into it.

  Measured on `data/projects/tilefill`, which has two `* 8` per row: 8.5% off a
  full screen, ~4.13s to ~3.78s at 4.77MHz. The estimate beforehand was 9.7%,
  and the shortfall is entirely the first trap below — it assumed a shift of
  three cost ~6 cycles, where through CL it costs 20. Unrolling would recover
  the rest.
- **Behind `-o`.** Odd residues of 3, 5, 7 and 9, which covers 10, 40, 80, 160
  and 320 — practically every 2D stride is `2^k x small`, so this catches almost
  everything real with no search.
- **Never.** General shift-add chain search. GCC ships tables for this; the
  return past the tier above is negligible.

Two traps:

- **`shl ax, cl` is slow on an 8086** — 8 + 4n cycles, so shifting by four
  through CL costs 24 where four separate `shl ax, 1` cost 8. The current rule
  ("unroll if the count is 2 or less, otherwise use CL") is *size*-optimal and
  actively poor for speed. Under `-o` it should unroll to about 8.

  **Strength reduction made this trap load-bearing rather than theoretical.**
  Reducing `* 8` produces a shift of three, which is exactly where CL becomes
  slow — 20 cycles against 6 unrolled, for 2 bytes. So the reduction delivers
  about 80% of what it could, and the remainder is one policy decision away.
  Left alone deliberately: unrolling trades size for speed everywhere, not only
  in reduced multiplies, and that is what `-o` is for.
- **Signed division by a power of two is not just `sar`.** `sar` rounds toward
  minus infinity while division rounds toward zero, so `-7 / 2` yields -4 rather
  than -3. The value must be biased by `2^k - 1` when negative first — about five
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

### Word copies and data alignment: two optimisations, measured

Prompted by an obvious question about `tilefill` — if the tiles are word aligned,
could a `u16` view copy two pixels at a time and halve the loop? The answer turned
out to be two separate optimisations of very different value, and the alignment
half is worth less than it looks.

The premise was also false. `tiles` sits at **0x2F7, which is odd**. Nothing in
Momo aligns user data; only `_heap` gets `align 2`. A `.COM` puts data at
`0x100 + code size`, so the parity of the whole data section is an accident of how
much code precedes it, and one extra instruction anywhere above flips it. It does
not affect correctness — the 8086 permits unaligned word access, which §17's rules
already say — only speed.

**The inner loop, counted.** `pixels[dest + col] = tiles[src + col]` plus its test
and increment is **19 instructions**, of which **two** touch pixel data. Everything
else recomputes both addresses and reloads ES. It performs **7 misaligned word
accesses** per pixel: the loop test reads `col`, the body reads `src`, `col`,
`dest`, `col`, and `inc word [col]` both reads and writes.

Applying the documented 8086 table (accumulator forms at 10, `8 + EA` otherwise,
`jcc` taken at 16, `inc word [mem]` at 21, a segment override at 2) gives ~182
cycles per pixel, and the misalignment adds 7 × 4 = 28.

| per tile (64 pixels) | 8086 | 8088 |
|---|---|---|
| as built | ~13,400 | ~13,900 |
| word views, 32 iterations | ~7,000 (−48%) | ~7,200 (−48%) |
| aligned scalars only | ~11,600 (−13%) | no change |
| both | ~6,100 (−55%) | ~7,200 (−48%) |

**The word-view half is the prize, and it needs no compiler work at all.** §17
already expresses it: `view u16[64] tileWords = tiles[0]` over the `u8[128]` set,
`view u16[32000] pixelWords = pixels[0]` over the far region. It needs no division
either — halve the constants instead, 320 → 160 and 8 → 4, and pass the tile
offset in words. The destination stays even for free, since both terms of
`(ty * 8 + row) * 160 + tx * 4` are. The saving is not two bytes per `mov`; it is
paying that 19-instruction preamble 32 times instead of 64, which is why it holds
up on an 8088 too.

**The alignment half is smaller and target-dependent.** An 8088's external bus is
8 bits, so a word access is two bus cycles whether aligned or not — the penalty
this would remove does not exist there. It is a true-8086 optimisation, and most
of these machines were 8088s. §21's CPU target levels are about the *instruction
set*; bus width is a second axis, and nothing in Momo currently has a place to say
which one it is tuning for.

**And reordering alone cannot deliver alignment.** Sorting the scalars words-first
is free and deterministic in itself, but it only makes every word share the parity
of the block start — and that parity comes from the code size, which the compiler
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
8088** — and if it ever comes, it arrives as `align 2` plus a width sort, with the
locals-locality cost paid deliberately. `tilefill` itself stays as it is: it is the
straightforward version on purpose, and §14 wants it readable more than fast.

### Higher-order and generic routines

§19 stops at array and view parameters. Two natural extensions were left out
because each is a distinct feature rather than an increment:

- **Routine parameters** — `sub forEach( u8[] a, sub visit( u8 ) )`. Callbacks
  that cost nothing at runtime, since specialisation turns them into a direct
  `call`. Needs function *types* in parameter lists, which the grammar has no
  notion of.
- **Group parameters** — `sub update( group mobs )`, meaning "any group carrying
  these fields". That is structural typing, and the deepest of the three.

Both would reuse §19's monomorphisation wholesale; the cost is in the type
system, not the backend.

### Hosted targets: JS, WASM, native

These are **categorically different from a CPU port**, and the difference is the
whole reason they are tractable: Momo's abstract machine does not change. Still
16-bit, still one flat 64K, still statically allocated. The front end *and the
resolver* carry over untouched — only the emitter and a shim layer differ.

Not a new direction for the lineage, either. Momo's predecessor Yuki compiled to
a bytecode interpreter, so it reached down from JS toward a machine. Momo starts
at a real machine and would reach back up. The same territory approached from the
opposite end — and the return trip should be the more faithful one, because the
machine is explicit rather than invented.

**The subset mindset is what makes this feasible at all.** A general DOS backend
is DOSBox — a multi-year project. Momo can only *express* a handful of things:
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

#### The machine is the real-mode address space

Once `far` (§16) exists, video memory is part of the addressable model — and a
real-mode address is only `segment * 16 + offset`. So the hosted machine is the
~1MB physical space, with the program's own segment placed inside it:

```
0x00000  ...  program segment (DS = CS = SS), 64K
0xA0000  ...  mode 13h framebuffer,  64000 bytes
0xB8000  ...  colour text buffer,     4000 bytes
0xFFA6E  ...  ROM 8x8 font
```

`far u8[64000] pixels = 0xA000` resolves to linear `0xA0000` on every backend.
No special case and no handle type — the same arithmetic the 8086 does.

The shim also **pre-fills what the hardware would provide**: a font at
`F000:FA6E`, so `const far u8[] font = 0xF000:0xFA6E` works unchanged. Palettes
go through `int 10h AH=1012h`, a BIOS call — one of the places where excluding
`in`/`out` from the subset turns out to help rather than hurt.

#### Video is memory, not calls

The shim does not intercept drawing. It **renders from a region and blits** —
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
the easier case — TIA races the beam and must generate pixels per scanline, while
PC video is a plain framebuffer you blit.

#### One address space, not per-global variables

`addr()`, `_heap`/`_heapw`, views (§17) and any future `peek`/`poke` all assume a
single address space. Emitting idiomatic JS — a variable per global — breaks every
one of them.

There is a pleasing accident here: **`_heap` and `_heapw` are already an
ArrayBuffer with two typed views.** The same trick keeps u16 access fast — `mem8`
and `mem16` over one buffer — provided the emitter aligns u16 storage to even
offsets, which it controls anyway. The memory report becomes the allocation plan
verbatim.

#### Emit from the typed AST, not from the assembly

Momo has structured control flow — `if`, `while`, `for`, `break`, `continue` —
which maps directly onto JS. Emitting from the *assembly* would need a
program-counter dispatch loop and be unreadable; emitting from the AST gives
output that reads like the source:

```js
// ---- if( tileAt( playerX, playerY ) == '#' )
if (mem8[map + mem8[playerY] * 10 + mem8[playerX]] === 35) {
```

#### The `int`-only decision pays off again

**The porting surface is exactly one function.** Every host interaction goes
through `int`, so a backend shims `int21`, `int16` and `int10` — and only the
handful of AH values the standard library actually uses.

The alternative, swapping the standard library per platform, would need an
`extern` concept and would break the "there are no externals" property from §10.
Shimming the interrupt keeps programs portable *unchanged*, including any that
call `int` directly.

**The shims are the platform.** DOS uses real DOS, JS uses a canvas, native uses
SDL2 — same program.

#### Two things that fall out free

- **Headless tests.** Tier 2 currently launches DOSBox per case; a JS backend
  runs the same suite in about a second.
- **Differential testing.** Run a program on both backends and compare output.
  Any divergence is a bug in one of them, and you need not know which in advance.

#### Wrinkles

- **JS integer semantics.** Numbers are doubles, so every operation needs masking
  — `& 0xFFFF` for u16, `<< 16 >> 16` to sign-extend i16, `| 0` or `Math.trunc`
  for division. A missed mask is silent divergence from the 8086, not a crash.
- **Division by zero diverges.** The 8086 raises `INT 0`; JS yields `Infinity`.
  Shim the check or document it.
- **Native x86 is less different than it sounds.** `ax`, `bx` and the 16-bit
  operations all still exist. The wrinkle is that 16-bit index registers cannot
  index a 64-bit address space — so either `movzx` each index, or simply use the
  same 64KB buffer as JS does, which preserves the whole model.

#### Sequencing

**JS first**, since "easy to share" is the goal and it is the most debuggable.
WASM is arguably the better endpoint — linear memory is native to it — and native
buys what neither can: real fullscreen, audio latency, gamepads, a shippable
binary, at the cost of object formats, a linker, an SDL2 dependency and per-OS
builds.

### Dropping the assembler

§1 records the toolchain as "NASM only. No linker, no `.obj`, no relocations."
The endpoint of that trajectory is **no assembler either** — emit `.COM` bytes
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

#### What it buys, with no self-hosting at all

- **The build stops needing DOSBox.** Assembly currently happens *inside* the
  emulator, which is where the `-Z` capture, the `build.ok` marker file and
  "DOSBox exits with its own status, not NASM's" all come from. That machinery
  disappears; DOSBox is left doing only what it is for — running the program.
- **Tier 2 gets cheaper**, and a further tier becomes possible: compare emitted
  bytes without launching anything.
- **1.6MB of bundled binaries leave the repository.**
- **The 8086 becomes a viable host again.** The bundled NASM is a DPMI build
  whose own README says "nothing older than a 386 is supported"; an assembler
  written in Momo has no such floor.

#### The check it costs, and how to keep it

`cpu 8086` currently makes NASM enforce the instruction subset mechanically. A
homegrown assembler enforces it *harder* — it cannot encode what it does not
implement — but it stops being an independent opinion about whether the encoding
is correct.

Keep that with **differential assembly** while NASM is still here: assemble both
ways, compare bytes, and treat any disagreement as a bug in the newcomer. The
golden `.asm` tier (§14) already establishes the shape.

The readable `.asm` stays a first-class output rather than becoming an
intermediate. It is the headline feature; emitting bytes is an addition to it.

---

### Self-hosting

Momo compiling Momo — and, the actual goal, **compiling on the target rather
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

#### The constraint is the memory model, not the CPU level

386 is transformative for codegen, and irrelevant to this: **386 real mode still
has 64KB segments**, and a `.COM` is still tiny model. Register width was never
the ceiling.

There is a twist, though. On-target compilation already requires a 386 *today*,
because the bundled NASM is a DPMI program. So `momo/386` is a consequence of
the machine rather than a prerequisite for the work — and if "Dropping the
assembler" above lands first, the requirement evaporates entirely and true 8086
self-hosting comes back into range.

#### Recursion is not the blocker it looks like

The obvious reading is: a recursive-descent parser is dozens of mutually
recursive calls, Momo rejects recursion, therefore self-hosting needs real stack
frames — which would cost the exact memory analysis (§12), the most load-bearing
decision in the language.

It does not follow. **Shunting-yard is naturally non-recursive**: an operator
stack and an operand stack, both explicit, both on the heap. The precedence
table is already data. Statements become a flat loop over a block-nesting stack,
and the tree walks in the resolver and emitter are the same shape — with an
array-of-nodes AST there are `u16` indices rather than pointers, so a worklist is
the natural form regardless.

§15 already reports `hanoi` — hand-rolled recursion with a resume point per
frame, the genuinely awkward case — coming out fine. A parser is easier than
that. Self-hosting is evidence *for* the ban, not against it.

#### Four binaries, because the pipeline already is four

The four stages are pure and separable, which is exactly the shape a
memory-constrained compiler wants: **four `.COM` files communicating through
intermediate files.** `lex` → tokens, `parse` → AST, `resolve` → annotated AST,
`emit` → `.asm`. The `lex`, `parse` and `check` tools already dump those
representations, so the on-disk formats are half-designed.

The sizing forces it. `simplerl` is ~900 bytes of code, on the order of ten bytes per
line of Momo; the compiler is ~5k lines of TypeScript, call it 6–8k lines of
Momo once recursion is unrolled into explicit stacks. That is 60–80KB as a
single binary — over the ceiling, and still uncomfortable if the estimate is
half wrong. Split four ways it is roomy.

(Deliberately rounded. Exact figures here go stale on any codegen change — the
peephole work in §9 moved `simplerl` by 18 bytes — and the conclusion is robust to
being wrong by a factor of two, which is the only precision that matters.)

#### What it needs

Almost nothing new, and less than when this was written. **`group` (§18), `len`
(§5) and `_cf` (§10) are now built** — structure-of-arrays is how a token table
or an AST wants to be held on this machine, and `_cf` means a failed read can be
noticed. With `int 0x21` and `addr()` already working, file access is writable
today; `data/projects/cftest` opens one.

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
itself*, not all of it — so drop tree-shaking, `include`, parameterised consts
and the exact memory report. That also resolves a real tension: Momo's design
has whole-program analysis baked in (the call graph for recursion and pruning,
image size for `_hsize`), while a memory-constrained compiler wants to stream.
Momo-0 simply does not owe those guarantees.

#### If the model has to give: a profile, not a dialect

Should far data prove insufficient, the escape hatch is `.EXE` and a laxer
memory model — but as a **target profile**, not a second language. Momo already
has a target axis (CPU levels above, `momo/z80` below); memory model is a second
axis of the same idea. A dialect means two languages to keep honest and every
guarantee quoted with an asterisk.

It costs less than it looks, and less than it did before §16 was built — ES is
already emitted, already preserved across interrupts, already in the subset.
**§12 survives** too: static allocation is static however many segments it spans,
so the figures stay exact, per segment. What actually dies is CS, DS and SS
staying uniform, and the mnemonic subset growing segment loads and `es:`
prefixes. Only `.EXE` costs "no linker, no relocations", and the four-binary
route avoids needing it.

#### The hazard

Everything else here gets built when something needs it. Self-hosting
*manufactures* needs, and that is the risk: features justified by what the
compiler wants rather than by what the language should be. Neither of Momo's
distinguishing properties — readable commented output, an exact memory footprint
— is served by the compiler being written in itself.

Used well it is a forcing function that exercises §16–§20 against a demanding
real program; used badly it is a reason to say yes to things. The tell is
whether a feature still looks right with self-hosting struck out.

So far the record is good, and none of it was actually driven by this section:
`len` was wanted for a map height, `group` for an entity pool, `_cf` because
DOS reports failure in carry and nothing could see it. The missing quadrant
passes the same test — it was already latent in §20's table, and the use case
only found it.

---

### Other CPUs — `momo/z80`, `momo/6502`

Unlike the hosted targets above, these **do** change the abstract machine. Very
stretch, but worth knowing what would and would not carry.

**Ports unchanged:** lexer, parser, AST, loader and `include`, the whole testing
apparatus, and the call-graph analysis. Roughly the front half.

**Ports in spirit, not in detail:** the type rules. "All arithmetic in 16 bits" is
an 8086 decision — on a 6502 you would want 8-bit native with 16-bit synthesised,
which changes the promotion rules and therefore the mixing matrix.

**Does not port at all:** the emitter, the reserved register globals, `int` as
the one primitive, the heap-at-end-of-image trick, and the whole standard library.

The encouraging part is that **Momo's core model ports well**: static allocation,
no recursion, globals as the calling convention, and an exact memory report are
exactly how one hand-writes 6502 and Z80 anyway. The design is not 8086-shaped
even though the backend is.

Between the two, **Z80 is much the closer fit** — 16-bit register pairs, a flat
64K with no segments (simpler than the 8086), and `LD A,(HL)` maps onto the
existing "compute an address, then load" model. The 6502 is harder than it looks:
no 16-bit registers at all, no multiply or divide, a fixed 256-byte stack, and
`abs,X` indexing with an 8-bit index — so arrays over 256 bytes need a different
addressing scheme entirely, not just a different instruction.
