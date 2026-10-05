.DEFAULT_GOAL := help

PORT = 8895

# ── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  make serve    Start dev server → http://localhost:$(PORT)"
	@echo "  make kill     Kill this project's HTTP server"
	@echo "  make validate Check every file under data/, then run npm test"
	@echo "  make data     Rebuild data/dict, data/kanji, data/names, data/like and data/play (manual)"
	@echo ""

# ── Dev server ────────────────────────────────────────────────────────────────
# scripts/serve.py is http.server plus Cache-Control: no-cache; a plain
# http.server sends only Last-Modified, so browsers keep stale ES modules after
# edits. Falls back to plain http.server outside the monorepo.
.PHONY: serve
serve:
	@echo "Serving → http://localhost:$(PORT)"
	@if [ -f ../../scripts/serve.py ]; then python3 ../../scripts/serve.py $(PORT); else python3 -m http.server $(PORT); fi

# ── Kill ──────────────────────────────────────────────────────────────────────
.PHONY: kill
kill:
	@lsof -ti :$(PORT) | xargs kill 2>/dev/null && echo "Stopped server on port $(PORT)" || echo "No server running on port $(PORT)"

# ── Validate ──────────────────────────────────────────────────────────────────
# The definition of done for any change under data/ or js/: the data checker
# (size cap, licence blocks, formats, shard ranges, no U+2014), then the tests.
.PHONY: validate
validate:
	node tools/check-data.mjs
	npm test

# ── Data ──────────────────────────────────────────────────────────────────────
# A MANUAL step, never wired into serve, CI or the root smoke run. It downloads
# the pinned upstreams into a cache outside the repo (YOMU_CACHE, default
# $TMPDIR/yomu-corpus-cache), needs unzip, bunzip2 and curl, and rewrites the
# committed shards. The page reads only the committed output and works offline.
.PHONY: data
data:
	node tools/build-dict.mjs
	node tools/build-kanji.mjs
	node tools/build-names.mjs
	node tools/build-sounds-like.mjs
	node tools/build-lookalikes.mjs
	node tools/check-data.mjs
