---
name: cf-augment
description: >
  Augment a sparse profile of a Capital Factory mentor or a Pitch.vc company by pulling
  public LinkedIn, the company / personal website, and web search snippets, then writing
  a compact local research brief to ~/.cf-helpers/augmentation/<slug>.md. Use this skill
  whenever the user says "research <name>", "augment <name>", "look up <name>", "find
  more on <X>", or whenever another CF skill (cf-mentor-match, cf-pitch-roulette) needs
  more context because the Pitch profile or mentor record is thin. Stays local — never
  commits anywhere, never leaves the machine.
---

# CF Augment

Take a name (a mentor, a company, or both) plus any URLs you've already got, gather public
signals (LinkedIn, website, web search), and write a short markdown brief under
`~/.cf-helpers/augmentation/`. Designed to feed the other CF skills when the primary
source (Pitch profile, mentor CSV row) is too thin to score well.

## When to trigger

- The user explicitly asks: *"research <X>"*, *"augment <X>"*, *"look up <X>"*, *"find more on <X>"*.
- Another CF skill calls this internally because:
  - A Pitch company has empty/generic tagline or fewer than ~3 substantive tags.
  - A mentor's CSV `Mentor Bio` + `Session Description` are both under ~100 chars total
    (or missing).
  - You need to disambiguate ("which Sean Hill?", "is this the same company?").

## Inputs

- **Name** (mentor name or company name) — required.
- **Optional context**: known LinkedIn URL, known company website, current role/title,
  city, anything the caller already has.

## Procedure

### 1. Slug + cache check
- `slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')`
- If `~/.cf-helpers/augmentation/<slug>.md` exists and `refreshedAt` is within ~60 days,
  **reuse it** — read and return it, don't re-fetch.

### 2. Gather (public only)
Try each of these; partial success is fine. Log every attempt.

- **LinkedIn (public)** — if a URL was provided, use it directly; otherwise guess
  `https://www.linkedin.com/in/<slug>/` (for people) or
  `https://www.linkedin.com/company/<slug>/` (for companies). `WebFetch(url, "Summarize role,
  experience, areas of expertise. Return 'STUB' if the page is just a login wall.")`. LinkedIn
  often returns a login-walled stub for unauthenticated requests — that's expected. Log the
  outcome.
- **Company/personal site** — `WebFetch(<url>, "What do they do? Who do they sell to? What
  technology? Stage / size? Customer examples? Any defense / regulated angle?")`.
- **Web search** — `WebSearch("<Name> <one-context-keyword>")` for snippets. Use
  the most specific context phrase you have (their city, their company, their domain).
  Read the results, don't re-fetch every link.

### 3. Synthesize
Write a short brief (200-400 words max) focused on **what helps mentor matching** — skip
press / marketing prose. Structure:

```markdown
---
name: <Name>
slug: <slug>
type: mentor | company
refreshedAt: <ISO timestamp>
sources:
  linkedin: success | stub | blocked | not_tried
  website: success | failed | not_tried
  websearch: <yes|no>
---

# <Name>

**TL;DR** — 1-2 sentence summary written for "would they be a useful match for a CF startup".

## Domains / expertise
- bullet list

## Notable signals
- companies (current + past), if mentor
- customer segments / vertical focus, if company
- any defense / regulated / hardware / edge / AI signals worth flagging

## Match-relevant tags (suggested)
- comma-separated list of tag-style strings the caller can use for scoring

## Caveats
- e.g. "LinkedIn returned a stub; brief is based on company site + web search only."
```

### 4. Save + log
- Write to `~/.cf-helpers/augmentation/<slug>.md` (overwrite if older).
- Append one line to `~/.cf-helpers/augmentation.log`:
  `<ISO>\t<slug>\tlinkedin=<status>\twebsite=<status>\twebsearch=<yes|no>\tsuggested_tags=<n>`
- Return: the file path and the brief content to whatever called you.

## Rules

- **Public sources only.** No login, no scraping behind auth. If WebFetch is blocked or
  returns a stub, log it and move on; don't retry aggressively.
- **PII restraint.** Do not record anyone's email, phone, demographic categories (race,
  gender, sexuality, military affiliation), or anything they didn't put on their public
  profile. Stick to professional / matching-relevant facts.
- **Never commit.** `~/.cf-helpers/` is git-ignored. Don't move or copy augmentation files
  into the repo.
- **Stale-OK.** A 60-day-old brief is fine for routine matching. Force a refresh only
  if the caller explicitly asks ("refresh <name>", "re-research <name>").

## Tools used
- `WebFetch` (public LinkedIn URL, company/personal site)
- `WebSearch`
- Standard file write to `~/.cf-helpers/augmentation/<slug>.md`

## LinkedIn outcome tracking
We expect public LinkedIn fetches to be hit-or-miss (most return a login-walled stub).
The append-only `~/.cf-helpers/augmentation.log` lets us see, over time, whether public
LinkedIn is yielding enough to be worth the call or if we should build a saved-session
`linkedin-auth` skill (like `slack-auth` / `union-calendar`'s sign-in flow). Treat that
log as the evidence base for that decision.
