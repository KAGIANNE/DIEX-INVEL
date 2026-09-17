# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the current static prototype: `index.html`, `app.js`, and `styles.css`.
- `docs/` contains architecture, current state, and numbered decision records.
- `tests/` is reserved for automated and manual test assets; no framework is installed yet.
- `.cursor/hooks/` contains the guide-sync hook. `README.md` explains how to open the prototype.

## Build, Test, and Development Commands

- `start .\src\index.html` opens the local prototype in the default browser.
- `node --check .\src\app.js` verifies JavaScript syntax.
- `node .cursor\hooks\sync-agent-guides.mjs AGENTS.md` synchronizes `CLAUDE.md` after an external edit.

There is no package manager, build step, or production server yet. Do not add dependencies without documenting the reason and updating the architecture decision.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, single-purpose functions, and clear Spanish user-facing labels. Use `camelCase` for JavaScript variables/functions, `kebab-case` for file names, and `snake_case` for future database identifiers. Preserve semantic HTML, keyboard access, and readable contrast.

## Testing Guidelines

Until a test runner is introduced, run the syntax check above and manually verify dashboard navigation, product creation, purchases, sales, partial payments, stock rules, cotizaciones, and CSV exports. Add tests under `tests/` with descriptive names such as `inventory-rules.test.js`.

## Documentation Policy

Every material change must update the matching file in `docs/`, `README.md`, or the relevant decision record. `AGENTS.md` and `CLAUDE.md` are one synchronized guide; never maintain different content in them.

## Commit & Pull Request Guidelines

Use concise imperative commits, for example `feat: add local inventory prototype`. Describe behavior changes, verification performed, and documentation updates in pull requests. Include screenshots for visible UI changes.

## Security & Architecture Notes

Never commit credentials, customer data, payment data, or production secrets. The target architecture is local-first: installed clients connect to a local server and PostgreSQL over the LAN, with optional cloud synchronization. Supabase remains a proposal until the database design is verified.
