// @verifies C001
// @verifies C003
// @verifies C005
// @verifies C006
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
/**
 * The absorption, proved over a run rather than over a fixture.
 *
 * Everything here reads the destination an actual run wrote. The defect being closed
 * was invisible to every test in the suite precisely because each of them supplied the
 * shape it expected: the spec's sections were asserted against fixtures that had them,
 * so a run that published twenty documents nobody read went on passing. Reading the
 * filesystem is what makes this gate able to fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import {
  findUnregisteredDocuments,
  findUnpublishedProjections,
  specSectionsFor,
} from '../../../.claude/scripts/workspacify-reverse/lib/spec-sections.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

/** A tree that yields claims in more than one scope, so the grouping has something to group. */
const CLAIM_BEARING_TREE = Object.freeze({
  'src/api/login.rs': [
    'use crate::model::User;',
    '',
    'pub fn login(user: &User) -> Result<(), Error> {',
    '    assert!(!user.name.is_empty());',
    '    if user.name.len() > 64 {',
    '        return Err(Error::TooLong);',
    '    }',
    '    Ok(())',
    '}',
    '',
  ].join('\n'),
  'src/model.rs': 'pub struct User { pub name: String }\n',
});

/** The published set, the sidecar and the Markdown a run left in a destination. */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function readRun(destination) {
  return {
    published: readdirSync(destination).filter((name) => !name.startsWith('.')).sort(),
    spec: JSON.parse(readFileSync(join(destination, 'ORIGIN-LONG-SPEC.json'), 'utf8')),
    markdown: readFileSync(join(destination, 'ORIGIN-LONG-SPEC.md'), 'utf8'),
  };
}

/** Write a JSON fixture into a scratch tree. */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('C001/IT: every document a real run publishes is registered to a section', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = createSyntheticTree({ 'placeholder.txt': '\n' });
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: 'r8' });
    const { published } = readRun(out.root);

    assert.ok(published.length > 5, 'this run publishes a document set worth covering');
    assert.deepEqual(
      findUnregisteredDocuments(published),
      [],
      'a document nothing registers is a finding the next command can never read',
    );
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('C001/IT: every registered projection is a document a real run publishes', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = createSyntheticTree({ 'placeholder.txt': '\n' });
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: 'r8' });
    const { published } = readRun(out.root);

    assert.deepEqual(findUnpublishedProjections(published), []);
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('C006/IT: a registered sidecar is a projection of the spec, not an alternate source', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = createSyntheticTree({ 'placeholder.txt': '\n' });
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: 'r8' });
    const { spec } = readRun(out.root);

    for (const name of ['DEPENDENCIES.json', 'GAPS.json']) {
      const published = JSON.parse(readFileSync(join(out.root, name), 'utf8'));
      const [section] = specSectionsFor(name);

      assert.ok(section, `${name} is registered`);
      assert.deepEqual(
        spec.sections[section.key].documents[name],
        published,
        `${name} is carried by the spec's ${section.heading} section, not only by its own file`,
      );
    }
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('C005/IT: the published spec carries every measured claim unchanged', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = createSyntheticTree({ 'placeholder.txt': '\n' });
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: 'r8' });
    const { spec } = readRun(out.root);
    const ledger = JSON.parse(readFileSync(join(out.root, 'CLAIM-LEDGER.json'), 'utf8'));
    const byId = new Map(spec.claims.map((claim) => [claim.claim_id, claim]));

    assert.ok(ledger.claims.length > 0, 'this population produces claims');
    for (const measured of ledger.claims) {
      const carried = byId.get(measured.claim_id);
      assert.ok(carried, `${measured.claim_id} survives into the spec`);
      assert.equal(carried.claim_type, measured.claim_type, `${measured.claim_id} is not re-classified`);
    }
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('C003/IT: the Markdown a real run publishes groups the claims by package', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = createSyntheticTree({ 'placeholder.txt': '\n' });
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: 'r8' });
    const { spec, markdown } = readRun(out.root);
    const entries = [...markdown.matchAll(/^#{2,6} Claim `([^`]+)`$/gm)].map(([, id]) => id);

    assert.deepEqual([...entries].sort(), spec.claims.map((claim) => claim.claim_id).sort());
    for (const scope of new Set(spec.claims.map((claim) => claim.scope))) {
      const escaped = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(markdown, new RegExp(`^### ${escaped}$`, 'm'), `${scope} is a subsection of Packages`);
    }
  } finally {
    tree.dispose();
    out.dispose();
  }
});

test('C004/IT: an authored entry reaches the published spec, and an unresolvable basis stops the run', async () => {
  const tree = createSyntheticTree(CLAIM_BEARING_TREE);
  const out = createSyntheticTree({ 'placeholder.txt': '\n' });
  const scratch = createSyntheticTree({});
  try {
    await analyzeProject({ root: tree.root, out: out.root, through: 'r8' });
    const measuredSpec = readRun(out.root).spec;

    const sound = join(scratch.root, 'sound.json');
    writeJson(sound, {
      semantics: [
        {
          statement: 'src/api owns the request lifecycle',
          falsification: 'publish a request from src/state and observe whether a consumer reads it half-built',
          basis: [measuredSpec.claims[0].claim_id],
          scope: measuredSpec.claims[0].scope,
        },
      ],
    });

    await analyzeProject({ root: tree.root, out: out.root, through: 'r8', options: { semantics: sound } });
    const authored = readRun(out.root).spec;

    assert.equal(authored.claims.length, measuredSpec.claims.length + 1, 'the authored entry is in the spec');
    assert.equal(
      authored.claims.some((claim) => claim.claim_id.startsWith('clm-design-')),
      true,
      'and it is marked as an inference the author made, not as a measurement',
    );

    const broken = join(scratch.root, 'broken.json');
    writeJson(broken, {
      semantics: [{ statement: 'x', falsification: 'y', basis: ['clm-absent-1'], scope: 'src/api' }],
    });

    await assert.rejects(
      () => analyzeProject({ root: tree.root, out: out.root, through: 'r8', options: { semantics: broken } }),
      /clm-absent-1/,
      'an unresolvable basis stops the run rather than being dropped in silence',
    );
    assert.deepEqual(readRun(out.root).spec.claims, authored.claims, 'and the last good publication is untouched');
  } finally {
    tree.dispose();
    out.dispose();
    scratch.dispose();
  }
});
