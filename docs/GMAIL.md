# Gmail

CF_helpers assumes you **already use Gmail** — there's nothing to install or authenticate here. The
mentor report just produces a ready-to-paste HTML version.

## Using the report in Gmail
Each `cf report` / `cf daily` run writes:

```
~/.cf-helpers/reports/latest.gmail.html
```

To send it:
1. Compose a new email in Gmail.
2. Paste the contents of `latest.gmail.html` as the body.

The HTML is self-contained (inline styles, a clean table per day with **Book →** links), so it
renders correctly in Gmail without any extra setup.

> Tip: on macOS you can copy it straight to the clipboard:
> ```bash
> cat ~/.cf-helpers/reports/latest.gmail.html | pbcopy
> ```

If you'd rather automate Gmail sending end-to-end, that's outside this repo's scope — wire the HTML
file into your own Gmail integration (the Gmail API, a Claude Gmail connector, etc.).
