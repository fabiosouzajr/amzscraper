# Amazon Price Tracker (amzscraper)

Multi-tenant Amazon price tracker with automated daily scraping, price history, and a dashboard for drops/increases.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity


### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution


### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project


### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness


### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it


### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.


## Project Structure

Monorepo with two independent packages (no shared workspace config):

```
backend/     # Express + TypeScript API, SQLite, Playwright scraper
frontend/    # React 18 + Vite SPA, plain CSS, i18next
database/    # SQLite DB file (auto-created, gitignored)
```

Each package has its own `CLAUDE.md` with detailed architecture notes.

## Quick Start

```bash
# Backend (terminal 1)
cd backend && npm install && npm run dev    # Express on port 3000 (installs Playwright browsers automatically)

# Frontend (terminal 2)
cd frontend && npm install && npm run dev   # Vite on port 5174, proxies /api to :3000
```

**Note**: The backend `npm install` automatically installs Playwright browsers (Firefox + Chromium) via a postinstall script.

## Environment Variables

```
PORT=3000              # Backend primary port (default: 3000)
PORT_FALLBACK=3001     # Backend fallback port if PORT is in use (default: 3001)
JWT_SECRET=<secret>    # Backend JWT key (MUST change from default)
```

No frontend env vars — Vite proxies `/api` to the backend.

## Key Technical Decisions

- **No ORM** — direct SQL queries in `backend/src/services/database.ts` (~1300 lines)
- **No test framework** — `backend/test/` contains debug utilities, not test suites
- **SQLite** — single file DB at `database/products.db`, auto-created with migrations on startup
- **Playwright Firefox** — scrapes Amazon.com.br with Chrome user-agent, Portuguese pattern matching
- **SSE streaming** — price updates and ASIN imports stream progress via Server-Sent Events
- **React Router v6** — frontend uses `<Routes>/<Route>` in `App.tsx` with `BrowserRouter` in `main.tsx`. Routes: `/`, `/products`, `/products/:id`, `/settings/*`
- **Tailscale-first networking** — both servers bind `0.0.0.0`, Vite allows `*.ts.net` hosts

## Code Style

- TypeScript strict mode (frontend enforces `noUnusedLocals`/`noUnusedParameters`)
- No linter or formatter configured
- Callbacks for SQLite operations, async/await for service layer
- Portuguese + English in scraper pattern matching and i18n

## Gotchas

- Backend `tsconfig.json` includes `test/**/*` but `rootDir` is `src/` — `tsc` errors on test files (pre-existing)
- Database migrations run on every startup; they handle schema evolution via table recreation
- Price field is nullable (unavailable products have `price: null` + `unavailable_reason`)
- Frontend `index.css` is a ~550-line global stylesheet; component styles live in `*.module.css` files alongside each component
