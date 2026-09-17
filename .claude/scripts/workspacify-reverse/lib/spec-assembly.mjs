// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
/**
 * The origin spec, assembled from everything the run published.
 *
 * This is where the rotation's single aggregation point is made. R8 already emitted a
 * spec, but it emitted one built from the claim ledger alone, so the other twenty-eight
 * documents the run wrote — the dependency structure, the gaps, the execution surface,
 * the capability limits, the serving questions, the security lane — were readable only
 * from their own files. The measured consequence was that the next rotation read two of
 * them and nothing read the rest.
 *
 * So the spec is built from `documents`: the very map the run is about to publish. Each
 * section carries the published values of the documents it registers, whole, and the
 * projection check in the absorption test compares them against the files on disk. That
 * is what makes "the spec carries it" a fact rather than a claim — the two are the same
 * object until publication writes them out.
 *
 * The AI's design semantics enter here too, and only here: measured claims come from the
 * ledger, authored ones from the answers file, and the two meet in one spec where the
 * second can never overwrite the first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertRoundTrip, buildOriginSpec, validateOriginSpec } from './origin-spec.mjs';
import { readSemanticsFile, validateDesignSemantics } from './design-semantics.mjs';
import { SPEC_SECTIONS } from './spec-sections.mjs';

/** The decisions document, written by `run.mjs decide` rather than by a stage. */
const DECISIONS_FILE_NAME = 'DECISIONS.json';

/**
 * The spec, carrying every section and every measured claim, plus the authored ones.
 *
 * The round trip is asserted here rather than downstream because this is where the two
 * documents are made: a spec whose Markdown re-parses to something else is a spec whose
 * two files disagree, and publishing either of them would be publishing a document that
 * cannot be believed.
 */
export function buildPublishedSpec({ analysis, authoredSemantics = null }) {
  const { root, treeHash, ledger, documents, destination } = analysis;
  const claims = mergeAuthored({ ledger, authoredSemantics });
  const sections = sectionsFrom({ documents, destination, authoredSemantics });

  const spec = validateOriginSpec(
    buildOriginSpec({ root, ledger: { ...ledger, claims }, treeHash, sections }),
    { root },
  );

  if (!assertRoundTrip(spec).equal) {
    throw new Error(
      'the origin spec does not survive the round trip: its Markdown re-parses to something other than '
      + 'the sidecar that would be published beside it. A spec whose two documents disagree cannot be '
      + 'believed, so nothing is published. Report this shape; the renderer and the parser have parted.',
    );
  }
  return spec;
}

/**
 * The measured claims, with the authored readings added beside them.
 *
 * A refused file raises rather than returning a spec without its authored section: the
 * operator handed a file over, and a publication that silently omitted it would differ
 * from what they asked for in a way no document would record.
 */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function mergeAuthored({ ledger, authoredSemantics }) {
  if (authoredSemantics === null || authoredSemantics === undefined) return ledger.claims;

  const { entries, findings } = readSemanticsFile(authoredSemantics);
  if (entries === null) throw new Error(renderRefusal(findings, authoredSemantics));

  const authored = validateDesignSemantics({ authored: entries, claims: ledger.claims });
  if (authored.claims === null) throw new Error(renderRefusal(authored.findings, authoredSemantics));

  return [...ledger.claims, ...authored.claims];
}

/** A refusal as one sentence naming the file and every finding, so the operator can act. */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function renderRefusal(findings, path) {
  return `the design semantics at ${path} were refused, so nothing was published: ${findings.join('; ')}`;
}

/**
 * The section payloads, taken from the documents the run is about to publish.
 *
 * A section is recorded when the run produced at least one of the documents it registers,
 * and not run when it produced none — which is a fact about the depth of the run rather
 * than about the subject. The four sections that carry the spec's own structure are
 * recorded whenever a spec exists at all.
 */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function sectionsFrom({ documents, destination, authoredSemantics }) {
  const published = documents ?? {};
  return Object.fromEntries(
    SPEC_SECTIONS.map((entry) => {
      const carried = {};
      for (const name of entry.projects) {
        if (Object.hasOwn(published, name)) carried[name] = published[name];
      }
      const recorded = entry.always || Object.keys(carried).length > 0;
      if (!recorded) return [entry.key, null];
      return [entry.key, { documents: carried, content: contentFor(entry, { destination, authoredSemantics }) }];
    }),
  );
}

/** What a section carries besides the documents it projects, or `null` when it carries none. */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function contentFor(entry, { destination, authoredSemantics }) {
  // The decisions are written after the run publishes, by the operator answering the six
  // questions, so a re-run is what brings them into the spec. Absent means absent, and
  // the section says so rather than rendering six blanks.
  if (entry.key === 'decisions') return readDecisions(destination);
  // What the author wrote, carried verbatim: the admitted claims are what the spec acts
  // on, and this is the statement of what was asked for, which a reader comparing the
  // two needs in order to see that nothing was dropped in between.
  if (entry.key === 'design_semantics' && authoredSemantics != null) {
    const { entries } = readSemanticsFile(authoredSemantics);
    return entries === null ? null : { source: authoredSemantics, entries };
  }
  return null;
}

/** The decisions document as the run found it beside the destination, or `null`. */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function readDecisions(destination) {
  const path = join(destination, DECISIONS_FILE_NAME);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
