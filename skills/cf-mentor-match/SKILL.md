---
name: cf-mentor-match
description: >
  Given a Capital Factory company (a Pitch.vc slug / name / URL, or any company URL),
  produce a tiered list of mentor-match recommendations from this week's open
  Capital Factory office-hours slots and (on request) DM them to the user's CF mentor
  coordinator on Slack (conventional nickname `eli`). Researches the company further
  via its website / web search when the Pitch profile is thin. Use this skill whenever
  the user asks to "match mentors to <X>", "find mentors for <X>", "who at CF can help
  <X>", "mentor recs for <X>", or pastes a pitch.vc link / company URL together with
  words like mentor/match/office hours. Pairs with the union-calendar, slack-dm, and
  Pitch MCP integrations.
---

# CF Mentor Match

Given a Capital Factory company, return a tiered list of mentor matches from the current
open office-hours slots, each with a one-line *why*, and (on user request) DM the result
to the user's **CF mentor coordinator** on Slack (conventional nickname `eli` —
each user maps that nickname to whoever their coordinator is via the slack-dm skill).

## When to trigger
The user gives a company reference and any of: "match mentors", "mentor recs", "who at CF
can help", "find mentors for", "do a mentor match", "push this to the mentor coordinator".
A bare pitch.vc URL plus the word *mentor* is enough.

