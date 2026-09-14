/**
 * env-manifest.cjs — resolve everything a conver project declares, and record it.
 *
 * `ENV-DEPS.json` is the only place a dependency is described. This module reads
 * that declaration, decides the state of every npm root and every external tool,
 * and writes `ENV-MANIFEST.json`: for each, the resolved version, the operating
 * system, the architecture and the exact command line used.
 *
 * Storing a version without storing what it produced is not evidence of
 * reproducibility, which is why the command line is part of the record.
 *
 * The act of resolving never destroys anything: an npm root with an existing
 * `node_modules` is reported, never rewritten.
 */

const fs = require('node:fs');
const path = require('node:path');
const { classifyDependencyAction, readManifestDependencies, resolveExecutable } = require('./install-deps.cjs');

const DECLARATION_FILE_NAME = 'ENV-DEPS.json';
const RECORD_FILE_NAME = 'ENV-MANIFEST.json';
const TICKETS_FILE_NAME = 'Tickets.json';

/** A ticket that has converged has finished its own work; nothing it provides is still pending. */
const CONVERGED_STATUSES = new Set(['done', 'resolved']);

/**
 * Read the one declaration, failing loudly when it is absent or malformed.
 *
 * A missing declaration is not an empty environment: it is an operator error,
 * and a report that reads as "nothing to do" would hide it.
 *
 * @param {string} projectRoot
 * @returns {object} the parsed declaration
 */
function readDeclaration(projectRoot) {
  const declarationPath = path.join(projectRoot, DECLARATION_FILE_NAME);
  if (!fs.existsSync(declarationPath)) {
    throw new Error(`no declaration found at ${DECLARATION_FILE_NAME} — every dependency must be declared there`);
  }
  try {
    return JSON.parse(fs.readFileSync(declarationPath, 'utf8'));
  } catch (error) {
    throw new Error(`${DECLARATION_FILE_NAME} is not valid JSON: ${error.message}`);
  }
}

/**
 * An empty declaration is reported as empty, not as a clean environment.
 *
 * @param {object} declaration
 * @returns {boolean}
 */
function declarationIsEmpty(declaration) {
  return (declaration.npmRoots ?? []).length === 0 && (declaration.tools ?? []).length === 0;
}

/**
 * Which tickets have converged.
 *
 * A ticket provided by an unconverged ticket is *not yet required*; reading the
 * ticket states is what lets the report tell the difference between "not needed
 * yet" and "needed and missing".
 *
 * @param {string} ticketsPath
 * @returns {Set<string>}
 */
function readConvergedTicketKeys(ticketsPath) {
  const converged = new Set();
  if (!fs.existsSync(ticketsPath)) {
    return converged;
  }
  const ticketsDocument = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  for (const phase of ticketsDocument.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      if (CONVERGED_STATUSES.has(ticket.status)) {
        converged.add(`P${phase.phaseId}-${ticket.id}`);
      }
    }
  }
  return converged;
}

/** The first non-empty line of a probe's stdout is its self-reported version. */
function versionFromProbe(probeResult) {
  const line = (probeResult.stdout ?? '')
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line ?? null;
}

/**
 * Decide the state of one declared external tool.
 *
 * Presence is checked before the providing ticket: a tool that is already
 * installed is present whether or not the ticket that introduces it has
 * converged.
 *
 * @param {object} params
 * @returns {{id: string, status: string, version: string|null, requiredFor: string, providedBy: string|null, remedy: string}}
 */
function classifyTool({ entry, probeResult, converged }) {
  const probed = probeResult.status === 0;
  if (probed) {
    return {
      id: entry.id,
      status: 'present',
      version: versionFromProbe(probeResult),
      requiredFor: entry.requiredFor,
      providedBy: entry.providedBy ?? null,
      remedy: '',
    };
  }

  const providerPending = entry.providedBy && !converged.has(entry.providedBy);
  const remedy = entry.obtain?.[probeResult.platform] ?? Object.values(entry.obtain ?? {})[0] ?? '';

  if (providerPending) {
    return { id: entry.id, status: 'not-yet-required', version: null, requiredFor: entry.requiredFor, providedBy: entry.providedBy, remedy };
  }
  if (entry.optional) {
    return { id: entry.id, status: 'unavailable', version: null, requiredFor: entry.requiredFor, providedBy: entry.providedBy ?? null, remedy };
  }
  return { id: entry.id, status: 'absent', version: null, requiredFor: entry.requiredFor, providedBy: entry.providedBy ?? null, remedy };
}

