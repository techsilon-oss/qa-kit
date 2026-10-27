# qa-kit — project rules

QA Kit is a public, open-source Claude Code plugin. These rules are durable; status lives in [`docs/PROJECT-HUB.md`](docs/PROJECT-HUB.md), and the plan in [`docs/PRIORITY-ROADMAP.md`](docs/PRIORITY-ROADMAP.md).

Last checked: 2026-10-27

- **The spec is the source of truth.** [`docs/SPEC.md`](docs/SPEC.md) defines every format, check ID and behaviour. If code and spec disagree, stop and ask. Record every spec change in `CHANGELOG.md` under "Unreleased".
- **Name nothing private.** The repo names only itself, `techsilon-oss/govkit` and `techsilon-oss/release-gate-kit`. Never write the name, URL, issue number or path of any other repo, product, company or client: not in files, examples, tests, commit messages, PR text, branch names or issues. Examples use neutral features (sign-in, refunds, search). `check-private-terms` enforces this; see the README section "Maintaining the private-terms guard".
- **Work in phases.** At the end of each phase: run `npm test`, report what changed and what passed, and stop for the owner's OK. Never push to `main`, open a PR to `main`, or tag without the owner's OK.
- **Check facts about tools** (a Playwright API, a Claude Code plugin field, a package version) against current docs or the installed package before using them, and say what you checked. Before changing `.claude-plugin/`, run `claude plugin validate . --strict`.
- **Fix bugs in the templates here.** Files under `skills/qa-init/templates/` are vendored into other repos; a fix in a copy never reaches anyone.
- **Make code edits with the file-edit tool**, not scripts. After changing a regex, show that a test fails on a broken version of it.
- **Writing style** for docs and messages: short sentences, imperative steps, active voice, one word for one meaning, a condition before its instruction.

<!-- govkit:start -->
# qa-kit — Engineering Guardrails

> Scaffolded by [govkit](https://github.com/techsilon-oss/govkit) `/govkit-init`. This block is delimited by `govkit:start`/`govkit:end` markers so re-running init won't duplicate it. Edit freely — but keep the markers if you want idempotent updates.

## Standards lineage — where these rules come from

This project's guardrails are **not local inventions**. They come from upstream repos, and a change belongs in whichever one owns it. Read this before "fixing" a guardrail here — a local patch forks it silently and the fix never reaches the other projects.

| Upstream | Owns | Change it when |
|---|---|---|
| [**release-gate-kit**](https://github.com/techsilon-oss/release-gate-kit) | `scripts/release-gate.ts` — the local CI-fallback gate, and nothing else. Standalone by design: usable in any project with zero governance buy-in | The gate itself is wrong or missing a feature. **Never patch the vendored copy here** |
| [**govkit**](https://github.com/techsilon-oss/govkit) | The guardrail spine: `/govkit-init`, `/sdlc`, `/govkit-doctor`, the hook, the doc-sync runners, this block | Any project would want the change |
| A house layer (private, if your org has one) | Org-specific delta: stack runbooks, the user `CLAUDE.md` profile, adoption cheatsheets | The change is house-specific, not universal |

**Dependencies run one way only:** release-gate-kit ← govkit ← house layer ← this project. Nothing upstream references a consumer.

`govkit.json` records which guardrails are installed and which were deliberately skipped. Run **`/govkit-doctor`** to see what this project is actually missing versus what it declares — that is the difference between a recorded decision and an unnoticed gap.

## Branch Strategy

```
feature/* (optional)  →  dev  →  main
```

- **`dev`** is the working branch — all new code lands here first.
- **`main`** is the release branch. **Never push directly to `main`** — always via a PR.
- **Every merge requires explicit per-merge approval.** Green CI is necessary but NOT sufficient; wait for an explicit "merge it" / "ship it".
- Feature branches are optional for small changes, recommended for larger/riskier work.

## Tests-With-Features Policy

Every feature or bug fix ships with its tests in the same change — not as a follow-up. At minimum: happy path + one error/edge case; cover any new pure function, and the edge cases of any money/security/permission logic. Never commit with failing tests.

## Local Release Gate — CI-fallback (MANDATORY when CI is unavailable)

CI runs on metered GitHub Actions. When minutes are exhausted — or during an outage — jobs fail to start and the "CI passing" merge gate can't run. The local release gate is its **substitute**, not a way around it.

**While CI is unavailable, before any merge to `dev` or `main`:**

1. Run the gate and confirm a **GREEN** verdict:
   ```bash
   npm run release-gate                 # the same checks as CI
   npm run release-gate -- --pr <num>   # also posts the evidence as a comment on PR <num>
   ```
2. **Attach the evidence** to the PR (`-- --pr <number>`) — the green checkmarks won't appear otherwise. The report is also written to `test-results/release-gate-report.md`.
3. **Never merge on a RED verdict.** Fix it first, exactly as for failing CI.

Nothing deploys from this repo: users install the plugin from GitHub, so a merge to `main` is the release.

The gate's checks live in `release-gate.config.json` — keep them matching this project's CI jobs.

## Project Context

- Architecture decisions, current status, and session handoffs live in [`docs/PROJECT-HUB.md`](docs/PROJECT-HUB.md).
- What to work on next lives in [`docs/PRIORITY-ROADMAP.md`](docs/PRIORITY-ROADMAP.md).
- Run `/sdlc status` (govkit skill) at session start for a current-state read.
<!-- govkit:end -->
