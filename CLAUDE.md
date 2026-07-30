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
