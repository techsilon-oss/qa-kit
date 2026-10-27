# QA Kit — Specification v0.1

## 1. Purpose

QA Kit gives a repository one source of truth for **what the product does** and **how each behaviour is proven**, and it keeps that truth in step with the code.

The chain it protects:

```
code → feature record → test case → automated test → result
```

Each link is checked by a script. No link depends on a person or an agent remembering it.

**The goal.** Open Claude Code in any repo and run one command. Afterwards the repo has the structure, its existing features mapped as drafts, and guardrails that keep code, records, cases and tests in step from then on. Adoption is a short, staged path (§9.1), not a big-bang clean-up.

**Principle.** A check that fails beats a rule that is written down. A skill tells an agent what to do. A check stops a commit or a merge that breaks the standard. QA Kit ships both, and the checks are the source of truth.

## 2. Scope

**In scope (v0.1):**

- Feature records: one Markdown file per feature.
- Test cases: one case file per feature, next to its record.
- Traceability checks: code ↔ record ↔ case ↔ automated test.
- A coverage view: how each case is tested.
- Commit-time coupling: a change to code or to a case must come with the matching record or test, or a written reason. A case ID is never deleted.
- Adoption on an existing repo: draft records from discovery, verified one by one, and a baseline of existing unmapped code and unlinked spec files that only shrinks.
- Automation module: link checks for Playwright tests, and a Playwright starter (tier tags, sign-in and cleanup interfaces).
- A manifest (`qa-kit.json`) and a doctor that reports what is installed.
- Skills for Claude Code that wrap the scripts.

**Planned (v0.2):** reporting module — Playwright HTML report as a CI artifact, a pass/fail summary in the CI run, and an optional Qase adapter that records results against case IDs.

**Not in scope:**

- A test runner. QA Kit links to Vitest, Playwright and others. It does not replace them.
- A test-management service or a hosted dashboard.
- System-wide quality checks (accessibility, load, security scans, data reconciliation, backup-restore drills). These are **companion kits** (§12).
- An in-app viewer, PDF editions or exports of records. A repo may build these on top of the formats.
- Anything that names a company, a client, a product or a stack.

## 3. Relation to other kits

| Kit | Question it answers | Relation to QA Kit |
|---|---|---|
| `release-gate-kit` | "Can I run the CI checks locally when CI cannot run?" | Independent. A repo may add `qa:check` to its release-gate checks |
| `govkit` | "How does work move?" (branch flow, gates, trackers, doc-sync) | Independent. QA Kit works without it. With it, QA Kit is one guardrail entry in `govkit.json` (§10.2), and needs **no change to govkit** |
| `qa-kit` | "What does the product do, and how is each behaviour proven?" | — |
| Companion kits | "Is the system healthy as a whole?" | Separate repos, named `qa-kit-<check>` |

**Rules:**

- Dependencies run one way. Nothing in QA Kit names a consumer repo.
- QA Kit owns the **feature-record** frontmatter. A general doc-frontmatter convention, if govkit adds one, covers other docs and must not redefine record keys.
- QA Kit reads govkit's code→doc map format (`scripts/source-doc-map.json`) instead of defining a second map (§6.3). One file, one format.
- All skills are named `qa-*`. A repo may have its own skills; two skills with one name cause wrong advice that looks right.

## 4. Vocabulary

Use one word for one meaning.

