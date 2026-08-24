# Working in this repo

## Never `git add -A`, `git add .`, or `git commit -a`

Stage the exact paths you changed, every time:

```sh
git add src/map/MapView.tsx scripts/smoke.mjs
```

More than one agent works in this tree at once. A blanket add sweeps up whatever
someone else has half-written and publishes it under your commit message — that
has already happened here once, to an in-progress `scripts/make-playa.mjs`, and
it went out to `master`.

Before committing, run `git status --short` and account for **every** line, then
read `git diff --cached` in full and confirm every hunk is yours. Grepping for
the names you happen to know about is not enough — the second time this went
wrong, the sweep was a component extraction whose keywords nobody had thought to
search for. If something is there that you did not write, leave it alone.

After staging a shared file, `git diff --cached HEAD~1 -- <file>` against the
last commit that passed CI is the cheapest way to see exactly what you are
adding.

### Committing when a shared file holds someone else's work too

If the file you changed also carries another agent's edits, do not commit the
file as it stands and do not revert theirs. Build your version from `HEAD`, hash
it straight into the index, and leave the working tree untouched:

```sh
git show HEAD:path/to/file.ts > /tmp/base.ts
# apply only your change to /tmp/base.ts
git update-index --add --cacheinfo 100644,$(git hash-object -w /tmp/base.ts),path/to/file.ts
git commit          # commits the index, not the working tree
```

Check `git diff --cached --stat` first. If it reports the whole file changed, the
line endings were rewritten — see below.

### Check your work is still there after someone else commits

Committing is not the end of it. Another agent's working copy of a shared file
can predate your commit, so when they stage that file they quietly put back the
version without your change. Nothing conflicts and nothing fails — the work is
just gone from `master`.

This has happened: the map credit was folded into the footnote, the scale bar
and the attribution pill were removed, and the next commit restored all three.

So after a commit lands on a file someone else is editing, check it survived:

```sh
git show HEAD:src/map/MapView.tsx | grep -c 'attributionControl={false}'
```

Zero means you were reverted. Rebuild on top of the **current** `HEAD` rather
than replaying your old copy — their commit may have restructured the file. Then
pin it with an assertion in `scripts/ui-invariants.mjs` or `scripts/smoke.mjs`,
so the next revert fails CI instead of reaching the live site.

## Keep LF line endings

The repo is LF throughout and there is no `.gitattributes`, so a tool that writes
CRLF turns a three-line change into a whole-file diff. Python's `write_text`
does exactly this on Windows: pass `newline=''` and read with `newline=''` too,
or run `sed -i 's/\r$//'` over anything you have rewritten. `git diff --stat` is
the tell — a file you barely touched should not report hundreds of changed lines.

## Everything about the city comes from Burning Man

Geometry, control points, toilets, city blocks and the trash fence come from
[burningmantech/innovate-GIS-data](https://github.com/burningmantech/innovate-GIS-data);
listings come from the official API. `layout.json` is derived from that survey
by `scripts/derive-layout.mjs`, never copied. Nothing is vendored from iBurn or
any other third-party project — it was inspiration, not a data source. The one
exception is the offline map typeface, and it is a typeface, not map data.

## The embargo is a licence condition, not a display preference

Camp locations may not be shown before the Sunday preceding the event, and art
locations not until Gates open. `scripts/fetch-api.mjs` strips them before
anything reaches `public/`, and `src/data/embargo.ts` repeats the check at load.
Do not weaken either, and do not report pre-redaction counts as though they were
what shipped.

## Tests read the year from config

Nothing may hard-code `public/data/2025`. Use `DATA_YEAR`, and skip cleanly when
a year's data is absent — CI fetches one year and only one.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
