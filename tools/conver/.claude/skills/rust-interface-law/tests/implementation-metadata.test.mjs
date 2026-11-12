import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCargoToml, checkDependencies } from '../scripts/lib/implementation-metadata.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures/implementation/project/Cargo.toml');

const policy = {
  interfaces: {
    rest: { crate: 'axum', version: '=0.8.9', features: ['json'], forbidden: ['actix-web'] },
  },
};

test('metadata accepts a required dependency with its feature', () => {
  const metadata = parseCargoToml(readFileSync(fixture, 'utf8'), 'app-rest');
  const result = checkDependencies({ metadata, policy });
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test('metadata rejects a forbidden dependency', () => {
  const metadata = parseCargoToml(
    '[package]\nname = "app-rest"\n[dependencies]\naxum = { version = "=0.8.9", features = ["json"] }\nactix-web = "=4.0.0"\n',
    'app-rest',
  );
  const result = checkDependencies({ metadata, policy });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].kind, 'forbidden-dependency');
  assert.equal(result.findings[0].package, 'actix-web');
});

test('metadata rejects a missing required feature', () => {
  const metadata = parseCargoToml(
    '[package]\nname = "app-rest"\n[dependencies]\naxum = { version = "=0.8.9" }\n',
    'app-rest',
  );
  const result = checkDependencies({ metadata, policy });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].kind, 'missing-feature');
});
