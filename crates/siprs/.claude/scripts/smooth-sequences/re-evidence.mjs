// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
/**
 * The one-time PX-290 evidence migration.
 *
 * `archive` copies the generated evidence, verifies it and removes the live copy;
 * `restore` returns the inquest to the readers that answered it; `check` reports without
 * writing. This CLI never creates a judgment, an attack or a reading.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  ARCHIVE_DIRECTORY,
  archiveGeneratedEvidence,
  resetManifestReceipts,
  restoreInquestReaders,
  summarizeArchive,
} from './lib/re-evidence.mjs';

/** Parse `--root=<path>` or `--root <path>`. */
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
function parse(argv) {
  const [command, ...rest] = argv;
  const inline = rest.find((entry) => entry.startsWith('--root='));
  const separated = rest.indexOf('--root');
  const root = inline !== undefined
    ? inline.slice('--root='.length)
    : separated !== -1 && typeof rest[separated + 1] === 'string'
      ? rest[separated + 1]
      : process.cwd();
  return { command, root };
}

/** Render the archive summary as Markdown. */
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
function renderArchive(result) {
  const lines = [
    '# PX-290 evidence archive',
    '',
    `- archive: \`${result.directory}\``,
    `- files: ${result.files.length}`,
    `- removed: ${result.removed.length}`,
    '',
    '| file | sha256 | bytes |',
    '|---|---|---:|',
  ];
  for (const entry of result.files) {
    lines.push(`| \`${entry.path}\` | \`${entry.sha256.slice(0, 16)}…\` | ${entry.bytes} |`);
  }
  return lines.join('\n');
}

/** Run one subcommand. */
// [::TICKET::] PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-293 --for-spec --no-implementation-order`.
function run(command, root) {
  if (command === 'archive') {
    const result = archiveGeneratedEvidence(root);
    const receipts = resetManifestReceipts(root);
    process.stdout.write(`${renderArchive(result)}\n\n- manifest receipts: ${receipts.receipts}\n`);
    return 0;
  }
  if (command === 'restore') {
    const result = restoreInquestReaders(root);
    process.stdout.write([
      '# Inquest reader restoration',
      '',
      `- rows: ${result.total}`,
      `- restored: ${result.restored}`,
      `- without original reader: ${result.withoutOriginal}`,
    ].join('\n') + '\n');
    return 0;
  }
  if (command === 'check') {
    const archive = summarizeArchive(root);
    const live = ['educe-sequences/readings-judgment.jsonl', 'educe-sequences/readings-attack.jsonl', 'educe-sequences/readings-uncovered.jsonl']
      .filter((relative) => existsSync(join(root, relative)));
    process.stdout.write([
      '# Evidence state',
      '',
      `- archive: ${archive === null ? 'absent' : `\`${join(root, ARCHIVE_DIRECTORY)}\` (${archive.files.length} files)`}`,
      `- live generated files: ${live.length === 0 ? 'none' : live.map((path) => `\`${path}\``).join(', ')}`,
    ].join('\n') + '\n');
    return 0;
  }
  process.stderr.write('usage: re-evidence.mjs <archive|restore|check> --root=<workspace>\n');
  return 2;
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  const parsed = parse(process.argv.slice(2));
  process.exitCode = run(parsed.command, parsed.root);
}
