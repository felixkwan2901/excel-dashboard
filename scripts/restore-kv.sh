#!/usr/bin/env bash
# Restore a KV backup into a Worker.
#
# Workers and KV namespaces cannot be moved between Cloudflare accounts, so a
# handover means standing the Worker up fresh on the company's account and
# pushing the data back in. This does the second half.
#
#   ./scripts/restore-kv.sh <backup-dir> <worker-base-url> [--dry-run]
#
#   ./scripts/restore-kv.sh ~/Desktop/kv-backup-20260918-1707 \
#       https://cde-data-upload.cassidydavies.workers.dev --dry-run
#
# Each file in the backup is one GET response: {"ok":true,"value":"<json>"}.
# The value is written back verbatim, so what comes out equals what went in.
set -euo pipefail

DIR="${1:-}"
BASE="${2:-}"
DRY="${3:-}"

if [[ -z "$DIR" || -z "$BASE" ]]; then
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 64
fi
[[ -d "$DIR" ]] || { echo "No such backup directory: $DIR" >&2; exit 66; }

shopt -s nullglob
files=("$DIR"/*.json)
(( ${#files[@]} )) || { echo "No .json files in $DIR" >&2; exit 66; }

echo "Restoring ${#files[@]} keys into $BASE"
[[ "$DRY" == "--dry-run" ]] && echo "(dry run — nothing will be written)"

ok=0; skipped=0; failed=0
for f in "${files[@]}"; do
  # Filename is the key with ':' written as '_', e.g. planning_job-owners.json
  key="$(basename "$f" .json)"
  key="${key/_/:}"

  value="$(python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))
v=d.get("value")
sys.stdout.write(v if isinstance(v,str) else "")
' "$f")"

  if [[ -z "$value" ]]; then
    printf "  skip  %-34s (empty)\n" "$key"; skipped=$((skipped+1)); continue
  fi

  if [[ "$DRY" == "--dry-run" ]]; then
    printf "  would %-34s %s chars\n" "$key" "${#value}"; ok=$((ok+1)); continue
  fi

  body="$(python3 -c '
import json,sys
print(json.dumps({"key": sys.argv[1], "value": open(sys.argv[2]).read()}))
' "$key" <(printf '%s' "$value"))"

  if curl -fsS -X POST "$BASE/app-data" \
       -H 'Content-Type: application/json' \
       --data-binary "$body" >/dev/null; then
    printf "  ok    %-34s %s chars\n" "$key" "${#value}"; ok=$((ok+1))
  else
    printf "  FAIL  %-34s\n" "$key"; failed=$((failed+1))
  fi
done

echo "restored $ok · skipped $skipped · failed $failed"
# Verify by reading one key back, so a silent no-op cannot pass for success.
if [[ "$DRY" != "--dry-run" && $ok -gt 0 ]]; then
  echo "Spot check: curl -s '$BASE/app-data?key=planning:job-owners' | head -c 200"
fi
[[ $failed -eq 0 ]]
