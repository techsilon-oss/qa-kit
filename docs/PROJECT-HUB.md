# qa-kit — Project Hub

> The single source of truth for current state, decisions, and session-to-session context. `/sdlc status` reads this file. Keep it current — a stale hub poisons the next session's context.

Last checked: 2026-10-27

## Current Status

- **Stage:** pre-release. v0.1 is being built in phases on `dev`. Nothing is on `main` yet, and nothing is tagged. The README says "Pre-release. Not ready to install."
- **Health:** run `npm test` for the test results, and see the latest CI run with `gh run list --branch dev --limit 1`. `claude plugin validate . --strict` checks the plugin manifests.
- **Done:** Phases 0–3a. The spec ([`SPEC.md`](SPEC.md)), the private-terms guard and CI; `qa-check` with `records`, `cases`, `map`, `links`, `coverage`, `all` and `commit-msg`; the installed `docs/features/README.md`. [`CHANGELOG.md`](../CHANGELOG.md) lists every addition and every spec change.
- **Now:** waiting on the Phase 3b gate (see [`PRIORITY-ROADMAP.md`](PRIORITY-ROADMAP.md)).

## Key Decisions Log

> Format: **Date · Decision · Why · Status**. Spec changes are listed in full in `CHANGELOG.md`; this log keeps the decisions and their reasons.

### DEC-001: The repo's spec is the only source of truth
2026-10-27 · `docs/SPEC.md` defines formats, check IDs and behaviour. Every spec change is logged in `CHANGELOG.md`. · One place to look; the build plan outside the repo is not authoritative. · Active

### DEC-002: Private-terms guard, whole-word, from a local list and a CI secret
2026-10-27 · `.private-terms` (git-ignored, master copy) and the `PRIVATE_TERMS` secret (for CI). Whole-word, case-insensitive. CI fails when the secret is missing. · The repo is public; a guard that turns itself off when its list is missing checks nothing. Whole-word, so a short term does not match inside other words. · Active

### DEC-003: The baseline has two lists and means "no record at all"
2026-10-27 · `qa-baseline.json` holds `unmapped` (for M3) and `unlinkedSpecs` (for L1). A path leaves `unmapped` as soon as it maps to any record, a draft included. Verification is tracked by the draft count. · Adoption must not fail on day one, and no new spec file may escape L1. · Active; built in Phase 4

### DEC-004: K1 blocks per record; a case file gets a reminder
2026-10-27 · K1 blocks when a mapped record is not staged (one `Docs-Reviewed` trailer per record). An unstaged case file prints a note. K2 still guards tests. · Blocking on every case file would push people to trailers by habit. · Active

### DEC-005: Cases are never deleted (K4)
2026-10-27 · A commit that removes a case ID existing at `HEAD` is blocked; retire with `status: retired`. With C3, an ID never comes back. · Case IDs are stable references from tests and issues. · Active

### DEC-006: Test files are one shared setting
2026-10-27 · `testFilePatterns` (file-name globs) marks test files for both M3 and K1. · One meaning, one setting. · Active

### DEC-007: `automated_by` stays required for `api` cases
2026-10-27 · For an `api` case it says how to run the check by hand. An API test a tool runs is `automated`. · Every non-manual case says what runs it. · Active

### DEC-008: C8 — a case file needs a matching record
2026-10-27 · Added to the spec and built. · Closes the reverse of R5. · Active

### DEC-009: CI mode for commit coupling
2026-10-27 · `qa-check commit-range <base> <head>` runs K1, K2 and K4 in CI. · The hook does not run for web-editor commits, machines without hooks, or `--no-verify`. · Active; built in Phase 4

### DEC-010: The starter ships an example feature, and templates are type-checked
2026-10-27 · `/qa-init` offers an example draft record, case file and linked spec (default yes); the doctor reports it until removed. This repo type-checks the TypeScript templates in CI. · A linked example test needs a case that exists; a template that does not compile must not ship. · Active; built in Phases 3b and 4

### DEC-011: Node 22 minimum
2026-10-27 · Node 22 or later; CI on Node 22 and 24. · Node 20 reached end of life in April 2026. · Active

### DEC-012: Branch flow dev → main; status in govkit's trackers
2026-10-27 · `dev` is the working branch, created at the tip of the first feature branch. The first PR (#1) was closed, because its commits were already on `dev`. A `dev` → `main` PR follows Phase 4. Status lives here and in the roadmap; the README links to it. · Matches govkit's flow; one source of truth for status. · Active

### DEC-013: Guardrails skipped until they apply
2026-10-27 · `supabase-account` is skipped (this repo uses no Supabase). `versioning` is skipped until v0.1.0 (pre-release). Both reasons are recorded in `govkit.json`. · A skipped guardrail is a recorded decision, not a gap. · Active

## Session Handoff

### Session 1 — 2026-10-27 — Phases 0–3a, govkit adoption
- **Shipped:** Phases 0–3a, on `dev` (see Current Status). Spec decisions DEC-001 to DEC-011. Fixed: `qa-check` now reads JSON files saved with a byte order mark.
- **Repo setup:** govkit scaffolded (trackers, release gate, pre-push hook, doc-sync, docs-sync-check); branch flow `dev` → `main`.
- **State:** tests and CI green on `dev`.
- **Next:** Phase 3b, after the owner confirms the sign-in and cleanup pattern has passed signed-in runs in a real repo. Give the next session the roadmap; the build plan's content is in it.
