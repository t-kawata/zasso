#!/usr/bin/env node
'use strict';

/**
 * PX-436 — build the language-neutral test index.
 *
 * A file under a configured test root is indexed or reported. A test entry
 * carries the adapter id, file, name, kind, ignored marker, annotations and a
 * digest; the index carries a digest over the whole population.
 */

const fs = require('node:fs');
const path = require('node:path');

const { writeTemporaryThenRename } = require('./lib/atomic-write.js');
const { compareText, sha256 } = require('./lib/adapters/helpers.js');
const { ADAPTERS, getAdapter } = require('./lib/adapters/index.js');

const OUTPUT_FILE_NAME = 'TEST-INDEX.json';
const CONFIG_FILE_NAME = 'TEST-INDEX-CONFIG.json';

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** The first existing candidate path, or null. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function firstExisting(cwd, candidates) {
  for (const candidate of candidates) {
    const full = path.join(cwd, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** Detect the adapter id from the project's manifests. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function detectAdapterId(cwd) {
  if (fs.existsSync(path.join(cwd, 'TEST-MANIFEST.json'))) return 'generic-manifest';
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return 'rust';
  if (fs.existsSync(path.join(cwd, 'package.json'))) return 'typescript';
  if (firstExisting(cwd, ['pyproject.toml', 'setup.py', 'requirements.txt']) !== null) return 'python';
  if (fs.existsSync(path.join(cwd, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(cwd, 'Package.swift'))) return 'swift';
  if (fs.existsSync(path.join(cwd, 'CMakeLists.txt'))) return 'c-cpp';
  const csproj = fs.existsSync(cwd) && fs.readdirSync(cwd).some((name) => name.endsWith('.csproj'));
  if (csproj) return 'csharp';
  return 'generic-manifest';
}

/** Resolve the adapter list from an explicit config or detection. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function resolveAdapters({ cwd, configPath }) {
  const configFile = configPath ?? firstExisting(cwd, [CONFIG_FILE_NAME]);
  if (configFile !== null && fs.existsSync(configFile)) {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (Array.isArray(config.adapters)) {
      return config.adapters.map((entry) => ({ ...getAdapter(entry.id), ...(entry.options ?? {}) })).filter((entry) => entry.id !== undefined);
    }
    return [{ ...getAdapter(config.adapter), ...(config.options ?? {}) }].filter((entry) => entry.id !== undefined);
  }
  return [getAdapter(detectAdapterId(cwd))].filter((entry) => entry !== null);
}

/** The digest of one test: its file content plus its id. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function testDigest({ cwd, test }) {
  if (typeof test.file === 'string' && fs.existsSync(path.join(cwd, test.file))) {
    return sha256(fs.readFileSync(path.join(cwd, test.file), 'utf8') + '\n' + test.id);
  }
  return sha256(JSON.stringify({ id: test.id, file: test.file ?? null, name: test.name ?? test.id, annotations: test.annotations ?? [] }));
}

/**
 * Build the test index.
 *
 * @param {{cwd:string, adapter?:object, adapters?:object[], io?:object}} input
 * @returns {object}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function buildTestIndex({ cwd, adapter = null, adapters = null, io = undefined }) {
  const list = (adapters ?? (adapter === null ? [] : [adapter])).filter((entry) => entry !== null && entry !== undefined);
  const tests = [];
  const discoveredFiles = new Set();
  const reported = [];

  for (const current of list) {
    const result = current.enumerate({ cwd, io }) ?? {};
    for (const file of result.files ?? []) discoveredFiles.add(file);
    for (const entry of result.reported ?? []) {
      reported.push({ ...entry, adapterId: current.id });
      if (typeof entry.file === 'string') discoveredFiles.add(entry.file);
    }
    for (const entry of result.tests ?? []) {
      if (typeof entry.file === 'string') discoveredFiles.add(entry.file);
      tests.push({
        id: String(entry.id),
        file: entry.file ?? null,
        name: entry.name ?? String(entry.id),
        kind: entry.kind ?? 'unit',
        ignored: entry.ignored === true,
        skipReason: entry.skipReason ?? null,
        annotations: [...(entry.annotations ?? [])].sort(compareText),
        adapter: { id: current.id, version: current.version ?? 1 },
        digest: testDigest({ cwd, test: entry }),
      });
    }
  }

  tests.sort((left, right) => compareText(left.adapter.id, right.adapter.id) || compareText(left.file ?? '', right.file ?? '') || compareText(left.id, right.id));

  const indexedFiles = new Set(tests.map((test) => test.file).filter((file) => typeof file === 'string'));
  const reportedFiles = new Set(reported.map((entry) => entry.file).filter((file) => typeof file === 'string'));
  const unaccountedFiles = [...discoveredFiles].filter((file) => !indexedFiles.has(file) && !reportedFiles.has(file)).sort(compareText);
  const findings = unaccountedFiles.map((file) => ({
    code: 'TEST_FILE_UNACCOUNTED',
    class: 'must-fix',
    file,
    problem: 'test file ' + file + ' was neither indexed nor reported',
  }));

  const digest = sha256(JSON.stringify(tests.map((test) => ({
    id: test.id,
    file: test.file,
    name: test.name,
    kind: test.kind,
    ignored: test.ignored,
    skipReason: test.skipReason,
    annotations: test.annotations,
    adapter: test.adapter,
    digest: test.digest,
  }))));

  return {
    version: 1,
    language: list.map((entry) => entry.language).join(','),
    runner: list.map((entry) => entry.runner).filter((runner) => typeof runner === 'string').join(' | ') || null,
    adapters: list.map((entry) => ({ id: entry.id, version: entry.version ?? 1, language: entry.language })),
    tests,
    digest,
    reconciliation: {
      files: discoveredFiles.size,
      indexed: indexedFiles.size,
      reported: reportedFiles.size,
      indexedFiles: [...indexedFiles].sort(compareText),
      reportedFiles: [...reportedFiles].sort(compareText).map((file) => reported.find((entry) => entry.file === file)),
    },
    findings,
  };
}

/** CLI entry point. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') ?? process.cwd());
  const configPath = argumentValue(args, 'config');
  const out = argumentValue(args, 'out');
  const reportOnly = args.includes('--report-only');

  let adapters;
  try {
    adapters = resolveAdapters({ cwd, configPath: configPath ? path.resolve(cwd, configPath) : null });
  } catch (error) {
    process.stdout.write(JSON.stringify({
      ok: false,
      code: 'CONFIG_UNREADABLE',
      problem: error instanceof Error ? error.message : String(error),
    }) + '\n');
    process.exit(0);
    return;
  }

  const index = adapters.length === 0
    ? { version: 1, language: '', runner: null, adapters: [], tests: [], digest: sha256('[]'), reconciliation: { files: 0, indexed: 0, reported: 0, indexedFiles: [], reportedFiles: [] }, findings: [{ code: 'ADAPTER_MISSING', class: 'must-fix', problem: 'no adapter matched this project' }] }
    : buildTestIndex({ cwd, adapters });

  if (!reportOnly) {
    const target = path.resolve(cwd, out ?? OUTPUT_FILE_NAME);
    writeTemporaryThenRename(target, JSON.stringify(index, null, 2) + '\n');
  }

  process.stdout.write(JSON.stringify(index) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  ADAPTERS,
  CONFIG_FILE_NAME,
  OUTPUT_FILE_NAME,
  buildTestIndex,
  detectAdapterId,
  main,
  resolveAdapters,
  testDigest,
};