| Term | Meaning |
|---|---|
| **Feature** | A unit of product behaviour a user or an operator can name, for example "Sign-in" or "Refunds" |
| **Feature record** | The Markdown file that states what a feature does, its rules, who can do what, and where it lives |
| **Case file** | The YAML file that holds a feature's test cases |
| **Test case** (case) | One behaviour to prove, with steps and expected results |
| **Case ID** | The stable ID of a case, for example `SIGN-01`. Never reused |
| **Case prefix** | The letters before the dash; one prefix per feature |
| **Priority** | `P0` critical · `P1` core · `P2` polish |
| **Case type** | `manual` (a person runs it through the UI) · `api` (a person runs a call or a script by hand) · `automated` (a test in the repo runs it, at any layer). An API test that a tool runs is `automated`, with `automated_by` naming the test file |
| **Layer** | Where an automated case runs: unit, API/database, browser (§8.1) |
| **Tier** | When an automated test runs: smoke, nightly, extended (§8.3) |
| **Linked test** | An automated test whose title starts with the case ID it proves |
| **Adapter** | The repo-specific part: accounts, environments, tag names, file locations |
| **Manifest** | `qa-kit.json`: the declared state of the kit in a repo |

## 5. File formats

### 5.1 Layout (defaults; all paths are settings)

```
docs/features/
├── README.md                ← how to write a record and a case (installed by /qa-init)
├── <feature-id>.md          ← feature record
└── <feature-id>.cases.yaml  ← case file
qa-kit.json                  ← manifest and settings
scripts/qa-check.mjs         ← the checks (vendored)
scripts/qa-doctor.mjs        ← the doctor (vendored)
scripts/source-doc-map.json  ← code → doc map (shared with govkit, if present)
```

### 5.2 Feature record

A Markdown file. The file name, without `.md`, is the feature ID. Feature IDs use lower-case letters, digits and hyphens.

**Required frontmatter:**

| Key | Value |
|---|---|
| `id` | The feature ID. Must equal the file name |
| `title` | Human-readable name |
| `version` | Record version, for example `1.0`. Increase it when the content changes meaningfully |
| `last_verified` | `YYYY-MM-DD`: the date someone last checked the record against the code. **Empty for a draft** (see below) |

**Optional frontmatter:** `case_prefix` (if set, every case in the case file must use it), `owner`, `status` (`active` · `draft` · `retired`; default `active`).

**Draft and verified records.** A record that nobody has checked against the code is a **draft**: `status: draft`, with `last_verified` empty. `/qa-discover` writes only drafts. A record becomes `active` only when someone checks it against the code and sets `last_verified` (`/qa-record` does this). Rules:

- A draft may contain unchecked claims. An active record may not: anything not traced to code is marked **Assumed**, with who can confirm it.
- An active record must not lose its `last_verified` date. To un-verify a record, set it back to `draft`.
- Drafts are never hidden. The doctor counts them (§10.1), and the coverage view marks them.

**Key names are settings** (`records.frontmatterKeys`), so a repo that already uses other names (for example `feature_id`, `doc_version`) conforms without a rename.

**Sections.** The default required sections, in this order:

1. What it does
2. Rules
3. Who can do what
4. How it works
5. Edge cases and known limits
6. Where it's configured
7. How to test
8. Where it lives
9. Decisions and history

The list is a setting (`records.requiredSections`). The check verifies that each required section exists as a level-2 heading, in order. It does not judge the content. Headings are compared after trimming, with straight (`'`) and curly (`’`) apostrophes treated as equal.

**Writing rules** (in the installed `docs/features/README.md`): short sentences; one instruction per step, imperative; active voice; one word for one meaning; a condition comes before its instruction. A repo may add its own style rules.

### 5.3 Case file

YAML. File name: `<feature-id><casesSuffix>`, default suffix `.cases.yaml` (a setting).

```yaml
feature: sign-in            # must equal the feature ID
cases:
  - id: SIGN-01             # matches caseIdPattern; unique in the repo; never reused
    title: A visitor signs in and lands on their home page
    priority: P0            # P0 | P1 | P2
    roles: [visitor]        # free list
    type: automated         # manual | api | automated
    automated_by: e2e/smoke/sign-in.spec.ts   # required unless type is manual
    environment: staging    # free text, optional
    preconditions:
      - The account exists and is approved.
    steps:
      - action: Open the sign-in page. Enter the email and password. Click **Sign in**.
        expected: The home page opens.
    tags: [smoke, happy-path]   # free list
    refs: ["#123"]              # free list: issues, specs
```

