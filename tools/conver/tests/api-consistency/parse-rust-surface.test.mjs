// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
// PX-369 @verifies C001
// The parser is the gate's only view of the Rust surface: if it skips a construct, the
// gate cannot see the defect. These tests pin the declaration and reference shapes the
// eight crystal defects exercise, and the unparsed-surface valve that keeps a construct
// the parser cannot read from disappearing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseRustSurface } from '../../.claude/scripts/api-consistency/index.mjs';

const RFC_PATH = '/w/pkg-a/RFC.md';

// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function parse(body) {
  return parseRustSurface({
    rfcText: ['# RFC pkg-a', '', '```rust', body, '```', ''].join('\n'),
    packageId: 'pkg-a',
    rfcPath: RFC_PATH,
  });
}

// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function declarationOf(surface, symbol) {
  return surface.declarations.find((entry) => entry.symbol === symbol);
}

test('C001 normal: a declaration records its name, kind, generic arity and parameters', () => {
  const surface = parse([
    'pub struct Envelope<T> { value: T }',
    'pub trait Sendable { fn send(&self); }',
    'pub enum Mode { Fast, Slow }',
    'pub type Alias = u8;',
    'pub const LIMIT: usize = 8;',
    'pub fn bind(left: A, right: B) -> Result<()> { Ok(()) }',
  ].join('\n'));

  assert.equal(declarationOf(surface, 'Envelope').kind, 'struct');
  assert.equal(declarationOf(surface, 'Envelope').genericArity, 1);
  assert.deepEqual(declarationOf(surface, 'Envelope').fields, ['value']);
  assert.equal(declarationOf(surface, 'Sendable').kind, 'trait');
  assert.equal(declarationOf(surface, 'Mode').kind, 'enum');
  assert.equal(declarationOf(surface, 'Alias').kind, 'type');
  assert.equal(declarationOf(surface, 'LIMIT').kind, 'const');
  assert.equal(declarationOf(surface, 'bind').kind, 'fn');
  assert.equal(declarationOf(surface, 'bind').parameterCount, 2);
});

test('C001 normal: an impl block yields method declarations on the implemented type', () => {
  const surface = parse('impl CliBinding { pub fn try_new(args: A) -> Self { Self::default() } }');

  const method = declarationOf(surface, 'CliBinding::try_new');
  assert.ok(method, JSON.stringify(surface.declarations));
  assert.equal(method.kind, 'fn');
  assert.equal(method.parameterCount, 1);
});

test('C001 normal: a reference records a type use with its generic arity', () => {
  const surface = parse('pub struct Holder { text: BoundedText<64> }');

  const reference = surface.references.find((entry) => entry.symbol === 'BoundedText');
  assert.ok(reference, JSON.stringify(surface.references));
  assert.equal(reference.kind, 'type');
  assert.equal(reference.genericArity, 1);
});

test('C001 normal: a call reference records its argument count', () => {
  const surface = parse('pub fn use_it() { bind(first, second, third); }');

  const reference = surface.references.find((entry) => entry.symbol === 'bind');
  assert.ok(reference, JSON.stringify(surface.references));
  assert.equal(reference.kind, 'call');
  assert.equal(reference.argumentCount, 3);
});

test('C001 boundary: an unparsed construct is reported with its line, never skipped', () => {
  const surface = parse('macro_rules! make_ops { () => {} }');

  assert.equal(surface.unparsed.length, 1);
  assert.match(surface.unparsed[0].reason, /macro/);
  assert.ok(surface.unparsed[0].line > 0);
});

test('C001 boundary: a fence with no declarations is an empty surface, not an unparsed finding', () => {
  const surface = parse('');

  assert.deepEqual(surface.declarations, []);
  assert.deepEqual(surface.references, []);
  assert.deepEqual(surface.unparsed, []);
});

test('C001 invariant: two parses of one RFC are identical', () => {
  const body = 'pub struct A { x: u8 }\npub fn f(a: A) -> A { a }';

  assert.deepEqual(parse(body), parse(body));
});

