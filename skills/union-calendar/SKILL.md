---
name: union-calendar
description: >
  Pull the union.vc community calendar (Capital Factory and other UNION networks) into
  machine-readable JSON. Use this skill whenever the user wants this week's and/or next
  week's events, office hours, or programming from union.vc — e.g. "pull the union calendar",
  "what's on the Capital Factory calendar this week", "get the week and week+1 schedule",
  "export union.vc events to JSON". Also generates the available-mentor-office-hours report
  ("daily mentor report", "available mentor slots", "what mentor office hours are open",
  "mentor slots report") formatted for Gmail and Slack. Handles login once and reuses the
  saved session so later pulls are fast and need no browser.
---

# Union Calendar Skill

Pull the union.vc agenda/programming calendar into clean JSON for downstream processing.
The default pull returns **this week and next week** ("week and week+1").

## Script location

```
~/.claude/skills/union-calendar/scripts/union_calendar.mjs
```

Run with Node (v18+). Playwright is installed in the skill's `scripts/` dir.

## Quick start

```bash
cd ~/.claude/skills/union-calendar/scripts
node union_calendar.mjs pull
```

If that errors with "No saved session" or "Session may have expired", run `login` first (below),
then re-run `pull`.

## Commands

### pull — get the calendar as JSON (the main command)

```bash
node union_calendar.mjs pull [--weeks N] [--date YYYY-MM-DD] [--network SLUG] [--out FILE] [--raw]
```

- No browser launch — uses the saved session cookies, so it's fast.
- Default: 2 weeks starting today (this week + next week).
- `--weeks N` — fetch N consecutive weeks starting from `--date` (default today).
- `--date YYYY-MM-DD` — anchor for "week 0" (any day in the target week works; the server returns that week).
- `--network SLUG` — community slug (default: the slug saved at login, else `capital_factory`).
- `--out FILE` — write JSON to FILE instead of stdout (a one-line summary goes to stderr).
- `--raw` — emit raw union.vc items instead of the normalized shape.

Prints JSON to stdout, so it pipes/redirects cleanly:
```bash
node union_calendar.mjs pull --out /tmp/union-week.json
node union_calendar.mjs pull --weeks 4 > month.json
```

### mentor-report — available mentor office-hours report (run on demand, e.g. daily)

```bash
node ~/.claude/skills/union-calendar/scripts/mentor_report.mjs [--out-dir DIR] [--network SLUG] [--tz ZONE] [--no-save]
```

Pulls this week + next week, keeps only **open** sessions (`isBookable` and `availableSlots > 0`),
and writes the report in three formats to `--out-dir` (default `./mentor-reports` in the current
directory). Times render in `--tz` (default `America/Chicago`, Austin), independent of machine zone.

Files written each run:
- `latest.gmail.html` / `latest.slack.md` / `latest.txt` — always the newest (easy to script/paste)
- `mentor-slots-YYYY-MM-DD.{gmail.html,slack.md,txt,json}` — dated archive

It prints a Slack + text preview to **stderr** and a one-line summary (`openSessions`, `openSlots`,
`savedDir`) as JSON to **stdout**. Paste `latest.gmail.html` into a Gmail compose (or use it as the
HTML body) and `latest.slack.md` into Slack. If it errors that the session expired, run `login`.

> This is the "daily process": run it whenever you want a fresh report — it overwrites `latest.*`
> and adds a dated copy. No system scheduler is installed.

### login — sign in once and save the session

```bash
# Headless auto-login (no window) when credentials are in the environment:
UNION_EMAIL='you@example.com' UNION_PASSWORD='…' node union_calendar.mjs login

# Or interactive — opens a browser window to sign in manually:
node union_calendar.mjs login
```

Saves the session cookies to `~/.union-vc-auth.json` and the detected community slug to
`~/.union-vc-config.json`. **No password is written to disk** — only the resulting session
cookie is saved. Re-run `login` whenever `pull` reports the session expired.

## Output shape

```jsonc
{
  "generatedAt": "2026-05-26T16:53:11.827Z",
  "network": "capital_factory",
  "weeks": [
    {
      "index": 0,
      "anchorDate": "2026-05-26",
      "count": 16,
      "byDay": { "2026-05-26": 4, "2026-05-27": 3, "2026-05-28": 7, "2026-05-29": 2 },
      "events": [ /* normalized event objects */ ]
    },
    { "index": 1, "anchorDate": "2026-06-02", "count": 21, "byDay": { … }, "events": [ … ] }
  ]
}
```

Each normalized event:

| field | meaning |
|---|---|
| `title`, `summary` | event name; plain-text description (HTML stripped) |
| `type`, `label` | `Event` / `OfficeHour` / `PrivateOfficeHour` |
| `start`, `end` | ISO 8601 with timezone offset |
| `day` | `YYYY-MM-DD` (handy for grouping) |
| `location` | physical location string, or `null` |
| `virtual`, `isVirtualOnly`, `isVirtualFriendly` | video provider name + virtual flags |
| `tags` | array of topic/industry tag names |
| `host`, `hostHeadline` | first author's name and headline |
| `url` | absolute link to the event page |
| `availableSlots`, `isBookable`, `isBooked`, `isScarce` | RSVP / booking status |
| `isAttending`, `isHosting`, `isPast` | the signed-in user's relationship to the event |

## How it works (for maintenance)

- The agenda page `https://union.vc/<network>/programming` loads its data from
  `GET /<network>/programming.json?date=YYYY-MM-DD`, which returns the **week containing
  that date** as a JSON array. The skill fetches one date per week (today, today+7, …).
- Login posts the Devise form (`POST /sign-in`, fields `user[email]` / `user[password]`,
  trigger `[data-target="login-modal"]`) and persists the session via Playwright storage state.
- `pull` uses Playwright's `request` context (cookies only, no Chromium launch).

## Notes

- A pull returning HTML instead of JSON means the session expired → run `login` again.
- The network slug defaults to `capital_factory`; override with `--network` for other UNION communities.
