import fs from 'fs';
import { firefox } from 'playwright';
import { version as installedPlaywrightVersion } from 'playwright/package.json';

export const BROWSER_INSTALL_COMMAND = 'cd backend && npx --no-install playwright install firefox';

export type BrowserCheckResult =
  | { ok: true; executablePath: string }
  | { ok: false; message: string };

export interface BrowserCheckDeps {
  executablePath?: () => string;
  exists?: (path: string) => boolean;
  playwrightVersion?: string;
}

// Each Playwright version expects one exact Firefox revision on disk. Check for it so
// callers can fail with the right install command instead of Playwright's generic banner.
// Never cache the result: installing the browser must fix the next call without a restart.
export function checkFirefoxInstalled(deps: BrowserCheckDeps = {}): BrowserCheckResult {
  const {
    executablePath = () => firefox.executablePath(),
    exists = fs.existsSync,
    playwrightVersion = installedPlaywrightVersion,
  } = deps;

  let path: string;
  try {
    path = executablePath();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `Playwright ${playwrightVersion} cannot locate a Firefox build for this system: ${reason}. If your OS is newer than this Playwright release, upgrade "playwright" in backend/package.json, then run: ${BROWSER_INSTALL_COMMAND}`,
    };
  }

  if (!exists(path)) {
    return {
      ok: false,
      message: `Playwright Firefox not found at ${path} (playwright ${playwrightVersion} requires this exact browser revision). Install it with: ${BROWSER_INSTALL_COMMAND}`,
    };
  }

  return { ok: true, executablePath: path };
}