/**
 * Decide the state of one declared npm root without modifying it.
 *
 * @param {object} params
 * @returns {{id: string, status: string, path: string, requiredFor: string, providedBy: string|null, remedy: string}}
 */
function diagnoseNpmRoot({ root, projectRoot }) {
  const rootDir = path.join(projectRoot, root.path);
  const manifestPath = path.join(rootDir, 'package.json');
  const base = { id: root.id, path: root.path, requiredFor: root.requiredFor, providedBy: root.providedBy ?? null };

  if (!fs.existsSync(manifestPath)) {
    return { ...base, status: 'no-declaration', remedy: '' };
  }

  const dependencyEntries = Object.keys(readManifestDependencies(manifestPath));
  const plan = classifyDependencyAction({ targetClaudeDir: rootDir, dependencyEntries });

  if (plan.action === 'no-dependencies') {
    return { ...base, status: 'no-dependencies', remedy: '' };
  }
  if (plan.action === 'resolved') {
    return { ...base, status: 'resolved', remedy: '' };
  }

  const remedy = `npm install ${root.path === '.' ? '' : `--prefix ${root.path}`}`.trim();
  const status = plan.action === 'skip-existing-node_modules' ? 'skipped-existing' : 'missing';
  return { ...base, status, remedy };
}

/**
 * One sentence naming an unresolved dependency and the command that would
 * provide it on this operating system.
 *
 * @param {object} verdict
 * @param {string} platform
 * @returns {string}
 */
function describeUnresolvedDependency(verdict, platform) {
  const what = verdict.path ? `npm root "${verdict.id}" at ${verdict.path}` : `tool "${verdict.id}"`;
  const remedy = verdict.remedy ? ` Run: ${verdict.remedy}` : '';
  return `${what} is unresolved on ${platform}.${remedy}`;
}

/**
 * Resolve every declared npm root and probe every declared external tool.
 *
 * @param {object} params
 * @param {object} params.declaration - the parsed ENV-DEPS.json
 * @param {string} params.projectRoot - root the declared paths are relative to
 * @param {{platform: string, arch: string, nodeVersion: string}} params.environment - what we are resolving for
 * @param {Function} params.commandRunner - injected so the probe is testable
 * @param {Set<string>} params.converged - ticket keys that have finished
 * @returns {{npmRoots: Array, tools: Array}}
 */
function resolveEnvironment({ declaration, projectRoot, environment, commandRunner, converged }) {
  const { platform, arch, nodeVersion } = environment;
  const npmRoots = (declaration.npmRoots ?? []).map((root) => {
    const verdict = diagnoseNpmRoot({ root, projectRoot });
    return {
      ...verdict,
      os: platform,
      architecture: arch,
      commandLine: `read ${path.join(root.path, 'package.json')}`,
    };
  });

  const tools = (declaration.tools ?? []).map((entry) => {
    const [command, ...args] = entry.probe.split(' ').filter((token) => token.length > 0);
    const executable = resolveExecutable({ platform, command });
    const probeResult = commandRunner({ command: executable, args, cwd: projectRoot, platform });
    const verdict = classifyTool({ entry, probeResult: { ...probeResult, platform }, converged });
    return {
      ...verdict,
      optional: entry.optional === true,
      os: platform,
      architecture: arch,
      commandLine: entry.probe,
      nodeVersion,
    };
  });

  return { npmRoots, tools };
}

/**
 * Write the record of what was resolved.
 *
 * @param {object} params
 * @param {object} params.outcome - the result of resolveEnvironment
 * @param {string} params.projectRoot
 * @param {{platform: string, arch: string, nodeVersion: string}} params.environment
 */
