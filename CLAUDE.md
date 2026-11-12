# EPEC Consumos Hub

Chrome extension (`epec-consumption-reporting-extension/`) + stateless Express email server (`epec-consumos-webhooks-server/`, deployed on Railway). Two separate npm projects; run commands inside each folder. Design and decisions: `ARCHITECTURE.md`.

<!-- Keep this file to what Claude cannot learn from the code. Target well under 200 lines. -->

## Commands

Repo root (runs both sub-projects in sequence; exits 1 if either fails):
- Install everything: `npm run install:all`
- All tests: `npm test`
- Typecheck everything: `npm run check`
- Build the extension (production): `npm run build`

Server (`epec-consumos-webhooks-server/`):
- Dev server: `npm run dev` (http://localhost:3000)
- Tests: `npm run test:run`; one file: `npx vitest run src/middleware/requireEpecToken.test.ts`
- Typecheck: `npm run typecheck` (`tsx` does not typecheck, so `npm run dev` can start with type errors)

Extension (`epec-consumption-reporting-extension/`):
- Tests: `npm run test:run`; one file: `npx vitest run tests/background.test.js`
- Parse check: `npm run typecheck`
- Build: `npm run build:dev` (API on http://localhost:3000) or `npm run build` (Railway, no localhost in the manifest)
- Load in Chrome: chrome://extensions > Developer mode > Load unpacked > `dist/` (rebuild and reload after each change)

## Testing

- Every bug fix ships with tests in the same commit, covering the bug and its edge cases.
- Extension tests run in Node with hand-written fakes, not a browser: `tests/helpers/chromeMock.js` (chrome.*), `epecApiMock.js` (fetch routed to EPEC), `pageMock.js` (page `window` and `XMLHttpRequest`). Reuse them instead of adding jsdom.
- Server tests use `src/testing/fakeExpress.ts` for req/res and `vi.mock` for nodemailer and the EPEC client.

## Gotchas

- Extension sources stay plain `.js` (a TypeScript migration is a separate decision). Vite bundles them into `dist/` via `build/build.js`; content scripts are built as classic IIFE scripts because MV3 content scripts cannot be ES modules.
- The server URL is `__API_BASE_URL__`, injected by the build (`build/buildModes.js`) and by `vitest.config.js` in tests. `dist/manifest.json` is generated from `manifest.json`; edit the source, not `dist/`.
- Server imports use `.js` extensions even for `.ts` files (NodeNext).
- No user data is stored server-side; the old Postgres layer was removed deliberately. Discuss before adding persistence.
- Email recipients come from the verified EPEC token (`res.locals.epecUser.email`), never from the request body.
- Every email route is `requireEpecToken` → `limitOneEmailPerDay` → controller. The limiter is in-memory and only correct on a single server instance.
- EPEC returns `consumo` as `"12,4"`; `getEpecData` normalises to numbers and sorts newest first, so `[0]` is the latest day.
- Dates use `America/Argentina/Cordoba`. Weekdays are `"0".."6"` strings with Sunday = `"0"`. EPEC's `hasta` is `DDMMYYYYHHmm`.
- `content-main.js` runs in epec.com.ar's own JS context: any `fetch`/XHR patch must hand the original response back, or the site breaks.

## Conventions

- If a parent CLAUDE.md with C#/WPF conventions is loaded, only its general rules apply here (SOLID, self-explanatory names, comments only for "why"); the C#/WPF file-structure rules do not.
- Errors propagate to the caller, which maps them to a response; never log and swallow.
- Conventional Commits (`fix(extension): …`, `feat(server): …`), one logical change per commit.
