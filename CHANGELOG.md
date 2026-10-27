# Changelog

All notable changes to QA Kit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). QA Kit uses semantic versioning. Before 1.0, a change to a file format, a check ID or a manifest key is a minor version.

## Unreleased

### Added

- `docs/SPEC.md`: the QA Kit specification v0.1. It is the only source of truth for the spec.
- Repo skeleton: README, MIT license (Techsilon LLC), Claude Code plugin and marketplace manifests, `package.json` (dev dependency `yaml` 2.9.1).
- `scripts/check-private-terms.mjs`: blocks private terms in tracked files and commit messages. Whole-word, case-insensitive matching. Runs in `npm test`, in the `pre-commit` and `commit-msg` hooks, and in CI.
- `npm install` points git at `.githooks/` (the `prepare` script).
- CI workflow: Node 20 and 24; private-terms check from the `PRIVATE_TERMS` secret, then `npm test`.

### Spec changes (from the first draft of v0.1)

- **Baseline:** `qa-baseline.json` holds two sorted lists, `unmapped` (code paths, for M3) and `unlinkedSpecs` (spec files, for L1). K3 blocks growth of either list. M4 reports stale entries in either list. (§6.3, §7)
- **L1:** a linked file is every file that matches `specGlob`, is not under `unlinkedDirs`, and is not in `unlinkedSpecs`. New spec files must be linked from their first commit. (§8.2)
- **M2:** skips draft and retired records. (§6.3)
- **M3:** checks tracked files (`git ls-files`). (§6.3)
- **K1:** blocks only when a record (`.md`) in the mapping is not staged; the `Docs-Reviewed` trailer applies per record. An unstaged case file in the mapping gets a reminder, not a block. (§7)
- **K4 (new):** blocks a commit that removes a case ID that exists at `HEAD`. Cases are retired, never deleted. A case may move between case files. (§5.3, §7)
- **Case type:** `api` means a call run by hand. An API test run by a tool is `automated`, with `automated_by` naming the test file. (§4)
- **Coverage:** the column "Automated: unit" is renamed "Automated: unit/API". "P0 cases not automated" also lists P0 cases of type `api`. (§6.4)
- **R4:** headings are compared after trimming, with straight and curly apostrophes treated as equal. (§5.2)
