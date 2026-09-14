// [::TICKET::] PX-198, PX-200, PX-201 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-200|PX-198) --for-spec --no-implementation-order`.
// PX-198 @verifies C001 C002
/**
 * Failure advice.
 *
 * A gate failure is read by an AI agent that must repair the input without guessing.
 * Every failure therefore carries three things in plain English: what the gate found
 * (already in the gate's own message), why it matters for the workspace, and the
 * concrete steps that make the verification pass again — naming the artefact to edit
 * and the command to re-run.
 */

/** Per-gate advice: why the check exists and the steps that satisfy it. */
const ADVICE = Object.freeze({
  G0: {
    why: 'stage 2 cannot start from a manifest it cannot trust, so it refuses to read anything else.',
    how: [
      'Confirm you passed the WORKSPACIFY-TREE-MANIFEST.json that stage 1 published (the JSON file, not the spec or a directory).',
      'Re-run /workspacify-tree for the specification to republish a manifest, or pass the correct manifest path.',
      'Run "node .claude/scripts/workspacify-allocate/run.mjs validate <manifest>" again and continue only when it prints status PASS.',
    ],
  },
  'G0.1': {
    why: 'the manifest must be machine-readable before any of its claims can be checked.',
    how: [
      'Open the manifest and repair the JSON syntax at the reported position (a truncated write or a hand edit is the usual cause).',
      'If the file was hand-edited, re-run /workspacify-tree so the manifest is regenerated from the specification and the decisions.',
      'Re-run validate; a repaired manifest prints status PASS.',
    ],
  },
  'G0.3': {
    why: 'every source reference a seed cites is anchored to the specification bytes, so the spec must still hash to the recorded value.',
    how: [
      'Keep the original specification next to the manifest, unmodified, under the name recorded in input.spec_path.',
      'If the specification legitimately changed, re-run /workspacify-tree so a new manifest records the new hash.',
      'Re-run validate and confirm the reported source hash matches the manifest.',
    ],
  },
  G2: {
    why: 'the directory plan, the package catalog and the ownership table must agree before anything is written to disk.',
    how: [
      'Read the reported path or package and correct the stage-1 decision input (tree leaves must match package paths one for one).',
      'Re-run /workspacify-tree so the manifest is republished, then re-run plan.',
      'Only continue when plan prints status PASS with the expected directory count.',
    ],
  },
  'G2.2': {
    why: 'a path that leaves the workspace root or crosses a symlink could write outside the workspace.',
    how: [
      'Remove the offending path from the stage-1 workspace tree, or replace the symlink with a real directory.',
      'Re-run /workspacify-tree to republish the manifest, then re-run plan.',
    ],
  },
  'G2.4': {
    why: 'this command only builds a fresh workspace; it never merges into or overwrites existing content.',
    how: [
      'Move or delete the existing directory the message names, or choose a fresh workspace root.',
      'Re-run plan; it passes once every planned path is absent or an empty directory.',
    ],
  },
  G3: {
    why: 'the decisions payload is the only channel for AI-authored content, so it must satisfy the schema before anything is rendered.',
    how: [
      'Fix the decisions JSON as reported: every seed_required package needs one entry with authoring sections 4-13 and, for each declared boundary, a contract edge whose clauses cover the boundary scope.',
      'Do not author sections 1, 2, 3 or 14 - the machine injects them, and supplying them is itself a failure.',
      'Re-run gate with the corrected payload.',
    ],
  },
  'G3.1': {
    why: 'section 1 is the machine-injected proof of where the directory sits in the system; a wrong reference makes it a lie.',
    how: [
      'Do not edit section 1: it is generated from the manifest and the files on disk.',
      'Restore the co-located specification, or republish the manifest with /workspacify-tree when the specification changed.',
      'Re-run gate; the reference block is rebuilt on every render.',
    ],
  },
  'G3.2': {
    why: 'a contract that does not match a declared boundary cannot be honoured by both sides.',
    how: [
      'Author a contract edge for every boundary that touches this package, and none for boundaries that do not.',
      'Copy the contract_id from the authoring packet ("packet" subcommand) to avoid typos.',
      'Re-run gate.',
    ],
  },
  'G3.5': {
    why: 'material that no seed carries would silently disappear from the workspace.',
    how: [
      'Add the reported segments or inventory items to the seed that owns them: extend that package authoring sections and its allocation index.',
      'If a segment carries no material, it needs no reference; only segments with a non-empty owned_inventory_ids must be referenced.',
      'Re-run gate and confirm the coverage line reports zero uncovered segments.',
    ],
  },
  'G3.6': {
    why: 'a seed whose structure or body is wrong cannot be parsed, so nothing downstream can verify it.',
    how: [
      'Keep the 14 required headings in order and give every section a non-empty body (use "not_applicable - <reason>" when nothing applies).',
      'Supply the authoring sections 4-13 for this package and remove any machine section from the payload.',
      'Re-run gate.',
    ],
  },
  'G3.7': {
    why: 'the self-grill loop is what decides seed quality, so its record must show that every focus ran, that the loop converged and that each unresolved question reached the seed that must answer it. A residual that stops at the payload is a question nobody will ever answer.',
    how: [
      'Read the reported artefact: the message names the focus, the pass, the residual id or the candidate id that failed.',
      'Record self_grill.rounds for implementer, counterpart, test, grill and adversarial, with a reason wherever a focus is not_applicable; the adversarial pass must actually run when the workspace declares a boundary.',
      'State self_grill.converged: true and make sure the last pass lists no new finding - convergence is the evidence that the loop finished.',
      'Carry every stage-1 residual into self_grill.residual verbatim: same candidate_id, same topic, plus the grill_question the human grill will answer. Copy them from the stage-1 manifest hand-off; do not reword.',
      'Re-run gate. Answering these is your own work in this session: never ask a human now, because the canonical per-directory grill runs later.',
    ],
  },
  G4: {
    why: 'a coupling contract only holds when both directories state it; one-sided or diverging contracts mean the workspace would be built against two different interfaces.',
    how: [
      'Open the reported contract and make both sides identical apart from the direction label: same clauses, same owners, same source refs.',
      'If one side is missing the contract entirely, add it to that package using the contract_id from the packet.',
      'Re-run gate and confirm the bilateral symmetry line reports no mismatch.',
    ],
  },
  G5: {
    why: 'the cross-directory graph is the workspace-level proof: a violation there means two directories cannot actually be implemented together.',
    how: [
      'Read the reported violation class and the contract or package it names, then correct the coupling contract that produced it.',
      'For an ordering violation, align the seed with the implementation_order the stage-1 manifest proved; never invent an order.',
      'Re-run gate; the graph summary must report zero violations.',
    ],
  },
  'G6.1': {
    why: 'the staged set must equal the published set, otherwise debris would be published with the workspace.',
    how: [
      'Remove the unexpected staged entries the message names (the run only stages planned directories, one seed per package and the allocate manifest).',
      'Re-run finalize; staging is rebuilt from scratch.',
    ],
  },
  'G6.4': {
    why: 'the published tree must match the plan exactly, so a missing or extra directory means the publish did not complete.',
    how: [
      'Compare the reported directories with the plan and remove anything extra from the workspace root.',
      'Re-run finalize in a fresh workspace root if the tree was damaged.',
    ],
  },
  'G6.5': {
    why: 'the reload pass proves the published artefacts still satisfy every gate; a divergence means something changed after verification.',
    how: [
      'Do not edit seeds or the allocate manifest after publication; regenerate them by re-running finalize in a fresh workspace.',
      'If the divergence names a seed, re-run gate first: the same defect is usually visible there with a more specific message.',
      'Re-run finalize and confirm the reload line reports PASS.',
    ],
  },
  'G6.6': {
    why: 'publication is atomic: a failure here means nothing was written, so the workspace is unchanged.',
    how: [
      'Resolve the reported destination conflict (an existing non-empty directory or an unwritable root).',
      'Re-run finalize; a failed finalize never leaves a partial workspace.',
    ],
  },
  GENERAL: {
    why: 'an unexpected failure means the command could not classify the problem.',
    how: [
      'Re-run the same subcommand to confirm the failure is reproducible.',
      'Check that the manifest and the specification are readable and unmodified, then re-run validate.',
    ],
  },
});

