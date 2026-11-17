import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAssetTree, removeAssetTree } from './lib/asset-fixtures.mjs';
import { validateSemanticProposal } from '../../.claude/scripts/amend-rfc-up/okf-asset/semantic.mjs';

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function baseDiscovery() {
  return {
    mode: 'spec-reference',
    roots: [],
    included: [
      {
        path: 'ops-kit/probe.py',
        root: 'ops-kit',
        selectedBy: 'spec-reference',
        signal: 'strong',
        governingConcepts: ['pages/pre-okf-original/15-minimum-path-acceptance'],
      },
    ],
    excluded: [],
    ambiguous: [],
  };
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function proposal(overrides = {}) {
  return {
    schema: 'okf-asset-plan/v1',
    interpretation: {
      freeForm: 'assets live in ops-kit',
      summary: 'ops-kit',
      confidence: 'high',
    },
    roots: [{ path: 'ops-kit', reason: 'free-form', quote: 'assets live in ops-kit', confidence: 'high' }],
    include: [],
    exclude: [],
    unresolved: [],
    ...overrides,
  };
}

test('a semantic proposal can add an evidenced asset', () => {
  const root = makeAssetTree({
    'ops-kit/probe.py': '#!/usr/bin/env python3\n',
    'ops-kit/helper.py': '#!/usr/bin/env python3\n',
  });
  try {
    const result = validateSemanticProposal({
      proposal: proposal({
        include: [
          {
            path: 'ops-kit/probe.py',
            role: 'Procedure',
            governing: 'pages/pre-okf-original/15-minimum-path-acceptance',
            reason: 'specification names the probe',
            quote: 'Run `ops-kit/probe.py`',
            confidence: 'high',
          },
          {
            path: 'ops-kit/helper.py',
            role: 'Procedure',
            governing: 'pages/pre-okf-original/15-minimum-path-acceptance',
            reason: 'README says helper.py is used by the probe',
            quote: 'helper.py is used by the probe',
            confidence: 'high',
          },
        ],
      }),
      discovery: baseDiscovery(),
      root,
    });
    assert.equal(result.ok, true);
    assert.equal(result.discovery.mode, 'semantic');
    assert.ok(result.discovery.included.some((entry) => entry.path === 'ops-kit/helper.py'));
  } finally {
    removeAssetTree(root);
  }
});

test('omitting a strong-signal asset is refused', () => {
  const root = makeAssetTree({ 'ops-kit/probe.py': 'print(1)\n' });
  try {
    const result = validateSemanticProposal({
      proposal: proposal(),
      discovery: baseDiscovery(),
      root,
    });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'ASSET_SEMANTIC_OMISSION'));
  } finally {
    removeAssetTree(root);
  }
});

test('inventing a path is refused', () => {
  const root = makeAssetTree({ 'ops-kit/probe.py': 'print(1)\n' });
  try {
    const result = validateSemanticProposal({
      proposal: proposal({
        include: [
          {
            path: 'ops-kit/ghost.py',
            role: 'Procedure',
            governing: 'pages/pre-okf-original/15-minimum-path-acceptance',
            reason: 'guess',
            quote: 'none',
            confidence: 'low',
          },
        ],
      }),
      discovery: baseDiscovery(),
      root,
    });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'ASSET_SEMANTIC_PATH_MISSING'));
  } finally {
    removeAssetTree(root);
  }
});

test('a policy violation overrides the semantic proposal', () => {
  const root = makeAssetTree({
    'ops-kit/probe.py': 'print(1)\n',
    'private/key.pem': '-----BEGIN PRIVATE KEY-----\n',
  });
  try {
    const result = validateSemanticProposal({
      proposal: proposal({
        include: [
          {
            path: 'private/key.pem',
            role: 'Reference',
            governing: 'pages/pre-okf-original/15-minimum-path-acceptance',
            reason: 'needed',
            quote: 'needed',
            confidence: 'high',
          },
        ],
      }),
      discovery: baseDiscovery(),
      root,
    });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'ASSET_SEMANTIC_POLICY_VIOLATION'));
  } finally {
    removeAssetTree(root);
  }
});

test('excluding a strong signal without evidence is refused', () => {
  const root = makeAssetTree({ 'ops-kit/probe.py': 'print(1)\n' });
  try {
    const result = validateSemanticProposal({
      proposal: proposal({
        exclude: [{ path: 'ops-kit/probe.py', reason: 'not needed', quote: '', confidence: 'low' }],
      }),
      discovery: baseDiscovery(),
      root,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.findings.some((finding) => finding.code === 'ASSET_SEMANTIC_EXCLUSION_UNREVIEWED'),
    );
  } finally {
    removeAssetTree(root);
  }
});

test('low-confidence additions follow the policy', () => {
  const root = makeAssetTree({
    'ops-kit/probe.py': 'print(1)\n',
    'ops-kit/helper.py': 'print(2)\n',
  });
  try {
    const result = validateSemanticProposal({
      proposal: proposal({
        include: [
          {
            path: 'ops-kit/probe.py',
            role: 'Procedure',
            governing: 'pages/pre-okf-original/15-minimum-path-acceptance',
            reason: 'specification',
            quote: 'probe',
            confidence: 'high',
          },
          {
            path: 'ops-kit/helper.py',
            role: 'Procedure',
            governing: 'pages/pre-okf-original/15-minimum-path-acceptance',
            reason: 'guess',
            quote: 'helper',
            confidence: 'low',
          },
        ],
      }),
      discovery: baseDiscovery(),
      root,
      policy: { lowConfidence: 'exclude' },
    });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'ASSET_SEMANTIC_LOW_CONFIDENCE'));
  } finally {
    removeAssetTree(root);
  }
});

test('a semantic addition without a governing concept is refused', () => {
  const root = makeAssetTree({
    'ops-kit/probe.py': 'print(1)\n',
    'ops-kit/helper.py': 'print(2)\n',
  });
  try {
    const result = validateSemanticProposal({
      proposal: proposal({
        include: [
          {
            path: 'ops-kit/helper.py',
            role: 'Procedure',
            reason: 'README',
            quote: 'README',
            confidence: 'high',
          },
        ],
      }),
      discovery: baseDiscovery(),
      root,
    });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.code === 'ASSET_SEMANTIC_UNLINKED'));
  } finally {
    removeAssetTree(root);
  }
});
