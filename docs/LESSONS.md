# Lessons

The incidents behind the rules. Each entry opens with the rule it produced, so a
line in `CLAUDE.md` or `docs/CONTRIBUTING.md` can be traced back to what caused
it. This file is read by reference from those checklists, not from end to end.

## Writing files

**Write repo text through Write, Edit, or Node.**

Use whatever language you like to think; use the project's native tooling when
touching its text. Work out a number in Python, plot something, reason in it,
throw a scratch script at an analysis - all fine. But anything whose output lands
in this repo goes through Write, Edit, or Node: reading, rewriting, generating or
sweeping a file is Node's job here, because Node is what this project already is
and it reads and writes UTF-8 without being asked.

This used to be conditional advice - *pass `encoding='utf-8'` on both ends* - and
conditional advice is the wrong shape for a failure this quiet. It has to be
remembered at every call site, and when it is forgotten nothing complains: tsc
does not care, the suite stays green, and the damage is committed. The evidence
is in the traps below, which record three separate Python incidents and a `§`
that reached `resolver.ts` and sat there corrupted across several commits.

Node is not a workaround, it is the shorter path. One session did roughly three
hundred substitutions across this repo and the vector study through
`readFileSync`/`writeFileSync` with `'utf8'`, and encoding never came up once.

**Never write a file containing backslashes through a shell heredoc.**

They get eaten: `"\\.momo"` becomes `"\.momo"`, which is invalid JSON. This
produced two broken config files in one session, both silently, and neither
failed loudly enough to notice at the time. Use Write/Edit for JSON, for regexes,
and for any TypeScript containing `\r\n` or escape sequences.

**Python heredocs eat backslashes even when quoted.**

`<<'PY'` should preserve them and does not, here. Anything containing `\r`, `\n`,
a regex escape or a Windows path fails silently or asserts. This is the same rule
as the shell-heredoc one above, and the same answer: **Edit and Write for
anything with an escape in it.** It used to say a Python heredoc was fine for
plain-text replacements; the rule at the top of this file supersedes that, and
the entry stays because the failure mode is the heredoc rather than the language.

**Python's `read_text`/`write_text` default to cp1252 on Windows, not UTF-8.**

This is the incident the rule at the top of this file exists for. A script that
reads a file containing `§`, edits something unrelated and writes it back silently
re-encodes every non-ASCII character on the way out: a comment reading
`DESIGN.md §25` comes back holding a lone 0xA7, which is not valid UTF-8 at all.
Nothing complains - tsc does not care, the suite stays green, and it was found
only by grepping for the byte.

Then it gets worse, and the second stage is the reason it survives. Something
reads that invalid byte as U+FFFD and writes the replacement character back -
`EF BF BD`, which **is** valid UTF-8. It round-trips cleanly, it looks like an
ordinary character to every tool, and it stops resembling damage at all. One
reached `resolver.ts` that way and sat there across several commits, found only
because somebody happened to grep for what reads `DESIGN.md`.

Worth knowing if a check for this is ever wanted: "is every file valid UTF-8"
catches the first stage and **misses the second**, which is the one that actually
survives in a repo. It would need to test for the replacement character
separately. Measured at 70ms over 388 files, and deliberately not added - the
suite's surface is a cost of its own, and agents run every test they can find.

**Keep both ends of a file handoff in one tool.**

Git Bash `/tmp` is not Windows Python's `/tmp`. Bash resolves it to
`C:/Users/<user>/AppData/Local/Temp`; Python reads `/tmp` as `C:\tmp` and finds
nothing. A file written by `cp` in one and read by a Python heredoc in the other
simply is not there. Use the scratchpad directory from the system prompt, or keep
both ends in the same tool.

## Editing text

**Use Edit rather than `sed -i` for files under Dropbox.**

`sed -i` on a Dropbox-backed folder can apply the edit and then report failure. It
writes a temp file and renames; the rename loses to a Dropbox lock and prints `cannot
rename ... Device or resource busy`. The edit is already in the file. Once this looked
like "the command failed so nothing changed", and three ladder entries had in fact been
deleted - caught only because TypeScript then complained about unused functions. **Use
Edit for files under Dropbox**, and if `sed` does report that error, check the file
before assuming.

**Splice prose with `text.split(anchor).join(replacement)`.**

JavaScript's `String.replace` interprets `$` in the REPLACEMENT, and will
silently duplicate a document. `$&`, `` $` ``, `$'` and `$$` are substitution
patterns wherever they appear in the replacement string - including inside text
being inserted from a file. Splicing a block into `DECISIONS.md` that contained a
Momo string terminator, `msg[i] != '$'`, put `$'` into the replacement, which
means "everything after the match" - so two whole sections were duplicated into
the middle of the file. `tsc` passed, the suite passed, and the only tell was a
heading appearing twice.

