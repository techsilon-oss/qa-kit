---
id: search
title: Search
version: 1.0
last_verified: 2026-10-01
owner: platform
---

# Sign-in

## What it does

A visitor signs in with an email and a password.

## Rules

- Five failed attempts lock the account for 15 minutes.

## Who can do what

| Role | Can |
|---|---|
| Visitor | Sign in |

## How it works

The form posts to the search handler.

```md
## This heading is inside a code block and is not a section
```

## Edge cases and known limits

None known.

## Where it's configured

`src/search/config.ts`.

## How to test

See `search.cases.yaml`.

## Where it lives

`src/search/`.

## Decisions and history

- 1.0: first record.
