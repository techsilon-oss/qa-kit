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

Run once per machine. In a Claude Code session (Claude Code 2.1.275 or later):

```text
/plugin install qa-kit --marketplace techsilon-oss/qa-kit
```

Or from a shell:

```bash
claude plugin marketplace add techsilon-oss/qa-kit
claude plugin install qa-kit@qa-kit-marketplace
```

Then run `/qa-init` in a repo. (`/qa-init` and the other skills ship in a later phase of v0.1; see [CHANGELOG.md](CHANGELOG.md).)

Requirements: git and Node 22 or later. The checks need one package, `yaml`, as a dev dependency of the repo.

## The limit

The link checks give zero *link* drift: every browser test names a case, and every automated case names a test that exists. They cannot prove that a passing test checks the right thing. The commit-time check on linked cases and code review cover that.

## Developing QA Kit

```bash
npm install   # also points git at .githooks/
npm test      # private-terms check, then the node:test suite
```

Before you change a manifest in `.claude-plugin/`, run `claude plugin validate . --strict`.

## Maintaining the private-terms guard

### What it does

This repo is public. `scripts/check-private-terms.mjs` blocks names that must not appear in it: other products, clients, companies. It searches every tracked file and every commit message. It matches whole words and ignores case, so a term matches `Term` and `(TERM)` but not a longer word that contains it. On a match it prints the file and line, or the commit, and the term's number in the list. It never prints the term.

It runs in four places:

| Where | When | List it reads |
|---|---|---|
| `pre-commit` hook | Every commit | `.private-terms` |
| `commit-msg` hook | Every commit, on the new message | `.private-terms` |
| `npm test` | Every test run | `.private-terms` |
| CI | Every push to `main`, every pull request from this repo | The `PRIVATE_TERMS` secret |

### The two copies of the list

| Copy | Where | Format | Role |
|---|---|---|---|
| `.private-terms` | The repo root on your machine. Git-ignored, never committed | One term per line. A term may contain spaces. Empty lines and lines that start with `#` are ignored | **The master copy.** Edit only this one |
| `PRIVATE_TERMS` | GitHub → the repo → Settings → Secrets and variables → Actions | All terms on one line, separated by commas. No quotes. No spaces around the commas | The copy CI reads. GitHub never shows its value again, so always rebuild it from the master copy |

On a new machine, copy `.private-terms` from a machine that has it. The repo does not hold it, and GitHub cannot give it back.

### Add or remove a term

1. Edit `.private-terms`.
2. Run the check locally, and fix every match:

   ```bash
   npm run check:private-terms
   ```

3. Replace the secret from the file. Run one of these from the repo root. Each one reads the file, drops comments and empty lines, joins the terms with commas, and sends the result to `gh secret set` on standard input, so no term appears in the command line or your shell history.

   bash:

   ```bash
   sed -e 's/\r$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/^#/d' -e '/^$/d' .private-terms \
     | paste -sd, - | gh secret set PRIVATE_TERMS --repo techsilon-oss/qa-kit
   ```

   PowerShell:

   ```powershell
   $OutputEncoding = [System.Text.UTF8Encoding]::new($false)  # keep non-ASCII terms intact
   ((Get-Content -Encoding UTF8 .private-terms | ForEach-Object { $_.Trim() } |
     Where-Object { $_ -and -not $_.StartsWith('#') }) -join ',') |
     gh secret set PRIVATE_TERMS --repo techsilon-oss/qa-kit
   ```

   Checked with gh 2.96.0: `gh secret set <name>` reads the value from standard input when `--body` is not given.

4. Check that CI and your machine agree. Open the latest CI run, step **Check private terms**. It prints `check-private-terms: OK (<n> terms from PRIVATE_TERMS)`. `<n>` must equal the count that `npm run check:private-terms` prints locally.

### Check that `.private-terms` is ignored

```bash
git check-ignore -v .private-terms
```

The output must name the rule in `.gitignore`, for example `.gitignore:2:.private-terms	.private-terms`. No output means the file is **not** ignored: add `.private-terms` to `.gitignore` before you commit anything. If git already tracks the file, the check fails with "the term list is tracked by git". Run `git rm --cached .private-terms`, and replace any term that was pushed.

### A red CI run from a missing secret

If the secret is missing or empty, the step **Check private terms** fails with:

```text
check-private-terms: no private terms configured. Set the PRIVATE_TERMS secret, or create .private-terms.
```

To fix it, set the secret (step 3 above), then re-run the failed job. The step fails on purpose: a guard that switches itself off when its list is missing would look green and check nothing.

### Known limit: pull requests from forks

GitHub does not give repository secrets to a pull request from a fork. CI skips the step **Check private terms** on such a pull request, and `npm test` there prints "no private terms configured". Before you merge a pull request from a fork, run `npm run check:private-terms` on its branch locally. The check also runs again on `main` after the merge.

## License

MIT. Copyright Techsilon LLC. See [LICENSE](LICENSE).
