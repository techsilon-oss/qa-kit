# Features

This folder says **what the product does** and **how each behaviour is proven**. It holds two files per feature:

- `<feature-id>.md`: the **feature record**. What the feature does, its rules, who can do what, and where it lives.
- `<feature-id>.cases.yaml`: the **case file**. The test cases that prove the record.

Scripts check both files, the map from code to records, and the links from tests to cases. Run them with:

```bash
npm run qa:check      # every check; CI runs the same command
npm run qa:coverage   # how each case is tested
```

The checks and their IDs (R1, C2, K1, …) are defined in the QA Kit specification. Each failure says what is wrong, where, and what to do.

## Write a feature record

1. Name the file after the feature: lower-case letters, digits and hyphens, for example `sign-in.md`.
2. Start the file with frontmatter:

   ```yaml
   ---
   id: sign-in              # must equal the file name, without .md
   title: Sign-in
   version: 1.0             # increase it when the content changes meaningfully
   last_verified: 2026-10-01
   case_prefix: SIGN        # optional: every case in the case file must use it
   owner: platform          # optional
   status: active           # optional: active (default), draft or retired
   ---
   ```

3. Write these sections as level-2 headings (`## …`), in this order. Add other sections anywhere you need them.
   1. What it does
   2. Rules
   3. Who can do what
   4. How it works
   5. Edge cases and known limits
   6. Where it's configured
   7. How to test
   8. Where it lives
   9. Decisions and history
4. Map the feature's code to the record in the code map (`scripts/source-doc-map.json`):

   ```json
   { "source": ["src/sign-in/**"], "docs": ["docs/features/sign-in.md", "docs/features/sign-in.cases.yaml"] }
   ```

### Draft and active records

- A record that nobody has checked against the code is a **draft**: `status: draft`, with `last_verified` empty.
- To make a record **active**, check every claim against the code. Mark anything you cannot trace to code as **Assumed**, and name who can confirm it. Then set `status: active` and `last_verified` to today's date.
- An active record keeps its `last_verified` date. To un-verify a record, set it back to `draft`.

### Writing rules

- Write short sentences.
- Write one instruction per step, in the imperative: "Open the page", not "The page should be opened".
- Use the active voice.
- Use one word for one meaning. If the product calls it an "order", never call it a "purchase".
- Put a condition before its instruction: "If the account is locked, wait 15 minutes."

## Write a case file

```yaml
feature: sign-in            # must equal the feature ID
cases:
  - id: SIGN-01             # unique in the repo; never reused
    title: A visitor signs in and lands on their home page
    priority: P0            # P0 critical · P1 core · P2 polish
    roles: [visitor]
    type: automated         # manual · api · automated
    automated_by: e2e/smoke/sign-in.spec.ts
    preconditions:
      - The account exists and is approved.
    steps:
      - action: Open the sign-in page. Enter the email and password. Click **Sign in**.
        expected: The home page opens.
    tags: [smoke, happy-path]
    refs: ["#123"]
```

- **`type`:**
  - `manual`: a person runs it through the UI.
  - `api`: a person runs a call or a script by hand. `automated_by` says how: the script, the request file, or a short description.
  - `automated`: a test in the repo runs it, at any layer. `automated_by` names the test file. Separate several with `;`.
- **Steps:** every step has an `action` and an `expected`, both plain text. If a value is a number, or contains `: `, quote it: `expected: "The response is 400."`.
- **Never delete a case.** To retire one, set `status: retired` on it and remove its links. A commit that removes a case ID is blocked. A case may move to another case file.

## Choose the layer

The goal is that every P0 case is automated at the cheapest layer that can truly prove it.

| Layer | Use it when the case is about | Tools |
|---|---|---|
| Unit | A rule or a calculation | Vitest, Jest, node:test |
| API / database | Who may do what; what the system refuses | API clients, database role tests |
| Browser | What a person sees and does across pages | Playwright |

A browser test is the slowest and most fragile layer. Use it only when a lower layer cannot prove the case.

## Link a browser test to its case

1. Start the test title with the ID of the case it proves: `test("SIGN-01 A visitor signs in", { tag: "@smoke" }, …)`. A test may prove several cases: `"SIGN-01, SIGN-05 …"`.
2. In the case, set `type: automated` and name the spec file in `automated_by`.
3. Make the test check what the case says, and no more. If the test needs a check the case does not state, add it to the case first.

Every test in a spec file must name a case, except in the folders listed in `unlinkedDirs` (for example visual snapshots, which assert no behaviour).

**The limit.** These checks keep the links exact: every browser test names a case, and every automated case names a test that exists. They cannot prove that a passing test checks the right thing. The commit check on linked cases and code review cover that.

### Tiers

| Tier | Tag | Runs |
|---|---|---|
| Smoke | `@smoke` | Every pull request to the release branch. A few critical tests, minutes |
| Nightly | everything except `@extended` | Every night. All core journeys |
| Extended | `@extended` | Weekly, or before a release. Slow or costly tests |

New tests start in nightly. Move a test to smoke only when it is critical, fast, and has passed many runs in a row.

### Write reliable browser tests

- Check the page's own content, not only the URL. A URL check can pass in the moment before a redirect.
- Find elements by role and visible label, not by CSS class.
- Use no fixed waits. Use assertions that wait.
- Sign in only as dedicated test accounts. Never as a real person.
- Remove the data each test creates. Never call a full data reset.
- Let cleanup run only in the environment the adapter allows.
- Treat red as broken. Fix a flaky test, or quarantine it with `test.fixme` and an issue, within one working day.

## Commit with a record or a reason

The `commit-msg` hook keeps code, records, cases and tests in step:

- **If you change code**, stage its record. If the record still holds, add a trailer instead:
  `Docs-Reviewed: docs/features/sign-in.md — only a log message changed`
- **If you change the title, preconditions or steps of a case with a browser test**, stage the spec. If the test still holds, add a trailer instead:
  `Test-Reviewed: SIGN-01 — the test already checks the new wording`
- Write a reason of 10 or more characters after the dash. "ok" does not count.
