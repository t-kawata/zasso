/**
 * The provenance a report states beside its verdict.
 *
 * A v3 artifact records how it became v3. That record is the difference between a
 * contract the project authored and a typed fact a migration synthesized: the report
 * must not let the reader infer the second from a green check. `contract_prose` is the
 * authored sentence PX-283 preserves; when it is absent the report says how many steps
 * lost it rather than omitting the question.
 */

const SCHEMA_V2 = 2;
const SCHEMA_V3 = 3;

/** The provenance of an artifact with no migration record. */
export function emptyProvenance() {
  return {
    status: 'not-recorded',
    fromSchemaVersion: null,
    toSchemaVersion: null,
    sourceDigest: null,
    migratedBy: null,
    proseContract: { total: 0, preserved: 0, missing: 0 },
  };
}

/** Whether a step carries a non-empty authored prose contract. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function hasProseContract(step) {
  return typeof step?.contract_prose === 'string' && step.contract_prose.trim() !== '';
}

/**
 * Summarize how an artifact came to be and what happened to its prose contracts.
 *
 * @param {object|null} artifact
 * @returns {{status: string, fromSchemaVersion: number|null, toSchemaVersion: number|null,
 *   sourceDigest: string|null, migratedBy: string|null,
 *   proseContract: {total: number, preserved: number, missing: number}}}
 */
export function summarizeProvenance(artifact) {
  const steps = Array.isArray(artifact?.steps) ? artifact.steps : [];
  const migration = artifact?.migration;
  const preserved = steps.filter(hasProseContract).length;

  if (artifact?.schema_version === SCHEMA_V2) {
    const legacyProse = steps.filter((step) => typeof step?.contract === 'string' && step.contract.trim() !== '').length;
    return {
      status: 'v2',
      fromSchemaVersion: SCHEMA_V2,
      toSchemaVersion: null,
      sourceDigest: null,
      migratedBy: null,
      proseContract: { total: legacyProse, preserved: 0, missing: 0 },
    };
  }

  if (migration === undefined || migration === null) {
    return {
      status: 'not-recorded',
      fromSchemaVersion: null,
      toSchemaVersion: artifact?.schema_version === SCHEMA_V3 ? SCHEMA_V3 : null,
      sourceDigest: null,
      migratedBy: null,
      proseContract: { total: steps.length, preserved, missing: steps.length - preserved },
    };
  }

  return {
    status: 'recorded',
    fromSchemaVersion: migration.from_schema_version ?? null,
    toSchemaVersion: migration.to_schema_version ?? null,
    sourceDigest: typeof migration.source_digest === 'string' ? migration.source_digest : null,
    migratedBy: typeof migration.migrated_by === 'string' ? migration.migrated_by : null,
    proseContract: { total: steps.length, preserved, missing: steps.length - preserved },
  };
}

/** One line for the console and the Markdown report. */
export function formatProvenanceLine(provenance) {
  if (provenance.status === 'not-recorded') return 'not-recorded (no migration field)';
  if (provenance.status === 'v2') {
    return `v2 (prose ${provenance.proseContract.total}; not migrated)`;
  }
  const direction = `${provenance.fromSchemaVersion ?? '?'}->${provenance.toSchemaVersion ?? '?'}`;
  const by = provenance.migratedBy === null ? 'unknown producer' : provenance.migratedBy;
  const prose = `prose ${provenance.proseContract.preserved}/${provenance.proseContract.total} preserved`;
  return `${direction} by ${by}; ${prose} (${provenance.proseContract.missing} missing)`;
}
