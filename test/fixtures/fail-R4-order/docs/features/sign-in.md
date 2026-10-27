---
id: sign-in
title: Sign-in
version: 1.0
last_verified: 2026-10-01
case_prefix: SIGN
owner: platform
---

# Sign-in

## What it does

A visitor signs in with an email and a password.

## Who can do what

| Role | Can |
|---|---|
| Visitor | Sign in |

## Rules

- Five failed attempts lock the account for 15 minutes.

## How it works

The form posts to the sign-in handler.

```md
## This heading is inside a code block and is not a section
```

## Edge cases and known limits

None known.

## Where it's configured

`src/sign-in/config.ts`.

## How to test

See `sign-in.cases.yaml`.

## Where it lives

`src/sign-in/`.

## Decisions and history

- 1.0: first record.
