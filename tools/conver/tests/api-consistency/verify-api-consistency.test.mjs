// PX-369 @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
// The eight crystal defects are one class: a cross-package surface where a declaration
// and a use disagree. Each check names the symbol, the packages and the repair, and an
// unparsed construct is reported rather than dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { materializeApiWorkspace } from './helpers/workspace.mjs';

const GATE = '.claude/scripts/api-consistency/verify-api-consistency.mjs';

// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function runGate(root) {
  return spawnSync(process.execPath, [GATE, `--workspace=${root}`, '--json'], { encoding: 'utf8' });
}

// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function findingsOf(result) {
  return JSON.parse(result.stdout).findings;
}

// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function findingOf(result, code, symbol) {
  return findingsOf(result).find((entry) => entry.code === code && entry.symbol === symbol);
}

test('C001 postcondition: an undefined cross-package symbol names the consumer and the symbol', () => {
  const workspace = materializeApiWorkspace({
    consumerRust: 'pub fn use_it() { let value = OperationCatalogue::empty(); }',
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1, result.stdout + result.stderr);
    const finding = findingOf(result, 'SYMBOL_UNDEFINED', 'OperationCatalogue');
    assert.ok(finding, result.stdout);
    assert.equal(finding.package, 'pkg-0002');
  } finally {
    workspace.remove();
  }
});

test('C001 invariant: a declared symbol with a declared edge produces no finding', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct OperationCatalogue { entries: Vec<String> }',
    consumerRust: 'pub fn use_it(value: OperationCatalogue) {}',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(findingsOf(result), []);
  } finally {
    workspace.remove();
  }
});

test('C002 postcondition: a three-argument call against a two-parameter declaration is named', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct Left;\npub struct Right;\npub fn bind(left: Left, right: Right) -> Result<()> { Ok(()) }',
    consumerRust: 'pub fn use_it() { bind(first, second, third); }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1);
    const finding = findingOf(result, 'ARITY_MISMATCH', 'bind');
    assert.ok(finding, result.stdout);
    assert.match(finding.cause, /3/);
    assert.match(finding.cause, /2/);
  } finally {
    workspace.remove();
  }
});

test('C003 postcondition: BoundedText<64> where BoundedText is non-generic is named', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct BoundedText { value: String }',
    consumerRust: 'pub struct Holder { text: BoundedText<64> }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1);
    assert.ok(findingOf(result, 'GENERIC_ARITY_MISMATCH', 'BoundedText'), result.stdout);
  } finally {
    workspace.remove();
  }
});

test('C003 invariant: a generic declaration used with the same arity passes', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct Envelope<T> { value: T }',
    consumerRust: 'pub struct Holder { value: Envelope<String> }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
  } finally {
    workspace.remove();
  }
});

test('C004 postcondition: a trait and a concrete type with one name is a kind mismatch', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub trait WebSocketBinding { fn send(&self); }',
    consumerRust: 'pub struct WebSocketBinding { endpoint: String }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1);
    const finding = findingOf(result, 'KIND_MISMATCH', 'WebSocketBinding');
    assert.ok(finding, result.stdout);
    assert.match(finding.cause, /trait/);
    assert.match(finding.cause, /struct/);
  } finally {
    workspace.remove();
  }
});

test('C005 postcondition: duplicate CoreOperations with different fields names both packages', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct CoreOperations { entries: Vec<String> }',
    consumerRust: 'pub struct CoreOperations { registry: HashMap<String, u8> }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1);
    const finding = findingOf(result, 'SYMBOL_DUPLICATE', 'CoreOperations');
    assert.ok(finding, result.stdout);
    assert.match(finding.cause, /pkg-0001/);
    assert.match(finding.cause, /pkg-0002/);
  } finally {
    workspace.remove();
  }
});

test('C006 postcondition: a provider reference with no declared boundary names the missing edge', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct CanonicalVocabulary { words: Vec<String> }',
    consumerRust: 'pub fn use_it(value: CanonicalVocabulary) {}',
    declaredEdge: false,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1);
    const finding = findingOf(result, 'DEPENDENCY_EDGE_MISSING', 'CanonicalVocabulary');
    assert.ok(finding, result.stdout);
    assert.match(finding.cause, /pkg-0001/);
    assert.match(finding.cause, /pkg-0002/);
  } finally {
    workspace.remove();
  }
});