`text.split(anchor).join(replacement)` does no pattern interpretation at all.
This matters most for exactly the operation it will be reached for: moving prose
between documents, where the prose is not under your control and a `$` in a code
example is ordinary.

**Edit by line, not by pattern.**

`if (typeNode.array) {` occurs twice in `parser.ts`, so a `String.replace`
neutered a `group` guard rather than the one under test - and the suite duly
failed `err-group-array-field.momo`, a test with nothing to do with the change.
The count moved either way, so a tally alone would have read as a successful
teeth check. Reading *which* test failed is what caught it.

**Where a script assumes a structure, make it check the structure rather than
match it.**

Rewriting `shell.momo`'s 25 open/close pairs into blocks could have been a regex
over `closeBox()`; it was a stack instead, which popped an open per close and
asserted that the two sat at the same indent. That turns "the file was indented
honestly" from something the edit silently relied on into something it proved -
and the pair count came out at exactly the number the design predicted, which a
regex could not have told you either way. **The check is usually three lines and
it is the difference between an edit that worked and an edit that looks like it
worked.** Predicting the count first is the other half.

**Write a throwaway probe out in full.**

The temptation is to derive one from an existing program with `sed` or a regex -
drop the `readKey`, add a `putNumber` - and it has failed every time it has been
tried here: once relocating only the first of four reads so a pixel was sampled
after the screen was cleared, once truncating a file mid-loop. Both produced
plausible-looking wrong output, which is worse than an error. Writing the twenty
lines out took less time than diagnosing either. The same instinct as the heredoc
rule above: for anything fiddly, use Write.

## Verifying

**Verify by running, not by reading.**

Almost every real bug here was invisible to the type checker: scalar initialisers
silently dropped, an `i8` path with a no-op double `xchg`, `_hsize` emitted 0x100
too large, a fn falling off its end into whatever the return slot last held, a
sub-local initialiser that ran once at load rather than per call. Several existed
only in what NASM did with the output. Compiling a two-line program and reading
the assembly finds these; reasoning about the source does not.

**Predict before adopting.**

Where an expected output or a measurement is about to be committed, work out what
it should be first and then check - every time that has been done here the
prediction was either confirmed, which is real evidence, or wrong in a way that
found something. Adopting whatever the tool printed proves only that it printed
it.

**Check the suite has teeth.**

After adding tests, deliberately break the thing they cover and confirm they
fail. A suite that has never failed has not been tested. Three separate tests
here turned out unable to fail for the reason they existed - output comparison
only catches a bug when the wrong computation yields a *different* number, and
small operands collide easily.

**Commit before the teeth check.**

`git checkout <file>` during a teeth check discards the work being tested. The
whole premise of a teeth check is that the change is not committed yet, so
reverting a neutered guard "back to normal" through git takes the feature out
with it - here, an entire resolver's worth of uncommitted work, recovered only
because a `cp` to the scratchpad happened to exist a few minutes earlier. Commit
before the teeth check, then git is safe again and the neutering can be reverted
with confidence rather than from memory. Restoring from a copy works but relies
on having thought of it.

**Neuter a guard with a condition tsc cannot fold.**

Neutering a guard with a literal `true` or `false` breaks TypeScript's narrowing.
An always-taken branch makes the rest of the block unreachable, so `node.to` on a
narrowed union stops existing and tsc reports eight errors that read as though
the change itself was wrong. The suite then never runs at all - and a harness
that only greps for `FAIL` lines reports that as "nothing failed", which is the
exact opposite of the truth. Use a condition tsc cannot fold, such as
`node.line < 0`, and make the harness read the tally rather than the failures.

**A green test run whose count did not move is worth distrusting.**

The vector study's `npm test` globbed `dist/*.test.js`, which does not reach
subdirectories - so the first run after adding a test file one level down
reported a comfortable pass having executed none of it. The tell was the number:
56 before, 56 after, thirteen tests added.

**Check the environment instead of reading about it. `npm run test:e2e` almost
certainly works.**

Two agents in a row have reported tier 2 as unavailable because DOSBox "would be
needed", while `toolchain.json` sat in the repo root correctly configured the
whole time.

