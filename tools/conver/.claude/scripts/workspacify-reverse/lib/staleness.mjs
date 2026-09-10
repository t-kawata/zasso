// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
/**
 * Staleness propagation — the instrument the evolution loop reads.
 *
 * A canonical record is only as current as the artefacts it was read from. When
 * a dependency, a configuration, a schema or an external contract moves on, the
 * record keeps its shape and quietly stops describing the code (F13). Nothing
 * throws, nothing turns red, and the next reader treats a stale claim as a
 * current one. This module is the signal that was missing.
 *
 * The design decision it implements is the "Option 2.5-refined" ruling at
 * ABOUT-REVERSE 6.12.2: the authority for uncertainty sits in the reverse
 * sidecar, and the sidecar holds the forward references *together with their
 * hashes*. No field is added to any forward artefact — `*-GRAPH.json` and
 * `*-Dirs-Tree.json` are untouched — and a change is still detectable, because
 * the recorded hash no longer matches the artefact it names.
 *
 * Two properties are load-bearing:
 *
 *   - **A comparison that could not be made is never reported as freshness.**
 *     An input that cannot be hashed, and a claim whose recorded hash is not a
 *     hash, both produce a finding. Silence there is the whole failure mode: a
 *     claim that stopped being checked would read exactly like a claim that was
 *     checked and found current.
 *   - **Staleness never cancels `COMPLETE`.** The two are independent axes.
 *     `COMPLETE` is a value the forward rotation already reads; staleness is a
 *     reverse-rotation concept. A reverse-only signal able to change a forward
 *     verdict would break the one thing this phase may not break.
 *
 * A claim that records no hashes is not stale. That is a normal branch rather
 * than an error path: the common case of a claim that lives outside the sidecar
 * needs no special handling, and reporting it would drown the real signal.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { sha256Hex } from './regression-gate.mjs';

/** The reverse sidecar holding the claims and their recorded forward references. */
export const CLAIM_LEDGER_FILE_NAME = 'CLAIM-LEDGER.json';

/** The sidecar this module's output is the authority for (ABOUT-REVERSE 6.12.3). */
export const STALENESS_INDEX_FILE_NAME = 'STALENESS-INDEX.json';

/** The material `/drill-rfc-down` accepts as an ordinary argument. */
export const REEXAMINATION_FILE_NAME = 'STALENESS-REEXAMINATION.md';

/** The hash encoding every recorded reference carries. */
export const HASH_PREFIX = 'sha256:';

/**
 * What went wrong, as opposed to what changed.
 *
 * A finding is never a verdict about a claim. It says a comparison could not be
 * made, which is a different statement from "this claim is current".
 */
export const FINDING_KINDS = Object.freeze({
  UNHASHABLE_INPUT: 'unhashable-input',
  UNRESOLVED_RECORDED_HASH: 'unresolved-recorded-hash',
});

/** A recorded or computed hash, in the one encoding this module accepts. */
const HASH_SHAPE = /^sha256:[0-9a-f]{64}$/;

const USAGE = [
  'Usage:',
  '  node staleness.mjs --claim-ledger=<dir>',
  '                      --changed=<ref>=<path> [--changed=<ref>=<path>]...',
  '                      [--out=<dir>] [--json]',
  '',
  '  --claim-ledger  Directory holding CLAIM-LEDGER.json. Required.',
  '  --changed       A forward reference and the artefact it names, as it stands now.',
  '                  Repeat once per input to examine. Required.',
  '                  A relative path is resolved against the --claim-ledger directory.',
  '                  An input that cannot be hashed is reported, never assumed unchanged.',
  '  --out           Where STALENESS-INDEX.json and STALENESS-REEXAMINATION.md are written.',
  '                  Nothing is written unless this is given.',
  '  --json          Print the index to stdout instead of the Markdown material.',
  '',
  'The completion state of every claim is read and reproduced, never altered:',
  'staleness and COMPLETE are independent axes.',
].join('\n');

/** The hash of one input, in the encoding recorded references use. */
export function hashInput(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`the input at ${filePath} does not exist, so its hash cannot be computed`);
  }
  return `${HASH_PREFIX}${sha256Hex(readFileSync(filePath))}`;
}

/** Whether a recorded value is a hash at all. A value that is not cannot be compared. */
export function isHashShaped(value) {
  return typeof value === 'string' && HASH_SHAPE.test(value);
}

/** The recorded forward references of a claim, or an empty set when it records none. */
export function recordedHashesOf(claim) {
  const recorded = claim?.forward_refs?.ref_hashes;
  return recorded !== null && typeof recorded === 'object' ? recorded : {};
}

