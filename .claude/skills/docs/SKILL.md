---
name: docs
description: Add or update documentation in the project's /docs/ tree, following the existing structure — folders, frontmatter, decision tree, templates. Use when the user invokes /docs to record something new, fix a stale page, or fill a gap in the existing docs.
argument-hint: "[--draft] [topic]"
disable-model-invocation: true
---

# /docs — write and update project docs

## Arguments

Both arguments are optional. The full invocation is parsed from `$ARGUMENTS`.

- `--draft` — produce a scaffold to iterate on, not a finished artifact. Fill the frontmatter, lay down section headings, and write only sentences where you have something concrete to say. Everything else stays as `<TODO: ...>` for the user to fill in on the next turn.
- `topic` — what to record or update. Can be:
  - **prose** describing the subject (e.g. "how OTEL tracing works")
  - **a reference to current changes** ("what I just changed", "this branch", "the diff", "uncommitted work") → run `git diff` / `git log development..HEAD` to gather the actual content before placing or writing
  - **a link or path** (a file under `src/`, a URL, a PR number, an ADR id) → read it first and treat the content as the source for the doc
  - **something already in this conversation** ("the asymmetry we just found", "the bug from earlier") → scroll back, extract the relevant facts, and use those

  If omitted entirely, ask one question to elicit it before doing anything else.

Default mode (no `--draft`): write the doc as a finished artifact at the level of detail the topic supports. Use `<TODO: ...>` markers only where you genuinely don't have specifics — don't fabricate.

`$ARGUMENTS` examples:
- `/docs --draft how OTEL tracing works` → draft mode, topic = prose
- `/docs the chatmessagestore page is out of date — Cosmos shipped` → default mode, prose with implicit update target
- `/docs document what I just changed` → resolve via `git diff` / recent commits
- `/docs https://github.com/.../pull/147` → fetch the PR, document what it added
- `/docs src/lib/telemetry/openobserve.ts` → read the file, document its purpose
- `/docs` → no args, ask the user what to record

## First, read `/docs/README.md`

The map, decision tree ("where does my doc go?"), frontmatter spec, and naming conventions all live there. Don't restate them — read them and apply.

## Workflow

1. **Confirm scope.** Restate the user's topic in one sentence so they can correct you before you write.
2. **Locate or place.**
   - *New doc:* walk the decision tree in `/docs/README.md`, pick a folder + filename, state your pick in one line.
   - *Inside `explanation/`*: flat, no subfolders. **Number only the ordered on-ramp** (`01-architecture`, `02-spec`, `03-classify-span` — the read-in-order foundation). A new doc joins the on-ramp *only* if it's part of that sequence; almost always it's a parallel **subsystem** doc, which stays **unnumbered** kebab-case (`datasets.md`, `tasks.md`, `code-organization.md`). When in doubt, unnumbered. Update the folder `README.md` index under the right group. Inserting a new number mid-on-ramp means renumbering everything after it — confirm with the user first (cross-link rewrites required). Folder `README.md` itself stays unprefixed.
   - *Outside `explanation/`* (guides, reference, plans, top level): no numbering. Just kebab-case filenames; reading order lives in the folder `README.md`. `plans/` holds forward-looking proposals for unbuilt features. (`decisions/` for ADRs and a top-level `glossary.md` aren't in the tree yet — create them on first need, three-digit ADR padding `004-…md`; don't scaffold empty.)
   - *Update:* find the file (Read/Grep, don't guess). If nothing matches, surface that and ask.
3. **Write.**
   - *New:* copy the matching template from `/docs/_templates/` (`explanation.md` | `guide.md` | `reference.md`). Fill frontmatter per `/docs/README.md`'s spec; `status: draft`, `last-reviewed:` = today. Then write per the active mode (default vs `--draft`).
   - *Update:* make the targeted edit. Bump `last-reviewed:`. If the change makes the frontmatter `summary:` wrong, update it (and the matching bullet in the folder README).
4. **Index follow-ups.**
   - Added a doc → add a bullet to that folder's `README.md` (matching the existing format).
   - Introduced a domain term and a `/docs/glossary.md` exists → add a one-line entry linking to the new doc. (No glossary yet — only create one if the user asks.)

## Don'ts

- Don't write before confirming scope. A doc in the wrong folder costs more than the question.
- Don't bypass the templates.
- Don't fabricate technical detail; mark `<TODO: ...>` and surface it.
- Don't expand scope. One doc means one doc.

## Reporting back

- Path of the new/updated file.
- Whether you also touched a folder README and/or glossary.
- Any `<TODO: ...>` markers left for the user.
