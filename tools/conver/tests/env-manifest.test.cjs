/**
 * env-manifest.test.cjs — the single environment declaration and its record.
 *
 * The declaration is the only place a dependency is described, and the record
 * is the evidence that the declaration was satisfied. Both are asserted here
 * without touching the network or installing anything.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  classifyTool,
  declarationIsEmpty,
  describeUnresolvedDependency,
  diagnoseNpmRoot,
  readDeclaration,
  readConvergedTicketKeys,
  recordEnvironmentManifest,
  renderEnvironmentReport,
  resolveEnvironment,
  rotationIsReady,
  DECLARATION_FILE_NAME,
  RECORD_FILE_NAME,
} = require('../env-manifest.cjs');
const { describeSpawnFailure, resolveExecutable } = require('../install-deps.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('resolveExecutable — the platform decision as a pure function', () => {
  it('resolves the Windows launcher form and the POSIX form', () => {
    assert.equal(resolveExecutable({ platform: 'win32', command: 'npm' }), 'npm.cmd');
    assert.equal(resolveExecutable({ platform: 'linux', command: 'npm' }), 'npm');
    assert.equal(resolveExecutable({ platform: 'darwin', command: 'npm' }), 'npm');
  });
});

describe('describeSpawnFailure — a symptom is not a cause', () => {
  it('names the command it attempted and the platform it ran on', () => {
    const message = describeSpawnFailure({ command: 'npm.cmd', platform: 'win32', status: null, stderr: '' });
    assert.match(message, /npm\.cmd/, 'the attempted command must be named');
    assert.match(message, /win32/, 'the platform must be named');
    assert.doesNotMatch(message, /npm install failed/, 'the symptom-only message is forbidden');
  });

  it('prefers the captured stderr when the command ran and failed', () => {
    const message = describeSpawnFailure({ command: 'npm', platform: 'linux', status: 1, stderr: 'EACCES: permission denied' });
    assert.match(message, /EACCES/);
    assert.match(message, /npm/);
  });
});

describe('readDeclaration', () => {
  it('reads the project declaration', () => {
    const declaration = readDeclaration(PROJECT_ROOT);
    assert.ok(Array.isArray(declaration.npmRoots));
    assert.ok(Array.isArray(declaration.tools));
    assert.ok(declaration.npmRoots.length > 0);
  });

  it('reports a missing declaration by path rather than silently returning nothing', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'env-deps-'));
    assert.throws(
      () => readDeclaration(empty),
      (error) => {
        assert.match(error.message, new RegExp(DECLARATION_FILE_NAME));
        return true;
      },
    );
    fs.rmSync(empty, { recursive: true, force: true });
  });

  it('names the file and the parse failure for malformed JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-deps-bad-'));
    fs.writeFileSync(path.join(dir, DECLARATION_FILE_NAME), '{ not json');
    assert.throws(
      () => readDeclaration(dir),
      (error) => {
        assert.match(error.message, new RegExp(DECLARATION_FILE_NAME));
        return true;
      },
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('declarationIsEmpty', () => {
  it('reports an empty declaration as empty rather than as a clean environment', () => {
    assert.equal(declarationIsEmpty({ npmRoots: [], tools: [] }), true);
    assert.equal(declarationIsEmpty({ npmRoots: [{ id: 'x' }], tools: [] }), false);
  });
});

describe('classifyTool', () => {
  const reverseTool = { id: 'zg', probe: 'zg version', minVersion: '0.1.0', requiredFor: 'reverse', providedBy: 'P22-9', optional: false };

  it('reports a tool whose providing ticket has not converged as not yet required', () => {
    const verdict = classifyTool({ entry: reverseTool, probeResult: { status: null }, converged: new Set() });
    assert.equal(verdict.status, 'not-yet-required');
    assert.equal(verdict.requiredFor, 'reverse');
  });

  it('reports the same tool as absent once its ticket has converged', () => {
    const verdict = classifyTool({ entry: reverseTool, probeResult: { status: null }, converged: new Set(['P22-9']) });
    assert.equal(verdict.status, 'absent');
  });

  it('reports an optional tool as unavailable without aborting the run', () => {
    const optional = { id: 'joern', probe: 'joern --version', requiredFor: 'reverse', providedBy: null, optional: true };
    assert.equal(classifyTool({ entry: optional, probeResult: { status: null }, converged: new Set() }).status, 'unavailable');
  });

  it('reports a probed tool as present with its version', () => {
    const verdict = classifyTool({
      entry: { id: 'node', probe: 'node --version', minVersion: '22.0.0', requiredFor: 'forward', providedBy: null, optional: false },
      probeResult: { status: 0, stdout: 'v26.0.0\n', stderr: '' },
      converged: new Set(),
    });
    assert.equal(verdict.status, 'present');
    assert.equal(verdict.version, 'v26.0.0');
  });
});

describe('diagnoseNpmRoot', () => {
  it('reports a root with no package.json as having no declaration', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-root-'));
    assert.equal(diagnoseNpmRoot({ root: { id: 'x', path: '.' }, projectRoot: dir }).status, 'no-declaration');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports a declared root whose dependencies already resolve as resolved', () => {
    const verdict = diagnoseNpmRoot({ root: { id: 'claude', path: '.claude' }, projectRoot: PROJECT_ROOT });
    assert.ok(['resolved', 'no-dependencies'].includes(verdict.status), `unexpected: ${verdict.status}`);
  });

  it('reports a root whose dependencies cannot be resolved as missing, with the command that would fix it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-root-miss-'));
    fs.mkdirSync(path.join(dir, 'broken'));
    fs.writeFileSync(path.join(dir, 'broken', 'package.json'), JSON.stringify({ dependencies: { 'a-package-that-does-not-exist-anywhere': '^1.0.0' } }));

    const verdict = diagnoseNpmRoot({ root: { id: 'broken', path: 'broken' }, projectRoot: dir });
    assert.equal(verdict.status, 'missing');
    assert.match(verdict.remedy, /npm install/, 'the remedy must be a runnable command');
    assert.match(verdict.remedy, /broken/, 'the remedy must name the root it applies to');

    const report = describeUnresolvedDependency(verdict, 'linux');
    assert.match(report, /broken/);
    assert.ok(report.trim().length > 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('readConvergedTicketKeys', () => {
  it('treats only done or resolved tickets as converged', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tickets-'));
    fs.writeFileSync(
      path.join(dir, 'Tickets.json'),
      JSON.stringify({ phases: [{ phaseId: 1, tickets: [{ id: 1, status: 'done' }, { id: 2, status: 'resolved' }, { id: 3, status: 'todo' }, { id: 4 }] }] }),
    );
    const converged = readConvergedTicketKeys(path.join(dir, 'Tickets.json'));
    assert.equal(converged.has('P1-1'), true);
    assert.equal(converged.has('P1-2'), true);
    assert.equal(converged.has('P1-3'), false);
    assert.equal(converged.has('P1-4'), false, 'a missing status is todo');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('resolveEnvironment', () => {
  it('produces one entry per declared root and per declared tool', () => {
    const declaration = readDeclaration(PROJECT_ROOT);
    const outcome = resolveEnvironment({
      declaration,
      projectRoot: PROJECT_ROOT,
      environment: { platform: 'darwin', arch: 'arm64', nodeVersion: 'v26.0.0' },
      commandRunner: () => ({ status: null, stdout: '', stderr: '' }),
      converged: new Set(),
    });
    assert.equal(outcome.npmRoots.length, declaration.npmRoots.length);
    assert.equal(outcome.tools.length, declaration.tools.length);
  });

  it('probes every tool with the command line from the declaration, not a hardcoded one', () => {
    const declaration = { npmRoots: [], tools: [{ id: 'probe-me', probe: 'a-command --a-flag', requiredFor: 'forward', providedBy: null, optional: true }] };
    const seen = [];
    resolveEnvironment({
      declaration,
      projectRoot: PROJECT_ROOT,
      environment: { platform: 'linux', arch: 'x64', nodeVersion: 'v22.0.0' },
      commandRunner: (call) => {
        seen.push(call);
        return { status: null, stdout: '', stderr: '' };
      },
      converged: new Set(),
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].command, 'a-command');
    assert.deepEqual(seen[0].args, ['--a-flag']);
  });
});

describe('recordEnvironmentManifest', () => {
  it('records a version, an operating system, an architecture and the command line for every entry', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-record-'));
    const declaration = { npmRoots: [{ id: 'r', path: '.claude', requiredFor: 'forward', providedBy: null }], tools: [{ id: 't', probe: 'node --version', requiredFor: 'forward', providedBy: null, optional: false }] };
    const outcome = resolveEnvironment({
      declaration,
      projectRoot: PROJECT_ROOT,
      environment: { platform: 'darwin', arch: 'arm64', nodeVersion: 'v26.0.0' },
      commandRunner: () => ({ status: 0, stdout: 'v26.0.0\n', stderr: '' }),
      converged: new Set(),
    });
    recordEnvironmentManifest({ outcome, projectRoot: dir, environment: { platform: 'darwin', arch: 'arm64', nodeVersion: 'v26.0.0' } });

    const record = JSON.parse(fs.readFileSync(path.join(dir, RECORD_FILE_NAME), 'utf8'));
    assert.equal(record.platform, 'darwin');
    assert.equal(record.architecture, 'arm64');
    assert.equal(record.nodeVersion, 'v26.0.0');
    for (const entry of [...record.npmRoots, ...record.tools]) {
      assert.equal(typeof entry.os, 'string', `${entry.id} must carry an operating system`);
      assert.equal(typeof entry.architecture, 'string', `${entry.id} must carry an architecture`);
      assert.equal(typeof entry.commandLine, 'string', `${entry.id} must carry the command line used`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('rotationIsReady — a readiness claim must be earned', () => {
  const readyForward = {
    npmRoots: [{ id: 'claude', status: 'resolved', requiredFor: 'forward' }],
    tools: [{ id: 'node', status: 'present', requiredFor: 'forward' }],
  };

  it('reports a rotation ready only when every required entry is satisfied', () => {
    assert.equal(rotationIsReady(readyForward, 'forward'), true);
    assert.equal(rotationIsReady({ ...readyForward, npmRoots: [{ id: 'claude', status: 'missing', requiredFor: 'forward' }] }, 'forward'), false);
    assert.equal(rotationIsReady({ ...readyForward, tools: [{ id: 'node', status: 'absent', requiredFor: 'forward' }] }, 'forward'), false);
  });

  it('does not count not-yet-required as ready: the tool is absent either way', () => {
    const record = { npmRoots: [], tools: [{ id: 'zg', status: 'not-yet-required', requiredFor: 'reverse', providedBy: 'P22-9' }] };
    assert.equal(rotationIsReady(record, 'reverse'), false, 'a toolchain that has not been chosen cannot be called ready');
  });

  it('treats a declared-optional absent tool as satisfied and a no-dependency root as satisfied', () => {
    const record = {
      npmRoots: [{ id: 'scripts', status: 'no-dependencies', requiredFor: 'forward' }],
      tools: [{ id: 'joern', status: 'unavailable', requiredFor: 'forward', optional: true }],
    };
    assert.equal(rotationIsReady(record, 'forward'), true);
  });
});

describe('renderEnvironmentReport', () => {
  it('separates forward readiness from reverse readiness in plain English', () => {
    const record = {
      platform: 'darwin',
      architecture: 'arm64',
      nodeVersion: 'v26.0.0',
      npmRoots: [{ id: 'claude', status: 'resolved', requiredFor: 'forward', path: '.claude' }],
      tools: [
        { id: 'node', status: 'present', requiredFor: 'forward', version: 'v26.0.0' },
        { id: 'zg', status: 'not-yet-required', requiredFor: 'reverse', providedBy: 'P22-9', remedy: 'npm install -g @zvec/zvec-grep' },
      ],
    };
    const report = renderEnvironmentReport(record);
    assert.match(report, /forward/i);
    assert.match(report, /reverse/i);
    assert.match(report, /ready/i);
    assert.match(report, /not yet required/i);
    assert.match(report, /P22-9/, 'the ticket that will provide it must be named');
  });

  it('reports an empty declaration as empty', () => {
    const report = renderEnvironmentReport({ platform: 'darwin', architecture: 'arm64', nodeVersion: 'v26.0.0', npmRoots: [], tools: [] });
    assert.match(report, /nothing is declared/i);
  });
});
