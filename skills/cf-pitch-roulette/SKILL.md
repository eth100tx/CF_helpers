---
name: cf-pitch-roulette
description: >
  Pick 5 random Pitch.vc companies and produce a compact mentor-match suggestion for each
  — combining this week's open Capital Factory office-hours with the master mentor list.
  Use this skill whenever the user says "pitch roulette", "pitchvc roulette", "roulette",
  "5 random pitch companies", "surprise me with companies", "find me 5 startups to match
  mentors with", or similar serendipity prompts. The output is one Slack-mrkdwn block per
  company; default Slack target is the user's self-DM (`me`). Pairs with cf-mentor-match
  for the matching logic and cf-augment when a Pitch profile is thin.
---

# CF Pitch Roulette

Five random Pitch.vc companies, each with a short Tier 1 mentor pick. Built for
**serendipitous discovery** — surfacing companies you wouldn't have thought to look at,
plus a couple of mentors who could plausibly help each.

## When to trigger
*"pitch roulette"* / *"pitchvc roulette"* / *"roulette"* / *"5 random pitch companies"* /
*"surprise me with companies"* / *"find me 5 startups to match mentors with"*. Numbers
like 3 / 10 are accepted overrides on "5".

## Procedure

### 1. Build the candidate pool
- Call `mcp__pitch__pitch_list_companies({ limit: 100 })` (or higher if available — page if needed).
- This is your pool. **Do not** filter by city/stage/raising unless the user asks — the
  whole point is serendipity.

### 2. Sample 5 at random
- Pick **5 distinct random** entries from the pool. Use real randomness (e.g. shuffle and
  take the first 5; don't pick by index pattern).
- If the user said "5 random raising-now companies", filter to `raising_funds=true` first,
  then sample. If they said "3" or "10", honor that count.

### 3. Build a profile + pick mentors for each
For **each** of the 5 picks:

1. **Profile-check** — `mcp__pitch__pitch_get_company({ slug })`. Note tagline, tags, city,
   stage, raising-status, url.
2. **If the profile is thin** (sparse tagline / few tags), invoke **cf-augment** with the
   company name + url. (Read the augmentation file it writes; don't re-fetch.)
3. **Match against open mentor sessions**: `cf report` → read the latest
   `~/.cf-helpers/reports/mentor-slots-*.json`. Apply the same scoring as **cf-mentor-match**
   (tag overlap, tagline-keyword × mentor-tags, stage-relevance). Pick **at most 2** Tier 1
   mentors per company — this is a roulette, not a full report.
4. **Off-hours add** *(optional, pick at most 1)* — call `cf mentors search --tags <…>
   --not-hosting-this-week --limit 5 --json` against the master mentor CSV and pick at most
   **one** off-hours mentor per company. Skip silently if no strong fit.

### 4. Compose the Slack message
Use this shape — **one combined message**, 5 sections:

```
*:slot_machine: Pitch Roulette — 5 random companies, mentor picks*
_<short metadata: total pool size · selected at random · date>_

*1. <CompanyName>* — _<city · stage · raising-status>_
> <tagline-truncated-to-1-line>
• *<MentorA>* — <Day h:MMam–h:MMpm> · <location-short> · _<one-line why>_ · <book-url|Book>
• *<MentorB>* — … · _<why>_ · <book-url|Book>
• :mag: *Off-hours:* <Name>, <Title> @ <Co> — _<why>_ · <linkedin|LI> · <union-link|Hrs>

*2. <CompanyName>* — …
[…repeat for 3, 4, 5…]

_Match logic = tag overlap (Pitch tags × mentor tags/specialties). 60s glance at each
mentor's union.vc bio recommended before booking._
```

If a roulette pick has **no plausible matches** (truly off-topic for this week's mentors),
include it with a single line:
`• _No strong match in this week's slots — try again next week or DM <coordinator> for
ideas._`

### 5. Send (only on request)
- Default target is `me` (self-DM) — 5 companies is a lot to push to anyone else
  unsolicited.
- Always dry-run first; show resolved target + text; wait for explicit go-ahead.
- If the user says "push to <X>" or "send to <X>", use that nickname instead, still with
  dry-run.

## Rules
- **True random**, not "recent" or "Austin". Honor explicit filter words if given.
- **Per-company budget**: 2 Tier 1 mentors max + 1 off-hours max. Keep each section
  scannable.
- **Compactness**: the whole message should fit on one screen. No multi-paragraph
  rationales.
- **Honest gaps**: if a company doesn't fit any mentor this week, say so. Don't
  manufacture a match.
- Same "actionable beats analytical" rule as cf-mentor-match — give a mentor + a time +
  a 1-line why + a book link.

## Tools used
- `mcp__pitch__pitch_list_companies`, `mcp__pitch__pitch_get_company`
- `cf report` / mentor-slots-*.json
- `cf mentors search --json` (for off-hours master-list picks)
- **`cf-augment`** (when a Pitch profile is thin)
- `cf slack me --file <tmp> --dry-run` then without `--dry-run`
