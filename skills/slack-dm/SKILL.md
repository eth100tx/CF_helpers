---
name: slack-dm
description: >
  Send a direct message (or channel post) on the Capital Factory Slack from the command line,
  using a saved browser session (no Slack app/token needed). Use this skill whenever the user
  wants to DM someone on Slack — e.g. "DM myself a reminder", "send a Slack message to
  <nickname>", "post this to <person/channel> on Slack", or to push the daily mentor-slots
  report. Targets are short nicknames the user adds to a local nickname file, or raw Slack
  conversation ids. Requires a one-time sign-in via the slack-auth skill first.
---

# Slack DM Skill

Send a Slack DM (or channel post) on the **Capital Factory** workspace from the CLI. It posts
through Slack's web API using the session you signed into once (via **slack-auth**) — no Slack
app install needed; it reuses the token from your own logged-in session. Because it's the API,
**mrkdwn renders properly and multi-line content is preserved**, which is how the daily
mentor-slots report gets pushed. A browser fallback (`--browser`) is available if ever needed.

## Script & files

```
<skill>/scripts/slack.mjs        # the CLI (shared with slack-auth)
~/.slack-cf-auth.json            # saved session cookies (from slack-auth; no password on disk)
~/.slack-cf-nicknames.json       # nickname → conversation-id map (you build this)
~/.slack-cf-config.json          # { team, base }
```

Run with Node (v18+); Playwright is installed in the skill's `scripts/` dir.

## Sending a DM

```bash
cd <skill>/scripts
node slack.mjs dm <nick|conversation-id> "<message>"
```

Examples:
```bash
node slack.mjs dm me  "Reminder: prep the board deck"
node slack.mjs dm me --file ~/.cf-helpers/reports/latest.slack.md   # push a report (multi-line)
```

On success it prints `{ "sent": true, "via": "api", "to": {…}, "ts": …, "chars": … }`.

### IMPORTANT — confirm before sending
When **Claude** runs this on the user's behalf, always **dry-run first** and show the resolved
target + exact text, then wait for the user's explicit go-ahead before the real send:

```bash
node slack.mjs dm <target> "the message" --dry-run    # prints target + text, sends nothing
```
Only after the user confirms, re-run the same command **without** `--dry-run`.

`--headed` shows the browser window (debugging) instead of running headless.

### Verify the session (sends nothing)
```bash
node slack.mjs auth-test    # calls Slack auth.test; prints your user/team if the session is valid
```

## Nicknames

Targets are short nicknames resolved from `~/.slack-cf-nicknames.json`. **It ships empty** — add
your own. A natural first one is `me` (a self-DM), which is handy for reminders and for receiving
the daily report:

```bash
node slack.mjs nicks                                 # list nicknames
node slack.mjs nick add me  D0XXXXXXX "Me (self-DM)"  # add/replace
node slack.mjs nick add team C0XXXXXXX "#some-channel"
node slack.mjs nick rm me                            # remove
```

You can also pass a **raw conversation id** (`D…` DM, `C…` channel, `G…` private group) directly
instead of a nickname. To find a conversation id: open the DM/channel in Slack, click a message's
timestamp → **Copy link**; the id is the `…/archives/<ID>/…` segment of the URL. (Your own
self-DM is the "Messages to yourself" / your-name DM in the sidebar.)

## When it fails

- `No saved session` / `Session expired` → run the **slack-auth** skill (`node slack.mjs auth`) to refresh the login, then retry.
- `Unknown target` → the nickname isn't in the file; add it with `nick add` or pass a raw id.

## Notes

- **Default send is the Slack web API** (`chat.postMessage`): instant, renders Slack mrkdwn
  (`*bold*`, `_italic_`, `:emoji:`, `<url|text>` links), and preserves multi-line content.
- The API token + auth cookie are read from `~/.slack-cf-auth.json` and are **only ever sent to
  Slack's own API** — the same "reuse the saved session" pattern the union-calendar skill uses.
- `--browser` forces the web-client fallback (slower; it types into the composer and collapses
  newlines to spaces, so it's for plain one-liners only).
