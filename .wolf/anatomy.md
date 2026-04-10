# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-04-10T12:14:17.818Z
> Files: 206 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.codex` (~0 tok)
- `.gitignore` — Git ignore rules (~139 tok)
- `CLAUDE.md` — OpenWolf (~1332 tok)
- `install.sh` — Colors for output (~2654 tok)
- `README.md` — Project documentation (~4413 tok)
- `run.sh` — Get the directory where the script is located (~796 tok)
- `TODO.md` — 1 asins import process feedback (~558 tok)

## .claude/

- `settings.json` (~441 tok)
- `settings.local.json` (~1871 tok)

## .claude/1f16fed8-2386-4620-8577-d379807b2f86/tool-results/

- `call_7fad2e57dd3748a69cec3366.txt` — Declares handleCreateChannel (~15414 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## backend/

- `.gitignore` — Git ignore rules (~2 tok)
- `CLAUDE.md` — Backend - Amazon Price Tracker (~1412 tok)
- `gemini.md` — Backend Overview (~184 tok)
- `package-lock.json` — npm lock file (~32848 tok)
- `package.json` — Node.js package manifest (~314 tok)
- `tsconfig.json` — TypeScript configuration (~131 tok)

## backend/src/

- `config.ts` — Exports AppConfig, config (~744 tok)
- `server.ts` — Import logger first to add timestamps to all console output (~1304 tok)

## backend/src/middleware/

- `admin.ts` — Exports requireAdmin (~135 tok)
- `auth.ts` — Exports AuthRequest, authenticate, generateToken, optionalAuthenticate (~750 tok)
- `index.ts` (~14 tok)

## backend/src/models/

- `types.ts` — Exports Product, Category, PriceHistory, ProductWithPrice + 25 more (~1235 tok)

## backend/src/routes/

- `admin.ts` — Rate limiting for admin endpoints (~3345 tok)
- `auth.ts` — API routes: POST, GET (5 endpoints) (~1542 tok)
- `config.ts` — API routes: GET, POST, PUT (6 endpoints) (~2991 tok)
- `dashboard.ts` — API routes: GET (2 endpoints) (~430 tok)
- `lists.ts` — API routes: GET, POST, PUT, DELETE (7 endpoints) (~2208 tok)
- `notifications.ts` — API routes: GET, POST, PUT, DELETE (10 endpoints) (~2613 tok)
- `prices.ts` — API routes: POST (1 endpoints) (~674 tok)
- `products.ts` — API routes: GET, POST, DELETE (8 endpoints) (~2300 tok)
- `setup.ts` — API routes: GET, POST (2 endpoints) (~832 tok)

## backend/src/services/

- `database.ts` — Exports DatabaseService, dbService (~584 tok)
- `notification-channel.ts` — Send notification via Email (SMTP) (~1274 tok)
- `notification-evaluator.ts` — Evaluate all applicable rules for a product after a price update (~1888 tok)
- `scheduler.ts` — Exports SchedulerService (~3570 tok)
- `scraper.ts` — Exports ScraperService (~10599 tok)

## backend/src/services/db/

- `admin-repo.ts` — Exports createAdminRepo, AdminRepo (~904 tok)
- `helpers.ts` — Run a DML/DDL statement, resolve when done. (~266 tok)
- `list-repo.ts` — Exports createListRepo, ListRepo (~930 tok)
- `migrations.ts` — DDL — table definitions (~4166 tok)
- `notification-repo.ts` — Exports createNotificationRepo (~5433 tok)
- `product-repo.ts` — Exports createProductRepo (~5687 tok)
- `user-repo.ts` — Exports createUserRepo, UserRepo (~2450 tok)

## backend/src/utils/

- `logger.ts` — Logger utility that adds timestamps to all log messages (~335 tok)
- `portManager.ts` — Utility to find an available port with failover support (~546 tok)
- `validation.ts` — Validates an Amazon ASIN (Amazon Standard Identification Number) (~836 tok)

## backend/test/

- `admin-middleware-test.js` — Simple test script to verify spec-compliant admin middleware logic (~818 tok)
- `admin-usage-example.ts` — Example of how to use requireAdmin middleware in routes (~1069 tok)
- `debug-price.js` — playwright_1: debugPrice (~3393 tok)
- `debug-price.ts` — Declares debugPrice (~2996 tok)
- `middleware-export-test.ts` — Simple test to verify middleware exports (~95 tok)
- `middleware-import-test.ts` — Test that middleware exports work correctly (~249 tok)
- `price-selector-analyzer.js` — playwright_1: analyzePriceSelectors (~1568 tok)
- `price-selector-analyzer.ts` — Declares analyzePriceSelectors (~1376 tok)
- `selector-analyzer.js` — Test a single selector and return the result (~3526 tok)
- `selector-analyzer.ts` — Test a single selector and return the result (~3204 tok)
- `spec-compliance-fix.md` — Spec Compliance Fix Report (~1248 tok)
- `verify-price-fixes.ts` — backend/test/verify-price-fixes.ts (~290 tok)

## database/

- `amazon-tracked-asins-2026-03-22.csv` (~179 tok)

## docs/backend/

- `BACKEND_API_DOCUMENTATION.md` — Backend API Documentation (~8027 tok)

## docs/plans/

- `pla2.md` — Prompt: Plan admin bootstrap + centralized runtime configuration (~1278 tok)
- `todos.md` — 1 - Minor UI changes (~693 tok)

## docs/plans/frontend/

- `frontend-a2-a7-implementation.md` — Implementation Plan: Frontend Issues A2–A7 (~3475 tok)
- `frontend-refactor-plan.md` — Frontend Refactor Plan — Amazon Price Tracker (~4277 tok)
- `frontend-remainingissues.md` — Frontend Refactor Plan — Navigation, UI & Responsiveness (~3540 tok)

## docs/plans/multiuser/

- `2026-03-07-multiuser-admin-interface.md` — Multi-User Admin Interface Implementation Plan (~23025 tok)
- `multiuser.md` (~1172 tok)

## docs/plans/notifications/

- `2026-03-06-notifications.md` — Notification System Implementation Plan (~6089 tok)
- `notifications-plan.md` — Notification System Refactoring Plan (~4949 tok)

## docs/superpowers/plans/

- `2026-03-10-database-refactor.md` — Database Refactor Implementation Plan (~13203 tok)
- `2026-03-10-product-thumbnails.md` — Product Thumbnails Implementation Plan (~645 tok)
- `2026-03-26-frontend-issues.md` — Frontend Issues Implementation Plan (~10196 tok)
- `2026-03-31-admin-bootstrap-centralized-config.md` — Admin Bootstrap & Centralized Configuration Implementation Plan (~15258 tok)
- `2026-04-01-scraper-price-bugs.md` — Scraper Price Bugs Fix Implementation Plan (~5374 tok)
- `2026-04-10-readme-and-improvements.md` — README Rewrite & Improvements Audit — Implementation Plan (~20812 tok)

## docs/superpowers/specs/

- `2026-03-10-database-refactor-design.md` — Design: database.ts Refactor (~1675 tok)
- `2026-03-10-product-thumbnails-design.md` — Product Thumbnails Design (~255 tok)
- `2026-04-01-scraper-price-bugs-design.md` — Scraper Price Bugs Fix (~1335 tok)
- `2026-04-10-readme-and-improvements-design.md` — Design Spec: README Rewrite & Improvements Audit (~3297 tok)

## frontend/

- `CLAUDE.md` — Frontend - Amazon Price Tracker (~1660 tok)
- `gemini.md` — Frontend Overview (~208 tok)
- `index.html` — Amazon Price Tracker (~216 tok)
- `package-lock.json` — npm lock file (~23707 tok)
- `package.json` — Node.js package manifest (~200 tok)
- `tsconfig.json` — TypeScript configuration (~161 tok)
- `tsconfig.node.json` (~68 tok)
- `vite.config.ts` — Vite build configuration (~379 tok)

## frontend/src/

- `App.tsx` — Full-app skeleton shown while auth state is resolving (<1 s on fast connections). (~2072 tok)
- `index.css` — Styles: 60 rules, 7 media queries, 1 animations (~2941 tok)
- `main.tsx` (~175 tok)
- `queryClient.ts` — Exports queryClient (~74 tok)
- `types.ts` — Exports Category, CategoryTreeNode, Product, PriceHistory + 23 more (~1144 tok)
- `vite-env.d.ts` — / <reference types="vite/client" /> (~64 tok)

## frontend/src/components/

- `AdminPanel.tsx` — AdminPanel (~713 tok)
- `ASINInput.module.css` — Styles: 12 rules, 1 media queries (~532 tok)
- `ASINInput.tsx` — ASINInput — renders form — uses useState (~708 tok)
- `Auth.module.css` — Styles: 10 rules (~379 tok)
- `Auth.tsx` — Auth — renders form — uses useState (~1087 tok)
- `CategoryFilter.module.css` — Styles: 23 rules (~800 tok)
- `CategoryFilter.tsx` — TreeNode — uses useState, useEffect (~1305 tok)
- `CategoryTreeFilter.module.css` — Styles: 23 rules (~800 tok)
- `CategoryTreeFilter.tsx` — TreeNode — uses useState, useEffect (~1138 tok)
- `ChannelForm.tsx` — ChannelForm — renders form, modal — uses useState (~2391 tok)
- `Dashboard.module.css` — Styles: 61 rules, 6 media queries (~2676 tok)
- `Dashboard.tsx` — MiniPriceChart — renders chart — uses useState, useCallback, useMemo (~3869 tok)
- `LanguageSwitcher.module.css` — Styles: 5 rules, 1 media queries (~210 tok)
- `LanguageSwitcher.tsx` — LanguageSwitcher (~169 tok)
- `ListsSidebar.module.css` — Styles: 42 rules, 1 media queries, 1 animations (~1518 tok)
- `ListsSidebar.tsx` — ListsSidebar — renders form — uses useState, useEffect (~2699 tok)
- `MiniPriceChart.module.css` — Styles: 2 rules (~28 tok)
- `MiniPriceChart.tsx` — MiniPriceChart — renders chart (~667 tok)
- `NotificationForms.module.css` — Styles: 13 rules (~367 tok)
- `Notifications.module.css` — Styles: 16 rules (~575 tok)
- `Notifications.tsx` — formatRuleParams — renders table — uses useState, useEffect (~3920 tok)
- `PriceChart.tsx` — PriceChart — renders chart (~231 tok)
- `ProductDetail.module.css` — Styles: 45 rules, 2 media queries (~1562 tok)
- `ProductDetail.tsx` — PriceChart — renders table, chart — uses useState, useEffect (~2854 tok)
- `ProductList.module.css` — Styles: 78 rules (~4805 tok)
- `ProductList.tsx` — ProductList — uses useState, useCallback, useEffect (~7089 tok)
- `ProductNotifications.module.css` — Styles: 33 rules, 1 media queries (~1191 tok)
- `ProductNotifications.tsx` — formatRuleParams — renders form, table — uses useState, useEffect (~3270 tok)
- `ProductsPage.module.css` — Styles: 27 rules, 2 media queries (~1377 tok)
- `ProductsPage.tsx` — ProductDetailSheet — renders form — uses useNavigate, useState, useCallback, useEffect (~2018 tok)
- `PullToRefreshIndicator.module.css` — Styles: 4 rules (~116 tok)
- `PullToRefreshIndicator.tsx` — Visual indicator for pull-to-refresh. Shows an arrow that rotates (~259 tok)
- `RuleForm.tsx` — RuleForm — renders form, modal — uses useState (~1506 tok)
- `SettingsPage.module.css` — Styles: 23 rules, 3 media queries (~1108 tok)
- `SettingsPage.tsx` — USER_SECTIONS — renders chart — uses useState, useEffect (~1889 tok)
- `SetupWizard.module.css` — Styles: 13 rules (~604 tok)
- `SetupWizard.tsx` — SetupWizard — renders form — uses useState (~953 tok)

## frontend/src/components/admin/

- `adminShared.module.css` — Styles: 4 rules (~198 tok)
- `AdminTable.module.css` — Styles: 9 rules, 2 media queries (~598 tok)
- `AuditLog.module.css` — Styles: 13 rules (~373 tok)
- `AuditLog.tsx` — AuditLog — renders table — uses useState, useEffect (~1507 tok)
- `Notifications.module.css` — Styles: 13 rules (~466 tok)
- `Notifications.tsx` — AdminNotifications — renders table — uses useState, useEffect (~2355 tok)
- `SystemConfig.module.css` — Styles: 7 rules (~183 tok)
- `SystemConfig.tsx` — SystemConfig — renders table — uses useState, useEffect (~1729 tok)
- `SystemStats.module.css` — Styles: 8 rules (~233 tok)
- `SystemStats.tsx` — COLORS — renders chart — uses useState, useEffect (~1193 tok)
- `UserManagement.module.css` — Styles: 13 rules (~391 tok)
- `UserManagement.tsx` — UserManagement — renders form, table, modal — uses useState, useEffect (~2914 tok)

## frontend/src/components/config/

- `AccountSection.tsx` — AccountSection — renders form — uses useState, useEffect (~1354 tok)
- `AdminPanel.module.css` — Styles: 8 rules (~256 tok)
- `Config.module.css` — Styles: 43 rules, 3 media queries (~1552 tok)
- `DashboardSection.tsx` — DashboardSection (~875 tok)
- `DatabaseSection.tsx` — DatabaseSection — uses useState (~764 tok)
- `DataExportSection.tsx` — DataExportSection — uses useState (~617 tok)
- `index.tsx` — NAV_SECTIONS — uses useState, useEffect (~1295 tok)

## frontend/src/contexts/

- `AuthContext.tsx` — AuthContext — uses useState, useEffect, useContext (~979 tok)
- `ImportContext.tsx` — ImportContext — uses useState, useContext (~1371 tok)

## frontend/src/design-system/

- `Badge.module.css` — Styles: 8 rules (~340 tok)
- `Badge.tsx` — Badge (~169 tok)
- `Button.module.css` — Styles: 20 rules, 1 media queries (~929 tok)
- `Button.tsx` — Button (~279 tok)
- `Card.module.css` — Styles: 17 rules, 1 media queries (~588 tok)
- `Card.tsx` — Card (~318 tok)
- `EmptyState.module.css` — Styles: 11 rules, 1 media queries (~739 tok)
- `EmptyState.tsx` — Visual variant that determines icon and colors (~530 tok)
- `index.ts` — Declares BadgeProps (~359 tok)
- `Input.module.css` — Styles: 46 rules, 1 media queries (~1553 tok)
- `Input.tsx` — Input (~538 tok)
- `Modal.module.css` — Styles: 21 rules, 2 media queries, 3 animations (~1232 tok)
- `Modal.tsx` — Modal — renders modal — uses useCallback, useEffect (~1414 tok)
- `ProgressBar.module.css` — Styles: 28 rules, 1 media queries, 1 animations (~1159 tok)
- `ProgressBar.tsx` — Progress value (0-100) for determinate mode (~929 tok)
- `Sheet.module.css` — Styles: 46 rules, 2 media queries, 4 animations (~1682 tok)
- `Sheet.tsx` — Whether the sheet is open (~1580 tok)
- `Skeleton.module.css` — Styles: 31 rules, 9 vars, 2 media queries (~1193 tok)
- `Skeleton.tsx` — Visual variant (~1095 tok)
- `Table.module.css` — Styles: 37 rules, 3 media queries (~1929 tok)
- `Table.tsx` — Column key (used for data access) (~1925 tok)
- `Tabs.module.css` — Styles: 29 rules, 2 media queries, 1 animations (~1434 tok)
- `Tabs.tsx` — Tab identifier (~2421 tok)
- `Toast.module.css` — Styles: 30 rules, 2 media queries, 4 animations (~1571 tok)
- `Toast.tsx` — Unique identifier for the toast (~1048 tok)
- `tokens.css` — Styles: 4 rules, 124 vars, 2 media queries, 2 animations (~2653 tok)

## frontend/src/hooks/

- `index.ts` (~94 tok)
- `useCategories.ts` — Exports CATEGORIES_KEY, useCategories (~100 tok)
- `useDashboard.ts` — Exports usePriceDrops, usePriceIncreases (~131 tok)
- `useDebouncedValue.ts` — Exports useDebouncedValue (~103 tok)
- `useLists.ts` — Exports LISTS_KEY, useLists, useAddProductToList, useRemoveProductFromList (~266 tok)
- `useMediaQuery.ts` — Hook to detect if a media query matches. (~550 tok)
- `useNotifications.ts` — Exports CHANNELS_KEY, RULES_KEY, HISTORY_KEY, useNotificationChannels + 6 more (~736 tok)
- `useOnlineStatus.ts` — Returns the current network online status and reacts to changes. (~231 tok)
- `useProduct.ts` — Exports PRODUCT_KEY, useProduct (~97 tok)
- `useProducts.ts` — Exports PRODUCTS_KEY, useProducts, useAddProduct, useDeleteProduct (~323 tok)
- `usePullToRefresh.ts` — Pixels of pull needed to trigger refresh (default: 70) (~1076 tok)
- `useSwipeGesture.ts` — Hook to detect swipe gestures on touch devices. (~948 tok)

## frontend/src/i18n/

- `config.ts` (~195 tok)

## frontend/src/i18n/locales/

- `en.json` (~4304 tok)
- `pt-BR.json` (~4594 tok)

## frontend/src/layout/

- `AppShell.module.css` — Styles: 26 rules (~1264 tok)
- `AppShell.tsx` — AppShell — uses useNavigate, useState (~1647 tok)
- `BottomTabBar.module.css` — Styles: 6 rules (~296 tok)
- `BottomTabBar.tsx` — TABS (~543 tok)
- `OfflineBanner.module.css` — Styles: 2 rules, 1 animations (~141 tok)
- `OfflineBanner.tsx` — OfflineBanner (~151 tok)

## frontend/src/services/

- `api.ts` — Exports invalidateCache, api (~6547 tok)

## frontend/src/utils/

- `dateFormat.ts` — Formats a date based on the current language (~618 tok)
- `numberFormat.ts` — Formats a number with the correct decimal and thousand separators based on language (~507 tok)
- `productImage.ts` — Exports getLegacyAmazonImageUrl, getPreferredProductImageUrl, handleProductImageError (~209 tok)

## logs/

- `backend.pid` (~2 tok)
- `frontend.pid` (~2 tok)

## memory/

- `MEMORY.md` — Project Memory (~207 tok)
