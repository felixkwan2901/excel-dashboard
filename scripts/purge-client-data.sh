#!/usr/bin/env bash
# Remove committed Cassidy-Davies data from the working tree AND from all
# git history, on every branch, then force-push.
#
# READ BEFORE RUNNING. This rewrites history: every commit SHA after the
# first touched commit changes. Anyone else with a clone must re-clone.
# Run it only once the repo is private and the Cloudflare deploy is live.
#
# Requires: git-filter-repo  (brew install git-filter-repo)

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v git-filter-repo >/dev/null; then
  echo "git-filter-repo not found. Install it with: brew install git-filter-repo" >&2
  exit 1
fi

echo "==> Backing up to ../excel-dashboard-backup-$(git rev-parse --short HEAD)"
cp -R . "../excel-dashboard-backup-$(git rev-parse --short HEAD)"

echo "==> Untracking data files (keeps them on disk)"
git rm -r --cached --quiet \
  'pending-updates/imports-archive' \
  'pending-updates/results' \
  'July Data.xlsx' \
  'The Real Operations Spreadsheet_updated_2026-08-06.xlsx' 2>/dev/null || true
git commit -qm "Stop tracking client data files" || true

echo "==> Stripping them from all history"
git filter-repo --force \
  --path 'pending-updates/imports-archive' \
  --path 'pending-updates/results' \
  --path 'July Data.xlsx' \
  --path 'The Real Operations Spreadsheet_updated_2026-08-06.xlsx' \
  --path-glob '*ProfitAndLoss*.xlsx' \
  --invert-paths

echo "==> Remaining spreadsheets in history (public/ copy is expected):"
git log --all --diff-filter=A --name-only --format= | grep -i '\.xlsx$' | sort -u || echo "  none"

cat <<'NEXT'

Done locally. Nothing has been pushed.

To publish the rewrite (only after the repo is PRIVATE):
    git remote add origin https://github.com/felixkwan2901/excel-dashboard.git
    git push --force --all
    git push --force --tags

Then delete the gh-pages branch, which still carries 30 built copies of the
workbook:
    git push origin --delete gh-pages

Note: GitHub keeps unreferenced objects reachable for a while. To have them
purged sooner, open a support request referencing this repo.
NEXT
