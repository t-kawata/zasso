#!/usr/bin/env node
/**
 * OKF v0.2 core CLI.
 *
 * Commands write JSON so the caller can follow a concept without parsing
 * prose. Errors carry a stable code and a non-zero exit.
 */

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle, listDirectory, getConcept } from './index.mjs';
import { resolveReference } from './paths/resolve.mjs';
import { showConcept, outgoingEdges, incomingEdges, neighborEdges } from './commands/navigation.mjs';
import { runValidation } from './commands/validation.mjs';
import { requiredSet, contextArtifact } from './commands/context.mjs';
import { searchConcepts } from './commands/search.mjs';
import { writeDirectoryIndexes } from './authoring/index.mjs';
import { writeLog } from './authoring/log.mjs';

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArgs(rest);
  if (!command) return fail('MISSING_COMMAND');
  if (!options.root) return fail('MISSING_ROOT');
  try {
    const bundle = await loadBundle(options.root);
    return runCommand(command, options, bundle);
  } catch (error) {
    return fail(error.code ?? 'OKF_ERROR', error.message);
  }
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function runCommand(command, options, bundle) {
  const now = parseNow(options.now);
  if (command === 'list') return print({ entries: listDirectory(bundle, options.path ?? '') });
  if (command === 'show' || command === 'page') {
    return print(showConcept({ bundle, id: options._[0], now }));
  }
  if (command === 'outgoing') return print({ id: options._[0], edges: outgoingEdges({ bundle, id: options._[0] }) });
  if (command === 'incoming') return print({ id: options._[0], edges: incomingEdges({ bundle, id: options._[0] }) });
  if (command === 'neighbors') return print({ id: options._[0], edges: neighborEdges({ bundle, id: options._[0] }) });
  if (command === 'resolve') {
    return print(resolveReference({ fromPath: options._[0], rawTarget: options._[1], root: options.root, files: bundle.files }));
  }
  if (command === 'search' || command === 'ask') {
    return print({ query: options.query ?? '', rows: searchConcepts({ bundle, query: options.query ?? '' }) });
  }
  if (command === 'required') return print(requiredSet({ bundle, entryIds: entries(options.entry) }));
  if (command === 'context') {
    const result = contextArtifact({
      bundle,
      entryIds: entries(options.entry),
      budgetBytes: options.budget ? Number(options.budget) : undefined,
      now,
    });
    return print(result);
  }
  if (command === 'validate' || command === 'lint') {
    const mode = command === 'lint' ? 'lint' : (options.mode ?? 'conformance');
    const findings = runValidation({ bundle, mode, now });
    print({ mode, findings });
    return findings.length === 0 ? 0 : 1;
  }
  if (command === 'trust') {
    const rows = bundle.concepts
      .filter((concept) => !options.tier || concept.trustTier === options.tier)
      .map((concept) => ({ id: concept.id, tier: concept.trustTier }));
    return print({ rows });
  }
  if (command === 'freshness') {
    const rows = bundle.concepts
      .filter((concept) => concept.isStale(now))
      .map((concept) => ({ id: concept.id, status: concept.status, staleAfter: concept.staleAfter ?? null }));
    return print({ rows });
  }
  if (command === 'sources') {
    const concept = getConcept(bundle, options._[0]);
    return concept ? print({ id: concept.id, sources: concept.sources }) : fail('UNKNOWN_CONCEPT');
  }
  if (command === 'rebuild') return rebuild({ bundle, root: options.root, date: options.date });
  return fail('UNKNOWN_COMMAND');
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function rebuild({ bundle, root, date }) {
  const temporary = mkdtempSync(join(tmpdir(), 'okf-rebuild-'));
  try {
    writeDirectoryIndexes({ bundle, outDir: temporary });
    const logPath = join(root, '..', 'source', 'okf-log.json');
    const entries = existsSync(logPath)
      ? JSON.parse(readFileSync(logPath, 'utf8')).entries
      : [{ date: date ?? '1970-01-01', text: 'rebuild' }];
    writeLog({ outDir: temporary, entries });
    for (const file of ['index.md', 'log.md']) {
      const actual = readFileSync(join(root, file), 'utf8');
      const rebuilt = readFileSync(join(temporary, file), 'utf8');
      if (actual !== rebuilt) {
        return fail('NON_DETERMINISTIC', `${file} differs from rebuild`);
      }
    }
    return print({ ok: true, rebuilt: ['index.md', 'log.md'] });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function parseArgs(args) {
  const options = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      options._.push(argument);
      continue;
    }
    const body = argument.slice(2);
    const equals = body.indexOf('=');
    if (equals >= 0) options[body.slice(0, equals)] = body.slice(equals + 1);
    else if (index + 1 < args.length && !args[index + 1].startsWith('--')) options[body] = args[++index];
    else options[body] = true;
  }
  return options;
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function entries(value) {
  return String(value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function parseNow(value) {
  if (!value || value === true) return new Date();
  return new Date(`${value}T00:00:00Z`);
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function print(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  return 0;
}

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function fail(code, message = code) {
  process.stderr.write(`${JSON.stringify({ code, message })}\n`);
  return 1;
}

if (
  process.argv[1]
  && process.argv[1].endsWith('/okf-core/cli.mjs')
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  main().then((code) => { process.exitCode = code; });
}
