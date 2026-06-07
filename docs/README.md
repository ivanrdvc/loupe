# docs

In-repo engineering docs for loupe.

## Map

- **`explanation/`** — the "why" of subsystems. Mental models, architecture,
  trade-offs. The highest-leverage section; longer-form prose.
- **`reference/`** — flat lookup tables. Attribute catalogs, error codes, etc.
  Each file is one self-contained table.
- **`_templates/`** — copy-paste starting points (`explanation.md`,
  `guide.md`, `reference.md`). The `/docs` skill copies from here.

The main folders (`explanation/`, `reference/`) carry a `README.md` index
listing every file with its `summary:` line — that's the catalog. Open the
index, decide which file to read, then open the file.

`docs/` is current-state only.

The glossary of domain nouns lives at `reference/glossary.md`. ADRs will get
their own folder when the first one is written; premature to scaffold now.

## Where does my doc go?

```
1. Steps to do a task ("how do I X?")     → guides/
2. A flat lookup table or registry        → reference/
3. The "why" of a subsystem               → explanation/

Test: step 1, step 2, step 3                  → guide.
      flat table, rows are independent         → reference.
      prose explaining a design                → explanation.
```

## Conventions

- Markdown only. No build step.
- Frontmatter on every file: `title`, `type`, `summary`, `status`, `owner`,
  `audience`, `last-reviewed`, `tags`. Keeps `grep '^summary:' docs/**/*.md`
  useful as a digest.
- Filenames are topical and lowercase-kebab. No date prefixes.
- Number only an ordered on-ramp (`explanation/01-…`, `02-…`); parallel docs
  stay unnumbered. `ls` then shows the read-in-order set first, deep dives after.
- Cross-link liberally. Stale links are bugs.
