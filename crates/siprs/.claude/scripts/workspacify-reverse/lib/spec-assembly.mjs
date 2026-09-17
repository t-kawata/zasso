// [::TICKET::] P26-4, P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-4|P26-5) --for-spec --no-implementation-order`.
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
 * ledger, authored ones from the readings file, and the two meet in one spec where the
 * second can never overwrite the first.
 *
 * A section is recorded when it has **material of either kind** — a projected document or
 * a content payload. Deciding that from the projected documents alone left the two
 * sections whose material is authored rather than published (`## Decisions`, `## Design
 * semantics`) permanently unrecordable, so the decisions and the readings were admitted
 * as claims and the sections that explain them said the stage had not run.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assertRoundTrip, buildOriginSpec, NOT_AUTHORED_STATUS, validateOriginSpec } from './origin-spec.mjs';
import { readSemanticsFile, summariseCoverage, validateDesignSemantics } from './design-semantics.mjs';
import { SPEC_SECTIONS } from './spec-sections.mjs';

/** The decisions document, written by `run.mjs decide` rather than by a stage. */
const DECISIONS_FILE_NAME = 'DECISIONS.json';

/** The two sections whose material is authored rather than published. */
const DECISIONS_SECTION_KEY = 'decisions';
const DESIGN_SEMANTICS_SECTION_KEY = 'design_semantics';

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
  // Both authored inputs are read once and carried, rather than read again by every
  // section that wants one: the same file read twice is the same file believed twice,
  // and two reads can straddle a change to it.
  const readings = readAuthoredReadings(authoredSemantics);
  const decisions = readDecisions(destination);
  const packageNames = packageNamesOf({ ledger, decisions });
  const claims = mergeAuthored({ ledger, readings, packages: packageNames });
  const sections = sectionsFrom({ documents, decisions, readings, packages: packageNames });

  const spec = validateOriginSpec(
    buildOriginSpec({ root, ledger: { ...ledger, claims }, treeHash, sections, scopes: packageNames }),
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

/** The readings file as the operator wrote it, or `null` when none was named. */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function readAuthoredReadings(authoredSemantics) {
  if (authoredSemantics === null || authoredSemantics === undefined) return null;
  const { entries, findings } = readSemanticsFile(authoredSemantics);
  if (entries === null) throw new Error(renderRefusal(findings, authoredSemantics));
  return { path: authoredSemantics, entries };
}

/**
 * The packages the semantics is owed for.
 *
 * The partition the operator decided is the authority, and the scopes the claims carry are
 * the other half: a package that holds measurements and no declaration still owes a
 * semantics, and a declared package with no measurements owes one too.
 */
// [::TICKET::] P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-5 --for-spec --no-implementation-order`.
function packageNamesOf({ ledger, decisions }) {
  const declared = decisions?.package_boundary?.packages ?? [];
  const measured = (ledger.claims ?? []).map((claim) => claim.scope);
  return [...new Set([...declared.map((entry) => entry?.path), ...measured].filter((name) => typeof name === 'string' && name.length > 0))].sort();
}

/**
 * The measured claims, with the authored readings added beside them.
 *
 * A refused file raises rather than returning a spec without its authored section: the
 * operator handed a file over, and a publication that silently omitted it would differ
 * from what they asked for in a way no document would record.
 */
// [::TICKET::] P26-4, P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-4|P26-5) --for-spec --no-implementation-order`.
function mergeAuthored({ ledger, readings, packages }) {
  if (readings === null) return ledger.claims;

  const authored = validateDesignSemantics({ authored: readings.entries, claims: ledger.claims, packages });
  if (authored.claims === null) throw new Error(renderRefusal(authored.findings, readings.path));

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
 * A section is recorded when it has material of either kind, and not run when it has
 * none — which is a fact about the depth of the run rather than about the subject. The
 * three sections that carry the spec's own structure are recorded whenever a spec exists
 * at all.
 */
// [::TICKET::] P26-4, P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-4|P26-5) --for-spec --no-implementation-order`.
function sectionsFrom({ documents, decisions, readings, packages }) {
  const published = documents ?? {};
  return Object.fromEntries(
    SPEC_SECTIONS.map((entry) => {
      const carried = {};
      for (const name of entry.projects) {
        if (Object.hasOwn(published, name)) carried[name] = published[name];
      }
      const content = contentFor(entry, { decisions, readings, packages });
      const recorded = entry.always || Object.keys(carried).length > 0 || content !== null;
      if (recorded) return [entry.key, { documents: carried, content }];
      // The design semantics carries authored material, so its absence has a reason of
      // its own: the stage ran and the Step that writes the readings has not been taken.
      // Reporting that as a stage that did not run is what made the document lie.
      if (entry.key === DESIGN_SEMANTICS_SECTION_KEY) {
        return [entry.key, { documents: {}, content: null, status: NOT_AUTHORED_STATUS }];
      }
      return [entry.key, null];
    }),
  );
}

/**
 * What a section carries besides the documents it projects, or `null` when it carries none.
 *
 * Both content-bearing sections are records rather than dumps: what a reader needs from
 * them is *what was authored and what was left out*, with the material itself printed
 * where it belongs — the decisions as the partition they decided, the readings under the
 * package each one is about.
 */
// [::TICKET::] P26-4, P26-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P26-4|P26-5) --for-spec --no-implementation-order`.
function contentFor(entry, { decisions, readings, packages }) {
  // The decisions are written after the run publishes, by the operator answering the six
  // questions, so a re-run is what brings them into the spec. Absent means absent, and
  // the section says so rather than rendering six blanks.
  if (entry.key === DECISIONS_SECTION_KEY) return decisions;
  if (entry.key === DESIGN_SEMANTICS_SECTION_KEY && readings !== null) {
    return { source: readings.path, coverage: summariseCoverage({ authored: readings.entries, packages }) };
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
