# union.vc — calendar & mentor report

Pulls the **Capital Factory** community calendar from union.vc and builds the **available mentor
office-hours** report. Reuses a saved browser session, so after the one-time login the pulls launch
no browser and are fast.

Scripts (installed by `cf connect`): `~/.claude/skills/union-calendar/scripts/`
- `union_calendar.mjs` — raw calendar pull
- `mentor_report.mjs` — the mentor-slots report (Slack / Gmail / text)

## Sign in (once)
```bash
node ~/.claude/skills/union-calendar/scripts/union_calendar.mjs login
# or, headless, if you have the credentials in env:
UNION_EMAIL='you@example.com' UNION_PASSWORD='…' node …/union_calendar.mjs login
```
Saves cookies to `~/.union-vc-auth.json` (no password on disk) and the network slug to
`~/.union-vc-config.json`. Re-run whenever a pull reports the session expired.

## Pull the calendar
```bash
node …/union_calendar.mjs pull [--weeks N] [--date YYYY-MM-DD] [--network SLUG] [--out FILE] [--raw]
# default: this week + next week, as JSON on stdout
cf calendar --weeks 4 > month.json
```

## Mentor report
```bash
node …/mentor_report.mjs [--out-dir DIR] [--network SLUG] [--tz ZONE] [--no-save]
# or just:
cf report      # writes to ~/.cf-helpers/reports/, tz America/Chicago (Austin)
```
Keeps only **open** sessions (`isBookable` and `availableSlots > 0`) and writes:
- `latest.slack.md` / `latest.gmail.html` / `latest.txt` — newest, easy to script/paste
- `mentor-slots-YYYY-MM-DD.{slack.md,gmail.html,txt,json}` — dated archive

It prints a Slack + text preview to stderr and a one-line JSON summary (`openSessions`, `openSlots`)
to stdout.

## How it works
The agenda page `union.vc/<network>/programming` loads from
`GET /<network>/programming.json?date=YYYY-MM-DD`, which returns the week containing that date. The
tool fetches one date per week and normalizes each event (title, type, start/end, location, virtual
flags, tags, host, url, booking status). Default network is `capital_factory`.
