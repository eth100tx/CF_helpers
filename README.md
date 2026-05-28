# CF_helpers

Command-line + Claude Code helpers for the **Capital Factory** ecosystem. One `cf connect` command
wires your machine up to:

| Integration | What you get | How it's accessed |
|---|---|---|
| **union.vc** | Pull the Capital Factory community calendar; build the daily **mentor office-hours** report | CLI (saved browser session) |
| **Capital Factory Slack** | Send DMs / channel posts; push the mentor report | CLI (saved browser session) |
| **Pitch.vc** | Search companies, manage pipeline, people, tags, reviews… | Claude Code via the Pitch **MCP server** |
| **Gmail** | Paste-ready HTML version of the report | Assumed already integrated (your normal Gmail) |
| **Mentor matching** | Given a CF company, get a tiered list of mentor matches from this week's open office-hours **plus** off-hours intro-request candidates drawn from your master mentor CSV, then DM it to your coordinator | Claude Code skill (`cf-mentor-match`) |
| **Pitch Roulette** | 5 random Pitch companies with a compact mentor pick for each — serendipitous discovery | Claude Code skill (`cf-pitch-roulette`) |
| **Augmentation** | Public-LinkedIn + website + WebSearch research, cached locally; auto-invoked when a profile is thin | Claude Code skill (`cf-augment`) |

Everything runs **locally** using sessions you sign into once — no Slack app install, no bot tokens,
and **no passwords are ever written to disk** (only the resulting session cookies, which stay on your
machine and are sent only to each service's own API).

---

## Quick start

### Option A — let Claude Code set it up
Open this repo in Claude Code (or just point Claude at the GitHub URL) and say **"set up CF_helpers
on this machine."** Claude reads [`CLAUDE.md`](CLAUDE.md), walks you through the sign-ins, asks for
your Pitch API key, and tests every integration.

### Option B — run it yourself
```bash
git clone https://github.com/eth100tx/CF_helpers.git
cd CF_helpers
node bin/cf connect
```

`cf connect` will:
1. Install the three skills into `~/.claude/skills/` and install Playwright.
2. Open a browser for you to sign in to **union.vc**, then test the calendar pull.
3. Open a browser for you to sign in to **Capital Factory Slack**, then verify with `auth.test`.
4. Ask for your **Pitch API key** (input hidden) and register the Pitch MCP server, then verify it.
5. Link `cf` onto your `PATH` and run a final `cf doctor`.

When it finishes, **you're connected and can work.**

> **Heads up:** `cf connect` opens real browser windows for the union.vc and Slack sign-ins — *you*
> complete those logins (including any SSO / 2FA). Claude never types your password.

---

## Everyday commands

```bash
cf doctor                 # re-test all integrations (read-only, no sign-in)
cf report                 # build the mentor office-hours report → ~/.cf-helpers/reports/
cf daily                  # build the report AND push it to your Slack target (no Claude needed)
cf calendar --weeks 4     # dump the union.vc calendar as JSON
cf slack me "ping" --dry-run   # preview a Slack DM (then drop --dry-run to send)
cf install-daily 07:00    # schedule `cf daily` every morning at 7:00 (macOS launchd)
cf uninstall-daily        # remove that schedule

cf mentors show           # what mentor CSV is configured + active count
cf mentors set <path>     # point at your master mentor CSV
cf mentors search --tags Defense,Hardware --not-hosting-this-week --limit 6
```

Natural-language calls from Claude:
- *"match mentors to TrailSense and push to my coordinator"* → `cf-mentor-match`
- *"pitch roulette — 5 random"* → `cf-pitch-roulette`
- *"research Dave Morris"* → `cf-augment`

The **daily report runs without Claude** — `cf install-daily` registers a macOS launchd job that
runs [`scripts/daily_report.sh`](scripts/daily_report.sh) → `cf daily` → generate + push to Slack.
See [`docs/DAILY.md`](docs/DAILY.md).

---

## What gets stored on your machine

| File | Contents |
|---|---|
| `~/.union-vc-auth.json` | union.vc session cookies (no password) |
| `~/.slack-cf-auth.json` | Slack session cookies + token (no password) |
| `~/.slack-cf-nicknames.json` | your Slack nickname → conversation-id map (you build this) |
| `~/.claude.json` → `mcpServers.pitch` | Pitch MCP config incl. your `PITCH_API_KEY` |
| `~/.cf-helpers/` | your config, generated reports, daily-job log |

None of these are part of this repo, and `.gitignore` is set up so they can never be committed.

---

## Docs

- [`docs/SETUP.md`](docs/SETUP.md) — manual setup, prerequisites, troubleshooting
- [`docs/UNION.md`](docs/UNION.md) — the union.vc calendar + mentor report
- [`docs/SLACK.md`](docs/SLACK.md) — Slack auth + sending
- [`docs/PITCH.md`](docs/PITCH.md) — the Pitch MCP server
- [`docs/GMAIL.md`](docs/GMAIL.md) — using the report in Gmail
- [`docs/DAILY.md`](docs/DAILY.md) — the unattended daily report
- [`CLAUDE.md`](CLAUDE.md) — how Claude Code sets up a machine from this repo

## Requirements

- macOS or Linux (the launchd scheduler is macOS-only; everything else is cross-platform)
- **Node.js 18+** and npm
- A Capital Factory account for union.vc + Slack; a Pitch.vc account for the Pitch MCP

## Privacy & scope

This is an unofficial community helper, not an official Capital Factory product. It only talks to
union.vc, Slack, and Pitch.vc using *your own* logged-in sessions and *your own* API key. Generated
reports can contain other people's names (mentors, hosts) — they're written under `~/.cf-helpers/`
and are git-ignored, so think before sharing them outside the community.
