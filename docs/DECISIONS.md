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