test('C006 invariant: the same reference with a declared boundary passes', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct CanonicalVocabulary { words: Vec<String> }',
    consumerRust: 'pub fn use_it(value: CanonicalVocabulary) {}',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
  } finally {
    workspace.remove();
  }
});

test('C001 boundary: an unparsed construct is advisory and reported, never silently skipped', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'macro_rules! make_ops { () => {} }',
    consumerRust: '',
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, 'an unparsed surface is advisory');
    const finding = findingOf(result, 'UNPARSED_SURFACE', 'macro_rules!');
    assert.ok(finding ?? findingsOf(result).find((entry) => entry.code === 'UNPARSED_SURFACE'), result.stdout);
  } finally {
    workspace.remove();
  }
});

test('C001 boundary: a package with no Rust fence is an empty surface, not a finding', () => {
  const workspace = materializeApiWorkspace({ noFences: true });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0);
    assert.deepEqual(findingsOf(result), []);
  } finally {
    workspace.remove();
  }
});

test('C001 invariant: two runs over one workspace produce identical findings', () => {
  const workspace = materializeApiWorkspace({
    consumerRust: 'pub fn use_it(value: Missing) {}',
  });
  try {
    assert.deepEqual(findingsOf(runGate(workspace.root)), findingsOf(runGate(workspace.root)));
  } finally {
    workspace.remove();
  }
});

test('C001 invariant: the gate never writes an artifact', () => {
  const workspace = materializeApiWorkspace({ consumerRust: 'pub fn use_it(value: Missing) {}' });
  try {
    const before = readFileSync(workspace.consumerRfc, 'utf8');
    runGate(workspace.root);
    assert.equal(readFileSync(workspace.consumerRfc, 'utf8'), before);
  } finally {
    workspace.remove();
  }
});

test('C006 invariant: every finding carries the uniform repair fields', () => {
  const workspace = materializeApiWorkspace({ consumerRust: 'pub fn use_it(value: Missing) {}' });
  try {
    const findings = findingsOf(runGate(workspace.root));
    assert.ok(findings.length > 0);

    for (const finding of findings) {
      for (const field of ['code', 'package', 'symbol', 'layer', 'cause', 'action', 'verify']) {
        assert.equal(typeof finding[field], 'string', `finding.${field} is required`);
        assert.ok(finding[field].length > 0, `finding.${field} is empty`);
      }
      assert.ok(['blocking', 'advisory'].includes(finding.severity));
    }
  } finally {
    workspace.remove();
  }
});

// PX-371 @verifies C004
// A bare unresolved call is a method, a variant or a standard-library name the
// parser cannot type without inference. It is not evidence that a cross-package
// symbol is missing; only a type use or a Type::method path on a declared type is.

// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
test('C004 invariant: an unresolvable bare call is not a blocking finding', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct Known { value: String }',
    consumerRust: 'pub fn consume_it() { Unknown(value); }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
    assert.equal(findingOf(result, 'SYMBOL_UNDEFINED', 'Unknown'), undefined);
  } finally {
    workspace.remove();
  }
});

test('C004 postcondition: a Type::method path on a declared type is still blocking', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct CliBinding { value: String }',
    consumerRust: 'pub fn use_it() { CliBinding::try_new(args); }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1);
    assert.ok(findingOf(result, 'SYMBOL_UNDEFINED', 'CliBinding::try_new'), result.stdout);
  } finally {
    workspace.remove();
  }
});

test('C004 invariant: same-named free functions are not a duplicate declaration', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub fn bind(left: String) {}',
    consumerRust: 'pub fn bind(left: String, right: String) {}',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
    assert.equal(findingOf(result, 'SYMBOL_DUPLICATE', 'bind'), undefined);
  } finally {
    workspace.remove();
  }
});

test('C004 invariant: same-named structs with different shapes remain a duplicate', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct Thing { left: String }',
    consumerRust: 'pub struct Thing { right: String }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1);
    assert.ok(findingOf(result, 'SYMBOL_DUPLICATE', 'Thing'), result.stdout);
  } finally {
    workspace.remove();
  }
});
