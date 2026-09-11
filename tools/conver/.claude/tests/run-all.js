#!/usr/bin/env node
/**
 * Run all tests
 *
 * Usage: node tests/run-all.js
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testsDir = __dirname;
const conftestDir = path.resolve(testsDir, '..');
const repoRoot = path.resolve(testsDir, '../..');
const TEST_GLOB = 'tests/**/*.test.{js,cjs}';

/** Matches paths like tests/foo.test.js, tests/foo/bar.test.cjs */
function matchesTestGlob(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  if (typeof path.matchesGlob === 'function') {
    return path.matchesGlob(normalized, TEST_GLOB);
  }

  return /^tests\/(?:.+\/)?[^/]+\.test\.(?:js|cjs)$/.test(normalized);
}

function walkFiles(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, acc);
    } else if (entry.isFile()) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function discoverTestFiles() {
// [::TICKET::] PX-204 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-204 --for-spec --no-implementation-order`.
  // Discover tests from .claude/tests/ (legacy location)
  const legacyFiles = walkFiles(testsDir)
    .map(fullPath => path.relative(conftestDir, fullPath))
    .filter(matchesTestGlob)
    .map(relPath => path.relative(testsDir, path.join(conftestDir, relPath)));

  // Discover tests from project-level tests/ (rfc-graph tests, etc.)
  const projectTestsDir = path.join(repoRoot, 'tests');
  const projectFiles = fs.existsSync(projectTestsDir)
    ? walkFiles(projectTestsDir)
        .map(fullPath => path.relative(repoRoot, fullPath))
        .filter(matchesTestGlob)
        .map(repoRelPath => path.resolve(repoRoot, repoRelPath))
    : [];

  return [...legacyFiles, ...projectFiles].sort();
}

const testFiles = discoverTestFiles();

const BOX_W = 58; // inner width between ║ delimiters
const boxLine = s => `║${s.padEnd(BOX_W)}║`;

process.stdout.write('╔' + '═'.repeat(BOX_W) + '╗' + '\n');
process.stdout.write(boxLine('           Everything Claude Code - Test Suite') + '\n');
process.stdout.write('╚' + '═'.repeat(BOX_W) + '╝' + '\n');
process.stdout.write('\n');

if (testFiles.length === 0) {
  process.stdout.write(`✗ No test files matched ${TEST_GLOB}` + '\n');
  process.exit(1);
}

let totalPassed = 0;
let totalFailed = 0;
let totalTests = 0;

for (const testFile of testFiles) {
  // testFile may be relative (legacy) or absolute (project-level)
  const testPath = path.isAbsolute(testFile) ? testFile : path.join(testsDir, testFile);
  const displayPath = testFile.split(path.sep).join('/');

  if (!fs.existsSync(testPath)) {
    process.stdout.write(`WARNING Skipping ${displayPath} (file not found)` + '\n');
    continue;
  }

  process.stdout.write(`\n━━━ Running ${displayPath} ━━━` + '\n');

  const result = spawnSync('node', [testPath], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';

  // Show both stdout and stderr so hook warnings are visible
  if (stdout) process.stdout.write(stdout + '\n');
  if (stderr) process.stdout.write(stderr + '\n');

  // Parse results from combined output
  const combined = stdout + stderr;
  const passedMatch = combined.match(/Passed:\s*(\d+)/);
  const failedMatch = combined.match(/Failed:\s*(\d+)/);

  if (passedMatch) totalPassed += parseInt(passedMatch[1], 10);
  if (failedMatch) totalFailed += parseInt(failedMatch[1], 10);

  if (result.error) {
    process.stdout.write(`✗ ${displayPath} failed to start: ${result.error.message}` + '\n');
    totalFailed += failedMatch ? 0 : 1;
    continue;
  }

  if (result.status !== 0) {
    process.stdout.write(`✗ ${displayPath} exited with status ${result.status}` + '\n');
    totalFailed += failedMatch ? 0 : 1;
  }
}

totalTests = totalPassed + totalFailed;

process.stdout.write('\n╔' + '═'.repeat(BOX_W) + '╗' + '\n');
process.stdout.write(boxLine('                     Final Results') + '\n');
process.stdout.write('╠' + '═'.repeat(BOX_W) + '╣' + '\n');
process.stdout.write(boxLine(`  Total Tests: ${String(totalTests).padStart(4)}`) + '\n');
process.stdout.write(boxLine(`  Passed:      ${String(totalPassed).padStart(4)}  ✓`) + '\n');
process.stdout.write(boxLine(`  Failed:      ${String(totalFailed).padStart(4)}  ${totalFailed > 0 ? '✗' : ' '}`) + '\n');
process.stdout.write('╚' + '═'.repeat(BOX_W) + '╝' + '\n');

process.exit(totalFailed > 0 ? 1 : 0);
