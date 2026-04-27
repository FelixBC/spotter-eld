# Spotter ELD — Claude Code context

## What this project is

This repository is a **job assessment** for **Spotter AI** (Full Stack Developer). It is a trip planner for property-carrying commercial motor vehicle (CMV) drivers that produces FMCSA-aligned ELD daily logs and route visualization. Treat requirements as fixed unless the user explicitly changes them.

## Commit strategy

- Prefer **substantial, logical commits** (one coherent change per commit), not micro-commits.
- Use **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, etc.).
- Aim for roughly **3–8 commits per session**, not dozens of tiny ones.
- **Always ask the user for approval before running `git commit`.** Never assume consent.

## Code quality bar

- Use **type hints** on new Python code where it aids clarity.
- Use **docstrings** for public modules, classes, and non-obvious functions.
- Add **pytest** coverage for Hours-of-Service (HOS) rule logic as it is implemented.
- Do not leave **commented-out code** in the tree.
- Avoid **magic numbers**; name constants and document units (hours, miles, etc.).

## What NOT to do

- Do not commit **secrets**, API keys, or real credentials; use env vars and local-only config.
- Do not add **dependencies** (pip/npm) or upgrade major versions without asking the user.
- Do not **refactor working code** for style alone unless the user asks.
- Avoid **scope creep** beyond what [docs/BRIEF.md](docs/BRIEF.md) and related specs describe.
- **Never run `git push`** or ask the user to expose tokens in chat.

## When in doubt

**Ask the user** before guessing on product behavior, compliance edge cases, or repo policy.
