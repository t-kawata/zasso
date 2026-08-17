/**
 * validate-examples-spec.test.cjs — Tests for validate-examples-spec.js
 *
 * Every sample file reference in the examples spec must resolve to an
 * existing file under examplesDir; unresolvable references are listed.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = require.resolve('../../.claude/scripts/crystalize-readme/validate-examples-spec.js');
const { validateExamplesSpec } = require(SCRIPT);

let tmpDir;
let examplesDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px152-ves-'));
  examplesDir = path.join(tmpDir, 'examples');
  fs.mkdirSync(examplesDir, { recursive: true });
  fs.writeFileSync(path.join(examplesDir, 'sample.rs'), '// sample', 'utf8');
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('validateExamplesSpec', () => {
  it('passes when every sample file reference resolves under examplesDir', () => {
    const spec = { samples: [{ file: 'sample.rs', purpose: 'shows usage' }] };
    const result = validateExamplesSpec(spec, examplesDir);
    assert.equal(result.ok, true);
    assert.deepEqual(result.unresolvableRefs, []);
  });

  it('lists each unresolvable sample file reference', () => {
    const spec = { samples: [{ file: 'missing.rs', purpose: 'x' }] };
    const result = validateExamplesSpec(spec, examplesDir);
    assert.equal(result.ok, false);
    assert.equal(result.unresolvableRefs.length, 1);
    assert.ok(result.unresolvableRefs[0].file.includes('missing.rs'));
  });

  it('handles a spec with no samples', () => {
    const result = validateExamplesSpec({ samples: [] }, examplesDir);
    assert.equal(result.ok, true);
  });

  it('handles nested subdirectory references', () => {
    fs.mkdirSync(path.join(examplesDir, 'common'), { recursive: true });
    fs.writeFileSync(path.join(examplesDir, 'common', 'client.rs'), '// client', 'utf8');
    const spec = { samples: [{ file: 'common/client.rs', purpose: 'client' }] };
    const result = validateExamplesSpec(spec, examplesDir);
    assert.equal(result.ok, true);
  });
});