**Rules:**

- `caseIdPattern` default: `^[A-Z]{2,5}-\d{2,3}$` (a setting).
- Case IDs are unique across the whole repo.
- Every step has an `action` and an `expected`, both plain strings. A value that YAML reads as a number or a map is an error, with the message "quote it in the YAML".
- `automated_by` is free text. It may name several things separated by `;`. For an `automated` case it names the test that runs the case. For an `api` case it says how to run the check by hand: the script, the request file, or a short description. A path that matches the automation module's spec pattern (§8.2) is a **browser link** and is checked.
- A case is never deleted. To retire it, set `status: retired` on the case (optional key) and remove its links. K4 (§7) blocks a commit that removes a case ID. With C3, a retired ID can never come back.

### 5.4 Manifest — `qa-kit.json`

```json
{
  "$comment": "QA Kit manifest. Declared state; qa-doctor compares it with what is on disk.",
  "qaKitVersion": "0.1.0",
  "implementation": "vendored",
  "modules": {
    "core": { "enabled": true },
    "automation": {
      "enabled": true,
      "runner": "playwright",
      "specGlob": "e2e/**/*.spec.ts",
      "unlinkedDirs": ["e2e/visual/"],
      "tiers": { "smoke": "@smoke", "extended": "@extended" }
    },
    "reporting": { "status": "planned", "plannedIn": "0.2.0" }
  },
  "settings": {
    "featuresDir": "docs/features",
    "casesSuffix": ".cases.yaml",
    "caseIdPattern": "^[A-Z]{2,5}-\\d{2,3}$",
    "records": {
      "frontmatterKeys": { "id": "id", "title": "title", "version": "version", "lastVerified": "last_verified" },
      "requiredSections": ["What it does", "Rules", "Who can do what", "How it works", "Edge cases and known limits", "Where it's configured", "How to test", "Where it lives", "Decisions and history"],
      "readme": "README.md"
    },
    "codeMap": "scripts/source-doc-map.json",
    "mustMap": [],
    "mustMapExceptions": [],
    "testFilePatterns": ["*.test.*", "*.spec.*"],
    "baseline": "qa-baseline.json",
    "trailers": { "recordReviewed": "Docs-Reviewed", "testReviewed": "Test-Reviewed" }
  },
  "sdlc": {
    "plan": "/qa-plan",
    "beforePr": "npm run qa:check",
    "sessionClose": "npm run qa:coverage"
  },
  "companions": [
    { "name": "qa-kit-a11y", "status": "planned", "issue": "<url>" }
  ]
}
```

**States the doctor reports:**

| State | Meaning |
|---|---|
| **OK** | Declared on, and present |
| **SKIPPED** | Declared off, with a recorded `skippedReason` (a decision) |
| **MISSING** | Declared on, and absent (a finding) |
| **PLANNED** | Not built yet. Never counted as OK |

A module with `enabled: false` and no `skippedReason` is MISSING. An unexplained gap is the thing the manifest exists to prevent.