// PX-371 @verifies C004
// A declaration line is a signature, not a use: reading it as a call made every
// one-line declaration call itself with its own parameter list, and made a method
// declaration's receiver count as a caller argument.

// [::TICKET::] PX-371 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-371 --for-spec --no-implementation-order`.
test('C004 boundary: a function declaration line is not a call site', () => {
  const surface = parse('pub fn use_it() { bind(first, second, third); }');

  assert.deepEqual(surface.references.filter((entry) => entry.symbol === 'use_it'), []);
  assert.equal(surface.references.find((entry) => entry.symbol === 'bind').argumentCount, 3);
});

test('C004 precondition: a derive attribute contributes no symbol', () => {
  const surface = parse('#[derive(Debug, Clone, PartialEq, Eq)]\npub struct Row { value: String }');

  const attributeNames = ['derive', 'Debug', 'Clone', 'PartialEq', 'Eq'];
  assert.deepEqual(surface.references.filter((entry) => attributeNames.includes(entry.symbol)), []);
});

test('C004 precondition: a method call is not a cross-package reference', () => {
  const surface = parse('pub fn use_it(value: &Row) { let _ = value.clone(); let _ = map.get(key); let _ = value.is_empty(); }');

  const methodNames = ['clone', 'get', 'is_empty'];
  assert.deepEqual(surface.references.filter((entry) => methodNames.includes(entry.symbol)), []);
});

test('C004 postcondition: self is not a parameter of the method declaration', () => {
  const surface = parse('impl Row { pub fn admit(&self, row: &Row) -> Result<(), E> { Ok(()) } }');

  const method = declarationOf(surface, 'Row::admit');
  assert.ok(method, JSON.stringify(surface.declarations));
  assert.equal(method.parameterCount, 1);
});

test('C004 postcondition: an associated call resolves to the impl declaration with non-self arity', () => {
  const surface = parse('impl Row { pub fn admit(&self, row: &Row) -> Result<(), E> { Ok(()) } }\nfn t() { Row::admit(row); }');

  const reference = surface.references.find((entry) => entry.symbol === 'Row::admit');
  assert.ok(reference, JSON.stringify(surface.references));
  assert.equal(reference.kind, 'call');
  assert.equal(reference.argumentCount, 1);
});

// PX-372 @verifies C001
// A declaration and a use may span lines. The parser reads a balanced parameter
// list and a balanced argument list across lines, accepts function modifiers, and
// never turns a declaration line into a call reference.

test('PX-372 C001: a multi-line signature records its full parameter count and yields no call', () => {
  const surface = parse([
    'pub fn admit(',
    '    key: &CommandKey,',
    '    content: &CommandContent,',
    '    records: &dyn CommandRecord,',
    ') -> Result<Admission, TransportError> {',
    '    records.lookup(key)',
    '}',
  ].join('\n'));

  const declaration = declarationOf(surface, 'admit');
  assert.ok(declaration, JSON.stringify(surface));
  assert.equal(declaration.parameterCount, 3);
  assert.equal(
    surface.references.filter((entry) => entry.symbol === 'admit' && entry.kind === 'call').length,
    0,
    JSON.stringify(surface.references),
  );
});

test('PX-372 C001: a multi-line call records its full argument count', () => {
  const surface = parse([
    'fn use_it() {',
    '    admit(',
    '        &key(),',
    '        &content("a"),',
    '        &records,',
    '    );',
    '}',
  ].join('\n'));

  const reference = surface.references.find((entry) => entry.symbol === 'admit' && entry.kind === 'call');
  assert.ok(reference, JSON.stringify(surface.references));
  assert.equal(reference.argumentCount, 3);
});