/**
 * Read the claim ledger from the sidecar directory the caller names.
 *
 * A ledger that is not there, or that is not a ledger, is refused rather than
 * treated as an empty one. "Nothing is stale" is a claim about a ledger that
 * was read; a run that never read one is not entitled to say it. That holds
 * whether the file is missing, unparseable, or parsed but carries no list of
 * claims — a truncated sidecar is exactly the case where the false statement
 * would be believed.
 */
export function loadClaimLedger(root) {
  const ledgerPath = join(root, CLAIM_LEDGER_FILE_NAME);
  if (!existsSync(ledgerPath)) {
    throw new Error(
      `no ${CLAIM_LEDGER_FILE_NAME} was found under ${root}; staleness is measured against a claim ledger `
      + 'and a run without one has nothing to compare',
    );
  }

  let ledger;
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${ledgerPath} is not readable as JSON (${detail})`);
  }

  if (!Array.isArray(ledger?.claims)) {
    throw new Error(
      `${ledgerPath} carries no \`claims\` array, so it is not a claim ledger; reading it as an empty one `
      + 'would report that nothing is stale about a ledger that was never read',
    );
  }

  return ledger;
}

/** Refuse a change set that cannot be compared, naming what is wrong with it. */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function assertChangedInputsAreComparable(changedInputs) {
  if (!Array.isArray(changedInputs)) {
    throw new Error(`changedInputs must be an array of { ref, path } entries; it was given ${typeof changedInputs}`);
  }
  const seen = new Set();
  for (const input of changedInputs) {
    if (!input?.ref || typeof input.ref !== 'string') {
      throw new Error('every changed input must name the forward reference it is, as a non-empty `ref`');
    }
    if (!input?.path || typeof input.path !== 'string') {
      throw new Error(`the changed input "${input.ref}" must name where the artefact is, as a non-empty \`path\``);
    }
    if (seen.has(input.ref)) {
      throw new Error(
        `the reference "${input.ref}" was given more than once; two entries for one reference make `
        + 'the comparison ambiguous',
      );
    }
    seen.add(input.ref);
  }
}

