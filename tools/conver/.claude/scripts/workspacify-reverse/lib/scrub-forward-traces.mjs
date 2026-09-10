// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
/**
 * Removal of forward-rotation traces from an existing project.
 *
 * Removal is line-scoped by design: a line is either kept byte-for-byte or
 * dropped whole. That makes C002 checkable — the SHA-256 of the non-comment
 * lines before and after must be identical, which can only be true if nothing
 * was ever rewritten in place.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  L1_PATTERNS,
  L2_PATTERNS,
  HEADER_MARKER,
  FENCE,
  IETF_REFERENCE,
  isCommentLine,
} from './trace-patterns.mjs';
import {
  detectForwardTraces,
  detectTicketKeyedFilenames,
  resolveTargetRoot,
} from './detect-forward-traces.mjs';

/**
 * Turn a detection report into the exact removals that would be performed.
 * Only L1 and L2 are ever planned; L3 and L4 are reported but never removed.
 *
 * @param {ReturnType<typeof detectForwardTraces>} detection
 * @returns {{ removals: Array<{file: string, line: number, layer: string, text: string}> }}
 */
export function planScrub(detection) {
  const removals = [];
  for (const layerId of ['L1', 'L2']) {
    for (const finding of detection.layers[layerId].findings) {
      removals.push({ ...finding, layer: layerId });
    }
  }
  return { removals };
}

/**
 * Locate boundify header blocks.
 *
 * A block whose closing fence is missing is *protected*, not partially
 * removed: half-deleting a header would mangle the file and destroy the very
 * evidence a reviewer needs to see. It is reported instead.
 */
function findHeaderBlocks(lines, relative, warnings) {
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!HEADER_MARKER.test(lines[index])) continue;

    let start = index;
    while (start > 0 && isCommentLine(lines[start - 1])) start -= 1;
    let end = index;
    while (end + 1 < lines.length && isCommentLine(lines[end + 1])) end += 1;

    let fences = 0;
    for (let cursor = start; cursor <= end; cursor += 1) {
      if (FENCE.test(lines[cursor])) fences += 1;
    }

    if (fences < 2) {
      warnings.push({
        file: relative,
        line: index + 1,
        reason: 'unclosed header block: no closing fence, left unchanged',
      });
      blocks.push({ start, end, protected: true });
    } else {
      blocks.push({ start, end, protected: false });
    }
    index = end;
  }
  return blocks;
}

/**
 * Keep the ticket key out of a file name.
 *
 * The content digest is what makes the result unique. A constant placeholder
 * would map every keyed file onto one name and silently overwrite all but the
 * last — destroying the tests instead of renaming them.
 */
function keylessFilename(relative, content) {
  const directory = path.dirname(relative);
  const stem = path.basename(relative, '.rs').replace(/p\d+_\d+_?/g, '');
  const digest = createHash('sha256').update(content).digest('hex').slice(0, 8);
  return path.join(directory, `${stem}${digest}.rs`);
}

/**
 * Follow a rename into `Cargo.toml`.
 *
 * An explicit `[[test]] name = "..."` entry outlives the file it points at, so
 * a rename that stops at the filesystem leaves a manifest cargo refuses to
 * parse.
 */
function updateCargoTestEntries(rootPath, renames) {
  const cargoPath = path.join(rootPath, 'Cargo.toml');
  if (!existsSync(cargoPath)) return;

  const stemMap = new Map(
    renames.map((renamed) => [path.basename(renamed.from, '.rs'), path.basename(renamed.to, '.rs')]),
  );
  const lines = readFileSync(cargoPath, 'utf8').split('\n');
  let changed = false;
  const updated = lines.map((line) => {
    const match = /^(\s*name\s*=\s*")([^"]+)(".*)$/.exec(line);
    if (!match) return line;
    const replacement = stemMap.get(match[2]);
    if (!replacement) return line;
    changed = true;
    return `${match[1]}${replacement}${match[3]}`;
  });
  if (changed) writeFileSync(cargoPath, updated.join('\n'));
}

/** A production item is anything a test-only file must never contain. */
const PRODUCTION_ITEM = /^\s*pub\s+(fn|struct|enum|trait|mod|const|static|type)\b/;

/**
 * A file may be removed whole only when it is a pure test artefact.
 *
 * L3 cannot be scrubbed line-wise: dropping `let rfc_path = Path::new(...)`
 * while leaving the assertion that reads it produces code that no longer
 * compiles. Removing the enclosing test file keeps the tree buildable, and the
 * test-only precondition keeps production code out of reach.
 */
function isTestOnlyFile(lines) {
  const hasTestModule = lines.some((line) => /#\[cfg\(test\)\]/.test(line));
  if (!hasTestModule) return false;
  return !lines.some((line) => !isCommentLine(line) && PRODUCTION_ITEM.test(line));
}

/**
 * Drop string literals and trailing line comments so that brace counting sees
 * only structural braces. A brace inside a literal must not be counted, or a
 * test function's extent would be misread and the wrong range removed.
 */
function stripNonCode(line) {
  let code = '';
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '/' && line[index + 1] === '/') break;
    code += char;
  }
  return code;
}

