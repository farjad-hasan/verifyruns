## 1. Helper (farjad-world, tests first)

- [ ] 1.1 `scripts/test_report_run.py`: wraps a command and returns its exit code unchanged (0, 1, 143); posts one row then `{"wrote": 1}`; sink failure → `{"wrote": 0}` and exit code still the command's; no env file → command runs, nothing posted; `--note` truncated; hook looked up per job (`VERIFYRUNS_HOOK_<JOB>` with `-` → `_`, upper-cased) falling back to `VERIFYRUNS_HOOK`
- [ ] 1.2 `scripts/report_run.py`: stdlib only, `--job`, `--env PATH` (default `~/.verifyruns-dogfood.env`), `--note`, `-- cmd…`; reuses `brand_state.report_run`'s row shape and User-Agent; `brand_state.report_run` delegates to it so the brand jobs keep one implementation
- [ ] 1.3 `scripts/test_brand_state.py` still green after the delegation

## 2. Destination and Checks

- [ ] 2.1 Supabase: `fleet_runs(job, exit, at, note, id, inserted_at)` with the same RLS shape as `brand_runs` (anon may insert; anon may select); confirm the read URL shape VerifyRuns' `http_json` connector needs from the existing brand Check
- [ ] 2.2 Checks (names are the labels): `kb-reindex` 26 h; `work-nightly-sweep` 26 h; `work-morning-brief` 25 h; `work-eod-brief` 25 h; `work-weekly-retention` 170 h; `work-hourly-sweep` 2 h now, window 13:00–23:00 once `heartbeat-schedule-window` ships. All `growth_mode: claimed`, `min_new_records: 1`, Discord/Slack channel as the brand Check
- [ ] 2.3 `~/.verifyruns-dogfood.env`: one `VERIFYRUNS_HOOK_<JOB>` per Check; `BRAND_*` keys untouched

## 3. Wiring

- [ ] 3.1 `com.farjad.cos-kb-reindex.plist`: command wrapped with `report_run.py --job kb-reindex --`; `launchctl unload/load`; `launchctl kickstart` once and confirm a PASS on the Check
- [ ] 3.2 `docs/dogfood-handoff-work-fleet.md` in farjad-world (or the note pasted into the work session): the exact wrapper line per job, the label policy, the plist copies to edit in the work repo so installed and source plists stay in sync
- [ ] 3.3 `farjad-world/docs/machine-setup.md`: the env file's per-job keys and the wrapped plist

## 4. Docs (this repo)

- [ ] 4.1 `docs/dogfood.md` per the spec; `README.md` link

## 5. Verify locally, then push

- [ ] 5.1 farjad-world: `tools/transcribe/.venv/bin/pytest scripts/test_report_run.py scripts/test_brand_state.py` green
- [ ] 5.2 Live: forced failure — run the wrapper with a command that exits 1 → sink row has `exit: 1`, Check still PASSes (a row was written); then skip a window on a 2 h test Check → heartbeat FAIL alert arrives, next real run → Recovered
- [ ] 5.3 Commit both repos (exact paths); flip the claim; remove the worktree
