## 1. Docs

- [ ] 1.1 `docs/unreachable-destination.md` per the spec; the Supabase recipe reuses the `fleet_runs` shape from `docs/dogfood.md`; the "what it proves / does not" paragraph is the first thing under the title
- [ ] 1.2 Cross-link from `docs/dogfood.md` (after `dogfood-fleet` merges); no link anywhere in `frontend/` or `README.md`

## 2. Verify locally, then push

- [ ] 2.1 `grep -r unreachable-destination frontend/src README.md` returns nothing; markdown renders on GitHub
- [ ] 2.2 Commit (exact path); flip the claim; remove the worktree