/**
 * Locate every `#[test]` function as an inclusive line range.
 *
 * L3 inside a mixed file is removed at this granularity: removing the lines
 * that name the document alone would leave the assertions that read it, and
 * removing the whole file would delete production code.
 */
function findTestFunctionBlocks(lines) {
  const blocks = [];
  for (let start = 0; start < lines.length; start += 1) {
    if (!/^\s*#\[test\]/.test(lines[start])) continue;
    let depth = 0;
    let opened = false;
    for (let cursor = start; cursor < lines.length; cursor += 1) {
      for (const char of stripNonCode(lines[cursor])) {
        if (char === '{') {
          depth += 1;
          opened = true;
        } else if (char === '}') {
          depth -= 1;
        }
      }
      if (opened && depth === 0) {
        blocks.push({ start, end: cursor });
        start = cursor;
        break;
      }
    }
  }
  return blocks;
}

/**
 * Remove every removable trace from a target root.
 *
 * @param {string} rootPath
 * @param {{ apply?: boolean, dryRun?: boolean, renameTicketKeyedFiles?: boolean }} [options]
 * @returns {{ removed: number, files: Record<string, string[]>, writes: string[], warnings: Array<object>, renames: Array<{from: string, to: string}> }}
 */
export function scrubForwardTraces(rootPath, options = {}) {
  const { apply = false, dryRun = false, renameTicketKeyedFiles = false } = options;
  const write = apply && !dryRun;

  const target = resolveTargetRoot(rootPath);
  const detection = detectForwardTraces(rootPath);

  const linesByFile = new Map();
  for (const layerId of ['L1', 'L2']) {
    for (const finding of detection.layers[layerId].findings) {
      if (!linesByFile.has(finding.file)) linesByFile.set(finding.file, new Set());
      linesByFile.get(finding.file).add(finding.line);
    }
  }

  const warnings = [];
  const writes = [];
  const removedFiles = [];
  const files = {};
  let removed = 0;

  const l3Files = new Set(
    detection.layers.L3.findings.map((finding) => finding.file),
  );

  for (const file of target.files) {
    const lines = readFileSync(file.path, 'utf8').split('\n');

    const removable = new Set();
    const protectedLines = new Set();

    if (l3Files.has(file.relative)) {
      if (isTestOnlyFile(lines)) {
        // Whole-file removal: line-wise removal would leave uncompilable code.
        removed += lines.length;
        if (write) {
          rmSync(file.path);
          removedFiles.push(file.relative);
        }
        continue;
      }

      // Mixed file: production code must survive, so only the `#[test]` blocks
      // that read the design document are removed. Dropping the naming lines
      // alone would strand the assertions that consume them.
      const l3Lines = detection.layers.L3.findings
        .filter((finding) => finding.file === file.relative)
        .map((finding) => finding.line);
      const testBlocks = findTestFunctionBlocks(lines);
      const enclosing = (line) =>
        testBlocks.find((block) => line - 1 >= block.start && line - 1 <= block.end);

      const orphaned = l3Lines.filter((line) => !enclosing(line));
      if (orphaned.length > 0) {
        warnings.push({
          file: file.relative,
          line: orphaned[0],
          reason: 'L3 outside any #[test] function: left unchanged, needs manual review',
        });
      }

      for (const line of l3Lines) {
        const block = enclosing(line);
        if (!block) continue;
        for (let index = block.start; index <= block.end; index += 1) removable.add(index);
      }
    }

    for (const block of findHeaderBlocks(lines, file.relative, warnings)) {
      for (let index = block.start; index <= block.end; index += 1) {
        if (block.protected) protectedLines.add(index);
        else removable.add(index);
      }
    }

    for (const lineNumber of linesByFile.get(file.relative) ?? []) {
      const index = lineNumber - 1;
      if (protectedLines.has(index)) continue;
      // Safety guard: IETF standards are domain knowledge, not provenance.
      if (IETF_REFERENCE.test(lines[index])) continue;
      removable.add(index);
    }

    const kept = lines.filter((_, index) => !removable.has(index));
    files[file.relative] = kept;
    removed += removable.size;

    if (write && removable.size > 0) {
      writeFileSync(file.path, kept.join('\n'));
      writes.push(file.path);
    }
  }

  const renames = [];
  if (renameTicketKeyedFiles) {
    for (const relative of detectTicketKeyedFilenames(rootPath)) {
      const absolute = path.join(rootPath, relative);
      const to = keylessFilename(relative, readFileSync(absolute, 'utf8'));
      if (write) renameSync(absolute, path.join(rootPath, to));
      renames.push({ from: relative, to });
    }
    if (write && renames.length > 0) updateCargoTestEntries(rootPath, renames);
  }

  return { removed, files, writes, removedFiles, warnings, renames };
}

/** The patterns this module removes by — re-exported for callers that cite them. */
export const SCRUB_PATTERNS = { L1_PATTERNS, L2_PATTERNS };
