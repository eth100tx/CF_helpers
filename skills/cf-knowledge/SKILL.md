---
name: cf-knowledge
description: >
  The local Capital Factory knowledge base — a persistent store of canonical markdown
  files for CF-relevant companies and mentors. Reads from Pitch.vc (companies) and the
  master mentor CSV (mentors), calls cf-augment for web research, and writes / updates
  one entity file per slug under the user-configured knowledge directory. Use this
  skill whenever the user says "what do we know about <X>", "look up <X>", "read pitch
  on <X>", "snapshot <X>", "update our notes on <X>", "research <X> and remember it",
  "list our companies", "list our mentors", "list our knowledge on <topic>", or any
  question that asks the local store. Triggers on words like *remember*, *know*,
  *snapshot*, *our notes*, *our knowledge* attached to a company or person name.
---

# CF Knowledge

A growing, **persistent local knowledge base** of CF companies and mentors. Each entity gets one
canonical markdown file you can read, search, edit (your own notes survive refreshes), and reuse
across `cf-mentor-match` / `cf-pitch-roulette` runs.

This skill is the **curator**. The low-level web research worker is **`cf-augment`** — this skill
*calls* cf-augment when it needs fresh public-LinkedIn / website / WebSearch material.

## Layout
The user picks where the store lives via `cf knowledge set <path>` (it's recorded in
`~/.cf-helpers/config.json` as `knowledgeDir` — could be inside an Obsidian vault, an iCloud
folder, a normal directory, anywhere). Files land under:

```
<knowledgeDir>/
├── companies/<slug>.md      # canonical record per Pitch company
└── mentors/<slug>.md        # canonical record per CF mentor
```

If `knowledgeDir` is unset, the skill tells the user to run `cf knowledge set <path>` before doing
anything else.

## Entity file shape

```markdown
---
type: company | mentor
name: <Display Name>
slug: <slug>
refreshedAt: <ISO timestamp of last full refresh>
sources:
  pitch: <ISO | not_found | not_tried>           # for companies
  csv: <ISO | not_found | not_tried>             # for mentors
  augment: <ISO | failed | not_tried>
tags: [<tag1>, <tag2>, …]
city: <…>
stage: <…>                                       # for companies
raising: true | false                            # for companies
unionLink: <url>                                 # for mentors
linkedin: <url>
website: <url>
---

# <Display Name>

## Summary
1-3 sentence synthesis written for matching / decision-making.

## Pitch profile snapshot     <!-- companies only; "Master CSV snapshot" for mentors -->
- Tagline / tagline-equivalent
- Tags
- City · Stage · Raising / Title · Current Company
- URL(s)
- Anything else from the structured source worth remembering

## Augmentation
The brief produced by cf-augment (LinkedIn / site / web search). Slim down to what
matters for CF matching.

## Notes
<!-- USER-OWNED. cf-knowledge MUST preserve everything in this section across refreshes. -->
```

## When to trigger
- *"what do we know about <X>"*, *"look up <X>"*, *"read pitch on <X>"*, *"snapshot <X>"*
- *"update our notes on <X>"*, *"refresh our knowledge on <X>"*
- *"list our companies"*, *"list our mentors"*, *"what companies do we track"*,
  *"list our knowledge on <topic>"*, *"who do we have tagged <tag>"*
- Implicit: the user asks anything about a CF entity and the answer would be better with
  the local file as ground truth.

## Procedure

### 0. Verify config
- Read `~/.cf-helpers/config.json` for `knowledgeDir`. If missing, tell the user:
  > "First, pick where the knowledge base should live: `cf knowledge set <path>` (any directory
  > you want — e.g. an Obsidian vault). Then re-run me."
- Use `cf knowledge show` to confirm path + counts; use `cf knowledge path <slug> --type <co|mentor>`
  to resolve a target file path before writing.

