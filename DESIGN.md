# Momo — language design

A small imperative language that transpiles to commented NASM source for a
minimal 8086 subset. Source files use the `.momo` extension.

Named after a cat, continuing the tradition set by Yuki — the earlier language
in `_reference/yuki.txt`, which is also the reference point for "level of
language" we are aiming at.

---

---

## 1. Target

| | |
|---|---|
| Output | Commented NASM source, assembled with `nasm -f bin` |
| Format | `.COM`, `org 100h` |
| Memory model | Tiny — `CS = DS = ES = SS`, one 64KB segment |
| CPU | **Strict 8086.** No 186+ instructions. Revisit later. |
| Toolchain | NASM only. No linker, no `.obj`, no relocations. |

Tiny model means segment registers are never emitted, never overridden, never
thought about. `far` does not exist.

### Instruction subset — 36 mnemonics

| Group | Instructions |
|---|---|
| Move | `mov` `push` `pop` |
| Arith | `add` `sub` `inc` `dec` `neg` `cmp` `mul` `div` `idiv` `cbw` `cwd` |
| Logic | `and` `or` `xor` `not` `test` `shl` `shr` `sar` |
| Control | `jmp` `je` `jne` `jl` `jle` `jg` `jge` `jb` `jbe` `ja` `jae` `call` `ret` |
| System | `int` |

Deliberately absent:

- **`lea`** — no pointers, and `[disp16 + bx]` covers array indexing in one instruction.
- **`imul`** — the low 16 bits of a multiply are identical signed and unsigned in
  two's complement, and with no 32-bit type we never read `DX`. `*` always emits `mul`.
- **`enter`/`leave`, `pusha`/`popa`, 3-operand `imul`, `push imm`, `shl r,imm8`** — all 186+.
- **`setcc`** — 386+. This is why conditions compile in control-flow context (§9).
- Segment ops, BCD/ASCII adjusts, flag manipulation, `in`/`out`, `xlat`, far calls.

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

**Peepholes** (these take the naive ~40 instructions for a typical indexed
expression down to ~25):

1. **Leaf RHS skips the stack** — load a variable/constant operand straight into
   BX instead of `push ax` / eval / `mov bx,ax` / `pop ax`. Biggest win.
2. **Constant store direct to memory** — `x = 0` is `mov byte [x], 0`.
3. **Same-width copy skips widening** — `u8 x = u8 x1` needs no `xor ah,ah`.
4. **Truthiness of a byte skips widening** — `test al, al`.

**Comment style:** source line as a section header, *not* echoed per
instruction. Inline comments reserved for width conversions, why `jbe` and not
`jle`, and the branch-expansion idiom.

```nasm
drawLineHorizontal:
; ---- for (x = x1; x <= x2; x++) ----
        mov     al, [x1]
        mov     [x], al                 ; x = x1  (u8 -> u8, no widening)
.for1_test:
        mov     al, [x]
        xor     ah, ah                  ; u8 -> u16
        mov     bl, [x2]
        xor     bh, bh
        cmp     ax, bx
        jbe     .for1_body              ; unsigned <= (both operands u8)
        jmp     .for1_end
.for1_body:
        call    setPixel
.for1_cont:
        inc     byte [x]                ; x++
        jmp     .for1_test
.for1_end:
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
`call int21` — 3 bytes instead of ~40. Confirmed working in
`data/projects/keytest`, which uses two.

**`addr(x)` builtin** returns a global's `u16` offset. In a `.COM` this is a
link-time constant, so it compiles to `mov ax, msg` — an immediate. `lea` stays
dead. Needed because DOS string calls take `DS:DX`.

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
`putStr` and `waitKey`, and the `strAddr` and `key` globals, do not appear in the
output at all.

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

One useful consequence of subs being statement-only calls: the expression stack
is always empty at a call site, so **no two subs ever have temporaries live at
the same time**. Worst-case stack is therefore
`2 × callDepth + 2 × max(temporaries)`, not a sum down the call chain.

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

Momo provides no allocator. `data/projects/heaptest` is a bump allocator written
in Momo, which is the intended shape: the language supplies the memory, the
programmer supplies the policy.

### Two limitations, both deliberate

**Heap indices are not bounds-checked.** The resolver checks constant indices
against a known length, but `_hsize` is not known until NASM has assembled.

**`_hsize` assumes the full 64K segment.** DOS normally grants a `.COM` the
largest available block, which is the whole segment, but this is not guaranteed.
The robust version reads the end-of-allocation segment from `PSP:0x0002` at
startup; that would make `_hsize` a runtime computation rather than an
assembly-time one.

### A NASM trap worth recording

`_hsize` is emitted as `dw`, not `equ`, and that is load-bearing. Under
`-f bin` with `org 100h`, NASM resolves a label correctly inside a **data**
expression but **section-relative** inside an `equ`:

| Form | Result |
|---|---|
| `dw _heap` | correct |
| `dw _htop - _heap` | correct |
| `equ _htop - _heap` | **0x100 too large** |

Verified empirically. Written as an `equ`, the heap would silently overlap the
stack reserve by 256 bytes.

---

## 14. Testing

Three tiers, plus a deliberately small set of unit assertions. The first two run
together in about a second and touch nothing outside Node.

```
npm test          # tier 1 + type lattice - about a second, no DOSBox
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
read `git status`, which is not a test. It also gives `rl` regression coverage
for the first time, since it is interactive and can never have a `.expected`.

