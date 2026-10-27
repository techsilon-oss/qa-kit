# QA Kit

QA Kit gives a repository one source of truth for **what the product does** and **how each behaviour is proven**. It keeps that truth in step with the code.

The chain it protects:

```
code → feature record → test case → automated test → result
```

Each link is checked by a script. No link depends on a person or an agent remembering it. A check that fails beats a rule that is written down.

QA Kit is a Claude Code plugin. Its skills wrap plain Node scripts, so every check also runs in a terminal, in a git hook and in CI.

> **Status: pre-release.** v0.1.0 is not tagged yet. The specification is [docs/SPEC.md](docs/SPEC.md); it is the only source of truth for formats, check IDs and behaviour. [CHANGELOG.md](CHANGELOG.md) lists what is built.

## What it gives a repo

- **Feature records.** One Markdown file per feature: what it does, its rules, who can do what, where it lives. A record is a `draft` until someone checks it against the code.
- **Case files.** One YAML file per feature, next to its record. Each case has a stable ID (`SIGN-01`) that is never reused.
- **Checks** (`qa-check`). Records, cases, the code → record map, and the links between cases and Playwright tests.
- **Commit-time coupling.** A commit that changes code must change its record, or say why in a trailer. A commit that changes a linked case must change its test, or say why. A case is never deleted, only retired.
- **A coverage view.** How each case is tested, and which critical cases are not automated.
- **An adoption path** for an existing repo: draft records first, verified one at a time, and a baseline of existing gaps that only shrinks.

## Relation to other kits

| Kit | Question it answers | Relation to QA Kit |
|---|---|---|
| [`techsilon-oss/release-gate-kit`](https://github.com/techsilon-oss/release-gate-kit) | "Can I run the CI checks locally when CI cannot run?" | Independent. A repo may add `qa:check` to its release-gate checks |
| [`techsilon-oss/govkit`](https://github.com/techsilon-oss/govkit) | "How does work move?" | Independent. QA Kit works without it. With it, QA Kit is one guardrail entry in `govkit.json`, and reads govkit's code → doc map format |
| QA Kit | "What does the product do, and how is each behaviour proven?" | — |

Dependencies run one way. Nothing in QA Kit names a consumer repo.

## Install

Run once per machine, in Claude Code:

```bash
claude plugin marketplace add techsilon-oss/qa-kit
claude plugin install qa-kit
```

Then run `/qa-init` in a repo. (`/qa-init` and the other skills ship in a later phase of v0.1; see [CHANGELOG.md](CHANGELOG.md).)

Requirements: git and Node 20 or later. The checks need one package, `yaml`, as a dev dependency of the repo.

## The limit

The link checks give zero *link* drift: every browser test names a case, and every automated case names a test that exists. They cannot prove that a passing test checks the right thing. The commit-time check on linked cases and code review cover that.

## Developing QA Kit

```bash
npm install   # also points git at .githooks/
npm test      # private-terms check, then the node:test suite
```

**Private-terms guard.** This repo is public. `scripts/check-private-terms.mjs` blocks names that must not appear in it. It reads terms, one per line, from the git-ignored file `.private-terms`, or from the `PRIVATE_TERMS` environment variable (comma-separated). It matches whole words, case-insensitive, in every tracked file and every commit message. It prints where a match is, never the term. It runs in `npm test`, in the `pre-commit` and `commit-msg` hooks, and in CI from the `PRIVATE_TERMS` repository secret.

Known limit: a pull request from a fork cannot read repository secrets, so CI does not check private terms on it. Review fork pull requests by hand, and the check runs again on `main` after the merge.

## License

MIT. Copyright Techsilon LLC. See [LICENSE](LICENSE).
