import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { firefox } from 'playwright';
import { version as installedPlaywrightVersion } from 'playwright/package.json';

export const BROWSER_INSTALL_COMMAND = 'cd backend && npx --no-install playwright install firefox';

export type BrowserCheckResult =
  | { ok: true; executablePath: string }
  | { ok: false; message: string };

export interface BrowserCheckDeps {
  executablePath?: () => string;
  exists?: (path: string) => boolean;
  // true/false = Playwright does/doesn't publish a Firefox build for this host; null = unknown
  hasHostBuild?: () => boolean | null;
  host?: () => string;
  playwrightVersion?: string;
}

// `playwright install --dry-run firefox` lists a "Download url:" under Firefox only when this
// Playwright release has a build for the host OS; on an unsupported OS the line is missing.
// Returns null when the output isn't in the expected shape, so a format change is never
// misreported as an unsupported OS.
export function firefoxHasHostBuild(dryRunOutput: string): boolean | null {
  const firefoxSection = dryRunOutput.split(/\n\s*\n/).find((block) => block.trimStart().startsWith('Firefox'));
  if (!firefoxSection || !firefoxSection.includes('Install location:')) return null;
  return firefoxSection.includes('Download url:');
}

// Host support depends only on the installed Playwright version and the OS, neither of which
// changes without a restart, so the (synchronous, ~2s) CLI probe runs at most once per process.
export function createHostBuildProbe(run: () => boolean | null): () => boolean | null {
  let probed = false;
  let result: boolean | null = null;
  return () => {
    if (!probed) {
      result = run();
      probed = true;
    }
    return result;
  };
}

const probeHostBuild = createHostBuildProbe(() => {
  const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
  const result = spawnSync(process.execPath, [cli, 'install', '--dry-run', 'firefox'], { encoding: 'utf8', timeout: 15000 });
  if (result.error || result.status !== 0) return null;
  return firefoxHasHostBuild(result.stdout);
});

function describeHost(): string {
  if (process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE) return process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE;
  if (process.platform === 'linux') {
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
      const field = (key: string) => osRelease.match(new RegExp(`^${key}="?([^"\\n]*)"?$`, 'm'))?.[1];
      const id = field('ID');
      if (id) return `${id}${field('VERSION_ID') ?? ''}-${os.arch()}`;
    } catch {
      // fall through to the generic description
    }
  }
  return `${process.platform}-${os.arch()}`;
}

// Each Playwright version expects one exact Firefox revision on disk. Check for it so
// callers can fail with the right install command instead of Playwright's generic banner.
// Never cache the result: installing the browser must fix the next call without a restart.
export function checkFirefoxInstalled(deps: BrowserCheckDeps = {}): BrowserCheckResult {
  const {
    executablePath = () => firefox.executablePath(),
    exists = fs.existsSync,
    hasHostBuild = probeHostBuild,
    host = describeHost,
    playwrightVersion = installedPlaywrightVersion,
  } = deps;

  let firefoxPath: string;
  try {
    firefoxPath = executablePath();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `Playwright ${playwrightVersion} cannot locate a Firefox build for this system: ${reason}. If your OS is newer than this Playwright release, upgrade "playwright" in backend/package.json, then run: ${BROWSER_INSTALL_COMMAND}`,
    };
  }

  if (exists(firefoxPath)) {
    return { ok: true, executablePath: firefoxPath };
  }

  // Only probe on the failure path: the first call spawns the Playwright CLI (~2s)
  if (hasHostBuild() === false) {
    return {
      ok: false,
      message: `Playwright ${playwrightVersion} has no Firefox build for this OS (${host()}), so the browser cannot be installed. Pin a newer "playwright" release that supports it: upgrade "playwright" in backend/package.json (exact version), run npm install, then: ${BROWSER_INSTALL_COMMAND}`,
    };
  }

  return {
    ok: false,
    message: `Playwright Firefox not found at ${firefoxPath} (playwright ${playwrightVersion} requires this exact browser revision). Install it with: ${BROWSER_INSTALL_COMMAND}`,
  };
}
