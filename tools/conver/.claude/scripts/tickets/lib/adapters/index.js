'use strict';

/**
 * PX-436 — adapter registry and vocabulary isolation.
 *
 * An adapter is project-supplied configuration and code for a language,
 * layout or artifact grammar. The harness never appends language flags and
 * never assumes one language per invocation.
 */

const path = require('node:path');
const fs = require('node:fs');
const { TEXT_EXTENSIONS, compareText, walkFiles } = require('./helpers.js');

const rust = require('./rust.js');
const genericManifest = require('./generic-manifest.js');
const typescript = require('./typescript.js');
const python = require('./python.js');
const go = require('./go.js');
const swift = require('./swift.js');
const cpp = require('./c-cpp.js');
const csharp = require('./csharp.js');

/** The built-in adapters. A project may override any declaration. */
const ADAPTERS = Object.freeze({
  rust,
  'generic-manifest': genericManifest,
  typescript,
  python,
  go,
  swift,
  'c-cpp': cpp,
  csharp,
});

/** Resolve an adapter id. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function getAdapter(id) {
  return Object.prototype.hasOwnProperty.call(ADAPTERS, id) ? ADAPTERS[id] : null;
}

/** Resolve an adapter declaration, merging project options over the built-in. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function resolveAdapter({ id, options = {} } = {}) {
  const builtIn = getAdapter(id);
  if (builtIn === null) {
    return { adapter: null, finding: { code: 'ADAPTER_MISSING', id: String(id), problem: 'no built-in adapter for ' + String(id) } };
  }
  return { adapter: { ...builtIn, ...options }, finding: null };
}

/** Read a text file, or null when it cannot be read. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function readTextIfPresent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Scan source trees for forbidden vocabulary.
 *
 * The test supplies sentinel tokens; a consuming project or CI supplies its own
 * list. The harness ships no evidence-project names as defaults.
 *
 * @param {{roots:string[], forbidden:string[]}} input
 * @returns {{findings:object[], unreadable:string[]}}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function scanVocabularyLeaks({ roots, forbidden }) {
  const findings = [];
  const unreadable = [];
  const tokens = (forbidden ?? []).filter((token) => typeof token === 'string' && token.length > 0);

  for (const root of roots ?? []) {
    const absoluteRoot = path.resolve(root);
    if (!fs.existsSync(absoluteRoot)) continue;
    const files = walkFiles({ cwd: absoluteRoot, roots: ['.'], extensions: [...TEXT_EXTENSIONS] });
    for (const file of files) {
      const text = readTextIfPresent(path.join(absoluteRoot, file));
      if (text === null) {
        unreadable.push(file);
        continue;
      }
      const lines = text.split('\n');
      for (const token of tokens) {
        lines.forEach((line, index) => {
          if (line.includes(token)) {
            findings.push({ file: path.relative(process.cwd(), path.join(absoluteRoot, file)), token, line: index + 1 });
          }
        });
      }
    }
  }

  findings.sort((left, right) => compareText(left.file, right.file) || left.line - right.line || compareText(left.token, right.token));
  return { findings, unreadable: unreadable.sort(compareText) };
}

module.exports = {
  ADAPTERS,
  getAdapter,
  resolveAdapter,
  scanVocabularyLeaks,
};
