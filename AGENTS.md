# Repository Guidelines

## Project Structure & Module Organization
`src/` hosts the React + TypeScript UI (pages, contexts, stores, and components). DeskThing actions and Sonos helpers live in `server/`, bundled independently with `npm run build-server`. Static assets land in `public/`, cross-runtime helpers belong in `shared/`, and automated tests sit in `test/`; anything under `dist/` or `*.backup` files is generated and should stay untouched.

## Build, Test, and Development Commands
- `npm run dev` – Vite + DeskThing wrapper with hot reload; `npm run dev-ip` prompts for a speaker IP and writes `.env.local` before launching dev mode.
- `npm run build` – Calls `@deskthing/cli package` to produce the deployable bundle in `dist/`.
- `npm run build-server` – Esbuilds `server/index.ts` so Sonos helpers can be exercised standalone.
- `npm run lint` – Runs ESLint with the repo’s TypeScript + React hooks rules.
- `npm test` – Executes the XML parsing regression suite (`node --loader tsm …`).
- `npm run preview` – Serves the production Vite build for smoke-testing on-device.

## Coding Style & Naming Conventions
TypeScript is required across UI and server files. Follow the enforced ESLint rules (ES2020, React Hooks, React Refresh), keep 2-space indentation, semicolons, single quotes, `camelCase` variables, and PascalCase React components (`VolumeControlPage.tsx`). Co-locate CSS or Tailwind-powered styles with their components (`PlaybackControl.css`) and prefer functional components plus hooks over classes.

## Testing Guidelines
Tests run under plain Node with `tsm` and `assert/strict`. Name suites `*.test.ts` and place them in `test/` (or beside the module when context is clearer), and exercise both happy-path device flows and malformed Sonos payloads. Include sample XML fixtures, assert derived values like resolved album art URLs, and run `npm test` plus any targeted integration checks before opening a PR.

## Commit & Pull Request Guidelines
History favors short, imperative messages (`add now playing widget`, `fix shuffle state`), so keep commits focused and scoped. PRs need a concise summary, linked issues/tickets, repro steps, UI screenshots or GIFs, and a callout for any new environment variables; tag both frontend and server reviewers when changes cross those areas and flag breaking Sonos control changes in bold.

## Security & Configuration Tips
Keep the target Sonos speaker reachable and store its IP in `.env.local` as `VITE_SONOS_IP` (`npm run dev-ip` scaffolds the file). Do not commit `.env*` files or generated DeskThing packages. When extending `server/sonos/` helpers, avoid logging credentials and use the utilities in `server/utils` for token handling and retries.
