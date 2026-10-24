import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFirefoxInstalled, firefoxHasHostBuild, BROWSER_INSTALL_COMMAND } from '../src/services/browser-check';

const P = '/x/firefox-1555/firefox/firefox';
const V = '1.64.1';

test('returns ok when the executable exists', () => {
  assert.deepEqual(
    checkFirefoxInstalled({ executablePath: () => P, exists: () => true, playwrightVersion: V }),
    { ok: true, executablePath: P }
  );
});

test('reports path, version and install command when executable is missing', () => {
  const r = checkFirefoxInstalled({ executablePath: () => P, exists: () => false, hasHostBuild: () => true, playwrightVersion: V });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.message.includes(P));
  assert.ok(r.message.includes(V));
  assert.ok(r.message.includes(BROWSER_INSTALL_COMMAND));
});

test('does not throw when executablePath() throws (unsupported platform)', () => {
  const r = checkFirefoxInstalled({
    executablePath: () => { throw new Error('Unsupported platform'); },
    exists: () => true,
    playwrightVersion: V,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.message.includes('Unsupported platform'));
  assert.ok(r.message.includes('upgrade "playwright"'));
  assert.ok(r.message.includes(BROWSER_INSTALL_COMMAND));
});

test('checks the filesystem on every call (no caching)', () => {
  let installed = false;
  const deps = { executablePath: () => P, exists: () => installed, hasHostBuild: () => true, playwrightVersion: V };
  assert.equal(checkFirefoxInstalled(deps).ok, false);
  installed = true;
  assert.equal(checkFirefoxInstalled(deps).ok, true);
});

test('reports an unsupported OS instead of an install command when Playwright has no build for the host', () => {
  const r = checkFirefoxInstalled({
    executablePath: () => P, exists: () => false, hasHostBuild: () => false,
    host: () => 'ubuntu30.04-x64', playwrightVersion: V,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.message.includes('ubuntu30.04-x64'));
  assert.ok(r.message.includes(V));
  assert.ok(r.message.includes('upgrade "playwright"'));
  assert.ok(!r.message.includes('Install it with'));
});

test('falls back to the install command when host support cannot be determined', () => {
  const r = checkFirefoxInstalled({ executablePath: () => P, exists: () => false, hasHostBuild: () => null, playwrightVersion: V });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.message.includes(`Install it with: ${BROWSER_INSTALL_COMMAND}`));
});

test('does not probe host support when the browser exists', () => {
  const r = checkFirefoxInstalled({
    executablePath: () => P, exists: () => true, playwrightVersion: V,
    hasHostBuild: () => { throw new Error('probe must not run'); },
  });
  assert.equal(r.ok, true);
});

// Captured from `playwright install --dry-run firefox` (1.64.1) on a supported host and with
// PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu30.04-x64.
const DRY_RUN_SUPPORTED = `Firefox 157.0 (playwright firefox v1555)
  Install location:    /home/fj/.cache/ms-playwright/firefox-1555
  Download url:        https://cdn.playwright.dev/dbazure/download/playwright/builds/firefox/1555/firefox-ubuntu-24.04.zip

FFmpeg (playwright ffmpeg v1013)
  Install location:    /home/fj/.cache/ms-playwright/ffmpeg-1013
  Download url:        https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-linux.zip
`;
const DRY_RUN_UNSUPPORTED = `Firefox 157.0 (playwright firefox v1555)
  Install location:    /home/fj/.cache/ms-playwright/firefox-1555

FFmpeg (playwright ffmpeg v1013)
  Install location:    /home/fj/.cache/ms-playwright/ffmpeg-1013
  Download url:        https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1013/ffmpeg-linux.zip
`;

test('dry-run with a Firefox download url means the host is supported', () => {
  assert.equal(firefoxHasHostBuild(DRY_RUN_SUPPORTED), true);
});

test('dry-run without a Firefox download url means the host is unsupported, even if FFmpeg has one', () => {
  assert.equal(firefoxHasHostBuild(DRY_RUN_UNSUPPORTED), false);
});