test('PX-372 C001: const, async and unsafe functions are parsed or named, never silently absent', () => {
  const constSurface = parse('pub const fn from_u64_unchecked(value: u64) -> Self { Self(value) }');
  const constDeclaration = declarationOf(constSurface, 'from_u64_unchecked');
  assert.ok(constDeclaration, JSON.stringify(constSurface.declarations));
  assert.equal(constDeclaration.parameterCount, 1);

  const asyncSurface = parse('pub async fn serve_connection(listener: TcpListener) -> Result<()> { Ok(()) }');
  assert.ok(declarationOf(asyncSurface, 'serve_connection'), JSON.stringify(asyncSurface.declarations));

  const malformed = parse('pub async fn half_written(');
  assert.ok(
    malformed.unparsed.some((entry) => /declaration/.test(entry.reason)),
    JSON.stringify(malformed),
  );
});

test('PX-372 C001: a trait method signature is declared with self excluded', () => {
  const surface = parse('pub trait Evaluator { fn admit(&self, plan: &Plan) -> Result<(), EvaluationRejection>; }');

  const method = declarationOf(surface, 'Evaluator::admit');
  assert.ok(method, JSON.stringify(surface.declarations));
  assert.equal(method.parameterCount, 1);
});

// PX-382 @verifies C001
// A use statement declares scope; it is not a reference. The parser records every
// import with its root and alias so the verifier can resolve a reference through the
// package's imports instead of a workspace-global bare-name table.

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: a use statement is an import, not a type reference', () => {
  const surface = parse('use clap::{Arg, Command};\npub fn run() { Command::new("doors"); }');

  assert.equal(Array.isArray(surface.imports), true);
  assert.equal(surface.imports.length, 1);
  assert.equal(surface.imports[0].root, 'clap');
  assert.deepEqual(surface.imports[0].names.map((entry) => entry.alias), ['Arg', 'Command']);
  assert.equal(surface.references.some((entry) => entry.symbol === 'Arg'), false);
  assert.equal(surface.references.some((entry) => entry.line === 4), false);
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: a multi-line grouped use records every alias and yields no type reference', () => {
  const surface = parse([
    'use provider::{',
    '  Known,',
    '  Missing as M,',
    '};',
  ].join('\n'));

  assert.equal(surface.imports.length, 1);
  assert.deepEqual(surface.imports[0].names.map((entry) => entry.alias), ['Known', 'M']);
  assert.equal(surface.references.length, 0);
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: a glob use is recorded and a bare variant is not a type reference', () => {
  const surface = parse('use provider::ErrorCode::*;\npub fn pick() -> ErrorCode { AlreadyExists }');

  assert.equal(surface.imports.length, 1);
  assert.equal(surface.imports[0].glob, true);
  assert.equal(surface.imports[0].names[0].name, 'ErrorCode');
  assert.ok(surface.references.some((entry) => entry.symbol === 'AlreadyExists'));
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: a trait impl method is declared on the implemented type', () => {
  const surface = parse('impl From<crate::error::DoorsError> for ErrorBody { fn from(value: crate::error::DoorsError) -> Self { ErrorBody(value) } }');

  const method = declarationOf(surface, 'ErrorBody::from');
  assert.ok(method, JSON.stringify(surface.declarations));
  assert.equal(method.receiver, false);
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: an impl method records whether it takes self', () => {
  const surface = parse('impl Row { fn admit(&self, row: Row) {} }');

  const method = declarationOf(surface, 'Row::admit');
  assert.ok(method, JSON.stringify(surface.declarations));
  assert.equal(method.receiver, true);
  assert.equal(method.parameterCount, 1);
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: a type alias records its target', () => {
  const surface = parse('pub type OperationErrorCode = ErrorCode;');

  const alias = declarationOf(surface, 'OperationErrorCode');
  assert.ok(alias, JSON.stringify(surface.declarations));
  assert.equal(alias.aliasTarget, 'ErrorCode');
});

// [::TICKET::] PX-382 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-382 --for-spec --no-implementation-order`.
test('PX-382 C001: an unreadable use statement is reported, not skipped', () => {
  const surface = parse('use provider::{Known,');

  assert.ok(surface.unparsed.some((entry) => /use/.test(entry.reason)), JSON.stringify(surface.unparsed));
});