## Inputs you accept
- A **name** (e.g. "TrailSense")
- A **Pitch slug** (e.g. `trailsense`) or **Pitch URL** (`https://pitch.vc/<slug>` / `/c/<slug>`)
- Any **company URL** (the company's own site, LinkedIn, etc.) — extract what you can; if you
  also have a name, look it up in Pitch in parallel.

## What you produce
A Slack-mrkdwn message (see template below) with **Tier 1 / Tier 2 / Suggested plan**.
Default destination is **DM to `eli`** via the slack-dm skill, but only after a dry-run
that the user confirms.

---

## Pipeline

### 1. Resolve the company
- If the input contains `pitch.vc/<slug>` (or `pitch.vc/c/<slug>`), pull the slug from the
  URL and call `mcp__pitch__pitch_get_company({ slug })` directly.
- Otherwise call `mcp__pitch__pitch_search_companies({ query: <name-or-keywords>, limit: 5 })`
  and pick the top hit (verify slug + name make sense), then `pitch_get_company({ slug })`.
- Capture: **name, tagline, tags (names), city, funding_stage, raising_funds, url, founded_year**.

### 2. Decide if you need more research
The Pitch profile is **thin** when **any** of these are true:
- `tagline` is empty, generic, or under ~30 chars
- fewer than ~3 substantive tags (or only generic ones like "Technology")
- `url` is missing
- The tagline doesn't disambiguate what they actually *do* / *sell* / *to whom*

When thin (or whenever the user pasted a non-Pitch URL):
- `WebFetch(<company-url>, "What does <Name> do? Who do they sell to? What technology? Stage? Defense / regulated angle?")`
- If still thin, `WebSearch("<Name> Capital Factory Austin <one-keyword-from-tagline>")` or similar.
- Build a 2-3 sentence internal understanding before scoring.

### 3. Pull the open mentor slots
Prefer the structured JSON (no re-parsing of mrkdwn):

```bash
# Refresh and read the JSON
node ~/.claude/skills/union-calendar/scripts/mentor_report.mjs --out-dir ~/.cf-helpers/reports >/dev/null 2>&1
# Then read ~/.cf-helpers/reports/mentor-slots-YYYY-MM-DD.json
```

Or just run `cf report` (same outcome). Each session in the JSON has `host`, `start`, `end`,
`location`, `isVirtualOnly`, `virtual`, `tags`, `open`, `slotMins`, `url`. **Filter to
sessions whose `start` is in the future** — `mentor_report.mjs` already drops past/booked,
but double-check.

### 4. Score & rank
For each open session compute:
- **Direct tag overlap** between the company's Pitch tags and the mentor's listed tags.
- **Keyword overlap** between the company's tagline (+ your researched understanding) and
  the mentor's tags (e.g. tagline says "edge inference" → mentor with "Edge Computing").
- **Stage relevance** — if `raising_funds === true` *or* `funding_stage` is Pre-Seed/Seed,
  pitch-deck / fundraising / angel-investors mentors are high priority for a *separate*
  fundraising track.
- **Adjacent value** — for regulated / dual-use companies, security & compliance, policy &
  advocacy, federal-gov mentors matter even without a direct tag overlap.
- **Penalize/skip** mentors whose tags are in unrelated domains (food, retail, biotech for
  non-bio) *unless* a real overlap exists in the tagline.

Bucket into:
- **Tier 1 — book these (3-5 picks):** high-confidence domain match
- **Tier 2 — strong adds (2-4 picks):** useful adjacencies
- **Skip everyone else** silently (don't list them in the Slack output)

### 5. Build the Slack message (mrkdwn)
Use this exact shape (replace placeholders, keep emoji + Book links intact):

```
*:satellite: <CompanyName> — CF mentor matches this week*
_<1-line summary: what they do · 2-3 key tags · city · stage / raising-status>._

*:large_green_circle: Tier 1 — book these*
• *<Mentor>* — <Day Mon D, h:MMam–h:MMpm> · <location-short> · _<one-line why>_ · <book-url|Book>
• …

*:large_yellow_circle: Tier 2 — strong adds*
• *<Mentor>* — … · _<one-line why>_ · <book-url|Book>
• …

*Suggested plan*
• <Day h:MMam> — <Mentor> _(optional note)_
• …  ← include any back-to-back / conflict notes here

_Match logic = tag overlap between <Company>'s Pitch profile and each mentor's listed CF tags. Tier 1 is high-confidence; worth a 60s glance at each mentor's union.vc bio before booking._
```

**Formatting rules:**
- Bold *mentor names* with `*…*` (Slack mrkdwn).
- Italicize the *why* with `_…_`.
- Each session line ends with the **clickable Book link**: `<https://union.vc/.../events/<id>|Book>` (Slack auto-formats angle brackets).
- Each `why` should reference *which tag(s) / which need* — never vague.
- Each mentor's window may span 2 hours but slots are 20–30 minutes; the *Suggested plan*
  must avoid overlaps. If two mentors' windows overlap, pick a non-conflicting 30-min slot
  within each (e.g. *"Thu 10:30am Joe → 12:00pm Eric → 1:00pm Sean"* when Joe is 10:30–12:30
  and Eric is 11–1).

### 6. Confirm-and-send (when the user wants it on Slack)
1. Write the message to a temp file (e.g. `/tmp/mentormatch_<company>.slack.md`).
2. Dry-run: `cf slack eli --file <tmp> --dry-run` (or `node …/slack-dm/scripts/slack.mjs dm eli --file <tmp> --dry-run`).
3. Show the user the resolved target + the formatted text.
4. **Wait for an explicit go-ahead.** Then send with the same command minus `--dry-run`.

If the user didn't ask to send it to Slack, just return the formatted block in chat and
**offer** to push it to `eli`.

---

## Rules

- **Always dry-run first** before any Slack send. Outward-facing DM = always confirm.
- **Default Slack target is the nickname `eli`** — the conventional handle for the user's
  CF mentor coordinator. The actual conversation id behind it lives in
  `~/.slack-cf-nicknames.json` (set up by the user via the slack-dm skill). If the
  nickname isn't defined yet, ask the user who their mentor coordinator is and add it
  with `slack.mjs nick add eli <D…> "<Name>"` before sending.
- **Be honest about the match logic.** Tag overlap is not deep due diligence. Always
  include the brief caveat line at the bottom of the message.
- **Actionable beats analytical.** The coordinator (and the founder) want: *mentor + time
  + 1-line why + Book link.* Don't pad.
- **Tier 1 is precious.** Cap at 5; ideally 3-4. The list should feel curated.
- **Future-only.** Don't recommend a slot whose start is in the past.

## Tools used
- `mcp__pitch__pitch_search_companies`, `mcp__pitch__pitch_get_company`
- `WebFetch` (the company's own URL) and optionally `WebSearch` (when Pitch is thin)
- `cf report` *or* `node ~/.claude/skills/union-calendar/scripts/mentor_report.mjs` (then read the JSON in `~/.cf-helpers/reports/`)
- `cf slack eli --file <path> --dry-run` then without `--dry-run`

## Worked example
- Input: *"do a mentor match for `<defense-hardware-startup>` and push to the mentor coordinator"*
- Pitch profile rich (clear tagline + 8+ relevant tags incl. Defense, Hardware, AI, Deep Tech;
  raising at Seed). → No further research needed.
- ~13 open sessions across the week.
- **Tier 1**: a mentor tagged *Federal Government + Police & Safety* (= the buyer view);
  a *Pitch Deck + Fundraising* mentor (because raising); an *Edge Computing* mentor
  (= the technical core of distributed sensors); a *Security + Compliance* mentor
  (CMMC/FedRAMP is the federal procurement gate).
- **Tier 2**: a second pitch-deck reviewer (different lens); an *Enterprise Sales* mentor
  (dual-use commercial GTM); a *Policy & Advocacy* mentor (SBIR/AFWERX/DIU navigation).
- Dry-run shown → user confirmed → sent to `eli`.
