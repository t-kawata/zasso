'use strict';

/**
 * PX-417 — claims: RFC index, classification, claim construction, validation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  assertClaimComplete,
  buildClaim,
  buildRfcIndex,
  classifyRule,
  renderClaimText,
} = require('../../.claude/scripts/amend-rfc-up/claims.js');
const { cleanup, makeFixturePackage } = require('./helpers.cjs');

function writeRfc(fixture, body) {
  fs.writeFileSync(`${fixture}/RFC.md`, body);
  return buildRfcIndex({ rfcPath: `${fixture}/RFC.md` });
}

test('buildRfcIndex records headings and section text', () => {
  const fixture = makeFixturePackage();
  try {
    const index = writeRfc(fixture, '# RFC\n\n## 1. Design\n\nBase.\n\n## 2. REST adapter\n\nREST-01 applies.\n');
    assert.equal(index.sections.length, 2);
    assert.equal(index.sections[1].heading, '2. REST adapter');
    assert.match(index.sections[1].text, /REST-01/);
  } finally {
    cleanup(fixture);
  }
});

test('classifyRule returns conforming when the section names the rule', () => {
  const fixture = makeFixturePackage();
  try {
    const index = writeRfc(fixture, '## 2. REST adapter\n\nREST-01 MUST expose one entry.\n');
    const result = classifyRule({
      rule: { id: 'REST-01', requirement: 'REST adapter MUST expose one entry.' },
      rfcIndex: index,
      graphIndex: { nodes: [] },
    });
    assert.equal(result.classification, 'conforming');
  } finally {
    cleanup(fixture);
  }
});

test('classifyRule returns missing when no section matches', () => {
  const fixture = makeFixturePackage();
  try {
    const index = writeRfc(fixture, '## 1. Unrelated\n\nNothing here.\n');
    const result = classifyRule({
      rule: { id: 'GRPC-99', requirement: 'gRPC adapter MUST expose a service.' },
      rfcIndex: index,
      graphIndex: { nodes: [] },
    });
    assert.equal(result.classification, 'missing');
  } finally {
    cleanup(fixture);
  }
});

test('classifyRule returns contradicting when the section negates the rule', () => {
  const fixture = makeFixturePackage();
  try {
    const index = writeRfc(fixture, '## 2. REST adapter\n\nREST-01 MUST NOT expose a typed entry.\n');
    const result = classifyRule({
      rule: { id: 'REST-01', requirement: 'REST adapter MUST expose a typed entry.' },
      rfcIndex: index,
      graphIndex: { nodes: [] },
    });
    assert.equal(result.classification, 'contradicting');
  } finally {
    cleanup(fixture);
  }
});

test('buildClaim returns a complete claim with code and proof', () => {
  const claim = buildClaim({
    rule: { id: 'REST-01', requirement: 'REST adapter MUST expose one typed entry.' },
    section: { heading: '2. REST adapter' },
    classification: 'missing',
    ticketKey: 'PX-417',
    codeExample: '```rust\npub async fn execute() {}\n```',
  });
  assert.equal(claim.target.kind, 'clause');
  assert.equal(claim.target.id, '2. REST adapter');
  assert.match(claim.predicate, /MUST expose/);
  assert.match(claim.requiredTest, /skill\.mjs gate/);
  assert.match(claim.text, /```rust/);
  assert.doesNotThrow(() => assertClaimComplete({ claim }));
});

test('assertClaimComplete rejects a blanket claim without a code fence', () => {
  assert.throws(
    () => assertClaimComplete({
      claim: {
        target: { kind: 'clause', id: '1. Design' },
        predicate: 'use the law',
        requiredTest: 'run the law',
        title: 'blanket',
        text: 'use rust-interface-law',
      },
    }),
    (error) => error.code === 'CLAIM_INVALID',
  );
});

test('assertClaimComplete rejects TBD in the text', () => {
  assert.throws(
    () => assertClaimComplete({
      claim: {
        target: { kind: 'clause', id: '1. Design' },
        predicate: 'the invariant holds',
        requiredTest: 'gate',
        title: 'x',
        text: 'TBD\n\n```rust\nfn x() {}\n```',
      },
    }),
    (error) => error.code === 'CLAIM_INVALID',
  );
});

test('renderClaimText is self-contained', () => {
  const text = renderClaimText({
    rule: { id: 'REST-01', requirement: 'REST adapter MUST expose one typed entry.' },
    section: { heading: '2. REST adapter' },
    codeExample: '```rust\npub async fn execute() {}\n```',
  });
  assert.match(text, /REST-01/);
  assert.match(text, /2\. REST adapter/);
  assert.match(text, /```rust/);
  assert.match(text, /Proof:/);
});
