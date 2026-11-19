/**
 * residue-coverage.test.mjs — RESIDUE records are read from README and matched to
 * tickets without blocking the drill.
 *
 * The drill already reads README as material. This module adds the machine view:
 * a stable residue id from the invisible comment, a ticket's optional
 * residueIds[], and an advisory report for anything unmatched.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateResidueCoverage,
  parseResidueRecords,
} from '../../.claude/scripts/drill-rfc-down/lib/residue-coverage.mjs';

const STRUCTURED = [
  '# Package',
  '',
  '## Account add',
  '',
  '<::README-RESIDUE::>',
  '<!-- crystalize-residue: id=RSD-aaaaaaaaaaaa level=package layer=interface element=account.add -->',
  'Evidence and reinforcement.',
  '',
].join('\n');

const PROSE = [
  '# Package',
  '',
  '## Legacy section',
  '',
  '<::README-RESIDUE::>',
  'Prose only.',
  '',
].join('\n');

describe('parseResidueRecords', () => {
  it('reads the stable id and the structured fields', () => {
    const records = parseResidueRecords(STRUCTURED, 'package');
    assert.equal(records.length, 1);
    assert.equal(records[0].id, 'RSD-aaaaaaaaaaaa');
    assert.equal(records[0].section, 'Account add');
    assert.equal(records[0].level, 'package');
    assert.equal(records[0].layer, 'interface');
    assert.equal(records[0].element, 'account.add');
    assert.equal(records[0].structured, true);
    assert.equal(records[0].source, 'package');
  });

  it('reports a prose-only residue as unstructured', () => {
    const records = parseResidueRecords(PROSE, 'package');
    assert.equal(records.length, 1);
    assert.equal(records[0].structured, false);
    assert.equal(records[0].id, null);
    assert.equal(records[0].section, 'Legacy section');
  });

  it('reads the examples residue marker', () => {
    const text = '# P\n\n## Examples (implementation samples) spec and design\n\n<::EXAMPLES-RESIDUE::>\n<!-- crystalize-residue: id=RSD-bbbbbbbbbbbb level=package layer=interface element=example -->\nEvidence\n';
    const records = parseResidueRecords(text, 'package');
    assert.equal(records.length, 1);
    assert.equal(records[0].id, 'RSD-bbbbbbbbbbbb');
  });

  it('deduplicates the same id across sections', () => {
    const text = `${STRUCTURED}\n## Another\n\n<::README-RESIDUE::>\n<!-- crystalize-residue: id=RSD-aaaaaaaaaaaa level=package layer=interface element=account.add -->\nEvidence\n`;
    const records = parseResidueRecords(text, 'package');
    assert.equal(records.length, 1);
  });

  it('returns nothing for a README without residue', () => {
    assert.deepEqual(parseResidueRecords('# P\n\n## Complete\n\nProse.\n', 'package'), []);
  });
});

describe('evaluateResidueCoverage', () => {
// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
  function ticketsWith(residueIds) {
    return {
      phases: [{
        tickets: [{ id: 'PX-900', phaseId: 0, status: 'todo', residueIds }],
      }],
    };
  }

  it('covers a structured residue named by a ticket', () => {
    const result = evaluateResidueCoverage({
      readmeText: STRUCTURED,
      workspaceReadmeText: '',
      tickets: ticketsWith(['RSD-aaaaaaaaaaaa']),
    });
    assert.deepEqual(result.uncovered, []);
    assert.deepEqual(result.unstructured, []);
    assert.equal(result.gate.exitCode, 0);
    assert.deepEqual(result.covered, [{ id: 'RSD-aaaaaaaaaaaa', ticketIds: ['PX-900'] }]);
  });

  it('reports an uncovered structured residue without failing the drill', () => {
    const result = evaluateResidueCoverage({
      readmeText: STRUCTURED,
      workspaceReadmeText: '',
      tickets: ticketsWith([]),
    });
    assert.deepEqual(result.uncovered, ['RSD-aaaaaaaaaaaa']);
    assert.equal(result.gate.exitCode, 1, 'the gate records residue');
    assert.equal(result.findings[0].code, 'RESIDUE_UNCOVERED');
    assert.match(result.findings[0].message, /RSD-aaaaaaaaaaaa/);
  });

  it('reports a prose residue as unstructured', () => {
    const result = evaluateResidueCoverage({
      readmeText: PROSE,
      workspaceReadmeText: '',
      tickets: ticketsWith([]),
    });
    assert.deepEqual(result.unstructured, ['Legacy section']);
    assert.equal(result.findings[0].code, 'RESIDUE_UNSTRUCTURED');
  });

  it('reads the workspace README and tags its source', () => {
    const result = evaluateResidueCoverage({
      readmeText: '',
      workspaceReadmeText: STRUCTURED,
      tickets: ticketsWith(['RSD-aaaaaaaaaaaa']),
    });
    assert.equal(result.records[0].source, 'workspace');
  });

  it('is inert when no README is supplied', () => {
    const result = evaluateResidueCoverage({
      readmeText: '',
      workspaceReadmeText: '',
      tickets: ticketsWith([]),
    });
    assert.deepEqual(result.records, []);
    assert.equal(result.gate.exitCode, 0);
    assert.deepEqual(result.findings, []);
  });
});
