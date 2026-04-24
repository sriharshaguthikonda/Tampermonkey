# TODO — Tampermonkey

Auto-index of GitHub Issues for this repo. Regenerate via:

```bash
GITHUB_TOKEN=$GH_CLASSIC gh issue list --repo sriharshaguthikonda/Tampermonkey \
  --state open --limit 100 --json number,title,labels \
  --jq '.[] | "- [#\(.number)](https://github.com/sriharshaguthikonda/Tampermonkey/issues/\(.number)) \(.title) — `\([.labels[].name] | join(", "))`"'
```

Source of truth: [GitHub Issues](https://github.com/sriharshaguthikonda/Tampermonkey/issues).
Priority labels: `priority:P0` (critical), `priority:P1` (important), `priority:P2` (defer).

## P0 — Critical

- [#3](https://github.com/sriharshaguthikonda/Tampermonkey/issues/3) innerHTML XSS risk in paragraph reversion — `type:security, type:bug`
- [#4](https://github.com/sriharshaguthikonda/Tampermonkey/issues/4) Race condition: `sendResponse` may fire after message port closes — `type:bug`

## P1 — Important

- [#5](https://github.com/sriharshaguthikonda/Tampermonkey/issues/5) `scheduledNextSource` / `cancelScheduledNext` referenced but never defined — `type:bug`
- [#6](https://github.com/sriharshaguthikonda/Tampermonkey/issues/6) Cache-key session drift: prefetch writes into stale sessionId — `type:bug`
- [#7](https://github.com/sriharshaguthikonda/Tampermonkey/issues/7) `pendingReverts` grows unbounded on long reading sessions — `type:perf`
- [#8](https://github.com/sriharshaguthikonda/Tampermonkey/issues/8) Stale utterance state leaks into next session (offset/endTime) — `type:bug`
- [#9](https://github.com/sriharshaguthikonda/Tampermonkey/issues/9) `innerHTML` restore strips child event listeners — `type:bug`
- [#10](https://github.com/sriharshaguthikonda/Tampermonkey/issues/10) Silent skip on server audio fetch failure hides repeated errors — `type:enhancement`
- [#11](https://github.com/sriharshaguthikonda/Tampermonkey/issues/11) Synthesis slot released too early on cache hit (starvation risk) — `type:perf, type:bug`

## P2 — Deferred (next audit run)

_To be populated in a later sweep: style nits, dead code, doc polish, dependency updates._

---

_Generated 2026-04-24 by cross-repo audit. See `~/.claude/projects/C--Windows-software/memory/project_cross_repo_audit.md`._