What caused it was that `README.md` and `CONTRIBUTING.md` described DOSBox in the
second person - *"point the toolchain at **your** DOSBox first"* - because they
were addressing somebody setting the project up. **That was a setup instruction,
not a statement about this machine**, and it read as the latter. Both passages
now state the mechanism in the third person and quote the error the tools print
when no DOSBox is configured. `toolchain.json` being gitignored makes it worse:
"not in the repo" slides quietly into "not present". `CONTRIBUTING.md`'s closing
*"N e2e programs, all green"* contradicts
the conclusion outright - that figure cannot exist unless somebody runs them - and
got read straight past both times. It is quoted here without its number
deliberately: the number has moved three times, and an agent who notices the
quote is stale has been handed a reason to dismiss the sentence carrying it.

The check is `toolchain.json` in the repo root, or `MOMO_DOSBOX` in the
environment, or just running the suite and reading the error if there is one.

## Measuring

**A stub measures a floor the real design cannot reach.**

Twice this project predicted the cost of a change by stubbing it out, and twice
the real version came in higher - by 77 bytes once, because a stub removes a call
site that the real design still has to keep. Useful for "is this worth doing", not
for "what will this cost".

**Recount before building on a number, especially your own.**

A count in a document is a claim like any other, including in a section whose
argument is that it measured something. §48's wrapper-limit table said "25
bracketable, 5 not" and then "25 of 30", and the file has 27 opens; the 25 was
right and had arrived beside a total nobody had derived from it. It survived being
written, reviewed and committed, and did not survive being read once. The premise
in `momolo/build.momo` that a fourteen-parameter sub "would be unreadable at every
call site" lasted much longer and was never anything but plausible - the corpus's
largest routine takes six. Both of those were one command away for as long as they
stood.

**A number arriving beside a claim is not evidence for the claim.**

The sweep that produced `STYLE.md`'s rule about counts found the rule's own first
draft sitting in `STYLE.md` unapplied, and the sentence it was written about
drifted a second time underneath it. It also found a tally in a design that had
not been built yet - §49's routine arities - where the load-bearing claim was
right and the totals beside it could not be reproduced by any counting rule that
also gave the right answer. That is twice now, after §48's wrapper table, and it
is the commonest way a wrong figure gets written down here.

**No present-tense count about the repo in prose unless a test or `npm run drift`
reads it.**

A figure nothing checks is drift surface. `std/io.momo` said 22 programs
included it when the answer was 36, and 19 of 48 round-trip assertions when the
suite had 60. Keep a number where it is load-bearing and stable; otherwise give
the shape of it and let the tools hold the arithmetic.

That rule was written in `STYLE.md` and then not applied, so the same sentence in
`io.momo` drifted a second time - 35 against an answer of 39 - and was cut
rather than corrected. It was short a test for deciding *which* numbers are
worth keeping, and a sweep of every figure in the repository produced one -
the four kinds now in `STYLE.md`.

**The tell is tense, and it is reliable.** DESIGN §14 carried the same figure
twice in one paragraph: *"22 programs included that file **at the time**"* is
still there and still true, and *"in every program that includes it - 35 of
them"* had rotted and has been cut. Same file, same paragraph, same number -
the guard is the only difference between them. §44
says its counts are *"fixed at the date rather than maintained"* and has cost
nothing since; §45 reused §44's denominator three hundred lines later without
that sentence, and it went stale.

So: **a count belongs in `DECISIONS.md`, where it is dated by construction.** A
present-tense count anywhere else is a bug unless a test reads it - and the fix
is one of three moves, in this order. Hand it to a tool. Or add §44's sentence,
if the figure *is* the evidence for a design. Or cut it and give the shape,
which is nearly always right when the number is incidental to the point being
made. Note that `DECISIONS.md` carries several hundred numerals and has never
needed a sweep, which is the argument for the split rather than for counting
less.

## Documents

**The docs are load-bearing, and have drifted.**

`DESIGN.md` described two peepholes as built that were never written, and carried
a worst-case-stack formula that contradicted another section. Treat a claim about
generated output as a hypothesis until the compiler agrees with it.

**Sweep for drift between code, comments and documents.**

This one keeps paying: a tier 1 assertion count that had not moved with the
tests, a glob that gained a directory level while the sentence describing it did
not, a file header quoted in a document after the file it came from had been
rewritten, a paragraph about branching written before the one branch happened.
**Not one of those was noticed by whoever caused it**, which is the argument for a
sweep rather than for being more careful.

Most of what a sweep finds is a stale number, and `STYLE.md` has the rule for
deciding which numbers are worth keeping at all - four kinds, of which only
present-tense counts about the repo cost anything. A figure that is dated, or
that a test reads, or that is about the 8086 rather than about us, does not need
checking and never has. `DECISIONS.md` carries several hundred numerals and has
never needed a sweep.

