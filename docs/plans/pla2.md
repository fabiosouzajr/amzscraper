# Prompt: Plan admin bootstrap + centralized runtime configuration

Use this prompt with an AI coding agent after it has access to the repository.

---

You are working in the **amzscraper** codebase (TypeScript backend + React frontend).

## Objective
Create an **implementation plan** (not code yet) that follows production best practices for:

1. **Default admin bootstrap at runtime**
   - Design a robust way to determine whether at least one admin user exists.
   - If no admin exists, design a secure bootstrap flow that prompts for admin setup.
   - Ensure this works cleanly for first-run setups and does not weaken security in subsequent runs.

2. **Parameter inventory after code analysis**
   - Analyze backend + frontend code and produce a complete parameter inventory.
   - Include where each parameter is currently defined, default behavior, and where it is consumed.

3. **Centralized configuration (backend + frontend)**
   - Propose a configuration architecture that centralizes system parameters in dedicated config files/modules for backend and frontend.
   - Ensure runtime parameterization is supported (different environments, defaults, validation, overrides).
   - Include migration strategy from current scattered configuration usage.

## Current implementation context you must consider

Base your plan on the existing code behavior:

- Backend server startup currently reads env vars and may auto-create/promote an initial admin if `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD` are present.
- Auth currently allows open registration (`POST /api/auth/register`) and does not gate first-user flow.
- Database path is currently hardcoded to `database/products.db`.
- Backend port selection uses `PORT` and `PORT_FALLBACK` with runtime availability check.
- JWT secret falls back to an insecure default if not set.
- Frontend Vite dev server has a fixed port and hardcoded backend proxy target.
- Frontend API base URL is hardcoded to `/api`.
- System-level app settings (quotas/scheduler) are currently seeded in `system_config` table and editable through admin routes/UI.

## Initial parameter inventory seed (expand and verify)

Use this as a starting point, then verify and expand during analysis:

### Backend/runtime
- `PORT` (backend primary port)
- `PORT_FALLBACK` (backend fallback port)
- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_PASSWORD`
- `JWT_SECRET`
- SQLite DB file path (`database/products.db`, currently hardcoded)
- Scheduler defaults and toggles (`scheduler_enabled`, `scheduler_cron` in `system_config`)
- Quota values in `system_config` (`quota_max_products`, `quota_max_lists`, etc.)

### Frontend/runtime/build
- Vite dev server port (`5174`)
- Vite proxy target (`http://localhost:3000`)
- Frontend API base URL (`/api`)
- Allowed hosts configuration in Vite

### Operational scripts
- `run.sh` prompted backend port default (`3030`)
- `run.sh` prompted frontend port default (`5174`)

## Required output format

Return your response in this exact structure:

1. **Codebase findings summary**
   - What exists today (admin bootstrap/auth/config), with risks and gaps.

2. **Parameter inventory table**
   - Columns: `Parameter`, `Layer`, `Current Source`, `Default`, `Used By`, `Risk if Misconfigured`, `Should Centralize?`.

3. **Target architecture**
   - Backend config design (file/module shape, env parsing, schema validation, defaults, fail-fast policy).
   - Frontend config design (build-time vs runtime config strategy).
   - Separation of concerns between static app config and mutable DB-backed admin settings.

4. **Admin bootstrap design**
   - Startup/admin existence check approach.
   - First-run setup flow design (API + frontend UX).
   - Security controls (one-time token/setup window/rate limits/audit logs/no plaintext secret persistence).
   - Edge cases (concurrency, multi-instance startup, partial setup, rollback).

5. **Step-by-step implementation plan**
   - Ordered phases with concrete tasks.
   - File-level impact list (expected files/modules to create/update).
   - Migration/backward compatibility strategy.

6. **Testing and verification strategy**
   - Unit/integration/e2e coverage plan.
   - Failure-mode tests (missing env, invalid config, setup race conditions).

7. **Rollout + observability plan**
   - Feature flags or staged rollout options.
   - Logging and metrics to verify successful adoption.

8. **Open questions / assumptions**
   - Explicitly list unresolved choices and assumptions.

## Constraints and best practices

- Prefer typed configuration modules over ad hoc `process.env` access.
- Validate config with a schema and fail fast on unsafe values (especially secrets in production).
- Do not conflate mutable admin-managed settings with immutable deployment/runtime config.
- Keep the admin bootstrap flow idempotent and safe under parallel startup.
- Minimize breaking changes and preserve developer ergonomics in local development.
- Include a pragmatic migration path and rollback notes.

Before finalizing your plan, ask me targeted clarifying questions if anything critical is ambiguous.
