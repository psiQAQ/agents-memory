import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('tracked client manifest fixes the three Task 4 sources, versions, and official artifact integrity', async () => {
  let manifest;
  try { manifest = JSON.parse(await readFile(new URL('../clients/manifest.json', import.meta.url), 'utf8')); } catch { manifest = null; }
  assert.ok(manifest, 'Task 4 client manifest must exist and parse');
  assert.equal(manifest.schema_version, 1);
  assert.deepEqual(manifest.clients.map(({ id, source, version }) => ({ id, source, version })), [
    { id: 'claude', source: 'claude-code', version: '2.1.226' },
    { id: 'opencode', source: 'opencode', version: '1.18.16' },
    { id: 'pi', source: 'pi', version: '0.84.1' },
  ]);
  assert.deepEqual(manifest.clients.map(({ id, display_name }) => ({ id, display_name })), [
    { id: 'claude', display_name: 'Claude Code' },
    { id: 'opencode', display_name: 'OpenCode' },
    { id: 'pi', display_name: 'Pi' },
  ]);
  assert.equal(manifest.clients[0].artifacts.wrapper.integrity, 'sha512-mUkA81SbzATHFsHNz/rPy3Itw0D0S9kQMsIUJ3qPGwpNJMqPePyDP6xnWHI0jfFlspVjs8r/GfolMUyiy8P1FQ==');
  assert.equal(manifest.clients[0].artifacts.linux_x64.integrity, 'sha512-zDdtV2tzCfngxKXJLj5/UYHtCVa/yA/L0vF5dBx3w1dx5tcA8+AlyRp3qcsd/gYU7hbI/gS5OoA7C8XqJR9YtA==');
  assert.equal(manifest.clients[1].artifacts.wrapper.integrity, 'sha512-l4nUfoucuw8u5WYU9my9Yz7lYpBI649i/ppgL0BGTjp/HC3p2jN50i331YpcGbKfGTEv9VG6mxU1+QZyaR5hxA==');
  assert.equal(manifest.clients[1].artifacts.linux_x64.integrity, 'sha512-eArnlUAhE3bqhaMXsypn14x49GsafuPS9oI6eH+rWZ2vrUCrKfKk/F7WOe/sFgp09gQU8yzFbGsZjDpWBFSCBg==');
  assert.equal(manifest.clients[1].artifacts.release.sha256, '286e07355df06738c1905955be15b7fbc10a7b12d931de9394a6f7597246750b');
  assert.equal(manifest.clients[2].artifacts.npm.integrity, 'sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==');
  assert.equal(manifest.clients[2].artifacts.release.sha256, '5634d7ebd18274b63af3371e942f342d74bea012389575c1d1ff15ce6ca80c2f');
  assert.equal(manifest.clients[2].artifacts.installer_package.sha256, 'aceae714453faab6e2f2d3d2f99c3249ba4986b6ed8a13c74be415e5305ab0c3');
  assert.equal(manifest.clients[2].artifacts.installer_lock.sha256, '81fc9b0997d27055909cdc62d24ee92bb0cbbbda6e7cd3c07958a5662ec32c0f');
  assert.doesNotMatch(JSON.stringify(manifest), /sk-mem-|api[_-]?key|auth[_-]?token|deepseek.*key/i);
});
