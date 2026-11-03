// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'dist', 'archive', 'progress-gif', 'vendor', 'fixtures']);
const CODE_EXTENSION = /\.(rs|go|ts|tsx|js|jsx|cjs|mjs|vue|py|java|kt|swift|c|cpp|h|hpp|rb|php|cs)$/i;
const STRICT_STUB = /^\s*\/\/\s*\[::STUB::\]\s+(P[A-Z0-9]+-\d+|MUST\s+RESOLVE):\s*\S/;

/**
 * Count strict [::STUB::] markers under one package. Generated design markers
 * (`MUST implement NODE_ID`) do not match the grammar and are not counted.
 */
export function countUnresolvedStubs(directory, nestedDirectories = new Set()) {
  let count = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        if (entry.name !== '.claude') continue;
      }
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      let stat;
      try {
        stat = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (nestedDirectories.has(full)) continue;
        walk(full);
      } else if (CODE_EXTENSION.test(entry.name) && stat.size < 2_000_000) {
        let text;
        try {
          text = fs.readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        for (const line of text.split('\n')) if (STRICT_STUB.test(line)) count += 1;
      }
    }
  };
  walk(directory);
  return count;
}
