# CLAUDE.md — setting up CF_helpers on a machine

You are helping a Capital Factory member connect their computer to the CF tools in this repo:
**union.vc** (calendar + mentor report), **Capital Factory Slack** (DMs / report push), and
**Pitch.vc** (via an MCP server). Gmail is assumed already integrated.

## The fast path
In almost all cases, just run the interactive installer and let it drive:

```bash
node bin/cf connect
```

It is idempotent and safe to re-run. It will: install the skills into `~/.claude/skills`, install
Playwright, open browser windows for the union.vc and Slack sign-ins, ask for the Pitch API key,
register the Pitch MCP server, and test everything. Walk the user through it and report the result.

## Rules of engagement
- **Never type the user's passwords or complete SSO for them.** The browser windows that open during
  `cf connect` are for *the user* to sign in. Tell them to complete the login; the script detects
  success and closes the window.
- **The Pitch API key is a secret.** Have the user paste it into the hidden prompt that `cf connect`
  shows (or set it yourself only if they explicitly hand it to you). Never echo it back, never write
  it anywhere except `~/.claude.json` (where `cf connect` puts it), and never commit it.
- **Confirm before sending anything to Slack.** When you send on the user's behalf, always run with
  `--dry-run` first, show the resolved target + exact text, and wait for an explicit go-ahead.
- This is a **public repo** — never add personal data, conversation ids, emails, or API keys to any
  file you commit here. Generated reports (`~/.cf-helpers/reports/`) and all session files are
  git-ignored; keep it that way.

## If you're doing it step by step instead of `cf connect`
1. Check Node ≥ 18 (`node -v`).
2. `node bin/cf` is the entrypoint; the skills live in `skills/` and are installed to
   `~/.claude/skills/` so Claude Code can discover them.
3. Install deps: `npm install` in `~/.claude/skills/union-calendar/scripts` and
   `~/.claude/skills/slack-dm/scripts`, then `npx playwright install chromium`.
4. union.vc: `node ~/.claude/skills/union-calendar/scripts/union_calendar.mjs login` → user signs in.
   Test: `… union_calendar.mjs pull --weeks 1`.
5. Slack: `node ~/.claude/skills/slack-dm/scripts/slack.mjs auth` → user signs in.
   Test: `… slack.mjs auth-test`.
6. Pitch: get the user's `pitch_…` key and add the MCP server (see `docs/PITCH.md`). Note that MCP
   servers only load when **Claude Code restarts**.

## Verifying
Finish with `node bin/cf doctor` and report the status of each integration. After Pitch is added,
remind the user to **restart Claude Code** so the Pitch MCP tools load.

## After setup, what the user can do
- "build the mentor report" → `cf report`
- "push the mentor report to Slack" → `cf daily` (or `cf slack me --file …` after a dry-run)
- "schedule the daily report at 7am" → `cf install-daily 07:00`
- **"match mentors to <CF company>"** → the **`cf-mentor-match`** skill triggers automatically;
  it reads the company from Pitch (researching the web if the Pitch profile is thin), scores
  it against this week's open office-hours, and (on request) DMs the tiered picks to the
  user's CF mentor coordinator on Slack (conventional nickname `eli`; each user maps it to
  their own coordinator's DM via the slack-dm skill). Dry-run first, always.
- Pitch work happens through the `mcp__pitch__*` tools once the server is loaded.
