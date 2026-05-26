# Capital Factory Slack — auth & sending

Send DMs and channel posts on the **Capital Factory** Slack from the CLI, using a session you sign
into once. It posts through Slack's web API (`chat.postMessage`), so **mrkdwn renders and multi-line
content is preserved** — that's how the mentor report ships. No Slack app install, no bot token.

Script (installed by `cf connect`): `~/.claude/skills/slack-dm/scripts/slack.mjs`

## Sign in (once)
```bash
node ~/.claude/skills/slack-dm/scripts/slack.mjs auth
```
A browser opens to `capitalfactory.slack.com`; **you** sign in (Google / Apple / email / password).
The script detects the logged-in web client, saves the session to `~/.slack-cf-auth.json` (cookies +
token, **no password**), records the workspace id in `~/.slack-cf-config.json`, and closes the window.

Verify any time without sending:
```bash
node …/slack.mjs auth-test        # prints your user/team if the session is valid
```

## Send a message
```bash
node …/slack.mjs dm <nick|conversation-id> "your message"
node …/slack.mjs dm me --file ~/.cf-helpers/reports/latest.slack.md   # push a report
# via cf:
cf slack me "ping" --dry-run      # preview; drop --dry-run to actually send
```
**Always `--dry-run` first** when Claude sends on your behalf, confirm the target + text, then send.

## Nicknames
Targets are short names in `~/.slack-cf-nicknames.json` — **it starts empty; you add your own.**
```bash
node …/slack.mjs nick add me   D0XXXXXXX "Me (self-DM)"
node …/slack.mjs nick add team C0XXXXXXX "#a-channel"
node …/slack.mjs nicks
node …/slack.mjs nick rm me
```
You can also pass a raw conversation id directly (`D…` DM, `C…` channel, `G…` private group). **Find
an id:** open the conversation in Slack → click a message's timestamp → **Copy link** → the id is the
`…/archives/<ID>/…` segment. Your self-DM is the "Messages to yourself" entry in the sidebar.

## When it fails
- `No saved session` / `Session expired` → re-run `node …/slack.mjs auth` (or `cf connect`).
- `Unknown target` → add the nickname, or pass a raw id.
- `--browser` forces a slower web-client fallback (collapses newlines; one-liners only).
