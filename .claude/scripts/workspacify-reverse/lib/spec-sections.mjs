// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
/**
 * The spec's sections — the one declaration that makes absorption checkable.
 *
 * The reverse rotation publishes a document set, and until this existed nothing said
 * which of those documents the spec was supposed to carry. The measured consequence was
 * that two were read downstream, nine were named in the procedure, and twenty were named
 * nowhere at all: written, published, and read by no one. A finding nobody reads is a
 * finding the next command cannot act on, and no test could fail on it because each test
 * supplied the shape it expected.
 *
 * So the list is declared here, once, and three questions are answered from it:
 * which documents a section carries verbatim, which are derived from the spec, and which
 * two files *are* the spec. A document in none of the three is unregistered, and
 * `findUnregisteredDocuments` reports it by name.
 *
 * Carrying a document means carrying it whole. A section that carried a summary would
 * need a rule for what the summary left out, and that rule is the defect returning under
 * another name — so `documents` holds the published value itself, and the projection
 * check is deep equality against the file the run wrote.
 */

/**
 * One section, as the registry declares it.
 *
 * `always` marks the four sections that carry the spec's own structure rather than a
 * stage's output: the scope of the run, the packages the claims are scoped to, the
 * counts derived from those claims, and the demotions. They are recorded whenever a
 * spec exists, because a spec that held claims and reported no packages would be
 * describing its own content as a stage that never ran.
 */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function section({ key, heading, stage, projects = [], always = false }) {
  return Object.freeze({ key, heading, stage, projects: Object.freeze([...projects]), always });
}

/**
 * Every section the spec carries, in the order the document renders them.
 *
 * The order is the reading order a person needs, not the order the stages ran: what the
 * subject is, what it is made of, what it does, what is missing, what would prove it, and
 * what a human still has to decide. `stage` names the stage whose absence makes a section
 * an explicit absence rather than an empty one, and is `null` for a section that is
 * always populated — the scope of the run, the counts, the demotions.
 */
export const SPEC_SECTIONS = Object.freeze([
  section({ key: 'scope', heading: 'Scope', stage: null, always: true, projects: ['ANALYSIS-SCOPE.json', 'R0-R2-REPORT.md'] }),
  section({ key: 'boundary', heading: 'Boundary', stage: 'r1', projects: ['PATTERN.json', 'SCOPE-BOUNDARY.json', 'ELIGIBILITY.json'] }),
  section({ key: 'dependencies', heading: 'Dependencies', stage: 'r2.5', projects: ['STRUCTURE.json', 'DEPENDENCIES.json', 'DYNAMIC-COUPLING.json'] }),
  section({ key: 'execution_surface', heading: 'Execution surface', stage: 'r2.5', projects: ['EXECUTION-SURFACE.json'] }),
  section({ key: 'packages', heading: 'Packages', stage: 'r3.5', always: true, projects: ['CLAIM-LEDGER.json'] }),
  section({ key: 'history', heading: 'History', stage: 'r4', projects: ['HISTORY-PROVENANCE.json'] }),
  section({ key: 'gaps', heading: 'Gaps', stage: 'r5', projects: ['GAPS.json', 'GAP-CANDIDATE.json'] }),
  section({ key: 'reconstruction', heading: 'Reconstruction', stage: 'r5.5', projects: ['RED-RECONSTRUCTION-PLAN.json', 'COUNTEREXAMPLE-RESULTS.json', 'GENERATED-PROPERTIES.json', 'ORACLE-GAP.json'] }),
  section({ key: 'serving', heading: 'Serving', stage: 'r7', projects: ['R7-SERVING.md', 'SECURITY-LANE.json', 'R7-SECURITY-LANE.md', 'ADJUDICATION-CANDIDATES.json', 'R7-ADJUDICATION.md'] }),
  section({ key: 'capability', heading: 'Capability', stage: 'r8', projects: ['CAPABILITY-PROFILE.json', 'CAPABILITY-MATRIX.json', 'ANALYSIS-ATTEMPTS.json'] }),
  section({ key: 'terminal_state', heading: 'Terminal state', stage: null, projects: ['TERMINAL-STATE.json'] }),
  section({ key: 'decisions', heading: 'Decisions', stage: null }),
  section({ key: 'design_semantics', heading: 'Design semantics', stage: 'r8' }),
  section({ key: 'provenance', heading: 'Provenance', stage: null, always: true }),
  section({ key: 'demotions', heading: 'Demotions', stage: null, always: true }),
]);

