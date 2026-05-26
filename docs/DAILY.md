# The daily report (unattended, no Claude)

The mentor report can post itself to Slack every day with **no Claude session involved** — it's just
two Node scripts behind one command, scheduled by macOS **launchd**.

## What runs
```
cf daily
  ├─ mentor_report.mjs   → builds the report into ~/.cf-helpers/reports/
  └─ slack.mjs dm <target> --file latest.slack.md   → pushes it to your Slack target
```
`<target>` is `config.dailyTarget` from `~/.cf-helpers/config.json` (set during `cf connect`,
defaults to the `me` nickname). Both scripts use your saved local sessions — no API key, no Claude.

Try it once by hand first:
```bash
cf daily
```

## Schedule it (macOS)
```bash
cf install-daily 07:00     # every day at 7:00 AM; pick any HH:MM (24-hour)
```
This writes `~/Library/LaunchAgents/com.cfhelpers.daily.plist` and loads it with `launchctl`. launchd
runs the job at the next opportunity if the Mac was asleep at the scheduled time. Output is logged to
`~/.cf-helpers/daily.log`.

Change the time by running `cf install-daily HH:MM` again. Remove it with:
```bash
cf uninstall-daily
```

## Why launchd and not a cloud/remote agent
The job depends on the **local** saved sessions (`~/.union-vc-auth.json`, `~/.slack-cf-auth.json`).
A cloud or remote Claude agent wouldn't have those credentials, so the daily report runs locally.
launchd is the macOS-native scheduler and survives reboots.

## Linux
There's no launchd on Linux. Use cron instead — point it at the same entrypoint:
```cron
0 7 * * *  /bin/bash /path/to/CF_helpers/scripts/daily_report.sh
```

## If the daily run fails
Check `~/.cf-helpers/daily.log`. The usual cause is an expired session — run `cf connect` (or the
specific tool's auth) to refresh it, then the next scheduled run will succeed.
