import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFirefoxInstalled, BROWSER_INSTALL_COMMAND } from '../src/services/browser-check';

const P = '/x/firefox-1555/firefox/firefox';
const V = '1.64.1';

test('returns ok when the executable exists', () => {
  assert.deepEqual(
    checkFirefoxInstalled({ executablePath: () => P, exists: () => true, playwrightVersion: V }),
    { ok: true, executablePath: P }
  );
});

test('reports path, version and install command when executable is missing', () => {
  const r = checkFirefoxInstalled({ executablePath: () => P, exists: () => false, playwrightVersion: V });
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
  const deps = { executablePath: () => P, exists: () => installed, playwrightVersion: V };
  assert.equal(checkFirefoxInstalled(deps).ok, false);
  installed = true;
  assert.equal(checkFirefoxInstalled(deps).ok, true);
});