/**
 * The documents a run computes *from* the spec rather than carrying inside it.
 *
 * The candidate is the spec reduced to what the answer key's comparison consumes, so it
 * is a function of the spec and would be a copy of it if it were carried as well. Naming
 * it here is what keeps `findUnregisteredDocuments` from reporting it as an orphan while
 * keeping the promise honest: it is derived, and `derived` says so.
 */
export const DERIVED_DOCUMENTS = Object.freeze([
  Object.freeze({ name: 'ORIGIN-SPEC-CANDIDATE.json', from: 'packages' }),
]);

/**
 * The documents every run publishes, whatever the subject turned out to hold.
 *
 * The rest are conditional by design: a stage that produced nothing publishes nothing,
 * because a document set that changed shape with what was found would make the finding
 * into a gate. So `findUnpublishedProjections` reports only these — a registry that
 * demanded the conditional ones would refuse every subject too small to exercise a lane,
 * which is the same refusal-of-incompleteness the design forbids.
 */
export const REQUIRED_DOCUMENTS = Object.freeze([
  'ANALYSIS-SCOPE.json',
  'R0-R2-REPORT.md',
  'PATTERN.json',
  'SCOPE-BOUNDARY.json',
  'ELIGIBILITY.json',
  'ANALYSIS-ATTEMPTS.json',
  'CAPABILITY-MATRIX.json',
]);

/** The two files that are the spec, rather than documents a section carries. */
export const SPEC_SELF_DOCUMENTS = Object.freeze(['ORIGIN-LONG-SPEC.json', 'ORIGIN-LONG-SPEC.md']);

/** The headings, in rendered order. */
export function sectionHeadings() {
  return SPEC_SECTIONS.map((entry) => entry.heading);
}

/** The section a document belongs to, as a list because a document may be carried and derived. */
export function specSectionsFor(documentName) {
  return SPEC_SECTIONS.filter((entry) => entry.projects.includes(documentName));
}

/** Every document name this registry accounts for, in declared order. */
export function registeredDocumentNames() {
  return [
    ...SPEC_SECTIONS.flatMap((entry) => entry.projects),
    ...DERIVED_DOCUMENTS.map((entry) => entry.name),
    ...SPEC_SELF_DOCUMENTS,
  ];
}

/**
 * The published documents nothing accounts for.
 *
 * Reported by name rather than counted: the finding is *which* document was written for
 * nobody, and a count would leave the operator to diff two lists by hand.
 */
export function findUnregisteredDocuments(publishedNames) {
  const registered = new Set(registeredDocumentNames());
  return [...publishedNames].filter((name) => !registered.has(name)).sort();
}

/**
 * The documents a run must have published and did not.
 *
 * The other direction of the same check, and a different defect: a section promising a
 * document the subject was too small to produce is a promise the spec does not keep, and
 * it would otherwise be found by a reader who went looking for a file that was never
 * there. Only the required set is demanded — see `REQUIRED_DOCUMENTS`.
 */
export function findUnpublishedProjections(publishedNames) {
  const published = new Set(publishedNames);
  return REQUIRED_DOCUMENTS.filter((name) => !published.has(name)).sort();
}

/** Every registered projection the run did not publish, required or not. */
export function findAbsentProjections(publishedNames) {
  const published = new Set(publishedNames);
  return SPEC_SECTIONS.flatMap((entry) => entry.projects).filter((name) => !published.has(name)).sort();
}

/** The stage a section waits on, or the statement that it waits on none. */
export function sectionStage(heading) {
  return SPEC_SECTIONS.find((entry) => entry.heading === heading)?.stage ?? null;
}
