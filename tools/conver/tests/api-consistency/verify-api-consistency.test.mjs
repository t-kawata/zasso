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
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { digestOfFindings } from '../../.claude/scripts/api-consistency/finding-identity.mjs';
import { materializeApiWorkspace, materializeApiWorkspaceWithPackages } from './helpers/workspace.mjs';

const GATE = '.claude/scripts/api-consistency/verify-api-consistency.mjs';

// [::TICKET::] PX-369, PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-369|PX-372) --for-spec --no-implementation-order`.
function runGate(root, extraArgs = []) {
  return spawnSync(process.execPath, [GATE, `--workspace=${root}`, '--json', ...extraArgs], { encoding: 'utf8' });
}

// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function findingsOf(result) {
  return JSON.parse(result.stdout).findings;
}

// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function findingOf(result, code, symbol) {
  return findingsOf(result).find((entry) => entry.code === code && entry.symbol === symbol);
}
// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.

test('C001 postcondition: an undefined cross-package symbol names the consumer and the symbol', () => {
  const workspace = materializeApiWorkspace({
    consumerRust: 'use provider::OperationCatalogue; pub fn use_it() { let value = OperationCatalogue::empty(); }',
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
    consumerRust: 'use provider::OperationCatalogue; pub fn use_it(value: OperationCatalogue) {}',
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
    consumerRust: 'use provider::bind; pub fn use_it() { bind(first, second, third); }',
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
    consumerRust: 'use provider::BoundedText; pub struct Holder { text: BoundedText<64> }',
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
    consumerRust: 'use provider::Envelope; pub struct Holder { value: Envelope<String> }',
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
    consumerRust: 'use provider::WebSocketBinding; pub struct WebSocketBinding { endpoint: String }',
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
    consumerRust: 'use provider::CoreOperations; pub struct CoreOperations { registry: HashMap<String, u8> }',
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
    consumerRust: 'use provider::CanonicalVocabulary; pub fn use_it(value: CanonicalVocabulary) {}',
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
    consumerRust: 'use provider::CanonicalVocabulary; pub fn use_it(value: CanonicalVocabulary) {}',
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
    providerRust: 'pub struct CliBinding { value: String }\nimpl CliBinding { pub fn try_new() -> Self { Self { value: String::new() } } }',
    consumerRust: 'use provider::CliBinding; pub fn use_it() { CliBinding::try_new(args); }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1);
    assert.ok(findingOf(result, 'ARITY_MISMATCH', 'CliBinding::try_new'), result.stdout);
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
    consumerRust: 'use provider::Thing; pub struct Thing { right: String }',
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

// PX-372 @verifies C002
// A provider declaration and a consumer call may each span lines. The verifier
// resolves them without a phantom arity finding, and the fail-closed and
// baseline behaviors make the gate usable as evidence.

test('PX-372 C002: a multi-line provider and consumer pair is clean', () => {
  const workspace = materializeApiWorkspace({
    providerRust: [
      'pub struct CommandKey;',
      'pub struct CommandContent;',
      'pub trait CommandRecord {}',
      'pub fn admit(key: &CommandKey, content: &CommandContent, records: &dyn CommandRecord) -> Result<u8, u8> {',
      '    0',
      '}',
    ].join('\n'),
    consumerRust: [
      'use provider::admit;',
      'pub fn use_it() {',
      '    admit(',
      '        &key(),',
      '        &content("a"),',
      '        &records,',
      '    );',
      '}',
    ].join('\n'),
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const findings = findingsOf(result);
    assert.equal(findings.filter((entry) => entry.severity === 'blocking').length, 0);
    assert.deepEqual([...new Set(findings.map((entry) => entry.code))], ['UNSCOPED_SYMBOL']);
  } finally {
    workspace.remove();
  }
});

test('PX-372 C003: an unreadable workspace is refused, never reported clean', () => {
  const result = spawnSync(process.execPath, [GATE, '--workspace=/nonexistent-api-root', '--json'], { encoding: 'utf8' });

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /WORKSPACE_UNREADABLE/);
});

test('PX-372 C003: a readable workspace with zero packages is refused', () => {
  const workspace = materializeApiWorkspace({ noPackages: true });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /NO_PACKAGE_SURFACE/);
  } finally {
    workspace.remove();
  }
});

test('PX-372 C004: --scope counts only findings owned by the scoped package', () => {
  const workspace = materializeApiWorkspace({
    consumerRust: 'use provider::Missing; pub fn use_it(value: Missing) {}',
  });
  try {
    const outside = runGate(workspace.root, ['--scope=pkg-0001']);
    assert.equal(outside.status, 0, outside.stdout);
    assert.equal(JSON.parse(outside.stdout).summary.outOfScopeBlocking, 1);

    const inside = runGate(workspace.root, ['--scope=pkg-0002']);
    assert.equal(inside.status, 1, inside.stdout);
  } finally {
    workspace.remove();
  }
});

test('PX-372 C004: a baseline records pre-existing debt and still fails a new finding', () => {
  const workspace = materializeApiWorkspace({
    consumerRust: 'use provider::Missing; pub fn use_it(value: Missing) {}',
  });
  try {
    const first = runGate(workspace.root);
    const finding = findingsOf(first).find((entry) => entry.code === 'SYMBOL_UNDEFINED');
    assert.ok(finding, first.stdout);
    assert.match(finding.id, /^[0-9a-f]{16}$/);

    const baselinePath = join(workspace.root, 'baseline.json');
    writeFileSync(baselinePath, JSON.stringify({
      workspaceRoot: workspace.root,
      digest: digestOfFindings([finding]),
      findings: [finding],
    }, null, 2));

    const authorized = runGate(workspace.root, [`--baseline=${baselinePath}`]);
    assert.equal(authorized.status, 0, authorized.stdout);

    const unresolved = runGate(workspace.root, [`--baseline=${baselinePath}`, `--require-resolved=${finding.id}`]);
    assert.equal(unresolved.status, 1, unresolved.stdout);

    const emptyBaseline = join(workspace.root, 'empty-baseline.json');
    writeFileSync(emptyBaseline, JSON.stringify({ workspaceRoot: workspace.root, digest: digestOfFindings([]), findings: [] }, null, 2));
    const fresh = runGate(workspace.root, [`--baseline=${emptyBaseline}`]);
    assert.equal(fresh.status, 1, fresh.stdout);
  } finally {
    workspace.remove();
  }
});

test('PX-372 C004: a baseline whose digest does not match its findings is refused', () => {
  const workspace = materializeApiWorkspace({
    consumerRust: 'use provider::Missing; pub fn use_it(value: Missing) {}',
  });
  try {
    const first = runGate(workspace.root);
    const finding = findingsOf(first).find((entry) => entry.code === 'SYMBOL_UNDEFINED');
    const tamperedPath = join(workspace.root, 'tampered-baseline.json');
    writeFileSync(tamperedPath, JSON.stringify({
      workspaceRoot: workspace.root,
      digest: '0'.repeat(64),
      findings: [finding],
    }, null, 2));

    const result = runGate(workspace.root, [`--baseline=${tamperedPath}`]);

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /BASELINE_UNREADABLE/);
  } finally {
    workspace.remove();
  }
});

// PX-382 @verifies C001
// A cross-package claim is proved through the consumer's import scope. External,
// crate-local, builtin, enum-variant and independent same-name references are not
// cross-package claims and must not be reported as blocking findings.

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: an explicit workspace import resolves and records the check-set version', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct Known { value: String }',
    consumerRust: 'use provider::Known; pub fn use_it(value: Known) {}',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(findingsOf(result), []);
    const summary = JSON.parse(result.stdout).summary;
    assert.equal(summary.checkSetVersion, '2026-11-06.import-scoped.1');
    assert.ok(summary.importKinds['workspace-explicit'] >= 1, JSON.stringify(summary.importKinds));
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: an external crate import and its associated call are out of scope', () => {
  const workspace = materializeApiWorkspace({
    consumerRust: 'use clap::Command; pub fn run() { Command::new("doors"); }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
    assert.equal(findingOf(result, 'SYMBOL_UNDEFINED', 'Command'), undefined);
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: a crate-local re-export is not a cross-package claim', () => {
  const workspace = materializeApiWorkspace({
    consumerRust: 'use crate::wire::Config; pub fn run(value: Config) {}',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: same-name types in different crates are not duplicates without an import', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct Candidate { left: String }',
    consumerRust: 'pub struct Candidate { right: String }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: a glob import resolves a bare enum variant', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub enum ErrorCode { AlreadyExists, NotFound }',
    consumerRust: 'use provider::ErrorCode::*; pub fn pick() -> ErrorCode { AlreadyExists }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
  } finally {
    workspace.remove();
  }
});

// PX-382 @verifies C002
// A re-export is not a second dependency edge: the boundary belongs to the crate the
// consumer imports, not to the crate that first declared the symbol.

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: a crate-root workspace glob resolves a bare symbol', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct Known { value: String }',
    consumerRust: 'use provider::*; pub fn use_it(value: Known) {}',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
    assert.equal(findingOf(result, 'UNSCOPED_SYMBOL', 'Known'), undefined);
  } finally {
    workspace.remove();
  }
});