### 1. For a single-entity lookup ("what do we know about Acme")
1. **Disambiguate type** quickly: company vs mentor.
   - If the user said "the company X" / "the startup X" → company.
   - If they said "mentor X" / "<X> @ <Co> who mentors" → mentor.
   - Else search Pitch (`pitch_search_companies({ query: name, limit: 3 })`); if a strong hit
     → company. Otherwise treat as mentor and confirm with the user if it matters.
2. **Slugify**: `slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')`.
3. **Look up existing file** at `<knowledgeDir>/<type>/<slug>.md`.
   - If exists and `refreshedAt` ≥ 60 days old → treat as stale, refresh.
   - If exists and fresh → read it, answer from it (and only re-fetch if user explicitly asks
     to refresh).
   - If missing → fetch fresh.
4. **Fetch fresh data** (whichever apply):
   - Companies: `pitch_get_company({ slug })` (or `pitch_search_companies` → top hit → get).
   - Mentors: `cf mentors search --keywords "<name>" --limit 3 --json` to find them in the
     master CSV; pick the right row.
   - Both: invoke `cf-augment` with the name + any URLs you have. Read its brief at
     `~/.cf-helpers/augmentation/<slug>.md` (cf-augment writes it).
5. **Write the canonical file** at `<knowledgeDir>/<type>/<slug>.md`:
   - Build the frontmatter (`refreshedAt = now`, `sources.*` set to ISO or `not_found`).
   - Render Summary, the structured Snapshot section, and the trimmed Augmentation section.
   - **Preserve the Notes section** verbatim from any prior version of the file (read the old
     file first; extract everything between `## Notes` and EOF; reuse it). On first creation,
     leave Notes empty with the HTML comment placeholder.
6. **Answer the user** from the synthesized file (Summary + relevant facts), and tell them the
   file path.

### 2. For list / query operations
- *"list our companies"* / *"list our mentors"* → `cf knowledge list --type co` (or `--type mentor`).
- *"list our knowledge on <tag>"* → `cf knowledge list --tag <tag>`.
- *"what stale entries do we have"* → `cf knowledge list --stale 60`.
- The CLI returns one row per entity (slug · name · refreshedAt · top tags); summarize / format
  for the user.

### 3. For batch / "snapshot many" requests
The user opted into **on-demand only** — do not auto-pull large batches. If the user explicitly
says *"snapshot the top 20 raising-now Austin companies"*, do it as N successive single-entity
lookups (with progress notes), but never proactively.

## Rules
- **Notes section is sacred.** A refresh that wipes a user's notes is a regression bug. Read the
  existing file before overwriting; verbatim-preserve `## Notes` onward.
- **Local only.** `<knowledgeDir>/` and `~/.cf-helpers/` are never committed. Do not move,
  copy, or upload these files anywhere. If the user picked a synced directory (iCloud, Dropbox,
  an Obsidian vault), that's their choice — but never embed them in CF_helpers commits.
- **No PII excess.** Skip personal demographics from the mentor CSV (email, race, gender,
  sexuality, military) — those are filtered out of `cf mentors search` already. Don't add them
  back in.
- **Honest provenance.** Frontmatter `sources.*` should say `not_found` when a lookup
  legitimately turned up empty (e.g. a mentor with no Pitch entry, a company with no LinkedIn).
  Tomorrow's reader needs to know what's been tried.
- **Stale is fine.** Don't refresh on every read — 60 days is the default freshness; only refresh
  earlier on explicit request.

## Tools used
- `mcp__pitch__pitch_search_companies`, `mcp__pitch__pitch_get_company`
- `cf-augment` (for web research)
- `cf mentors search --json` (for the CSV-based mentor lookup)
- `cf knowledge show | set | list | path` (CLI helpers in `bin/cf`)
- File I/O under `<knowledgeDir>/`

## How the other skills use this
`cf-mentor-match` and `cf-pitch-roulette` SHOULD prefer the local knowledge file when one exists
and is fresh — it's faster and includes any notes you've added. They fall back to fresh fetches
when no entry exists or it's stale, and they may invoke this skill to create / refresh the entry
on the way.