Line endings are normalised before comparing. The emitter writes CRLF while git
stores LF, so a clone that checks out LF would otherwise fail every case for a
reason that has nothing to do with the compiler.

**Tier 2 — any project with a `<name>.expected` file.** Compiled, assembled and
actually run under DOSBox with stdout redirected to a file, then compared
exactly. This is the tier that catches what unit tests structurally cannot:
bugs at the NASM boundary, and bugs that only appear when real 8086 code runs.

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
| Text adventure | not yet attempted |

Still unwritten: a string library beyond `putStr`, and anything graphical (which
needs the `ES` work in §16).

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

## 16. Planned: `far` regions and ES

Deferred, not vague. This is the design to build when something needs it.

```momo
far       u16[2000] textCells = 0xB800          // text buffer, 80x25 cells
far       u8[64000] pixels    = 0xA000          // mode 13h
const far u8[]      font      = 0xF000:0xFA6E   // ROM 8x8 font, read-only
```

> **A hosted backend (§21) needs this.** If graphics went through `int 10h` per
> pixel, every hosted target would have to shim each call and maintain its own
> framebuffer. With `far`, both DOS and hosted backends simply write memory. That
> moves this up the priority list — it is not only the fast path on real hardware.

### Why it is deferred rather than dropped

The instruction cost is near zero — `mov`, `push` and `pop` gain a
segment-register operand class, and memory operands gain a `26h` prefix. No new
mnemonics. The 36-instruction subset is unchanged.

The cost is entirely in invariants, and in the emitter carrying state it has
never carried before.

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

**ES is callee-saved.** Any routine whose body touches ES wraps it in
`push es` / `pop es`, exactly as the int helpers do. Two bytes, only in routines
that use it — and it makes "ES is never disturbed by anything you call" an
invariant rather than a discipline. That in turn is what makes the hoisting
below simple.

**Redundant ES loads — a performance question.** Naively, every far access emits
`mov ax, seg` / `mov es, ax` first. On an 8086 that is ~6 cycles against ~16 for
the store itself (`9` + EA `5` + override `2`), so roughly a third again.

That is worth having but is not fatal, and the size of the problem depends
entirely on the access pattern:

| Pattern | Impact |
|---|---|
| Scattered writes (a few cells per turn) | Unnoticeable |
| Tight loop over many pixels | Real — a full mode 13h clear goes from ~1.0M cycles to ~1.4M, about 5 fps down to 3.4 |

Note also that a plot usually computes `y * 320 + x` first, and `mul` alone is
~120 cycles on an 8086 — so the reload is small beside the addressing arithmetic.

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
and the whole segment is 65536; `rl` currently has ~63,800 free. A back buffer
needs a second segment from `INT 21h AH=48h`, which in turn needs a **variable**
segment (`mov es, [thatVar]` rather than an immediate). Barely harder than the
constant form, but it is the piece that would have to come with it.

Text mode is 4000 bytes, so double buffering there is comfortable — and for a
roguelike that is the interesting case anyway.

### Rough sizing

Comparable to the heap work, slightly more: a `far` keyword and declaration form,
a new symbol kind carrying segment/offset/extent, ES handling plus the tracking
peephole in the emitter, and `push es`/`pop es` in the int helpers.

---

## 17. Planned: `view`

Deferred, not vague — like §16, this is the design to build when something wants
it.

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
already used for the heap, promoted from a special case into the language — and
`_heapw` could stop being a compiler builtin and become an ordinary view written
in `lib/std`.

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
  being unchecked today.

Implementation is an array symbol carrying an alias — `label = parent + offset` —
which the emitter writes as an `equ` instead of storage. Tree-shaking must keep a
live view's parent alive, and the memory report must list views as aliases rather
than counting their bytes twice.

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
- **Views compose** in principle — a field is an ordinary array — but not with
  the spelling this section originally gave. `view u8[16] firstWave = mob__x[0]`
  names a label that is deliberately out of scope (above), so when §17 lands it
  needs a way to say *the whole field array*: `mob.x` with no index, which today
  is an error because the indexed form requires one. Worth settling with `view`
  rather than inventing now.

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
Those are genuinely views over `_ax`'s storage, and §17 still covers them.

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

