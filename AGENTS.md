# Repository Guidelines

## Project Structure & Module Organization
- `backend/`: NestJS + Prisma service. Features live under `src/` (events, console, ai, billing/payments, communities). Schema in `prisma/schema.prisma`; migrations in `prisma/migrations`; seeds in `prisma/seed.ts`; compiled output in `dist/`.
- `frontend/`: Vue 3 + Vite app. Screens in `src/views/console` and `src/views/mobile`; HTTP client `api/client.ts`; shared types `types/api.ts`; routing in `router/`; state in `stores/`; copy in `locales/` with `i18n.ts`; static assets in `assets/`.
- Root: `docker-compose.yml` (local Postgres), `README.md` (setup), `SESSION_NOTES.md` (work log), and this guide.

## Build, Test, and Development Commands
- Install: `cd backend && npm install && cd ../frontend && npm install`.
- Backend: `npm run start:dev` (http://localhost:3000), `npm run build`, `npm run lint`.
- Prisma: `npm run prisma:generate`; migrate locally with `npx prisma migrate dev --name <msg>`; seed `npm run prisma:seed`.
- Stripe webhook (local): `stripe listen --forward-to http://localhost:3000/api/v1/payments/stripe/webhook`.
- Frontend: `npm run dev -- --host` (http://localhost:4173), `npm run build`, `npm run preview`.
- DB: `docker compose up postgres -d` before migrate/seed; set `DATABASE_URL` to match compose.

## Coding Style & Naming Conventions
- TypeScript everywhere; 2-space indent; follow repo ESLint/Prettier. Keep copy in `locales/` (base language: ja); avoid hard-coded strings.
- Backend: Nest patterns (module/service/controller in PascalCase; files kebab-case). DTOs + validation per feature folder. Centralize env reads.
- Frontend: SFC names PascalCase; composables `useX`; stores `useXStore`. Keep API shapes in `types/api.ts`; call backend via `api/client.ts`; prefer composables/state over ad-hoc globals.

## Testing Guidelines
- Minimum: ensure `npm run build` passes in backend and frontend for every PR.
- Backend: use Nest testing module + supertest; mock Stripe/OpenAI; prefer seeded fixtures for DB flows.
- Frontend: Vitest + Vue Test Utils for logic; smoke key flows manually (auth, event create/publish, payments, community portal) before merging.

## Commit & Pull Request Guidelines
- Commits: short, imperative (`Fix portal hero spacing`). Keep migrations/seed steps called out in messages or PR notes.
- PRs: state scope, link issue/ticket, list env or schema changes, attach UI screenshots/GIFs, and note any manual QA done. Include build/lint status for both apps.

## Environment & Security Notes
- Backend env (`backend/.env.local`): `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, upload/OSS keys, `FRONTEND_BASE_URL`.
- Frontend env (`frontend/.env.local`): `VITE_API_BASE_URL`, `VITE_STRIPE_PUBLISHABLE_KEY`, optional maps/upload keys.
- Never commit secrets. Avoid hardcoded URLs/keys in components; use envs/config. Prefer HTTPS for Stripe in non-local environments.
