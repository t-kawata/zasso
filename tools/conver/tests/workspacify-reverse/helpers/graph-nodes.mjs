// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
/**
 * The graph node set a reverse run hands to `--graph`.
 *
 * T3 is the gate that judges grounding: every node must carry the file it is
 * grounded in, and that file must exist in the measured tree. The node set is
 * therefore not invented — it is read from the origin spec the analysis run
 * published, whose every claim names the evidence anchor it rests on
 * (`evidence[].source_span.file`). A node set built from anything else would be a
 * claim about the project that no measurement supports.
 *
 * A file is the anchor, not a claim: two claims resting on the same file are one
 * node, because T3 asks whether the file exists rather than how many claims cite
 * it. The list is sorted so the same origin spec always yields the same node
 * order, which is what makes the gate's report comparable run to run.
 */
import { readFileSync } from 'node:fs';

/** The field an evidence record names its anchor in. */
const EVIDENCE_ANCHOR_FIELD = 'source_span';

/** The field the anchor names its file in. */
const ANCHOR_FILE_FIELD = 'file';

/**
 * Every distinct file the origin spec's claims are grounded in, as `{id, file}`.
 *
 * The shape is the one `readGraphNodes` accepts: a node is an id and the file it
 * is grounded in, and nothing else survives the reader. An id is derived from the
 * file rather than from a claim, so the id is stable when the same file anchors
 * further claims in a later reading.
 *
 * @param {{specPath: string}} input - the origin spec's absolute path
 * @returns {Array<{id: string, file: string}>} one node per distinct anchor file
 */
export function buildGraphNodes({ specPath }) {
  const originSpec = JSON.parse(readFileSync(specPath, 'utf8'));
  const files = new Set();

  for (const claim of originSpec.claims ?? []) {
    for (const evidence of claim.evidence ?? []) {
      const file = evidence?.[EVIDENCE_ANCHOR_FIELD]?.[ANCHOR_FILE_FIELD];
      if (typeof file === 'string' && file.trim() !== '') {
        files.add(file);
      }
    }
  }

  return [...files].sort().map((file) => ({ id: nodeIdFor(file), file }));
}

/** A node id that names the file it grounds, so a T3 failure is readable on its own. */
// [::TICKET::] P24-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-10 --for-spec --no-implementation-order`.
function nodeIdFor(file) {
  return `grounded-${file}`;
}
