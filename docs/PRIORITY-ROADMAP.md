# qa-kit — Priority Roadmap

> What to work on next, and why. Start each session by reading this, [`PROJECT-HUB.md`](PROJECT-HUB.md) and `gh issue list`. This file holds the order and the reasons; the spec ([`SPEC.md`](SPEC.md)) holds what each part must do.

Last checked: 2026-10-27

## Phases to v0.1.0

Phases 0–3a are done (see the hub). Each phase ends with `npm test` green, a report, and the owner's OK. Work branches from `dev`.

| Phase | What | Starts when |
|---|---|---|
| **3b** | Playwright starter | **Gated:** the owner confirms that the sign-in and cleanup pattern has passed signed-in runs in a real repo |
| **4** | Manifest, doctor and `/qa-init` | Phase 3b is done |
| **5** | Authoring skills | Phase 4 is done |
| **6** | Prove it end to end | Phase 5 is done |
| **7** | Release preparation | Phase 6 is done |

### Phase 3b — Playwright starter (gated)

**Why gated:** the starter is copied into other repos. A sign-in and cleanup pattern that has never signed in for real must not ship.

- Templates (spec §8.4): `playwright.config.ts`, `e2e/support/accounts.ts`, `e2e/auth.setup.ts`, `e2e/support/test.ts`, `e2e/support/cleanup.ts`, `e2e/smoke/example.spec.ts`.
- Unit tests for `Cleanup` (order, every step runs, the report) and for the environment guard.
- Check the Playwright test `tag` option and the fixture API against the installed Playwright version.
- The example feature (spec §8.4): a draft record `docs/features/example.md`, its case file and `e2e/smoke/example.spec.ts`, linked to each other, so `qa-check all` passes on a fresh install.
- Add `@playwright/test` and `typescript` as dev dependencies (check the current versions first), and a CI step that type-checks every TypeScript template.

### Phase 4 — Manifest, doctor and `/qa-init`

After Phase 4 the kit is usable: a `dev` → `main` PR makes it installable.

- `qa-kit.json` template (spec §5.4), including the `sdlc` block (spec §5.4, §10.3).
- `qa-doctor.mjs` (spec §10.1): OK / SKIPPED / MISSING / PLANNED, `--ci`, `config`, files installed but not declared, and as findings: the draft count, the baseline size, "example feature still present".
- The baseline (spec §6.3): `qa-baseline.json` with `unmapped` and `unlinkedSpecs`, written by `/qa-init`; M4 (stale entry) and K3 (the baseline only shrinks), with fixtures.
- `qa-check commit-range <base> <head>` (spec §7.1): K1, K2 and K4 over the combined change of a range; a trailer in any commit message in the range counts; merge commits skipped. Tests with real git repos, including a commit made with `--no-verify` that the range check then catches.
- The CI workflow template: `qa-check all` and `commit-range` on every push and pull request. Base: the merge base with the target branch, or the previous tip for a push to the target branch itself.
- `skills/qa-init/SKILL.md`: preflight; questions with defaults (modules, paths, case prefix pattern, test accounts placeholder, the example feature); non-destructive, idempotent install; `package.json` script merge; optional `govkit.json` guardrail entry (spec §10.2); summary table.
- `skills/qa-doctor/SKILL.md`.

### Phase 5 — Authoring skills

- `skills/qa-discover/SKILL.md`, `skills/qa-record/SKILL.md`, `skills/qa-plan/SKILL.md` (spec §9, §9.1). They wrap the scripts and follow the layer rule (spec §8.1).
- `/qa-discover` proposes the feature list and waits for approval. Then it writes drafts only, with their code-map entries, and removes the newly mapped paths from the baseline.
- `/qa-record` verifies a record against the code and makes it active, so the draft count falls.

### Phase 6 — Prove it end to end

`examples/sample-app/`: a tiny app with two features and no records. Run the adoption path (spec §9.1) in a test script or a documented run, and record it in `docs/VERIFICATION.md`:

1. `/qa-init` → the baseline is written; `qa-check all` passes.
2. `/qa-discover` → two draft records; their paths leave the baseline; the doctor reports 2 drafts.
3. `/qa-record` on one feature → it is active; the draft count falls to 1.
4. Add a new unmapped file → M3 fails. Add a path to the baseline → K3 blocks the commit.
5. Break each link type once → the right check fails with a clear message. Fix it → it passes.

### Phase 7 — Release preparation

- A final README pass.
- Draft GitHub issues: one per companion kit (spec §12; label `idea`; body: what it would check, why, the trigger, "ships nothing yet"), and one for the v0.2 reporting module. Create them only after the owner's OK.
- After the owner's OK, tag v0.1.0. Then enable the `versioning` guardrail in `govkit.json`.

## Definition of done for v0.1.0

- Every check ID in the spec (R1–R5, C1–C8, M1–M4, L1–L6, K1–K4) has a passing and a failing fixture, and the tests pass.
- The sample-app run in `docs/VERIFICATION.md` shows each check failing and passing.
- `/qa-init` is non-destructive and idempotent: run it twice, and the second run changes nothing.
- `qa-doctor --ci` exits 1 on a MISSING module and 0 on PLANNED.
- README, LICENSE, CHANGELOG and SPEC are present and agree with each other.

## After v0.1.0 — separate tasks

Each is its own PR in its own repo, with the owner's OK first.

- **techsilon-oss/govkit — the `/sdlc` extension point** (spec §10.3). When a sibling kit's manifest (`qa-kit.json`) has an `sdlc` block, govkit's `/sdlc` runs its `plan` step while planning, its `beforePr` step before opening a PR, and its `sessionClose` step at session close. No QA Kit logic goes into govkit; it only reads the block. Bump govkit's version, and update its README and roadmap.
- **techsilon-oss/govkit — template fixes found while adopting govkit here.**
  - Provenance comments in govkit's templates and README stay as they are (owner decision, 2026-10-27). qa-kit keeps its comment-only exception in `sdlc-docs.mjs`.
  - Update the action versions in the `sdlc-docs.yml` template (`actions/checkout` and `actions/setup-node` are at v4; this repo's CI uses v7).
  - In the `sdlc-docs.yml` template, stop the comment step from failing a pull request from a fork: such a run gets a read-only token and cannot write the comment.
- **techsilon-oss/govkit and techsilon-oss/release-gate-kit — the MIT license.** Add an MIT `LICENSE` (holder: Techsilon LLC). Change the license field from CC0-1.0 to MIT (`plugin.json` and `marketplace.json` in govkit; `package.json` in release-gate-kit). Update the README "License" section to say: "MIT from version <next>. Earlier releases were published under CC0-1.0 and stay CC0-1.0." Bump each repo's version as its own CHANGELOG or roadmap does.

## Later (v0.2 and beyond, from spec §14)

- v0.2.0: the reporting module (a CI workflow that saves the HTML report and publishes a JUnit summary; an optional Qase adapter; `/qa-review`).
- Later: unit-layer links, quarantine with expiry dates, a smoke time budget, feature tags for targeted runs.

## Revision History

| Date | Session | Changes |
|------|---------|---------|
| 2026-10-27 | 1 | Roadmap written from the v0.1 build plan, after Phases 0–3a. |