/**
 * The current hash of every input the caller named, or the reason there is none.
 *
 * An input that cannot be hashed is recorded as a problem rather than dropped.
 * Dropping it would leave each claim that depends on it looking fresh, which is
 * the one answer the run is not entitled to give.
 */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function examineInputs(root, changedInputs) {
  const examined = new Map();
  const findings = [];

  for (const input of changedInputs) {
    const absolutePath = resolve(root, input.path);
    try {
      examined.set(input.ref, { ref: input.ref, path: absolutePath, hash: hashInput(absolutePath) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      examined.set(input.ref, { ref: input.ref, path: absolutePath, problem: detail });
      findings.push({
        kind: FINDING_KINDS.UNHASHABLE_INPUT,
        ref: input.ref,
        path: absolutePath,
        detail: `${absolutePath} could not be hashed (${detail}), so no claim depending on it is reported as fresh`,
      });
    }
  }

  return { examined, findings };
}

/**
 * Compare one claim's recorded hashes against the inputs as they stand.
 *
 * Three outcomes, kept distinct on purpose: a reference that differs, a
 * reference that could not be compared, and a reference this change set did not
 * examine. The third is not staleness — the caller asked about other inputs —
 * and folding it into either of the others would make the report lie.
 */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function compareRecordedHashes(recorded, examined) {
  const differing = {};
  const unresolved = [];

  for (const [ref, recordedHash] of Object.entries(recorded)) {
    if (!isHashShaped(recordedHash)) {
      unresolved.push({
        ref,
        recorded: recordedHash,
        // The finding belongs to the recorded value itself, so this is the one
        // place that reports it.
        finding: FINDING_KINDS.UNRESOLVED_RECORDED_HASH,
        reason: `the recorded hash for "${ref}" is not a ${HASH_PREFIX}… value, so it can never be compared`,
      });
      continue;
    }
    const input = examined.get(ref);
    if (input === undefined) {
      continue;
    }
    if (input.problem) {
      // The input already produced its own finding; repeating the fact per
      // claim would report one broken input as many broken claims.
      unresolved.push({
        ref,
        recorded: recordedHash,
        finding: null,
        reason: `the artefact for "${ref}" could not be hashed, so whether it changed is unknown`,
      });
      continue;
    }
    if (input.hash !== recordedHash) {
      differing[ref] = { recorded: recordedHash, current: input.hash, path: input.path };
    }
  }

  return { differing, unresolved };
}

/** The plain-English condition a human reads before deciding what to do. */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function reexaminationConditionFor(claim, differing) {
  const refs = Object.keys(differing).sort();
  const descriptions = refs.map((ref) => {
    const { recorded, current } = differing[ref];
    return `"${ref}" was recorded as ${recorded} and now hashes to ${current}`;
  });
  return `re-examine ${claim.claim_id}: ${descriptions.join('; ')}`;
}

/**
 * The marker a stale claim carries.
 *
 * The completion state is copied, never computed. That is the whole point of
 * the marker: it says the canonical record needs looking at while leaving the
 * forward rotation's own verdict exactly where it was.
 */
export function markClaimStale(claim, { differing, completionState }) {
  const refs = Object.keys(differing).sort();
  const primaryRef = refs[0];

  return Object.freeze({
    claimId: claim.claim_id,
    stale: true,
    changedInput: primaryRef,
    changedInputPath: differing[primaryRef].path,
    differingHashes: Object.freeze({ ...differing }),
    rfcHeadingRefs: Object.freeze([...(claim.forward_refs?.rfc_heading_refs ?? [])]),
    reexaminationCondition: reexaminationConditionFor(claim, differing),
    completionState,
  });
}

/**
 * Propagate a change in the named inputs to the claims that depend on them.
 *
 * @param {string} root - sidecar directory holding `CLAIM-LEDGER.json`
 * @param {Array<{ref: string, path: string}>} changedInputs - the forward references to examine
 * @returns {Readonly<object>} the staleness index
 */
export function propagateStaleness(root, changedInputs) {
  assertChangedInputsAreComparable(changedInputs);

  const ledger = loadClaimLedger(root);
  const claims = ledger.claims;
  const completionState = ledger.completion_state ?? null;
  const { examined, findings } = examineInputs(root, changedInputs);

  const staleClaims = [];
  const unresolvedClaims = [];
  let freshClaimCount = 0;

  for (const claim of claims) {
    const recorded = recordedHashesOf(claim);
    if (Object.keys(recorded).length === 0) {
      freshClaimCount += 1;
      continue;
    }

    const { differing, unresolved } = compareRecordedHashes(recorded, examined);

    if (Object.keys(differing).length > 0) {
      staleClaims.push(markClaimStale(claim, { differing, completionState }));
      continue;
    }
    if (unresolved.length > 0) {
      for (const entry of unresolved) {
        if (entry.finding === null) {
          continue;
        }
        findings.push({
          kind: entry.finding,
          claimId: claim.claim_id,
          ref: entry.ref,
          recorded: entry.recorded,
          detail: `${claim.claim_id}: ${entry.reason}`,
        });
      }
      unresolvedClaims.push(
        Object.freeze({
          claimId: claim.claim_id,
          refs: Object.freeze(unresolved.map((entry) => entry.ref)),
          condition: `re-examine ${claim.claim_id}: ${unresolved.map((entry) => entry.reason).join('; ')}`,
        }),
      );
      continue;
    }
    freshClaimCount += 1;
  }

  return Object.freeze({
    sidecar: STALENESS_INDEX_FILE_NAME,
    root,
    completionState,
    examinedInputs: Object.freeze([...examined.values()].map((input) => Object.freeze({ ...input }))),
    staleClaims: Object.freeze(staleClaims),
    staleClaimIds: Object.freeze(staleClaims.map((marker) => marker.claimId)),
    unresolvedClaims: Object.freeze(unresolvedClaims),
    freshClaimCount,
    claimCount: claims.length,
    findings: Object.freeze(findings.map((finding) => Object.freeze({ ...finding }))),
  });
}

/** Whether a value is the output of `propagateStaleness` and not something shaped like it. */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function isStalenessIndex(value) {
  return Boolean(value)
    && value.sidecar === STALENESS_INDEX_FILE_NAME
    && Array.isArray(value.staleClaims)
    && Array.isArray(value.unresolvedClaims);
}

// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
function renderDifferingHashes(marker) {
  const lines = ['| changed input | recorded | current |', '|---|---|---|'];
  for (const ref of Object.keys(marker.differingHashes).sort()) {
    const { recorded, current } = marker.differingHashes[ref];
    lines.push(`| \`${ref}\` | \`${recorded}\` | \`${current}\` |`);
  }
  return lines;
}

/**
 * The re-examination conditions as material `/drill-rfc-down` accepts.
 *
 * Markdown rather than JSON, because the reader is an AI deciding what to do
 * with each condition. A run that found nothing stale says so in words: an
 * empty document reads as a failure, and there is nothing here that failed.
 */
export function emitReexaminationConditions(index) {
  if (!isStalenessIndex(index)) {
    throw new Error(
      'emitReexaminationConditions renders the result of propagateStaleness; '
      + 'it was given something that is not one',
    );
  }

  const lines = [
    '# Staleness — re-examination conditions for /drill-rfc-down',
    '',
    '**Pass this document to `/drill-rfc-down` as an ordinary material argument.** Each entry names a claim '
      + 'whose recorded forward reference no longer matches the artefact it describes, together with the '
      + 'condition under which the claim must be looked at again.',
    '',
    'Staleness is not a completion verdict. No claim listed here has had its completion state changed.',
    '',
    '## Summary',
    '',
    `- claims examined: ${index.claimCount}`,
    `- stale: ${index.staleClaims.length}`,
    `- reported, not compared: ${index.unresolvedClaims.length}`,
    `- fresh: ${index.freshClaimCount}`,
    '',
  ];

  if (index.staleClaims.length === 0) {
    lines.push(
      '**No claim is stale under this change set.** Nothing in the canonical record needs re-examination '
        + 'because of these inputs.',
      '',
    );
  } else {
    lines.push(`## ${index.staleClaims.length} claim(s) are stale`, '');
    for (const marker of index.staleClaims) {
      lines.push(`### ${marker.claimId}`, '');
      lines.push(`**Re-examination condition.** ${marker.reexaminationCondition}`, '');
      lines.push(...renderDifferingHashes(marker), '');
      if (marker.rfcHeadingRefs.length > 0) {
        lines.push(`**RFC clauses to re-examine.** ${marker.rfcHeadingRefs.map((ref) => `\`${ref}\``).join(', ')}`, '');
      }
      lines.push(`**Completion state.** \`${marker.completionState ?? 'not recorded'}\` — unchanged by this report.`, '');
    }
  }

  if (index.unresolvedClaims.length > 0) {
    lines.push('## Reported rather than compared', '');
    lines.push(
      'These claims were **not** found fresh. A comparison could not be made, which is a different statement '
        + 'from "this claim is current", so each is reported here instead.',
      '',
    );
    for (const claim of index.unresolvedClaims) {
      lines.push(`- ${claim.condition}`);
    }
    lines.push('');
  }

  if (index.findings.length > 0) {
    lines.push('## Findings', '');
    for (const finding of index.findings) {
      lines.push(`- \`${finding.kind}\` — ${finding.detail}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** The index as it is written beside the ledger. */
export function serializeStalenessIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

/**
 * Write the index and the drill material.
 *
 * This is the only writing path, and the caller has to ask for it. Propagation
 * itself writes nothing: a measurement that mutates its subject is not a
 * measurement, and the subject tree must come out of a run byte-identical.
 */
export function writeStalenessArtifacts(index, outDir) {
  const indexPath = join(outDir, STALENESS_INDEX_FILE_NAME);
  const materialPath = join(outDir, REEXAMINATION_FILE_NAME);
  writeFileSync(indexPath, serializeStalenessIndex(index));
  writeFileSync(materialPath, emitReexaminationConditions(index));
  return { indexPath, materialPath };
}

/** Parse the command line into `{ claimLedger, changedInputs, out, json }`. */
export function parseArguments(argv) {
  let claimLedger = null;
  let out = null;
  let json = false;
  const changedInputs = [];

  for (const argument of argv) {
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument.startsWith('--claim-ledger=')) {
      claimLedger = argument.slice('--claim-ledger='.length);
      continue;
    }
    if (argument.startsWith('--out=')) {
      out = argument.slice('--out='.length);
      continue;
    }
    if (argument.startsWith('--changed=')) {
      const entry = argument.slice('--changed='.length);
      const separator = entry.indexOf('=');
      changedInputs.push({
        ref: separator === -1 ? entry : entry.slice(0, separator),
        path: separator === -1 ? '' : entry.slice(separator + 1),
      });
      continue;
    }
    throw new Error(`"${argument}" is not an option this script knows\n\n${USAGE}`);
  }

  return { claimLedger, changedInputs, out, json };
}

// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
/** Do the work, assuming the arguments have already been accepted. */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
async function runPropagation(options) {
  if (options.claimLedger === null) {
    process.stderr.write(`no claim ledger was named\n\n${USAGE}\n`);
    return 2;
  }
  if (options.changedInputs.length === 0) {
    process.stderr.write(`no changed input was named, so there is nothing to compare\n\n${USAGE}\n`);
    return 2;
  }

  const index = propagateStaleness(options.claimLedger, options.changedInputs);

  if (options.out !== null) {
    writeStalenessArtifacts(index, options.out);
  }

  process.stdout.write(options.json ? serializeStalenessIndex(index) : `${emitReexaminationConditions(index)}\n`);
  return 0;
}

/**
 * Run as a command.
 *
 * A bad argument or an unreadable sidecar is something the operator has to fix,
 * so it is stated in words and the usage is printed. Letting it escape as a
 * stack trace would bury the one sentence they need under frames they cannot
 * act on.
 */
// [::TICKET::] P22-21 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-21 --for-spec --no-implementation-order`.
async function main(argv = process.argv.slice(2)) {
  try {
    return await runPropagation(parseArguments(argv));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`staleness could not run: ${detail}\n\n${USAGE}\n`);
    return 2;
  }
}

export { USAGE, main };

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
