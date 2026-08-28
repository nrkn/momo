# Studies

Some of what is in `shared/lib/` was not designed here. It was distilled from
something that already existed, in a separate project built for the purpose, and
then ported in. This file is the record of that: which studies there have been,
what each one distilled, what arrived here from it, and the method they converged
on.

It exists because `DESIGN.md`, `PLAN.md` and `DECISIONS.md` all assume work that
was designed in Momo. Two of the largest things in the repository were not, and
the three-document split had nowhere to say so.

## What a study is

A separate TypeScript project, built to find the smallest useful version of
something that already exists, and shaped from the start so it can be ported to
Momo without a redesign. It is a place to be wrong quickly: TypeScript iterates
faster than an 8086 does, and a design that cannot survive being written twice was
not ready to be written once.

A study is not a dependency. Nothing here builds, runs or tests against one.

## They are not in this repository, and will not be

Studies are scratchpads. They are large in their own right, they are worth
keeping, and they are not worth maintaining as further public projects - so they
live outside this repository and nobody who clones it has them.

**That has one consequence, and it is a rule rather than a preference:**

> **Say what was learned, never where it was learned.** Anything worth citing has
> to be brought across first. Anything not worth bringing across is not worth
> citing.

A reference to a study's files, sections or line numbers is useless to every
reader of this repository except one, and worse than useless because it promises
an explanation it cannot deliver. Twenty-six of them accumulated across thirteen
files before this was noticed - some naming a document, some naming a TypeScript
source file, and the commonest kind saying "see PORT.md, Sentinels" beside a
paragraph that had already explained the sentinel.

**Upstream is different and stays citable.** Clay, Zingl's paper and the
Ghostscript tiger are public - a reader can go and look. So the shape is: cite
upstream, summarise the study, never cite the study.

Note the asymmetry, because it is the reason this is easy to get wrong. The
studies cite Momo's section numbers, and that is correct: somebody reading a study
has this repository open. The reverse is not true and never will be.

## The register

| | distilled from | became | generates files here |
|---|---|---|---|
| clay study | [Clay](https://github.com/nicbarker/clay), `clay.h`, 5,058 lines | `shared/lib/momolo/`, §36 | no |
| vector study | Alois Zingl, *Bresenham Curve Rasterizing Algorithms* (V20.15, 2020), by way of a TypeScript playground | `shared/lib/momovec/`, §37 | yes |
| palette study | prior work by the author, 2024 | colour and palettes - scope undecided | planned, not built |
| schema study | prior work by the author, not yet audited | schemas, and what can be generated from one | planned, not built |

**momolo** (§36) is pure geometry - no text, colour, borders or drawing - which
is the largest single departure from Clay. The name is six characters so it fits a DOS
8.3 project directory. The port was written by hand against the study, so nothing
here is generated and there is nothing to keep in step mechanically.
`shared/lib/mopaint.momo` is the layer momolo deliberately does not have.

**momovec** (§37) is a rasteriser: normalized paths in, pixels out, integers
throughout. Its provenance runs one level deeper than momolo's - the study distilled a
playground, and the playground was itself a port of Zingl's paper. The study
generates data and harness programs in this repository, which is the part that can
break silently; `CONTRIBUTING.md` records the general shape of that trap and the
commands live where the paths do.

**The palette study** is not built yet. Its model is unpublished prior work rather
than a public source, so "cite upstream" has nothing to point at - provenance is
the author's own earlier project and that is the whole of it. It is the first
study planned after this workflow was noticed rather than reconstructed, which
makes it the test of whether this file is any good.

**The schema study** has models like the other two, and they have not been audited
yet - prior work across the author's own projects covers parts of this, and
finding out how much is part of the study's first job rather than a prerequisite
to naming it here. So the register cannot yet say what it distils, and that is a
gap in this row rather than a departure from the definition above.

## The method

Both finished studies arrived at the same one, independently, which is the reason
this document is about a workflow rather than about two libraries.

- **Build it in TypeScript first**, because it iterates faster than the target.
- **Shape it for the port from the beginning**, so what lands is a translation
  rather than a redesign.
- **Read the target's design documents before writing the plan**, and cite the
  sections. Both studies' plans open by listing which parts of `DESIGN.md` they
  were written against, and the vector study's include resolver copies §11's rules
  wholesale rather than inventing any - resolution, identity, cycles, all of it
  already decided and written down.
- **Chunk the port**, and record what each chunk cost.
- **Hold the port against the study number for number.** This is the part that
  makes a port checkable rather than plausible: `momolo` runs six scenes and
  prints every resolved box, `tiger` digests 339 lines covering every scanline,
  every path and the order all 92,949 pixels were drawn in. Two implementations
  agreeing on every integer is a test; a picture that looks right is not.
- **Generate shared data rather than copying it.** One dataset, several readers,
  no copy to drift.

## When a study is retired

A study can be finished with. When one is, anything it generates here stops being
regenerable, and the `GENERATED - do not edit` headers on those files stop being
true - at which point they should say what they are instead of what they were.

Nothing else changes, because nothing here depends on a study. That is the
property this file is written to preserve, and the test for anything added to it:
**would it still be true and useful after every study was gone?**
