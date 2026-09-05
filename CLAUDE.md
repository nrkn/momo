# Momo - notes for Claude

Read `docs/CONTRIBUTING.md` first: layout, pipeline, scripts, working practices.
Then read `LOCAL.md` if there is one. It holds what is true of this machine.

## Editing files

- Write repo text through Write, Edit, or Node. Never Python: `read_text` and
  `write_text` default to cp1252 on Windows and re-encode `§` on the way out.
- Never write a file containing backslashes through a shell heredoc. They are
  eaten, which gives invalid JSON, a broken regex or a wrong escape sequence.
- Use Edit rather than `sed -i` for files under Dropbox. The rename loses to a
  lock and reports failure with the edit already applied.
- Splice prose with `text.split(anchor).join(replacement)`. `String.replace`
  reads `$&`, `` $` ``, `$'` and `$$` in the replacement text.
- Edit by line, not by pattern. The line you mean occurs more than once.
- Where a script assumes a structure, have it check that structure and fail
  loudly rather than match it.
- Diff the headings before and after any edit that removes more than it adds.
  `grep -nE '^#{1,3} '` over the file, and confirm only the intended one is gone.
- Write a throwaway probe out in full. Do not derive one from an existing file.
- Keep both ends of a file handoff in one tool. Git Bash `/tmp` and Windows
  Python `/tmp` are different directories.

## Before committing

- `npm test`. Generated `.asm` stays byte-identical; adopt a deliberate change
  with `npm run momoc:all` and read the diff.
- `npm run test:e2e` after any change to what the emitter writes. Check for
  `toolchain.json` or `MOMO_DOSBOX` before concluding DOSBox is missing.
- `npm run memory -- <project>` after a static capacity changes. It takes one
  project name, and nothing else reports a segment overflow.
- `npm run grammar` after touching `tokens.ts` or the builtin globals in
  `resolver.ts`, and check the emitted regexes compile.
- Edit DESIGN §1 when a new mnemonic is emitted.
- `npm run drift`, and fix what it reports.
- `npx tsc` after `git stash pop`. The build left behind is the reverted one.
- Verify by running, not by reading. Work out the expected number first, then
  check it against the tool.

## Teeth check

- Commit first. `git checkout <file>` afterwards discards uncommitted work.
- Neuter the guard with a condition tsc cannot fold, such as `node.line < 0`. A
  literal `true` makes the rest of the block unreachable and tsc fails instead.
- Neuter it by line, not by pattern.
- Read which test failed, not only the tally.

## Documenting a change

- A design lives in `PLAN.md` until it is built, then moves to `DESIGN.md`.
- Section numbers are one namespace across the documents, and append-only.
- A retrospective or a measurement goes in `DECISIONS.md`. A rule goes in the
  Rules block of its `DESIGN.md` section.
- No present-tense count in prose unless a test reads it.

## This file

This file may not grow. A new entry replaces or merges an existing one. The
incident behind any entry goes in `docs/LESSONS.md`.
