# Setup

## Prerequisites
- **Node.js 18+** and **npm** (`node -v`, `npm -v`). On macOS: `brew install node`.
- A **Capital Factory** account (for union.vc and Slack) and, optionally, a **Pitch.vc** account.
- macOS or Linux. The unattended daily scheduler uses macOS **launchd**; the rest is cross-platform.

## The one command
```bash
git clone https://github.com/eth100tx/CF_helpers.git
cd CF_helpers
node bin/cf connect
```
`cf connect` is **idempotent** — re-run it any time. It skips anything already set up (add `--force`
to reinstall the skills/deps). It performs:

1. **Install skills** → copies `skills/{union-calendar,slack-dm,slack-auth}` into `~/.claude/skills/`
   so Claude Code can discover them and the `cf` CLI can run them.
2. **Install Playwright** → `npm install` in the two `scripts/` dirs + `npx playwright install chromium`.
3. **union.vc sign-in** → opens a browser; you sign in; it saves the session and test-pulls the calendar.
4. **Slack sign-in** → opens a browser; you sign in; it verifies with `auth.test`. Optionally records
   your daily-report Slack target.
5. **Pitch** → asks for your API key (hidden input), writes the MCP config, and verifies it.
6. **PATH link** → symlinks `cf` into `/usr/local/bin` or `~/.local/bin`.
7. **`cf doctor`** → final read-only check of all three integrations.

## Project-local workspace (optional)
To keep a project self-contained instead of using `~/`, run `cf init [dir]` — it scaffolds
`memory/`, `data/`, and `.cf-helpers/` and makes any `cf`/skill run from inside that dir use it
(`CF_HOME` = `$CF_HOME` → nearest ancestor `.cf-helpers/config.json` → `~/.cf-helpers`). Secrets
still live in `~/` and are not copied in.

> **Note on Playwright:** the Chromium download (step 2) is only needed for the browser sign-ins.
> `cf report`/`cf daily`/`cf calendar` and Slack API sends run over HTTP with no browser, so a
> machine that already has valid sessions can skip it.

## Manual / piecemeal setup
See [UNION.md](UNION.md), [SLACK.md](SLACK.md), and [PITCH.md](PITCH.md) for the individual steps if
you'd rather not use `cf connect`.

## Re-checking later
```bash
cf doctor      # read-only; tells you what's working and what needs a re-auth
```

## Troubleshooting
- **`cf: command not found`** — the PATH link didn't take. Run via `node /path/to/CF_helpers/bin/cf`,
  or add the link dir to your shell PATH (e.g. `export PATH="$HOME/.local/bin:$PATH"` in `~/.zshrc`).
- **"No saved session" / "Session expired"** — re-run `cf connect` (it'll re-open the right sign-in),
  or the specific tool's auth (`node … union_calendar.mjs login`, `node … slack.mjs auth`).
- **Playwright browser errors** — re-run `npx playwright install chromium` inside
  `~/.claude/skills/slack-dm/scripts`.
- **Pitch tools don't appear in Claude** — MCP servers load at startup; **restart Claude Code**.
- **npm `EACCES` cache errors** — `cf` already points the Pitch server at a private npm cache
  (`~/.npm-mcp-cache`). If `npm install` itself fails this way, fix your cache ownership
  (`sudo chown -R "$(whoami)" ~/.npm`).
