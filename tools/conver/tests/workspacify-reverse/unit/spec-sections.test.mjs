// @verifies C001
// @verifies C006
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
/**
 * The section registry — the one declaration that makes absorption checkable.
 *
 * The defect this file guards against was measured, not argued: of the 29 documents
 * a full run publishes, the downstream rotations read two, the procedure named nine,
 * and twenty were named nowhere at all. A document nobody reads is a finding the next
 * command cannot act on, and the reason it happened is that no list existed to be
 * compared against — so the comparison is what this file is.
 *
 * Both directions are asserted. A document with no section is a finding the spec
 * dropped; a section naming a document the run does not publish is a promise the spec
 * does not keep, and a registry that checked only one of them would pass while the
 * other went wrong.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  SPEC_SECTIONS,
  SPEC_SELF_DOCUMENTS,
  specSectionsFor,
  findUnregisteredDocuments,
  findUnpublishedProjections,
  sectionHeadings,
} from '../../../.claude/scripts/workspacify-reverse/lib/spec-sections.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** The documents a real run left behind, as the frozen evidence of what must be covered. */
const REFERENCE_RUN = `${PROJECT_ROOT}/tests/workspacify-reverse/analysis`;

test('C001 precondition: the reference run is the published set this registry must cover', () => {
  const published = readdirSync(REFERENCE_RUN).filter((name) => !name.startsWith('.'));

  assert.equal(published.length, 29, 'the reference run holds the 29 documents the design measures');
  assert.equal(published.includes('GAPS.json'), true, 'including the ones the procedure never named');
  assert.equal(published.includes('ORIGIN-LONG-SPEC.md'), true);
});

test('C001 postcondition: every document the reference run published is registered', () => {
  const published = readdirSync(REFERENCE_RUN).filter((name) => !name.startsWith('.'));

  assert.deepEqual(
    findUnregisteredDocuments(published),
    [],
    'a published document no section carries is a finding the next command can never read',
  );
});

test('C001 postcondition: every registered projection is a document the run publishes', () => {
  const published = readdirSync(REFERENCE_RUN).filter((name) => !name.startsWith('.'));

  assert.deepEqual(
    findUnpublishedProjections(published),
    [],
    'a registered projection the run does not publish is a promise the spec does not keep',
  );
});

test('C001 boundary: an unregistered document is reported by name, not counted', () => {
  const published = ['ANALYSIS-SCOPE.json', 'A-DOCUMENT-NOBODY-REGISTERED.json'];

  assert.deepEqual(findUnregisteredDocuments(published), ['A-DOCUMENT-NOBODY-REGISTERED.json']);
});

test('C001 invariant: no document is registered by two sections, and no heading repeats', () => {
  const registered = SPEC_SECTIONS.flatMap((section) => section.projects);

  assert.deepEqual(
    registered.filter((name, index) => registered.indexOf(name) !== index),
    [],
    'two sections claiming one document would render it twice and reconstruct it once',
  );
  assert.deepEqual(
    sectionHeadings().filter((heading, index) => sectionHeadings().indexOf(heading) !== index),
    [],
    'a repeated heading is a section the parser cannot tell from its twin',
  );
});

test('C001 invariant: the spec names itself, and does so outside the projection list', () => {
  for (const name of ['ORIGIN-LONG-SPEC.json', 'ORIGIN-LONG-SPEC.md']) {
    assert.equal(SPEC_SELF_DOCUMENTS.includes(name), true, `${name} is the spec itself`);
    assert.equal(
      SPEC_SECTIONS.flatMap((section) => section.projects).includes(name),
      false,
      `${name} is carried by being the document, not by a section rendering it`,
    );
    assert.deepEqual(specSectionsFor(name), [], 'and it projects from no section');
  }
});

test('C001 boundary: a section is reachable by every document it projects', () => {
  for (const section of SPEC_SECTIONS) {
    for (const name of section.projects) {
      assert.equal(
        specSectionsFor(name).includes(section),
        true,
        `${name} must be reachable from the section that carries it`,
      );
    }
  }
});
