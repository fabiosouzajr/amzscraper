# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-04-10

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** amzscraper
- **Description:** A full-stack TypeScript web application that tracks Amazon product prices, stores data in SQLite, and provides a React frontend with dashboard, product management, price history visualization, user au

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

- [2026-06-14] Never extract the Amazon price by searching the whole document (`document.querySelectorAll('span.a-price-whole')` or `page.textContent('.a-price .a-offscreen')`). It grabs recommendation-carousel / sponsored / "similar items" prices (`li.a-carousel-card`, `idAsinFaceoutContainer`). Always scope price extraction to the main-price container allowlist in `scraper.ts` and reject carousel ancestors. If no main-region price → mark unavailable (`price:null`), never emit a stray number.

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->

- [2026-06-14] amzscraper scraper runs **logged-out** (no storageState/cookies in `scraper.ts` newContext). User decided the tracker treats the **public (logged-out) price as truth**, not account/Pix/member prices. So logged-in vs logged-out price differences (e.g. B076KZYYRJ 15,00 vs public 16,90) are NOT bugs; no authenticated-session work to be done. Only genuine parser bugs (carousel contamination) get fixed.
