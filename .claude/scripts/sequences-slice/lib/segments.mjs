/**
 * The line coordinate, and the measurement that rejects it as an identity.
 *
 * The join is built in two steps: each package's RFC-SEED.md carries `source_segments`,
 * an array of segment ids, and the tree manifest's structure.segments resolves each id to
 * a line range. The array carries ids and not ranges — an earlier reading of this ticket
 * took it for ranges, which is the kind of mistake that produces a join that looks total
 * and answers nothing.
 *
 * It is kept because it is a totality check of real value: every operation, entry and step
 * falls inside some package's claimed lines. It is not used as an identity, and the
 * measurement below is the reason, recorded as numbers rather than as an argument.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The fence that opens a JSON block inside a seed document. */
const JSON_FENCE = /```json\r?\n([\s\S]*?)```/g;

/** The directory beneath a workspace root that holds its packages. */
export const PACKAGE_ROOT_DIRECTORY = 'crates';

/** The seed document each package directory carries its source_segments in. */
const SEED_FILENAME = 'RFC-SEED.md';

/** The field names the tree manifest carries, which are not the names used here. */
const MANIFEST_LINE_START_FIELD = 'line_start';
const MANIFEST_LINE_END_FIELD = 'line_end';

/**
 * The manifest's segments, in this module's spelling.
 *
 * WORKSPACIFY-TREE-MANIFEST.json carries line_start and line_end; the join speaks
 * lineStart and lineEnd. Converting at the boundary is not a formality: a reader that
 * assumed the manifest's spelling produced an undefined range, looped zero times, and
 * reported that the key claims none of the specification's lines — a confident zero where
 * the truth was 15969. So the conversion is a named function with its own tests, and a
 * segment carrying no range is rejected by id rather than read as an empty one.
 *
 * @param {Array<{ id?: string, line_start?: number, line_end?: number }>} manifestSegments
 * @returns {Array<{ id: string, lineStart: number, lineEnd: number }>}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function normalizeStructureSegments(manifestSegments) {
  return manifestSegments.map((segment) => {
    if (typeof segment?.id !== 'string' || segment.id.length === 0) {
      throw new Error('a structure segment carries no id');
    }
    const lineStart = segment[MANIFEST_LINE_START_FIELD];
    const lineEnd = segment[MANIFEST_LINE_END_FIELD];
    if (!Number.isInteger(lineStart) || !Number.isInteger(lineEnd)) {
      throw new Error(`structure segment ${segment.id} carries no line range`);
    }
    return { id: segment.id, lineStart, lineEnd };
  });
}

/**
 * The segment ids a seed document's source_segments block carries, or nothing.
 *
 * A document with no such block, with a block that does not parse, or with a
 * source_segments that is not an array of strings records nothing rather than a guess: a
 * guessed empty array reads as "this package claims no lines", which is a claim about the
 * workspace, while null reads as "this document did not say", which is the truth.
 *
 * @param {string} rfcSeedText
 * @returns {string[]|null}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function readSourceSegments(rfcSeedText) {
  if (typeof rfcSeedText !== 'string') return null;

  JSON_FENCE.lastIndex = 0;
  let match;
  while ((match = JSON_FENCE.exec(rfcSeedText)) !== null) {
    let parsed;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const segmentIds = parsed?.source_segments;
    if (Array.isArray(segmentIds) && segmentIds.every((id) => typeof id === 'string')) {
      return [...segmentIds];
    }
  }
  return null;
}

/**
 * The line ranges the given segment ids resolve to, in the order given.
 *
 * Ids the manifest does not carry are left out here and reported by findUnknownSegmentIds,
 * so that a seed naming a segment that no longer exists is a finding rather than a hole.
 *
 * @param {string[]} segmentIds
 * @param {Map<string, { id: string, lineStart: number, lineEnd: number }>} segmentsById
 * @returns {Array<{ id: string, lineStart: number, lineEnd: number }>}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function resolveSegmentLineRanges(segmentIds, segmentsById) {
  return segmentIds
    .filter((id) => segmentsById.has(id))
    .map((id) => {
      const segment = segmentsById.get(id);
      return { id, lineStart: segment.lineStart, lineEnd: segment.lineEnd };
    });
}

/**
 * The segment ids no manifest segment carries.
 *
 * @param {string[]} segmentIds
 * @param {Map<string, unknown>} segmentsById
 * @returns {string[]}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function findUnknownSegmentIds(segmentIds, segmentsById) {
  return segmentIds.filter((id) => !segmentsById.has(id));
}

/**
 * Measure what the line-range key claims, and how little it separates.
 *
 * The two numbers that matter are the claimed line count, which shows the key is total,
 * and the multi-claimed line count, which shows it is not selective. Reporting only the
 * first would make the key look sound.
 *
 * @param {{
 *   packageSegments: Array<{ packagePath: string, segmentIds: string[] }>,
 *   structureSegments: Array<{ id: string, lineStart: number, lineEnd: number }>,
 *   specLines: number,
 * }} input
 * @returns {{
 *   claimedLineCount: number,
 *   multiClaimedLineCount: number,
 *   unclaimedLineCount: number,
 *   unusedSegmentIds: string[],
 *   singlyClaimedSegmentIds: string[],
 *   segmentsUsedByMoreThanOnePackage: number,
 *   maxClaimantsOnOneSegment: number,
 *   packagesWithNoSegments: Array<{ packagePath: string, segmentIds: string[] }>,
 * }}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function measureLineRangeJoin({ packageSegments, structureSegments, specLines }) {
  const segmentsById = new Map(structureSegments.map((segment) => [segment.id, segment]));
  const claimantsByLine = new Map();
  const claimantsBySegment = new Map();

  for (const entry of packageSegments) {
    for (const segmentId of entry.segmentIds) {
      if (!segmentsById.has(segmentId)) continue;
      claimantsBySegment.set(segmentId, (claimantsBySegment.get(segmentId) ?? 0) + 1);

      const segment = segmentsById.get(segmentId);
      for (let line = segment.lineStart; line <= segment.lineEnd; line += 1) {
        claimantsByLine.set(line, (claimantsByLine.get(line) ?? 0) + 1);
      }
    }
  }

  const claimantCounts = [...claimantsBySegment.values()];
  return {
    claimedLineCount: claimantsByLine.size,
    multiClaimedLineCount: [...claimantsByLine.values()].filter((claimants) => claimants > 1).length,
    unclaimedLineCount: specLines - claimantsByLine.size,
    unusedSegmentIds: structureSegments.filter((segment) => !claimantsBySegment.has(segment.id)).map((segment) => segment.id).sort(),
    singlyClaimedSegmentIds: [...claimantsBySegment.entries()].filter(([, claimants]) => claimants === 1).map(([id]) => id).sort(),
    segmentsUsedByMoreThanOnePackage: claimantCounts.filter((claimants) => claimants > 1).length,
    maxClaimantsOnOneSegment: claimantCounts.length === 0 ? 0 : Math.max(...claimantCounts),
    packagesWithNoSegments: packageSegments.filter((entry) => entry.segmentIds.length === 0),
  };
}

/**
 * Every package seed document under the manifest root, as package and segment ids.
 *
 * A seed document that carries no source_segments block is read as claiming no segment
 * rather than skipped: skipping it would remove the package from the denominator, and ten
 * packages claiming nothing is one of the findings this calibration exists to report.
 *
 * @param {string} packageRoot
 * @returns {Array<{ packagePath: string, segmentIds: string[] }>}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function readPackageSegments(packageRoot) {
  if (!fs.existsSync(packageRoot)) return [];

  const packageSegments = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name === SEED_FILENAME) {
        const segmentIds = readSourceSegments(fs.readFileSync(fullPath, 'utf8'));
        packageSegments.push({ packagePath: path.relative(packageRoot, directory), segmentIds: segmentIds ?? [] });
      }
    }
  };
  walk(packageRoot);
  return packageSegments.sort((left, right) => left.packagePath.localeCompare(right.packagePath));
}
