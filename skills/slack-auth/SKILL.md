---
name: slack-auth
description: >
  Authenticate this machine to the Capital Factory Slack so other Slack skills (like slack-dm)
  can act without a Slack app or API token. Use this skill the first time Slack automation is
  set up on a machine, or whenever a Slack action reports "No saved session" / "Session expired".
  Opens a browser window for a one-time sign-in and saves the session locally (cookies only — no
  password is ever written to disk). Triggers: "set up Slack auth", "log Slack in", "refresh my
  Slack session", "connect this machine to Slack".
---

# Slack Auth Skill

One-time sign-in that saves a reusable Capital Factory Slack session to this machine. After this,
the **slack-dm** skill (and any other Slack skill in this family) works headlessly with no further
login until the session expires.

## How to run

```bash
cd <skill>/../slack-dm/scripts
node slack.mjs auth
```

This uses the shared CLI installed by the **slack-dm** skill (so that skill must be present — it
holds the Playwright install).

### What happens
1. A Chromium window opens to `https://capitalfactory.slack.com/`.
2. **The user signs in themselves** — Google / Apple / email magic-link / password. Claude does
   not enter passwords or complete SSO on the user's behalf.
3. Once the Slack web client loads (`app.slack.com/client/…`), the script detects it, saves the
   session, and closes the window automatically (waits up to 3 minutes for sign-in).

### What gets saved
- `~/.slack-cf-auth.json` — session cookies + localStorage. **No password is stored.**
- `~/.slack-cf-config.json` — the detected workspace team id (auto-filled at sign-in).

## When to re-run

Run this again whenever a Slack action fails with `No saved session` or `Session expired`
(Slack sessions are long-lived but not permanent). Re-running just refreshes
`~/.slack-cf-auth.json`; nicknames in `~/.slack-cf-nicknames.json` are untouched.

## Notes

- This Playwright session is **separate** from any Claude-for-Chrome extension session — it's a
  dedicated saved login for the CLI.
- To revoke: delete `~/.slack-cf-auth.json`, or sign the session out from Slack's account/devices
  settings.
