You are an expert full-stack TypeScript architect.  
I have an existing project: **amzscraper – Amazon Price Tracker**.

It is a full-stack TypeScript web application with this stack and structure :

*   Backend: Node.js, Express, TypeScript, Playwright, SQLite, node-cron, bcrypt, jsonwebtoken
*   Frontend: React, TypeScript, Vite, Recharts, react-i18next
*   Database: SQLite3
*   Auth: JWT-based
*   Project layout (summarized):
    *   `backend/src/server.ts` – Express server
    *   `backend/src/routes/` – `auth.ts`, `products.ts`, `lists.ts`, `prices.ts`, `dashboard.ts`, `config.ts`
    *   `backend/src/services/` – `database.ts`, `scraper.ts`, `scheduler.ts`
    *   `backend/src/middleware/auth.ts` – JWT auth middleware
    *   `backend/src/models`, `backend/src/utils`
    *   `frontend/src/App.tsx` and components: `Auth.tsx`, `Dashboard.tsx`, `ProductList.tsx`, `ProductSearch.tsx`, `ProductDetail.tsx`, `ListsSidebar.tsx`, `Config.tsx`
    *   `frontend/src/contexts/AuthContext.tsx`
    *   `frontend/src/services/api.ts`
    *   `frontend/src/i18n/*` with `en.json` and `pt-BR.json` translations .

Current functionality and constraints (from README) :

*   User auth (register/login/change-password) with isolated data per user
*   Product management by ASIN, price tracking, price history, lists, CSV import/export, database export
*   Daily scheduled price updates via `scheduler.ts`
*   Database tables: `users`, `products`, `categories`, `product_categories`, `price_history`, `user_lists`, `product_lists`
*   The app already supports multiple users at the DB level, but UX and admin tooling are single-tenant / basic .

**Goal**

Design a detailed plan to evolve this codebase into a **proper multi-tenant, multi-user SaaS-style app** with a **dedicated admin interface**.

I want:

1.  A clear separation between:
    *   Regular end users (each managing their own products/lists)
    *   Admin users (managing users, quotas, system config, monitoring scraping jobs, etc.)
2.  A dedicated **admin UI** (could be a separate route like `/admin` or a separate frontend section) with:
    *   User management: list/search users, create/disable users, reset passwords
    *   Tenant/data visibility: see high-level stats per user (number of products, DB size share, scraping errors)
    *   System-level settings: rate limits, per-user quotas, feature flags
    *   Operational views: scraping queue status, last run per user, error logs
3.  A robust **multi-tenant model**:
    *   Decide whether to keep single SQLite DB with user\_id scoping or introduce a more explicit tenant concept
    *   Ensure strong isolation at API and DB level (no user can ever see others’ data)
    *   Plan for future migration away from SQLite if needed (outline only, no implementation)
4.  Auth and authorization:
    *   Role model (e.g. `USER`, `ADMIN`)
    *   Changes needed in JWT payload, middleware, and routes to enforce roles
    *   How admin routes differ from regular routes (URL structure, middleware, permissions)
5.  Frontend changes:
    *   Routing and navigation updates to add an admin area
    *   State management for roles (AuthContext evolution)
    *   Internationalization considerations for new admin UI strings (en + pt-BR)
    *   UX pattern for switching between “normal user” view and “admin” area
6.  Operational and security aspects:
    *   How to expose admin-only endpoints safely
    *   Logging and audit trails (who did what and when)
    *   Handling scheduled tasks in a multi-user context (e.g. per-user scheduling, limits, failure handling)

**Your task**

1.  First, analyze the current architecture based on the README and project structure above and **explicitly list assumptions** you must make about the existing code (e.g. current auth flow, where roles would fit, how `users` table is structured).
2.  Then produce a **step-by-step implementation plan** in the form of a md file in the docs folder (not code yet) covering:
    *   Database/schema changes
    *   Backend changes (routes, services, middleware)
    *   Frontend changes (routes, components, contexts, API client)
    *   Infrastructure/ops changes (logs, configuration, env variables)
3.  For each step, call out:
    *   Potential pitfalls or breaking changes
    *   Where to add tests (unit/integration/e2e)
4.  Finish with a short, prioritized roadmap (phases) that I can execute in iterations (e.g. Phase 1: introduce roles in DB and backend, Phase 2: admin API, Phase 3: admin UI, etc.).

Write the answer concisely but with enough technical detail that I can hand this plan back to you or another AI to start generating concrete code changes file-by-file.