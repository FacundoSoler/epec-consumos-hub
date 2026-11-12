# EPEC Consumos Hub

Chrome extension (`epec-consumption-reporting-extension/`) + stateless Express email server (`epec-consumos-webhooks-server/`, deployed on Railway). Two separate npm projects; run commands inside each folder. Design and decisions: `ARCHITECTURE.md`.

<!-- Keep this file to what Claude cannot learn from the code. Target well under 200 lines. -->

## Commands

Server (`epec-consumos-webhooks-server/`):
- Dev server: `npm run dev` (http://localhost:3000)
- All tests: `npm run test:run`
- One test file: `npx vitest run src/middleware/requireEpecToken.test.ts`
- Typecheck: `npx tsc --noEmit -p .` (`tsx` does not typecheck, so `npm run dev` can start with type errors)

Extension (`epec-consumption-reporting-extension/`):
- All tests: `npm run test:run`
- One test file: `npx vitest run tests/background.test.js`
- Parse check: `npm run check`
- Load in Chrome: chrome://extensions > Developer mode > Load unpacked > the extension folder

## Testing

- Every bug fix ships with tests in the same commit, covering the bug and its edge cases.
- Extension tests run in Node with hand-written fakes, not a browser: `tests/helpers/chromeMock.js` (chrome.*), `epecApiMock.js` (fetch routed to EPEC), `pageMock.js` (page `window` and `XMLHttpRequest`). Reuse them instead of adding jsdom.
- Server tests use `src/testing/fakeExpress.ts` for req/res and `vi.mock` for nodemailer and the EPEC client.

## Gotchas

- Extension sources are plain `.js` on purpose: Chrome loads files as-is and cannot run TypeScript. Do not add `.ts` under the extension's `src/` until a build step exists.
- Server imports use `.js` extensions even for `.ts` files (NodeNext).
- No user data is stored server-side; the old Postgres layer was removed deliberately. Discuss before adding persistence.
- Email recipients come from the verified EPEC token (`res.locals.epecUser.email`), never from the request body.
- Every email route is `requireEpecToken` → `limitOneEmailPerDay` → controller. The limiter is in-memory and only correct on a single server instance.
- EPEC returns `consumo` as `"12,4"`; `getEpecData` normalises to numbers and sorts newest first, so `[0]` is the latest day.
- Dates use `America/Argentina/Cordoba`. Weekdays are `"0".."6"` strings with Sunday = `"0"`. EPEC's `hasta` is `DDMMYYYYHHmm`.
- `content-main.js` runs in epec.com.ar's own JS context: any `fetch`/XHR patch must hand the original response back, or the site breaks.
- `IS_PRODUCTION` in `src/background.js` is a manual switch and stays `false` (localhost) in the repo.

## Conventions

- If a parent CLAUDE.md with C#/WPF conventions is loaded, only its general rules apply here (SOLID, self-explanatory names, comments only for "why"); the C#/WPF file-structure rules do not.
- Errors propagate to the caller, which maps them to a response; never log and swallow.
- Conventional Commits (`fix(extension): …`, `feat(server): …`), one logical change per commit.
