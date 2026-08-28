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
