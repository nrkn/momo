# Momo — notes for Claude

**Read `CONTRIBUTING.md` first.** Layout, pipeline, scripts, the traps that have
cost real time, and the working practices this project holds to all live there,
and all of them apply here. This file is only what differs when the contributor
is an agent rather than a person at an editor — which is very little.

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
