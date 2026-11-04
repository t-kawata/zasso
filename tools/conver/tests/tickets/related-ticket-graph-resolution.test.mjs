// PX-356 @verifies C007
// A split package may store `metadata.source` home-relative and may name its RFC something
// other than RFC.md. The graph resolver must follow the metadata, not a project-root guess
// or a hardcoded RFC-GRAPH.json name, or relatedTicketIds silently stays empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadGraphEdgesFromTickets } = require('../../.claude/scripts/tickets/generate-related-ticket-ids.js');

// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function writePackage(directory, { source, resolvedGraphPath = null }) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'Tickets.json'),
    JSON.stringify({
      metadata: {
        source,
        ...(resolvedGraphPath === null ? {} : { resolvedPaths: { graphPath: resolvedGraphPath } }),
      },
    }),
  );
}

test('C007 resolvedPaths.graphPath is expanded from ~ and read', () => {
  const previousHome = process.env.HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'px356-home-'));
  process.env.HOME = home;

  try {
    const packageDirectory = path.join(home, 'shyme', 'example', 'crates', 'pkg');
    writePackage(packageDirectory, {
      source: '~/shyme/example/crates/pkg/RFC.md',
      resolvedGraphPath: '~/shyme/example/crates/pkg/RFC-GRAPH.json',
    });
    fs.writeFileSync(
      path.join(packageDirectory, 'RFC-GRAPH.json'),
      JSON.stringify({ edges: [{ from: 'N1', to: 'N2', type: 'depends_on' }] }),
    );

    const edges = loadGraphEdgesFromTickets(path.join(packageDirectory, 'Tickets.json'));

    assert.equal(edges.length, 1);
    assert.equal(edges[0].from, 'N1');
  } finally {
    process.env.HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('C007 a non-RFC.md basename uses <basename>-GRAPH.json beside the package', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px356-related-'));
  const packageDirectory = path.join(root, 'crates', 'pkg');

  try {
    writePackage(packageDirectory, { source: 'Package.md' });
    fs.writeFileSync(
      path.join(packageDirectory, 'Package-GRAPH.json'),
      JSON.stringify({ edges: [{ from: 'N1', to: 'N2', type: 'depends_on' }] }),
    );

    const edges = loadGraphEdgesFromTickets(path.join(packageDirectory, 'Tickets.json'));

    assert.equal(edges.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C007 a missing graph returns null without inventing edges', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px356-related-missing-'));
  const packageDirectory = path.join(root, 'crates', 'pkg');

  try {
    writePackage(packageDirectory, { source: 'Missing.md' });

    assert.equal(loadGraphEdgesFromTickets(path.join(packageDirectory, 'Tickets.json')), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
