#!/bin/bash
# Push S_19 Tournament files to GitHub (shoshikola19-debug/s-19-tournament)
# via the Contents API.
# Prerequisites:
#  - The repo "s-19-tournament" must already exist on GitHub (create it in
#    the GitHub web UI first — the token cannot create repos).
#  - The GitHub token must grant Contents read/write on that repo.
#    If the token is expired (401 Bad credentials), reconnect it first:
#    the parent agent has the secure reconnect link.
set -u
GH="$HOME/workspace/custom-connectors/custom.github/bin/github.py"
OWNER="shoshikola19-debug"
REPO="s-19-tournament"
BRANCH="main"
ROOT="$(cd "$(dirname "$0")" && pwd)"

put_file() {
  local path="$1"
  local full="$ROOT/$path"
  [ -f "$full" ] || { echo "SKIP missing $path"; return 0; }
  local sha=""
  local existing
  existing=$(python3 "$GH" GET "/repos/$OWNER/$REPO/contents/$path?ref=$BRANCH" 2>/dev/null || true)
  sha=$(echo "$existing" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('sha',''))" 2>/dev/null || echo "")
  local b64f; b64f=$(mktemp)
  base64 -w0 "$full" > "$b64f"
  local body; body=$(mktemp)
  python3 - "$body" "$path" "$b64f" "$sha" <<'PYEOF'
import json, sys
body_path, path, b64f, sha = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
with open(b64f) as f:
    b64 = f.read()
data = {"message": f"S_19 Tournament: {path}", "content": b64, "branch": "main"}
if sha:
    data["sha"] = sha
with open(body_path, "w") as f:
    json.dump(data, f)
PYEOF
  echo "== PUT $path ($(stat -c%s "$full") bytes)"
  python3 "$GH" PUT "/repos/$OWNER/$REPO/contents/$path" --data-file "$body" 2>&1 | head -5
  rm -f "$body" "$b64f"
}

for f in README.md package.json render.yaml .gitignore server.js db.js \
         data/seed.json test/smoke.js \
         public/index.html public/styles.css public/app.js \
         public/manifest.webmanifest public/sw.js \
         public/logo.webp public/icon-192.png public/icon-512.png public/icon-maskable-512.png; do
  put_file "$f"
done
echo "DONE. Repo: https://github.com/$OWNER/$REPO"
