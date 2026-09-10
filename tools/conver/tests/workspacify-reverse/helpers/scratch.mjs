// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
/**
 * Shared test helpers for the workspacify-reverse suite.
 *
 * Every test that scrubs must operate on a throwaway copy: the fixtures under
 * tests/workspacify-reverse/fixtures are the single source of truth and must
 * never be mutated by a test run.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUITE_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Absolute path of the fixture project that mirrors a contaminated tree. */
export const FIXTURE_PROJECT = path.join(SUITE_ROOT, 'fixtures', 'sample-project');

/** Absolute path of a fixture holding only the pathological header case. */
export const FIXTURE_UNCLOSED_HEADER = path.join(SUITE_ROOT, 'fixtures', 'unclosed-header-project');

/** Absolute path of a fixture mixing production code with an L3 dependency. */
export const FIXTURE_MIXED_L3 = path.join(SUITE_ROOT, 'fixtures', 'mixed-l3-project');

/**
 * Copy a fixture project into a fresh temporary directory.
 * @param {string} [fixturePath] — fixture to copy; defaults to the main project
 * @returns {{ root: string, dispose: () => void }}
 */
export function createScratchFrom(fixturePath = FIXTURE_PROJECT) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'wsp-reverse-'));
  cpSync(fixturePath, root, { recursive: true });
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Copy the main contaminated fixture project into a fresh temporary directory. */
export function createScratchProject() {
  return createScratchFrom(FIXTURE_PROJECT);
}

/** Read a file as an array of lines (newline characters stripped). */
export function readLines(filePath) {
  return readFileSync(filePath, 'utf8').split('\n');
}

/** Keep only lines that are not comment-only lines. */
export function nonCommentLines(lines) {
  return lines.filter((line) => !/^\s*(\/\/|\/\/!|\/\*|\*)/.test(line));
}

/** SHA-256 of a string. */
export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * SHA-256 of every file under a root, keyed by path relative to that root.
 * Used to prove that a scrub did not touch anything outside its target.
 */
export function hashTree(root) {
  const hashes = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        hashes[path.relative(root, full)] = sha256(readFileSync(full));
      }
    }
  };
  walk(root);
  return hashes;
}

/** Write lines back to a file, preserving a trailing newline when present. */
export function writeLines(filePath, lines) {
  writeFileSync(filePath, lines.join('\n'));
}
