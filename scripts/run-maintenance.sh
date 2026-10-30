#!/usr/bin/env bash
# Shared by GitHub Actions and manual checks. Never enable shell tracing here.
set -euo pipefail

node <<'JS'
const fail = message => { console.error('::error::' + message); process.exit(1); };
const base = process.env.API_BASE_URL;
const token = process.env.MAINTENANCE_TOKEN;
if (!base) fail('Missing API_BASE_URL. Set it in GitHub Actions repository secrets.');
try {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
} catch { fail('Invalid API_BASE_URL. Use the backend HTTPS origin only, with no /api path, credentials, query or fragment.'); }
if (!token) fail('Missing MAINTENANCE_TOKEN. Set the same secret in GitHub Actions and Cloudflare Pages Production.');
if (token.length < 32 || /[\s\x00-\x1f\x7f]/.test(token)) fail('Invalid MAINTENANCE_TOKEN. Use at least 32 characters without whitespace or control characters, identical in GitHub and Cloudflare.');
JS

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

request() {
  local method="$1" path="$2" label="$3" destination="$4" status
  if ! status=$(curl --silent --show-error --connect-timeout 15 --max-time 120 \
    --request "$method" --header "Authorization: Bearer $MAINTENANCE_TOKEN" \
    --output "$destination" --write-out '%{http_code}' "${API_BASE_URL%/}$path"); then
    echo "::error::$label failed to reach the backend. Check its availability and network settings." >&2
    return 1
  fi
  case "$status" in
    200) ;;
    401|403) echo "::error::$label authentication failed (HTTP $status). Check that GitHub and Cloudflare Pages Production have the same MAINTENANCE_TOKEN (at least 32 characters). No interactive login is required." >&2; return 1 ;;
    404|405) echo "::error::$label endpoint unavailable (HTTP $status). Check API_BASE_URL and deploy the matching backend version; cleanup uses POST." >&2; return 1 ;;
    429) echo "::error::$label rate limited (HTTP 429). Wait before rerunning the workflow." >&2; return 1 ;;
    *) echo "::error::$label failed (HTTP $status). Check Cloudflare runtime configuration, D1/R2 bindings and service logs." >&2; return 1 ;;
  esac
}

# Authenticate and check D1 before attempting any destructive operation.
request GET '/api/verify?action=retention' 'Pre-cleanup check' "$work_dir/before.json"
node - "$work_dir/before.json" <<'JS'
const fs = require('node:fs');
try {
  const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (result.success !== true || typeof result.compliant !== 'boolean') throw new Error();
} catch {
  console.error('::error::Pre-cleanup check returned an unexpected response. Check API_BASE_URL and the backend version.');
  process.exit(1);
}
JS

# Read-only mode is useful for validating secrets without deleting any data.
if [[ "${MAINTENANCE_CHECK_ONLY:-false}" == 'true' ]]; then
  echo 'Maintenance authentication and database check passed; no cleanup was performed.'
  exit 0
fi

request POST '/api/cleanup' 'Cleanup' "$work_dir/cleanup.json"
request GET '/api/verify?action=retention' 'Post-cleanup check' "$work_dir/after.json"
node - "$work_dir/cleanup.json" "$work_dir/after.json" <<'JS'
const fs = require('node:fs');
let cleanup, after;
try {
  cleanup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  after = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  if (cleanup.success !== true || after.success !== true || typeof after.compliant !== 'boolean' ||
      !['deletedCount', 'deletedCoupleCount', 'deletedImages', 'pendingImageDeletes'].every(key => Number.isFinite(cleanup[key]) && cleanup[key] >= 0)) throw new Error();
} catch {
  console.error('::error::Maintenance returned an unexpected response. Check API_BASE_URL and the backend version.');
  process.exit(1);
}
if (cleanup.r2Configured !== true) {
  console.error('::error::Cleanup did not confirm R2 storage configuration. Bind FACE_IMAGES in Cloudflare Pages Production and deploy the matching backend version.');
  process.exit(1);
}
console.log(`Cleanup completed: ${cleanup.deletedCount + cleanup.deletedCoupleCount} records and ${cleanup.deletedImages} images deleted.`);
if (!after.compliant || cleanup.pendingImageDeletes > 0) {
  console.error('::error::Maintenance is incomplete: expired records or queued image deletions remain. Check D1/R2 bindings and logs, then rerun; queued image deletions are retried.');
  process.exit(1);
}
console.log('Post-cleanup retention check passed.');
JS