test('PX-382 C001: an external glob leaves an unresolved symbol named, not silently external', () => {
  const workspace = materializeApiWorkspace({
    consumerRust: 'use clap::prelude::*; pub fn run() { Unknown::new(); }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
    assert.ok(findingOf(result, 'UNSCOPED_SYMBOL', 'Unknown::new'), result.stdout);
  } finally {
    workspace.remove();
  }
});

test('PX-382 C001: a missing imported member is advisory, not blocking', () => {
  const workspace = materializeApiWorkspace({
    providerRust: 'pub struct CliBinding { value: String }',
    consumerRust: 'use provider::CliBinding; pub fn use_it() { CliBinding::try_new(args); }',
    declaredEdge: true,
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
    const finding = findingOf(result, 'UNSCOPED_SYMBOL', 'CliBinding::try_new');
    assert.ok(finding, result.stdout);
    assert.match(finding.cause, /member is not declared/);
  } finally {
    workspace.remove();
  }
});

test('PX-382 C002: a re-export boundary is checked against the imported crate', () => {
  const workspace = materializeApiWorkspaceWithPackages({
    packages: [
      { id: 'pkg-0001', name: 'foundation', path: 'crates/foundation', rust: 'pub struct BoundedValue { value: String }' },
      { id: 'pkg-0002', name: 'ports', path: 'crates/ports', rust: 'pub use foundation::BoundedValue;' },
      { id: 'pkg-0003', name: 'adapter', path: 'crates/adapter', rust: 'use ports::BoundedValue; pub fn use_it(value: BoundedValue) {}' },
    ],
    boundaries: [
      { provider: 'pkg-0001', consumer: 'pkg-0002' },
      { provider: 'pkg-0002', consumer: 'pkg-0003' },
    ],
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 0, result.stdout);
  } finally {
    workspace.remove();
  }
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C002: a missing re-export edge names the imported crate', () => {
  const workspace = materializeApiWorkspaceWithPackages({
    packages: [
      { id: 'pkg-0001', name: 'foundation', path: 'crates/foundation', rust: 'pub struct BoundedValue { value: String }' },
      { id: 'pkg-0002', name: 'ports', path: 'crates/ports', rust: 'pub use foundation::BoundedValue;' },
      { id: 'pkg-0003', name: 'adapter', path: 'crates/adapter', rust: 'use ports::BoundedValue; pub fn use_it(value: BoundedValue) {}' },
    ],
    boundaries: [
      { provider: 'pkg-0001', consumer: 'pkg-0002' },
    ],
  });
  try {
    const result = runGate(workspace.root);

    assert.equal(result.status, 1, result.stdout);
    const finding = findingOf(result, 'DEPENDENCY_EDGE_MISSING', 'BoundedValue');
    assert.ok(finding, result.stdout);
    assert.match(finding.cause, /ports/);
  } finally {
    workspace.remove();
  }
});

// PX-382 @verifies C003
// A verdict records the check set that produced it. A later gate applies its new
// version on a new run; it does not retroactively invalidate an older verdict.

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C003: a recorded check-set version is read and accepted', async () => {
  const verifier = await import('../../.claude/scripts/api-consistency/verify-api-consistency.mjs');

  assert.equal(verifier.recordedCheckSetVersion({ checkSetVersion: 'legacy-v1' }), 'legacy-v1');
  assert.equal(verifier.recordedCheckSetVersion({ verdict: 'pass' }), null);
  assert.equal(verifier.acceptsRecordedVersion({ checkSetVersion: 'legacy-v1' }, verifier.API_CHECK_SET_VERSION), true);
  assert.equal(verifier.acceptsRecordedVersion({ verdict: 'pass' }, verifier.API_CHECK_SET_VERSION), true);
  assert.notEqual('legacy-v1', verifier.API_CHECK_SET_VERSION);
});