function recordEnvironmentManifest({ outcome, projectRoot, environment }) {
  const { platform, arch, nodeVersion } = environment;
  const record = {
    version: 1,
    platform,
    architecture: arch,
    nodeVersion,
    npmRoots: outcome.npmRoots,
    tools: outcome.tools,
  };
  fs.writeFileSync(path.join(projectRoot, RECORD_FILE_NAME), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/**
 * Whether every entry of one rotation's dependencies is satisfied.
 *
 * `not-yet-required` does not count as ready: the tool is absent, and the only
 * reason it is not yet an error is that the ticket providing it has not
 * converged. Calling that "ready" would say the reverse rotation can run when
 * its toolchain has not even been chosen.
 */
function rotationIsReady(record, rotation) {
  const roots = record.npmRoots.filter((entry) => entry.requiredFor === rotation);
  const tools = record.tools.filter((entry) => entry.requiredFor === rotation);
  const rootSatisfied = (entry) => entry.status === 'resolved' || entry.status === 'no-dependencies';
  const toolSatisfied = (entry) => entry.status === 'present' || (entry.status === 'unavailable' && entry.optional === true);
  return roots.every(rootSatisfied) && tools.every(toolSatisfied);
}

/**
 * Render the record as the Markdown a human reads.
 *
 * Forward readiness and reverse readiness are stated separately, because one
 * undifferentiated verdict would hide the difference that matters most during
 * this phase: the forward rotation works, and the reverse rotation's tools are
 * not chosen yet.
 *
 * @param {object} record
 * @returns {string}
 */
function renderEnvironmentReport(record) {
  if (declarationIsEmpty(record)) {
    return ['# Environment report', '', '**Nothing is declared.** The declaration lists no npm root and no tool, so there is nothing to resolve.', ''].join('\n');
  }

  const lines = [
    '# Environment report',
    '',
    `Platform: ${record.platform} / ${record.architecture} · Node ${record.nodeVersion}`,
    '',
    `## Forward rotation — ${rotationIsReady(record, 'forward') ? 'ready' : 'not ready'}`,
    '',
  ];

  for (const entry of record.npmRoots.filter((item) => item.requiredFor === 'forward')) {
    lines.push(`- npm root \`${entry.path}\` — ${entry.status}${entry.remedy ? ` (${entry.remedy})` : ''}`);
  }
  for (const entry of record.tools.filter((item) => item.requiredFor === 'forward')) {
    lines.push(`- tool \`${entry.id}\` — ${entry.status}${entry.version ? ` (${entry.version})` : ''}${entry.remedy ? ` (${entry.remedy})` : ''}`);
  }

  lines.push('', `## Reverse rotation — ${rotationIsReady(record, 'reverse') ? 'ready' : 'not ready'}`, '');

  for (const entry of record.npmRoots.filter((item) => item.requiredFor !== 'forward')) {
    lines.push(`- npm root \`${entry.path}\` — ${entry.status}${entry.requiredFor === 'experiment' ? ' (experiment)' : ''}`);
  }
  for (const entry of record.tools.filter((item) => item.requiredFor !== 'forward')) {
    const pending = entry.status === 'not-yet-required' ? `, provided by ${entry.providedBy} which has not converged — not yet required` : '';
    lines.push(`- tool \`${entry.id}\` — ${entry.status}${pending}${entry.remedy && entry.status !== 'not-yet-required' ? ` (${entry.remedy})` : ''}`);
  }

  lines.push('', 'Nothing above was modified: an existing `node_modules` is reported, never rewritten.', '');
  return lines.join('\n');
}

module.exports = {
  DECLARATION_FILE_NAME,
  RECORD_FILE_NAME,
  TICKETS_FILE_NAME,
  classifyTool,
  declarationIsEmpty,
  describeUnresolvedDependency,
  diagnoseNpmRoot,
  readConvergedTicketKeys,
  readDeclaration,
  recordEnvironmentManifest,
  renderEnvironmentReport,
  resolveEnvironment,
  rotationIsReady,
};
