# Momo - notes for Claude

**Read `CONTRIBUTING.md` first.** Layout, pipeline, scripts, the traps that have
cost real time, and the working practices this project holds to all live there,
and all of them apply here. This file is only what differs when the contributor
is an agent rather than a person at an editor - which is very little.

## Writing files

**Never write a file containing backslashes through a shell heredoc.** They get
eaten: `"\\.momo"` becomes `"\.momo"`, which is invalid JSON. This produced two
broken config files in one session, both silently, and neither failed loudly
enough to notice at the time. Use Write/Edit for JSON, for regexes, and for any
TypeScript containing `\r\n` or escape sequences.

## Verifying

`CONTRIBUTING.md` asks for two things that are easy to perform and not do:
running rather than reading, and checking that a new test can actually fail.
Both mean extra tool calls, and both have caught real bugs here that nothing
else would have. The stash-and-rebuild trap in that file is worth reading before
the first time you revert something to prove a test has teeth.

**Write throwaway probes out in full.** The temptation is to derive one from an
existing program with `sed` or a regex - drop the `readKey`, add a `putNumber` -
and it has failed every time it has been tried here: once relocating only the
first of four reads so a pixel was sampled after the screen was cleared, once
truncating a file mid-loop. Both produced plausible-looking wrong output, which is
worse than an error. Writing the twenty lines out took less time than diagnosing
either. The same instinct as the heredoc rule above: for anything fiddly, use
Write.

**Predict before adopting.** Where an expected output or a measurement is about
to be committed, work out what it should be first and then check - every time
that has been done here the prediction was either confirmed, which is real
evidence, or wrong in a way that found something. Adopting whatever the tool
printed proves only that it printed it.

## Tooling traps this project has actually hit

Each of these cost real time, and none of them announce themselves.

**`sed -i` on a Dropbox-backed folder can apply the edit and then report failure.** It
writes a temp file and renames; the rename loses to a Dropbox lock and prints `cannot
rename ... Device or resource busy`. The edit is already in the file. Once this looked
like "the command failed so nothing changed", and three ladder entries had in fact been
deleted - caught only because TypeScript then complained about unused functions. **Use
Edit for files under Dropbox**, and if `sed` does report that error, check the file
before assuming.

**Python heredocs eat backslashes even when quoted.** `<<'PY'` should preserve them and
does not, here. Anything containing `
`, `
`, a regex escape or a Windows path
fails silently or asserts. This is the same rule as the shell-heredoc one above, and the
same answer: **Edit and Write for anything with an escape in it.** A Python heredoc is
fine for plain-text replacements and nothing else.

**Git Bash `/tmp` is not Windows Python's `/tmp`.** Bash resolves it to
`C:/Users/<user>/AppData/Local/Temp`; Python reads `/tmp` as `C:	mp` and finds nothing.
A file written by `cp` in one and read by a Python heredoc in the other simply is not
there. Use the scratchpad directory from the system prompt, or keep both ends in the same
tool.

**A green test run whose count did not move is worth distrusting.** The vector study's
`npm test` globbed `dist/*.test.js`, which does not reach subdirectories - so the first
run after adding `src/dsl/lex.test.ts` reported a comfortable pass having executed none
of it. The tell was the number: 56 before, 56 after, thirteen tests added.

**A write to the study docs did not persist, and nothing said so.** Two corrections to
`NEXT.md` in the vector study were applied, verified by a matched replacement count, and
were simply not there an hour later - while other edits from the same run survived. The
study lives under Dropbox and is not a git repo, so there is no diff to catch it and no
history to recover from. **Re-read a study doc before trusting an edit you made earlier in
the session**, and prefer one write per file over several across a session. The cause was
never established, which is itself the reason to write it down.

**Python's `read_text`/`write_text` default to cp1252 on Windows, not UTF-8.** A
script that reads a file containing `§`, edits something unrelated and writes it
back silently re-encodes every non-ASCII character on the way out: a comment
reading `DESIGN.md §25` comes back holding a lone 0xA7, which is not valid UTF-8 at
all. Nothing complains - tsc does not care, the suite stayed green, and it was
found only by grepping for the byte. Then it gets worse, because Edit reads that
byte as U+FFFD and writes the replacement character back, so a second pass leaves
`§` followed by a `?` glyph instead of fixing it. **Pass `encoding='utf-8'` on both
ends**, and prefer Edit for any file with a `§` in it - which, given the
cross-reference convention, is most of them. A `read_text()` used only for matching
is safe; it is the write that does the damage.

**`git checkout <file>` during a teeth check discards the work being tested.** The
whole premise of a teeth check is that the change is not committed yet, so
reverting a neutered guard "back to normal" through git takes the feature out
with it - here, an entire resolver's worth of uncommitted work, recovered only
because a `cp` to the scratchpad happened to exist a few minutes earlier.
**Commit before the teeth check**, then git is safe again and the neutering can be
reverted with confidence rather than from memory. Restoring from a copy works but
relies on having thought of it.

**Neutering a guard with a literal `true` or `false` breaks TypeScript's
narrowing.** An always-taken branch makes the rest of the block unreachable, so
`node.to` on a narrowed union stops existing and tsc reports eight errors that
read as though the change itself was wrong. The suite then never runs at all -
and a harness that only greps for `FAIL` lines reports that as "nothing failed",
which is the exact opposite of the truth. Use a condition tsc cannot fold, such
as `node.line < 0`, and make the harness read the tally rather than the failures.

**A stub measures a floor the real design cannot reach.** Twice this project predicted
the cost of a change by stubbing it out, and twice the real version came in higher - by
77 bytes once, because a stub removes a call site that the real design still has to
keep. Useful for "is this worth doing", not for "what will this cost".
