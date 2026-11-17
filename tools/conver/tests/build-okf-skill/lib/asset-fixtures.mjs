// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Build a temporary input tree. Keys are POSIX-relative paths; values are
 * UTF-8 text. The caller owns cleanup through removeAssetTree.
 */
export function makeAssetTree(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'okf-asset-fixture-'));
  for (const [relativePath, text] of Object.entries(files)) {
    const absolute = join(root, relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  }
  return root;
}

export function removeAssetTree(root) {
  rmSync(root, { recursive: true, force: true });
}

export const MINIMAL_SOURCE = '# Specification\n\nRun the probe and inspect the result.\n';

export const MINIMAL_ASSET = '#!/usr/bin/env python3\nprint("probe")\n';

export function manifestFor(...roots) {
  return { assets: { roots } };
}

export function docsOnlyFiles() {
  return {
    'PRE-OKF-ORIGINAL.md': '# Specification\n\nOnly documentation is present.\n',
    'notes.txt': 'Unrelated notes.\n',
    'package.json': '{"name":"fixture"}\n',
  };
}

export function assetFiles(root = 'assets') {
  return {
    'PRE-OKF-ORIGINAL.md': MINIMAL_SOURCE,
    [`${root}/probe.py`]: MINIMAL_ASSET,
    [`${root}/Containerfile`]: 'FROM ubuntu:24.04\n',
    'private/key.pem': '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n',
    'notes.txt': 'Unrelated notes.\n',
  };
}