**Diff the structure, not the content, after an edit that removes more than it
adds.**

A section move is a large deletion, and that is where an overrun hides. Moving
a design out of `PLAN.md` into `DESIGN.md` removes a hundred-odd lines from one
file and adds them to another, so a range or anchor edit that ends too late looks
exactly like the change working. One did: 905cc83 meant to take the `unit` Todo
item and the §39 section, and took another 188 lines with them - the tail of
Probably, all of Maybe, all of Questions and half of Done - stopping in the middle
of a list. `git diff --stat` reported what a section move reports, `npm test` was
green because nothing reads `PLAN.md`, and the commit message's 378/378 was true.
It was found a session later, from three finished items left reading as work that
had not happened.

This one belongs to editing without eyes on the result. Somebody cutting a
selection in an editor watches the extra hundred lines go; an edit expressed as a
pattern over text nobody re-reads does not get that. Same family as the
`String.replace` entry above, and the same answer.

The check is `grep -nE '^#{1,3} '` over the file before and after, confirming
that only the intended heading is gone. `CONTRIBUTING.md`'s rule about editing
DESIGN §1 records the same failure twice over - a slice that swallowed the prose
around the mnemonic table and read `cmptest` as a mnemonic - and that is what its
*"being careful is not a method"* is about. That one closed with a test, because a
mnemonic table is machine-checkable and three tier 1 assertions now read it.
`PLAN.md` is not checkable that way and nothing reads it at all.

**A "GENERATED - do not edit" file can be edited anyway, and the generator will
not notice.**

`mvdemo.momo` and `mvpic.momo` are emitted by the vector study, and both carried
an `include "momovec/direct.momo"` that the study's emitter never wrote - added by
hand on this side when `direct.momo` was extracted, and never taught to the
generator. Regenerating would have silently removed it and `clip.momo` would have
failed with `"mapX" is not declared`. Nothing said so for five commits, because
nobody regenerated in between. **The check is to regenerate and diff**, and it is
worth doing whenever either side of a generated file moves.

**Re-read a study doc before trusting an edit you made earlier in the session.**

A write to the study docs did not persist, and nothing said so. Two corrections to
NEXT.md in the vector study were applied, verified by a matched replacement count, and
were simply not there an hour later - while other edits from the same run survived. The
study lives under Dropbox and is not a git repo, so there is no diff to catch it and no
history to recover from. Prefer one write per file over several across a session. The
cause was never established, which is itself the reason to write it down.

**Regenerate the grammar after touching `tokens.ts` or the builtin globals in
`resolver.ts`.**

The grammar is generated from both, and `far` and `_cf` both reached main with
the committed extension stale because this rule used to name only the first.

**A new mnemonic means editing DESIGN §1.**

This was a manual instruction for one commit, and got done wrong three times in a
row - once by hand-typing the subset (`xchg` and `imul` in, `cwd` out), twice by a
slice that swallowed the prose around the table and read `cmptest` as a mnemonic.
`_cf` added `pushf` and the table said 36 for a while. Which is the argument for a
test rather than a practice: the check is fiddlier than it looks, and being
careful is not a method.

**A feature that subsumes a special case is worth having whether or not the
special case can be re-spelled in it.**

Read what got retired carefully. `view` absorbed the emitter's byte-alias
arithmetic and its hardcoded `_heapw equ _heap` as *mechanism*, not as source.
`_heapw` and `_al` still cannot be written as views - DESIGN said they could, and
it was half wrong. The two are different claims and only one of them survived
contact.

## Working with an assistant

**AI-assisted work is welcome; unexamined work is not.**

A good deal of this repo was written that way - `CLAUDE.md` exists and the commit
log is explicit about it - so this is a note from experience rather than a
precaution.

None of the practices above are waived, because none of them are about who typed
the change. The agent's half is under Verifying, above: *adopting whatever the
tool printed proves only that it printed it.* The contributor's half is the same
sentence.

What is genuinely new is that a change nobody has understood is now cheap to
produce. So:

- **Be able to say what your change does and why, without the assistant in the
  room.** If you cannot, learn it until you can. That is the same bar you would
  clear by writing the code yourself, not a higher one.
- **Work by dialogue.** Proposing, measuring, being told the measurement
  disagrees, and changing the plan is the mode that has produced the good commits
  here. A single prompt and a pull request is not, and it tends to produce changes
  whose reasoning nobody can reconstruct - including whoever submitted them.

A review can catch a bug. It cannot supply an understanding that was never formed.
