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
