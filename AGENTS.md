# Repository Guidelines

## Project Structure & Module Organization
The NestJS app lives in `src/`, with feature folders (auth, payment, tiktokdm, etc.) following the `*.module.ts` / `*.service.ts` / `*.controller.ts` pattern. Shared entities and helpers sit in `src/entity` and `src/utils`. Migrations live in `migrations/`, docs and integration notes in `docs/`, runtime assets in `uploads/` and `storage/`, compiled output in `dist/`, and e2e helpers under `test/`. Add new modules beneath `src/` and register them in `app.module.ts` so DI can wire them.

## Build, Test, and Development Commands
Install dependencies with `pnpm install`. Common scripts:
```
pnpm run start:dev    # watch-mode API server
pnpm build            # compile TypeScript to dist/
pnpm start:prod       # run compiled bundle
pnpm lint             # ESLint with TypeScript rules
pnpm format           # Prettier over src/ and test/
pnpm test             # unit tests
pnpm test:e2e         # e2e suite via test/jest-e2e.json
pnpm test:cov         # coverage report in coverage/
```
Use `docker-compose.dev.yml` to boot MySQL, RabbitMQ, and MinIO locally before running modules that depend on them.

## Coding Style & Naming Conventions
Code is TypeScript-first with ES2022 modules. Keep 2-space indentation, single quotes, and trailing commas—Prettier handles the formatting. Stick to Nest naming: controllers end with `Controller`, providers with `Service`, DTOs with `Dto`. Use `camelCase` for variables, `PascalCase` for classes, and `SCREAMING_SNAKE_CASE` for env keys. Run `pnpm lint` and `pnpm format` before pushing; ESLint (`@typescript-eslint`) will flag implicit `any` and stray imports.

## Testing Guidelines
Place unit tests next to their sources with the `*.spec.ts` suffix. Integration and contract tests belong under `test/` with `*.e2e-spec.ts`, driven by `test/jest-e2e.json`. Mock external systems (MinIO, MercadoPago, TikTok connectors) to keep runs deterministic. Target ≥80% branch coverage and run `pnpm test:cov` before review submissions.

## Commit & Pull Request Guidelines
History favors concise, lowercase summaries (`ajustes`, `docker`). Prefer `<scope>: <imperative>` when extra context helps, keep subjects ≤50 chars, and add a body that covers What/Why for multi-file work. Pull requests must state the purpose, list manual/automated test evidence, reference issue IDs, and note config or migration steps. Request reviewers tied to the affected domain (payments, tracking, TikTok) and wait for green CI before assigning.

## Environment & Security Tips
Configuration comes from `.env` files loaded by `@nestjs/config` (`src/config`). Do not commit secrets; document required keys (DB, JWT, MinIO, MercadoPago, TikTok) inside the PR checklist instead. Rotate Puppeteer/TikTok tokens frequently, prefer secret managers in production, and clear temporary artifacts under `logs/` and `uploads/` before committing.
