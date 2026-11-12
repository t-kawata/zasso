import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'scripts/cli.mjs');

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'law-applies-'));
  for (const crate of ['app-rest', 'app-core']) {
    mkdirSync(join(repo, 'crates', crate, 'src'), { recursive: true });
    writeFileSync(join(repo, 'crates', crate, 'src/lib.rs'), 'pub fn ready() {}\n');
  }
  return repo;
}

function run(repo, args) {
  try {
    return {
      status: 0,
      stdout: execFileSync(process.execPath, [cli, 'applies', '--root', repo, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    return { status: error.status, stdout: String(error.stdout ?? '') };
  }
}

test('applies selects interface paths and skips unrelated paths', () => {
  const repo = makeRepo();
  try {
    const interfaceResult = run(repo, ['--paths', 'crates/app-rest/src/lib.rs']);
    assert.equal(interfaceResult.status, 0);
    assert.match(interfaceResult.stdout, /Law applicability — APPLIES/);
    assert.match(interfaceResult.stdout, /app-rest/);
    assert.match(interfaceResult.stdout, /contract, core, operation, adapter, docs, conformance/);

    const coreResult = run(repo, ['--paths', 'crates/app-core/src/lib.rs']);
    assert.equal(coreResult.status, 3);
    assert.match(coreResult.stdout, /Law applicability — SKIP/);

    const sharedResult = run(repo, ['--paths', 'crates/app-core/src/lib.rs', '--include-shared']);
    assert.equal(sharedResult.status, 0);

    const unknownResult = run(repo, ['--paths', 'docs/README.md']);
    assert.equal(unknownResult.status, 3);

    const emptyResult = run(repo, []);
    assert.equal(emptyResult.status, 3);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