**`implementation`:** `vendored` (the repo runs QA Kit's scripts) or `native` (the repo implements the checks itself). For `native`, the manifest lists `evidence`: the commands that run each check (§11). The doctor verifies that those commands exist.

## 6. Core checks — `qa-check.mjs`

All checks print plain-language problems: what is wrong, where, and what to do. Exit code `1` on any problem.

### 6.1 Records — `qa-check records`

| ID | Fails when |
|---|---|
| R1 | A record has no frontmatter, or a required key is missing (`last_verified` is required only when `status` is `active`) |
| R2 | `id` does not equal the file name |
| R3 | An active record has no `last_verified`, or it is not a valid `YYYY-MM-DD` date; or a draft has a `last_verified` date; or `status` is not `active`, `draft` or `retired` |
| R4 | A required section is missing or out of order |
| R5 | A record has no case file |

A record whose frontmatter does not parse as YAML fails R1.

### 6.2 Cases — `qa-check cases`

| ID | Fails when |
|---|---|
| C1 | `feature` does not equal the feature ID |
| C2 | A case ID does not match `caseIdPattern`, or the case prefix differs from the record's `case_prefix` |
| C3 | A case ID appears twice in the repo |
| C4 | `title`, `priority`, `type` or `steps` is missing or invalid |
| C5 | `type` is `api` or `automated` and `automated_by` is empty |
| C6 | A step has no `action` or no `expected`, or a value is not a plain string |
| C7 | A case file has no cases |
| C8 | A case file has no matching record (no `<feature-id>.md` next to it) |

A case file that does not parse as YAML fails C7: no case can be read from it. C5 skips a case with `status: retired`, because retiring a case removes its links (§5.3).

### 6.3 Code map — `qa-check map`

QA Kit reads the code→doc map in govkit's format:

```json
{ "mappings": [ { "source": ["src/sign-in/**"], "docs": ["docs/features/sign-in.md", "docs/features/sign-in.cases.yaml"] } ] }
```

Globs: `*` matches any run of characters except `/`; `**` matches any run of characters, `/` included. Every other character, `?` included, matches itself. `mustMap` and `mustMapExceptions` entries are globs too, so a plain path is a glob that matches only itself.

**Test files** are not code. A file is a test file when its file name (not its path) matches a glob in `testFilePatterns` (default `*.test.*` and `*.spec.*`). M3 and K1 (§7) use this one setting.

The map may also name docs that are not feature records (it is shared with govkit). QA Kit reads only the entries inside `featuresDir`.

| ID | Fails when |
|---|---|
| M1 | A mapping names a record or a case file that does not exist |
| M2 | An active record maps from no code: no mapping that names the record has a `source` glob that matches a tracked file. Draft and retired records are skipped |
| M3 | A tracked file (`git ls-files`) that matches `mustMap` maps to no record of any status (unless it is a test file, is in `mustMapExceptions`, or is in the baseline's `unmapped` list) |
| M4 | A baseline entry is stale: a path in `unmapped` now maps to a record or no longer exists, or a file in `unlinkedSpecs` now has only linked tests or no longer exists. Remove it from the baseline |

If the map file does not exist, `/qa-init` creates it with an example mapping that gates nothing until edited, and the doctor says so. If it is still missing, or is not valid JSON with a `mappings` list, `qa-check map` fails with M1.

**The baseline (existing code and existing tests).** On an existing repo, M3 and L1 would fail on the first day, and a check that always fails gets turned off. So `/qa-init` writes the baseline file (default `qa-baseline.json`) with two sorted lists:

```json
{ "unmapped": ["src/legacy/report.ts"], "unlinkedSpecs": ["e2e/old-checkout.spec.ts"] }
```

- `unmapped`: every existing tracked path that matches `mustMap` and maps to no record at all (for M3).
- `unlinkedSpecs`: every existing spec file that has a test whose title names no case (for L1, §8.2).

Then:

- **New** code must be mapped from its first commit (M3). **New** spec files must be linked from their first commit (L1).
- A path leaves `unmapped` as soon as it maps to a record of any status, a draft included. So `/qa-discover` empties most of `unmapped` when it writes draft records and their code-map entries. A spec file leaves `unlinkedSpecs` when all its tests name cases. M4 says when.
- Verification is tracked by the **draft count**, not by the baseline. `/qa-record` turns a draft into an active record, and the draft count falls.
- **The baseline only shrinks.** K3 (§7) blocks a commit that adds a path to either list.

`mustMapExceptions` is different: it lists paths that are never a feature (a 404 page, a generated file), with no plan to map them.

### 6.4 Coverage — `qa-check coverage`

Prints a Markdown table, one row per feature, then a total row:

| Feature | Cases | Manual | API | Automated: unit/API | Automated: browser | P0 cases not automated |

- **Automated: browser** = `type: automated` with at least one browser link.
- **Automated: unit/API** = `type: automated` with no browser link.
- **P0 cases not automated** lists the IDs of `P0` cases with `type: manual` or `type: api`.
- Cases with `status: retired` are not counted.
- A feature whose record is a draft is marked `(draft)`; a retired record, `(retired)`; a case file with no record, `(no record)`. Below the table: the number of drafts and the size of the baseline.

This command never fails. It is a view.

### 6.5 All core checks — `qa-check all`

Runs `records`, `cases`, `map` and, when the automation module is on, `links` (§8.2). This is the command for CI and for a release gate.

## 7. Commit-time coupling — `qa-check commit-msg <file>`

Run from the repo's `commit-msg` hook (any hook system: `core.hooksPath`, Husky or another). It reads the staged files with `git diff --cached --name-only --diff-filter=ACMR` and the commit message from `<file>`. It skips merge commits.

| ID | Blocks the commit when | Way through |
|---|---|---|
| K1 | Staged code matches a mapping, and a record (`.md`) in that mapping is not staged. A case file in the mapping that is not staged gets a reminder, not a block | Stage the record, or add `Docs-Reviewed: <record path> — <reason>`, one trailer per record |
| K2 | A staged case file changes the `title`, `preconditions` or `steps` of a case that has a browser link, and the linked spec is not staged | Stage the spec, or add `Test-Reviewed: <case ID> — <reason>` |
| K3 | The staged baseline file contains a path, in either list, that the baseline at `HEAD` does not | Remove the path. Map it to a record, or link its tests to cases, instead. A first baseline (nothing at `HEAD`) passes |
| K4 | A case ID in a case file at `HEAD` is in no staged case file | Restore the case and set `status: retired` on it instead. A case may move to another case file |

**Rules:**

- A trailer is one line of the message: `<Name>: <subject> — <reason>`. The dash may be `—`, `–` or `-`, with a space on each side. Lines that start with `#`, and everything below a scissors line (`# --- >8 ---`), are not part of the message.
- A reason must have 10 or more characters after the dash. "ok" does not count.
- Trailer names are settings (`settings.trailers`).
- K2 compares the case at `HEAD` with the staged copy (`git show HEAD:<path>` and `git show :<path>`). A new case file has nothing at `HEAD` and passes.
- K4 compares all case IDs in case files at `HEAD` with all case IDs in the staged case files. Deleting or renaming a case file counts.
- A change that removes a browser link still counts as a change to a linked case.
- Test files (`testFilePatterns`, §6.3), records and case files are not "code" for K1.
- K1 reads the staged copy of the code map. It considers only the records and case files inside `featuresDir`; other docs in the shared map belong to govkit. A record that exists nowhere (not on disk, staged or at `HEAD`) is skipped; M1 reports it.
- K2 treats a case as linked when it has a browser link at `HEAD` or in the staged copy. It blocks when the title, preconditions or steps change, or when a browser link present at `HEAD` is removed. Every spec the case links to, at `HEAD` or staged, must be staged; a staged deletion counts as staged.
- K4 blocks when a staged case file does not parse, because it cannot read the case IDs.
- **Known limit:** the checks compare the index with `HEAD`. With `git commit --amend`, `HEAD` is the commit being replaced, so only the changes added in the amend are checked.

## 8. Automation module

### 8.1 Choosing the layer (the standard)

**The goal is an outcome, not a count:** every P0 case is automated at the cheapest layer that can truly prove it.

| Layer | Use when the case is about | Tools |
|---|---|---|
| Unit | A rule or a calculation | Vitest, Jest, node:test |
| API / database | Who may do what; what the system refuses | API clients, database role tests |
| Browser | What a person sees and does across pages | Playwright |

A browser test is the slowest and most fragile layer. Use it only when a lower layer cannot prove the case.

### 8.2 Link checks — `qa-check links`

**The contract:**

1. A browser test's title starts with the case ID(s) it proves: `test("SIGN-01 A visitor signs in", { tag: "@smoke" }, …)`. Several IDs are allowed: `"SIGN-01, SIGN-02 …"`.
2. That case says `type: automated` and names the spec file in `automated_by`.
3. The test checks what the case says, and no more. If a test needs a check the case does not state, add it to the case first.

The checker scans files that match `specGlob`. It finds tests by their declaration: `test(`, `test.only(`, `test.skip(`, `test.fixme(`, `test.fail(`, `test.slow(` followed by a string title. It ignores `test.describe`, hooks, `test.step`, and a conditional `test.skip(condition, "reason")`.

| ID | Fails when |
|---|---|
| L1 | A test in a linked file names no case ID at the start of its title. A **linked file** is every file that matches `specGlob`, is not under `unlinkedDirs`, and is not in the baseline's `unlinkedSpecs` list (§6.3) |
| L2 | A test names a case ID that does not exist |
| L3 | A test proves a case whose `type` is not `automated` |
| L4 | A test proves a case whose `automated_by` does not name the test's file |
| L5 | A case names a spec file that does not exist |
| L6 | A case names a spec file, and no test there starts with its ID |

Files under `unlinkedDirs` (for example visual snapshots, which assert no behaviour) are not linked and not checked. Files in the baseline's `unlinkedSpecs` list are existing tests from before adoption; L1 does not check them, and the list only shrinks (K3). Every new spec file is linked from its first commit.

**The limit, stated in the README:** these checks give zero *link* drift. They cannot prove that a passing test checks the right thing. K2 and code review cover that.

### 8.3 Tiers

| Tier | Tag | Runs | Size |
|---|---|---|---|
| Smoke | `@smoke` | Every PR to the release branch | A few critical tests, minutes |
| Nightly | everything except `@extended` | Every night | All core journeys |
| Extended | `@extended` | Weekly or before a release | Slow or costly tests |

Tag names are settings. **New tests start in nightly.** A test moves to smoke only when it is critical, fast and has passed many runs in a row.

### 8.4 Playwright starter (templates installed by `/qa-init`)

| File | Purpose |
|---|---|
| `playwright.config.ts` (only if absent) | `setup` project for sign-ins; main project matches `*.spec.ts`; `E2E_BASE_URL` or a local dev server; one retry in CI; HTML and JUnit reporters |
| `e2e/support/accounts.ts` | **Adapter.** The test accounts: role, email, the page each lands on. Never real people |
| `e2e/auth.setup.ts` | Signs in each account once per run and saves the session. Without a password it skips; with `E2E_REQUIRE_ACCOUNTS=true` it fails |
| `e2e/support/test.ts` | The `test` every spec imports: an `account` option (start signed in) and a `cleanup` fixture |
| `e2e/support/cleanup.ts` | `Cleanup`: steps run after the test, newest first, every step even if one fails; reports what was left behind. **Adapter:** the delete function and the allowed environment |
| `e2e/smoke/example.spec.ts` | One linked example test |

Scripts merged into `package.json` (existing keys kept): `test:e2e`, `test:e2e:smoke` (`--grep @smoke`), `test:e2e:nightly` (`--grep-invert @extended`), `qa:check`, `qa:coverage`, `qa:doctor`.

**Rules for reliable browser tests** (in the installed README):

- Check the page's own content, not only the URL. A URL check can pass in the moment before a redirect.
- Find elements by role and visible label, not by CSS class.
- No fixed waits. Use assertions that wait.
- Tests sign in only as dedicated test accounts.
- Each test removes the data it creates. Tests never call a full data reset.
- Cleanup refuses any environment except the one allowed in the adapter.
- Red means broken. A flaky test is fixed, or quarantined with `test.fixme` and an issue, within one working day.

## 9. Skills (Claude Code plugin)

Every skill is a thin wrapper over the scripts. The work must also run in a plain terminal and in CI.

| Skill | Does |
|---|---|
| `/qa-init` | Installs the kit into the current repo. Non-destructive: creates missing files, merges `package.json` scripts, never overwrites. Idempotent. Asks which modules to enable; a skipped module needs a reason. Prints a created / merged / skipped summary. Never commits, installs packages or deploys |
| `/qa-discover` | Maps an existing repo's features. Reads the code (routes, pages, API handlers, jobs, database objects), proposes a feature list, and **waits for approval**. Then drafts, for each approved feature: a record (`status: draft`), a case file with case outlines, and its code-map entries. Removes the newly mapped paths from the baseline's `unmapped` list. Never sets `last_verified`. Never marks a case `automated`. Ends with a list of drafts, in a suggested order for verification (highest risk first) |
| `/qa-doctor` | Runs `qa-doctor.mjs` and explains each finding |
| `/qa-record <feature>` | Writes, updates or **verifies** a feature record and its case file against the code. Reads the code first; marks anything it cannot trace to code as **Assumed**, with who can confirm it. Sets `status: active` and `last_verified` only after checking every claim. The draft count falls by one |
| `/qa-plan <issue or feature>` | Before code: lists the behaviours, writes or updates the cases, chooses the layer for each (§8.1), and proposes the tests |

`/qa-review` (periodic coverage, flaky and slow-test review) ships with the reporting module in v0.2.

### 9.1 The adoption path for an existing repo

| Step | Command | Result | Kind of work |
|---|---|---|---|
| 1 | `/qa-init` | Structure, manifest, scripts, hooks, CI step, and the baseline of existing unmapped code and unlinked spec files | Predictable; safe to run again; minutes |
| 2 | `/qa-discover` | An approved feature list; draft records, case outlines and code-map entries. Mapped paths leave the baseline; the drafts appear in the draft count | Judgment; reviewed by a person |
| 3 | `/qa-record <feature>`, one feature at a time | The record checked against the code and made active; the draft count falls | Judgment; repeated over days or weeks |
| 4 | Day to day | `/qa-plan` before work; commit hook K1–K4; `qa:check` in CI; coverage view | Automatic |

A new repo skips step 2: it writes records as features are built.

**Why steps 1 and 2 are separate.** Step 1 must behave the same in every repo and never change content. Step 2 writes content and can be wrong. An agent that drafts many records at once writes some claims it did not check. Marking them as drafts keeps a wrong claim from reading like a verified one.

## 10. The doctor — `qa-doctor.mjs`

### 10.1 Behaviour

- Reads `qa-kit.json`. If it is absent: says so, and points to `/qa-init`.
- For each module: OK, SKIPPED, MISSING or PLANNED (§5.4), with the missing files or scripts listed.
- For each companion: PLANNED (with its issue link) or OK when its own manifest is present.
- Reports QA Kit files found on disk but not declared ("installed but not in the manifest").
- Reports adoption progress as **findings, not failures**: the number of draft records, and the number of paths left in the baseline.
- `--ci`: exit `1` if anything is MISSING. PLANNED never fails the run.
- `config`: prints the manifest as a readable table.
- Dependency-free: Node built-ins only.

### 10.2 Inside govkit's doctor

With no change to govkit, a repo adds one guardrail entry to `govkit.json`:

```json
"qa-kit": {
  "enabled": true,
  "description": "Feature records, test cases and their traceability checks",
  "expects": ["qa-kit.json", "scripts/qa-check.mjs", "scripts/qa-doctor.mjs"],
  "expectsScripts": ["qa:check", "qa:doctor"],
  "vendoredFrom": "techsilon-oss/qa-kit",
  "vendoredVersion": "0.1.0"
}
```

`/qa-init` offers to add this entry when `govkit.json` exists.

### 10.3 With govkit's `/sdlc`

**The guardrails do not depend on `/sdlc`.** They are the commit hook (K1–K4) and the CI step (`qa:check`), which run whether or not anyone uses a skill. `/sdlc` integration is a convenience.

**QA Kit never ships its own `/sdlc`.** Two skills with one name give advice that is almost right, which is worse than advice that is plainly wrong.

**The contract.** QA Kit declares its steps in the `sdlc` block of `qa-kit.json` (§5.4):

| Key | When govkit's `/sdlc` runs it |
|---|---|
| `plan` | While planning an issue, before code |
| `beforePr` | Before it opens a PR |
| `sessionClose` | At session close, to report coverage and draft counts |

govkit's `/sdlc` reads this block when `qa-kit.json` exists, and runs the steps in its own phases. This needs one small change in govkit: an extension point that reads sibling kits' `sdlc` blocks. Any future kit can use the same block. Until govkit ships the extension point, the steps run by hand and the guardrails still hold.

## 11. Conformance

A repo **conforms** to QA Kit v0.1 when:

1. Its records and case files meet §5 (key names and paths may differ, through settings).
2. Checks equivalent to R1–R5, C1–C8, M1–M3, L1–L6 run in CI or in the release gate, and fail the run.
3. K1, K2, K3 and K4 run at commit time.
4. A coverage view exists.
5. `qa-kit.json` declares the state, and the doctor reports no MISSING.

A repo that already has its own implementation declares `"implementation": "native"` and lists its evidence:

```json
"evidence": {
  "records": "npm run test",
  "cases": "npm run test",
  "links": "npm run test",
  "coupling": "commit-msg hook: <path>",
  "coverage": "npm run <coverage-script>"
}
```

The doctor checks that each named script exists. It does not run them.

## 12. Companion kits (shell)

Separate repos, built only when a real need starts one. Until then each is **PLANNED**: a line in the QA Kit README and a GitHub issue labelled `idea` in `qa-kit`.

| Kit | Would check | Trigger to build |
|---|---|---|
| `qa-kit-a11y` | Accessibility of key pages (an axe-based scan) | Before a public launch |
| `qa-kit-load` | Behaviour under many users at once | Before a public launch, or a known traffic event |
| `qa-kit-security` | A baseline web security scan and a dependency audit | Before a public launch; then weekly |
| `qa-kit-recon` | That the system of record and an external provider agree (for example every payment has a record, totals match) | When money or other external records exist |
| `qa-kit-restore` | That a backup restores into a scratch environment and works | Before the first real customer data |

Each issue states: what it would check, why, the trigger, and "ships nothing yet".

## 13. Engineering rules for the kit itself

- Runners (`qa-check.mjs`, `qa-doctor.mjs`) use Node built-ins plus **one** dependency: the `yaml` npm package, installed per repo as a dev dependency (the same pattern as `tsx` for govkit's release gate). Verify the current version of `yaml` before you pin it.
- Node 22 or later.
- Tests use `node:test`, with fixture repos under `test/fixtures/`. Every check ID (R1…L6, K1–K4) has a passing and a failing fixture.
- Vendored files are copied verbatim into a repo, and the manifest records `vendoredVersion`. Fix bugs in `qa-kit`, never in a copy.
- Messages are plain language: what, where, what to do.
- Semantic versioning. A change to a file format, a check ID or a manifest key is a minor version before 1.0, and is listed in `CHANGELOG.md`.
- License: MIT. Copyright holder: Techsilon LLC.

## 14. Roadmap

| Version | Adds |
|---|---|
| 0.1.0 | Core (records with draft and active states, cases, map, baseline, coverage, coupling K1–K4) + automation (link checks, Playwright starter) + doctor + `/qa-init`, `/qa-discover`, `/qa-doctor`, `/qa-record`, `/qa-plan` + the `sdlc` block + companion shell. In govkit, separately: the `/sdlc` extension point |
| 0.2.0 | Reporting: CI workflow template that saves the HTML report and publishes a JUnit summary; optional Qase adapter (results by case ID); `/qa-review` |
| Later | Unit-layer links (Vitest titles with case IDs, same contract); quarantine with expiry dates (`test.fixme` must name an issue and a date; the check fails after the date); smoke time budget; feature tags for targeted runs |
