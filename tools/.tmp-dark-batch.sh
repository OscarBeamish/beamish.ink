#!/usr/bin/env bash
# Record every `either` item against the dark ground.
#
# Sequential on purpose: the recorder brings up its own server on a fixed port
# and drives a browser, so two at once fight over both.
#
# One failure must not end the night, so each item is allowed to fail and the
# result goes to a log the morning can be read from.
#
# Absolute paths throughout. Git Bash maps /tmp to AppData\Local\Temp while
# node maps it to C:\tmp, so a list written by one and read by the other is
# silently empty, which is exactly how the first run of this recorded nothing
# and reported success.

REPO="C:/Users/oscar/Documents/GitHub/beamish.ink"
WORK="C:/Users/oscar/Documents/GitHub/beamish.ink/tools/.dark-run"

cd "$REPO" || exit 1
mkdir -p "$WORK"

LIST="$WORK/either.txt"
RESULTS="$WORK/results.txt"
: > "$RESULTS"

# Build the list here rather than inheriting one, so there is one source.
node -e '
const fs=require("fs");
const out=[];
for(const d of ["effects","components"]) for(const s of fs.readdirSync(d)){
  const f=d+"/"+s+"/meta.json"; if(!fs.existsSync(f))continue;
  if(JSON.parse(fs.readFileSync(f,"utf8")).ground==="either") out.push(s);
}
process.stdout.write(out.join("\n"));
' > "$LIST"

count=$(grep -c . "$LIST")
echo "list has $count either items" >> "$RESULTS"

total=0
ok=0
failed=0

while read -r slug; do
  [ -z "$slug" ] && continue

  # Already recorded by hand while proving the flag.
  if [ "$slug" = "stipple-field" ]; then
    echo "SKIP  $slug (recorded while proving the flag)" >> "$RESULTS"
    continue
  fi

  total=$((total + 1))
  start=$(date +%s)

  if npx pnpm record "$slug" --ground dark --ratio 16x9 > "$WORK/$slug.log" 2>&1; then
    took=$(( $(date +%s) - start ))
    dir="effects/$slug/media/dark"
    [ -d "$dir" ] || dir="components/$slug/media/dark"
    size=$(du -k "$dir" 2>/dev/null | cut -f1)
    echo "OK    $slug  ${took}s  ${size:-?}kB" >> "$RESULTS"
    ok=$((ok + 1))
  else
    echo "FAIL  $slug  (see tools/.dark-run/$slug.log)" >> "$RESULTS"
    failed=$((failed + 1))
  fi
done < "$LIST"

echo "" >> "$RESULTS"
echo "done: $ok recorded, $failed failed, of $total attempted" >> "$RESULTS"
