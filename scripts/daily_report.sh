#!/usr/bin/env bash
# daily_report.sh — the no-Claude daily job: generate the mentor report and push it to Slack.
# This is what the launchd LaunchAgent runs (see `cf install-daily`). You can also run it by hand.
#
# It resolves its own repo location and calls `cf daily`. launchd runs with a minimal PATH, so we
# prepend the usual Homebrew / system locations where `node` lives.

set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

echo "===== cf daily $(date '+%Y-%m-%d %H:%M:%S %Z') ====="
exec node "$REPO/bin/cf" daily
