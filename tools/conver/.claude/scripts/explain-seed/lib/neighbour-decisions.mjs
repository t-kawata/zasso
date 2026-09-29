/**
 * Read the answers the packages at the other end of a boundary have already written down.
 *
 * A boundary names exactly one provider and one consumer, so the question one end asks is the
 * question the other end asks, and the same `contract-boundary-NNN` is asked twice across a
 * workspace. This module finds the neighbours' explanation documents and takes from each the
 * prose a person wrote under the placeholder.
 *
 * The whole of its difficulty is telling three states apart, and only one of them settles
 * anything:
 *
 *   - the neighbour has not been explained yet — ordinary, and the question stays open;
 *   - the neighbour has been explained and nobody has written — ordinary, same outcome;
 *   - the neighbour has written — this question is settled, and is not asked again.
 *
 * The safe direction is to re-ask. A document that is unreadable, or is not one this command
 * wrote, settles nothing and is named, rather than being read for whatever can be salvaged:
 * `digest.mjs` states the same rule for its own block — "absent, truncated or unreadable
 * records nothing rather than a guess".
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ExplainSeedError } from './errors.mjs';
import { EXPLAIN_FILE_NAME, locateSections } from './frame.mjs';
import { HUMAN_ITEM_HEADING, decisionUnderPlaceholder, splitItems } from './items.mjs';
import { countPlaceholdersIn } from './markers.mjs';

/** The explanation section a person writes into. */
const HUMAN_SECTION_ID = 'E5';

/**
 * The decision written for each boundary in one explanation document.
 *
 * Pure: it reads the bytes it is handed, so the whole of the parsing is testable from a
 * recorded document rather than from a workspace assembled on disk.
 *
 * @param {{ documentText: string }} input
 * @returns {Map<string, string>} the decision per boundary id, for the ids that have one
 * @throws {ExplainSeedError} when the document carries no human section, or offers more than
 *   one place to write in an item — neither is a document this command writes, and neither
 *   can be read without deciding on the person's behalf which place they meant
 */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
export function readSettledDecisions({ documentText }) {
  const humanSection = locateSections(String(documentText)).bodies[HUMAN_SECTION_ID];
  if (humanSection === undefined) {
    throw new ExplainSeedError('the explanation carries no 人間が決めること（ここだけ） section', {
      field: EXPLAIN_FILE_NAME,
    });
  }

  const decisions = new Map();
  for (const item of splitItems(humanSection, HUMAN_ITEM_HEADING)) {
    if (item.id === null) continue;
    if (countPlaceholdersIn(item.body) > 1) {
      throw new ExplainSeedError(`the explanation offers more than one place to write for ${item.id}`, {
        field: EXPLAIN_FILE_NAME,
      });
    }
    const decision = decisionUnderPlaceholder(item.body);
    if (decision !== null) decisions.set(item.id, decision);
  }
  return decisions;
}

/** Where one counterpart's explanation lives, relative to the workspace root. */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
function counterpartDocumentPath({ counterpart, pathOf }) {
  const packagePath = pathOf[counterpart];
  return packagePath === undefined ? null : join(packagePath, EXPLAIN_FILE_NAME);
}

/**
 * What one counterpart document holds.
 *
 * The three outcomes are kept apart because two of them are ordinary and one is a fault the
 * operator has to see: `absent` is the neighbour not having been explained, `decisions` is what
 * it says, and neither is `reason`, which is set only when a document exists and could not be
 * read.
 *
 * @returns {{ absent: boolean, decisions: Map<string, string>|null, reason: string|null }}
 */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
function decisionsInDocument({ root, relativePath }) {
  const absolutePath = join(root, relativePath);
  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    return { absent: true, decisions: null, reason: null };
  }
  if (!stats.isFile()) {
    return { absent: false, decisions: null, reason: 'the path exists but is not a file' };
  }

  try {
    return { absent: false, decisions: readSettledDecisions({ documentText: readFileSync(absolutePath, 'utf8') }), reason: null };
  } catch (error) {
    if (error instanceof ExplainSeedError) return { absent: false, decisions: null, reason: error.message };
    throw error;
  }
}

/**
 * Every boundary this package is a party to that a neighbour has clearly decided.
 *
 * A boundary settles only when at least one neighbour document was read and every decision
 * found for its id is byte-identical. Two differing answers are not a decision: the id is left
 * open and both documents are named, because choosing between them would be inventing the
 * agreement this function exists to report.
 *
 * @param {{ root: string, packageId: string, boundaries: Array<object>, pathOf: Record<string, string> }} input
 * @returns {{ settled: Array<{ boundary_id: string, counterpart: string, counterpart_name: string,
 *   document: string, decision: string }>, unreadable: Array<{ document: string, reason: string }> }}
 */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
export function collectSettledDecisions({ root, packageId, boundaries, pathOf }) {
  const answersByBoundary = new Map();
  const unreadable = [];
  const documentsRead = new Map();

  const nameUnreadable = (document, reason) => {
    if (!unreadable.some((entry) => entry.document === document)) unreadable.push({ document, reason });
  };

  for (const boundary of boundaries) {
    // A boundary that names this package at both ends would have this run read the document it
    // is about to write. There is no neighbour there to have answered anything.
    if (boundary.counterpart === packageId) continue;

    const relativePath = counterpartDocumentPath({ counterpart: boundary.counterpart, pathOf });
    if (relativePath === null) {
      nameUnreadable(`${boundary.counterpart} (no path recorded)`, 'the workspace manifest records no path for this package');
      continue;
    }

    if (!documentsRead.has(relativePath)) documentsRead.set(relativePath, decisionsInDocument({ root, relativePath }));
    const { absent, decisions, reason } = documentsRead.get(relativePath);
    if (absent) continue;
    if (decisions === null) {
      nameUnreadable(relativePath, reason);
      continue;
    }

    const decision = decisions.get(boundary.id);
    if (decision === undefined) continue;

    const answers = answersByBoundary.get(boundary.id) ?? new Map();
    answers.set(decision, [...(answers.get(decision) ?? []), relativePath]);
    answersByBoundary.set(boundary.id, answers);
  }

  return { settled: settle({ answersByBoundary, boundaries, pathOf, nameUnreadable }), unreadable };
}

/** The settled records, leaving every boundary that carries more than one answer open. */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
function settle({ answersByBoundary, boundaries, pathOf, nameUnreadable }) {
  const settled = [];
  for (const [boundaryId, answers] of answersByBoundary) {
    if (answers.size > 1) {
      for (const documents of answers.values()) {
        for (const document of documents) nameUnreadable(document, `${boundaryId} is answered differently in more than one document`);
      }
      continue;
    }
    const [decision, documents] = [...answers.entries()][0];
    const counterpart = boundaries.find((boundary) => boundary.id === boundaryId).counterpart;
    settled.push({
      boundary_id: boundaryId,
      counterpart,
      counterpart_name: packageNameOf(pathOf[counterpart]),
      document: documents[0],
      decision,
    });
  }
  return settled;
}

/**
 * The name a package is known by, taken from the last segment of the path the manifest gives it.
 *
 * The path is required rather than optional: a counterpart with no recorded path was reported
 * and skipped before any answer of its could reach here, so a fallback would be a branch no
 * run can take — and one that would quietly print an id where a name belongs if it ever did.
 */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
function packageNameOf(packagePath) {
  return packagePath.split('/').filter((segment) => segment !== '').pop();
}