/**
 * Build the advice lines for a failure.
 *
 * @param {{ gateId?: string, reason?: string, stage?: string }} input
 * @returns {string[]} English sentences: what happened, why it matters, how to fix
 */
export function adviseFailure({ gateId, reason, stage = 'workspacify-allocate' } = {}) {
  const table = stage === 'workspacify-tree' ? TREE_ADVICE : ADVICE;
  const advice = table[gateId] ?? table.GENERAL;
  const lines = [
    `What happened: ${stage} stopped at gate ${gateId ?? 'GENERAL'}. ${reason ?? 'no reason was reported'}`,
    `Why this matters: ${advice.why}`,
    'How to fix it:',
    ...advice.how.map((step) => `  - ${step}`),
  ];
  return lines;
}

/**
 * Stage-1 advice.
 *
 * The gate ids are shared between the two stages but the artefacts are not: stage 1
 * repairs a decisions payload and a workspace design, stage 2 repairs seeds. Advising
 * stage 1 with stage-2 words would send the AI to edit a file that does not exist yet.
 */
const TREE_ADVICE = Object.freeze({
  G0: {
    why: 'the specification must be the exact bytes the gates verified, or every source reference in the manifest would point at text that no longer exists.',
    how: [
      'Pass the specification file itself (a regular, readable, non-empty UTF-8 file), not a directory or an edited copy.',
      'Re-run "node .claude/scripts/workspacify-tree/run.mjs parse <spec>" and continue only when it reports reconstruction PASS.',
    ],
  },
  G1: {
    why: 'the segments are the addresses every later check uses, so they must recombine into the original bytes exactly.',
    how: [
      'Normalize the specification to UTF-8 with LF line endings and keep the file unchanged while the run is in progress.',
      'Re-run parse; a mismatch means the file changed between reading it and verifying it.',
    ],
  },
  G2: {
    why: 'a candidate that is neither confirmed nor approved leaves the inventory ambiguous, and an ambiguous inventory cannot prove that nothing was omitted.',
    how: [
      'Review the extraction report the extract subcommand printed and list the REVIEW_REQUIRED and unresolved candidates.',
      'Record an approvals entry (decisionId, rationale, approver) for every candidate you accept, and correct the ones the extractor misfiled.',
      'Re-run gate; the finalAudit line reports how many candidates still require review.',
    ],
  },
  G3: {
    why: 'the workspace design has an inconsistency only the AI can settle: an owner assigned twice, a package with no responsibility, or an observation about the specification or the dependency graph that nobody answered. The manifest is the only input stage 2 receives, so an unanswered observation would travel silently into every RFC seed.',
    how: [
      'Read the reported reason: it names the package, candidate id or edge that failed, and the finalAudit counts say how many are left.',
      'Answer every dependency_reviews candidate with a decision (keep, replace_with_port, merge, split or residual) and a rationale; residual also needs why_unresolved. Replace_with_port is only valid once the edge and its boundary are gone from the payload.',
      'Settle every structure.spec_pulse candidate in spec_defects or residual_questions. Answering is your own work in this session: never ask a human now, because the per-directory grill happens later.',
      'Give every package a non-empty responsibilities list and make the tree leaves match the package paths one for one.',
      'Re-run gate and continue only when it prints COMPLETE.',
    ],
  },
  G4: {
    why: 'the dependency graph is the workspace build order: a cycle or an edge to an unknown package makes the implementation order unprovable, and stage 2 publishes that order as the plan.',
    how: [
      'Open the reported cycle or unknown endpoint and correct the dependencies array: every from/to must name a package id in the workspace catalog.',
      'Break each cycle by removing the weaker direction, or by introducing the port the forbidden alternative names.',
      'Re-run gate and confirm cycle_count and unknown_dependency_count are zero.',
    ],
  },
  G5: {
    why: 'the manifest is only published when it is complete and self-consistent: a half-verified manifest would be consumed by stage 2 as if it were proven.',
    how: [
      'Fix what the reported acceptance error names - usually a stage-2 requirement the manifest does not satisfy yet.',
      'Re-run gate, then finalize. Nothing is published while the check fails, and an existing manifest is left untouched.',
    ],
  },
  GENERAL: {
    why: 'the run stopped before publishing, so no manifest was written and no existing one was changed.',
    how: [
      'Read the reported reason and fix the decisions payload it points at.',
      'Re-run the failing subcommand; use "node .claude/scripts/workspacify-tree/run.mjs parse <spec>" to check the input first.',
    ],
  },
});

/**
 * Gate ids that carry dedicated advice (used by the tests and the docs).
 *
 * @param {{ stage?: string }} [options] - which stage's table to list
 */
export function advisedGateIds({ stage = 'workspacify-allocate' } = {}) {
  return Object.keys(stage === 'workspacify-tree' ? TREE_ADVICE : ADVICE);
}