What is built covers arrays. Two cases wait on their own features:

- `len` on a **group** is its instance count — `for ( i = 0; i < len( mob ); i++ )`
  (§18).
- `len` on a **view** is the view's length, not the underlying array's (§17).

Both are additional symbol kinds rather than new machinery, so each is a case in
the same fold.

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
needs to say *"in `clear`, instantiated from rl.momo:42"* — the C++ template
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
- **Graphics.** `int 10h` needs no extra ISA but costs an interrupt per cell.
  Direct buffer access is designed in §16 and deferred until something needs it.
- **Port I/O (`in`/`out`).** Two instructions, needed for EGA/VGA planar modes,
  the PIT, and the speaker. Out of scope until a program wants one of those.
- ~~**`bool _cf`**~~ — **built**, see §10.
- **`peek8`/`poke8`/`peek16`/`poke16`** — the only route to a **runtime**
  address. `far` (§16) and `view` (§17) are both compile-time addressing, so
  neither overlaps with this:

  | | Address known | Segment |
  |---|---|---|
  | `far` | compile time | another one |
  | `view` | compile time | ours |
  | `peek`/`poke` | **runtime** | ours |

  What they unlock is **library routines that take a buffer** — a general
  `memcpy`, a reusable `drawString`, following an offset stored in the heap.
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

  Inline works; only *factoring it into a library* needs an address parameter.

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

  Codegen is trivial: roughly `mov bx, ax` / `mov al, [bx]`.
- **`asm { }` passthrough** for hand-written NASM. Probably not needed for a long time.
- **Strength reduction for powers of two.** `i * 4` currently emits a `mul`
  (~120 cycles on an 8086) where two `shl` would do, and `x / 8` a `div` (~160)
  where `shr` would. Both are **faster *and* smaller**, so they belong in the
  normal emitter rather than behind a flag. §21 sets out how far to take it and
  the two traps involved.

---

## 21. Longer-term directions

Not planned like §16–§18 — these are directions rather than designs.

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

`rl`'s `tileAt` is `map[y * mapW + x]` with `mapW = 10`, so `10 = 5 << 1`:

```nasm
        mov     bx, ax
        shl     ax, 1
        shl     ax, 1           ; x * 4
        add     ax, bx          ; x * 5
        shl     ax, 1           ; x * 10
```

11 cycles against ~128 — nearly 12x, for five extra bytes, a hundred times per
draw.

Three tiers, with the cutoff between the first two:

- **Unconditional.** Powers of two up to 8 for `*`, and *all* powers of two for
  unsigned `/` and `%`. Division is the clear case: `x / 8` as `shr ax, 3` is
  ~6 cycles against ~160, and it is *smaller*. `x % 8` becomes `and ax, 7`.
  There is no tradeoff to weigh.
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
because of a decision taken for an unrelated reason. **The 36-mnemonic subset is
the entire specification.** An assembler that handles only what Momo itself
emits needs:

- The 36 mnemonics, in the operand forms the emitter actually produces:
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

The sizing forces it. `rl` is 936 bytes of code, on the order of ten bytes per
line of Momo; the compiler is ~4,400 lines of TypeScript, call it 6–8k lines of
Momo once recursion is unrolled into explicit stacks. That is 60–80KB as a
single binary — over the ceiling, and still uncomfortable if the estimate is
half wrong. Split four ways it is roomy.

#### What it needs

Almost nothing new. §18 `group` is structure-of-arrays, which is how a token
table or an AST wants to be held on this machine; §19's array parameters and
`len` give routines that take a buffer; §20's `_cf` gives DOS error reporting,
and file access is otherwise writable *today* — `int 0x21` and `addr()` already
work.

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

It costs less than it looks. **§12 survives** — static allocation is static
however many segments it spans, so the figures stay exact, per segment. What
actually dies is §1's "segment registers are never emitted, never overridden,
never thought about", and the mnemonic subset growing segment loads and `es:`
prefixes. Only `.EXE` costs "no linker, no relocations", and the four-binary
route avoids needing it.

#### The hazard

Everything else here gets built when something needs it. Self-hosting
*manufactures* needs, and that is the risk: features justified by what the
compiler wants rather than by what the language should be. Neither of Momo's
distinguishing properties — readable commented output, an exact memory footprint
— is served by the compiler being written in itself.

Used well it is a forcing function that exercises §18–§20 against a demanding
real program; used badly it is a reason to say yes to things. The tell is
whether a feature still looks right with self-hosting struck out. The missing
quadrant above passes that test — it was already latent in §20's table, and the
use case only found it.

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
