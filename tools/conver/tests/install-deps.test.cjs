/**
 * install-deps.test.cjs — Tests for install-deps.cjs (dependency resolution for install.js)
 *
 * Safe, non-destructive dependency resolution:
 *  - classifyDependencyAction: resolved / skip-existing-node_modules / install / no-dependencies
 *  - runDependencyInstall: invokes npm install with safe flags via an injectable commandRunner
 *  - resolveTargetDependencies: orchestration with rollback of the self-created node_modules
 *
 * The fixtures are hermetic: no real npm install and no network is involved.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  classifyDependencyAction,
  runDependencyInstall,
  resolveTargetDependencies,
  readManifestDependencies,
  DEFAULT_NPM_INSTALL_ARGS,
} = require('../install-deps.cjs');

const DEPS = ['ajv', 'sql.js'];

/**
 * Create a temp .claude-like fixture directory.
 * @param {object|null} seedNodeModules - { pkgName: { relPath: content } } written under node_modules/
 * @returns {{ claudeDir: string, cleanup: () => void }}
 */
function makeClaudeFixture(seedNodeModules) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-deps-'));
  const claudeDir = path.join(root, 'claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  if (seedNodeModules) {
    for (const [name, files] of Object.entries(seedNodeModules)) {
      for (const [relPath, content] of Object.entries(files)) {
        const filePath = path.join(claudeDir, 'node_modules', name, relPath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
      }
    }
  }
  return { claudeDir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** A minimal real-resolvable fake of the `ajv` package. */
const FAKE_AJV = {
  'package.json': JSON.stringify({ name: 'ajv', version: '8.20.0', main: 'dist/ajv.js' }),
  'dist/ajv.js': 'module.exports = {};',
};

/** A minimal real-resolvable fake of the `sql.js` package. */
const FAKE_SQLJS = {
  'package.json': JSON.stringify({ name: 'sql.js', version: '1.14.2', main: 'dist/sql-wasm.js' }),
  'dist/sql-wasm.js': 'module.exports = {};',
};

describe('classifyDependencyAction', () => {
  it('returns resolved when every dependency resolves from the target .claude', () => {
    const fx = makeClaudeFixture({ ajv: FAKE_AJV, 'sql.js': FAKE_SQLJS });
    try {
      const result = classifyDependencyAction({ targetClaudeDir: fx.claudeDir, dependencyEntries: DEPS });
      assert.deepEqual(result, { action: 'resolved' });
    } finally {
      fx.cleanup();
    }
  });

  it('returns skip-existing-node_modules when node_modules exists but dependencies are missing', () => {
    const fx = makeClaudeFixture({ unrelated: { 'index.js': 'module.exports = {};' } });
    try {
      const result = classifyDependencyAction({ targetClaudeDir: fx.claudeDir, dependencyEntries: DEPS });
      assert.deepEqual(result, { action: 'skip-existing-node_modules' });
    } finally {
      fx.cleanup();
    }
  });

  it('returns install when node_modules is absent', () => {
    const fx = makeClaudeFixture(null);
    try {
      const result = classifyDependencyAction({ targetClaudeDir: fx.claudeDir, dependencyEntries: DEPS });
      assert.deepEqual(result, { action: 'install' });
    } finally {
      fx.cleanup();
    }
  });

  it('returns no-dependencies when the dependency list is empty', () => {
    const fx = makeClaudeFixture(null);
    try {
      const result = classifyDependencyAction({ targetClaudeDir: fx.claudeDir, dependencyEntries: [] });
      assert.deepEqual(result, { action: 'no-dependencies' });
    } finally {
      fx.cleanup();
    }
  });

  it('is deterministic — identical input yields identical action (C001-Inv)', () => {
    const fx = makeClaudeFixture(null);
    try {
      const first = classifyDependencyAction({ targetClaudeDir: fx.claudeDir, dependencyEntries: DEPS });
      const second = classifyDependencyAction({ targetClaudeDir: fx.claudeDir, dependencyEntries: DEPS });
      assert.deepEqual(first, second);
    } finally {
      fx.cleanup();
    }
  });
});

describe('runDependencyInstall', () => {
  it('invokes npm install with safe flags in the target .claude and reports ok', () => {
    const fx = makeClaudeFixture(null);
    try {
      const calls = [];
      const okRunner = ({ command, args, cwd }) => {
        calls.push({ command, args, cwd });
        return { status: 0, stdout: '', stderr: '' };
      };
      const result = runDependencyInstall({ targetClaudeDir: fx.claudeDir, commandRunner: okRunner });

      assert.equal(result.ok, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].command, 'npm');
      assert.equal(calls[0].cwd, fx.claudeDir);
      assert.ok(calls[0].args.includes('install'));
      assert.ok(calls[0].args.includes('--no-audit'));
      assert.ok(calls[0].args.includes('--no-fund'));
      assert.ok(calls[0].args.includes('--ignore-scripts'));
    } finally {
      fx.cleanup();
    }
  });

  it('reports ok:false with the stderr message when npm fails', () => {
    const fx = makeClaudeFixture(null);
    try {
      const failRunner = () => ({ status: 1, stdout: '', stderr: 'npm ERR! EINTEGRITY' });
      const result = runDependencyInstall({ targetClaudeDir: fx.claudeDir, commandRunner: failRunner });
      assert.equal(result.ok, false);
      assert.match(result.error, /EINTEGRITY/);
    } finally {
      fx.cleanup();
    }
  });

  it('uses DEFAULT_NPM_INSTALL_ARGS when npmArgs is omitted', () => {
    const fx = makeClaudeFixture(null);
    try {
      let capturedArgs = null;
      const captureRunner = ({ args }) => {
        capturedArgs = args;
        return { status: 0, stdout: '', stderr: '' };
      };
      runDependencyInstall({ targetClaudeDir: fx.claudeDir, commandRunner: captureRunner });
      assert.deepEqual(capturedArgs, DEFAULT_NPM_INSTALL_ARGS);
    } finally {
      fx.cleanup();
    }
  });
});

describe('resolveTargetDependencies', () => {
  it('does nothing when dependencies already resolve', () => {
    const fx = makeClaudeFixture({ ajv: FAKE_AJV, 'sql.js': FAKE_SQLJS });
    try {
      const calls = [];
      const result = resolveTargetDependencies({
        targetClaudeDir: fx.claudeDir,
        dependencyEntries: DEPS,
        commandRunner: ({ command }) => { calls.push(command); return { status: 0 }; },
      });
      assert.equal(result.status, 'resolved');
      assert.equal(calls.length, 0);
    } finally {
      fx.cleanup();
    }
  });

  it('does nothing when an existing node_modules must not be touched', () => {
    const fx = makeClaudeFixture({ unrelated: { 'index.js': 'module.exports = {};' } });
    try {
      const calls = [];
      const result = resolveTargetDependencies({
        targetClaudeDir: fx.claudeDir,
        dependencyEntries: DEPS,
        commandRunner: ({ command }) => { calls.push(command); return { status: 0 }; },
      });
      assert.equal(result.status, 'skipped-existing');
      assert.equal(calls.length, 0);
    } finally {
      fx.cleanup();
    }
  });

  it('installs when node_modules is absent and npm succeeds', () => {
    const fx = makeClaudeFixture(null);
    try {
      const result = resolveTargetDependencies({
        targetClaudeDir: fx.claudeDir,
        dependencyEntries: DEPS,
        commandRunner: () => ({ status: 0, stdout: '', stderr: '' }),
      });
      assert.equal(result.status, 'installed');
    } finally {
      fx.cleanup();
    }
  });

  it('rolls back the self-created node_modules when npm fails', () => {
    const fx = makeClaudeFixture(null);
    try {
      // Simulates npm leaving partial debris behind before failing.
      const failingRunner = () => {
        fs.mkdirSync(path.join(fx.claudeDir, 'node_modules', 'partial'), { recursive: true });
        return { status: 1, stdout: '', stderr: 'npm ERR! install failed' };
      };
      const result = resolveTargetDependencies({
        targetClaudeDir: fx.claudeDir,
        dependencyEntries: DEPS,
        commandRunner: failingRunner,
      });
      assert.equal(result.status, 'install-failed');
      assert.match(result.error, /install failed/);
      assert.equal(fs.existsSync(path.join(fx.claudeDir, 'node_modules')), false, 'node_modules must be rolled back');
    } finally {
      fx.cleanup();
    }
  });

  it('returns no-dependencies when the dependency list is empty', () => {
    const fx = makeClaudeFixture(null);
    try {
      const result = resolveTargetDependencies({
        targetClaudeDir: fx.claudeDir,
        dependencyEntries: [],
        commandRunner: () => { throw new Error('must not be called'); },
      });
      assert.equal(result.status, 'no-dependencies');
    } finally {
      fx.cleanup();
    }
  });
});

describe('readManifestDependencies', () => {
  it('returns the dependencies object when the manifest declares some', () => {
    const fx = makeClaudeFixture(null);
    try {
      const manifestPath = path.join(fx.claudeDir, 'package.json');
      fs.writeFileSync(manifestPath, JSON.stringify({ type: 'commonjs', dependencies: { ajv: '^8.20.0', 'sql.js': '^1.14.2' } }));
      assert.deepEqual(readManifestDependencies(manifestPath), { ajv: '^8.20.0', 'sql.js': '^1.14.2' });
    } finally {
      fx.cleanup();
    }
  });

  it('returns an empty object when the manifest has no dependencies', () => {
    const fx = makeClaudeFixture(null);
    try {
      const manifestPath = path.join(fx.claudeDir, 'package.json');
      fs.writeFileSync(manifestPath, JSON.stringify({ type: 'commonjs' }));
      assert.deepEqual(readManifestDependencies(manifestPath), {});
    } finally {
      fx.cleanup();
    }
  });

  it('returns an empty object when the manifest is missing', () => {
    const fx = makeClaudeFixture(null);
    try {
      assert.deepEqual(readManifestDependencies(path.join(fx.claudeDir, 'package.json')), {});
    } finally {
      fx.cleanup();
    }
  });
});
