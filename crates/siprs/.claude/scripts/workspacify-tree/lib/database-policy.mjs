// [::TICKET::] PX-177 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`.
/**
 * Database policy checks (§10.2).
 *
 * When RDBMS persistence is applicable, raw SQL is prohibited and DB-specific
 * types must not leak into domain/protocol/core/interfaces packages. Migration
 * atomicity is never a substitute for domain operation atomicity.
 */

const LEAK_PRONE_LAYERS = new Set(['domain', 'protocol', 'core', 'interfaces']);

/**
 * Check a database policy model.
 *
 * @param {{ databasePolicy: object, packages: Array<object> }} model
 *   packages: [{ id, layer, rawSqlFragments?: string[], dbSpecificTypes?: string[], migrationAsAtomicity?: boolean }]
 * @returns {{ raw_sql_count: number, db_type_leak_count: number,
 *             migration_atomicity_misuse_count: number, details: Array<string> }}
 */
export function checkDatabasePolicy({ databasePolicy, packages }) {
  const details = [];
  const applicable = Boolean(databasePolicy?.applicable);
  if (!applicable) {
    return { raw_sql_count: 0, db_type_leak_count: 0, migration_atomicity_misuse_count: 0, details };
  }

  const rawSqlProhibited = databasePolicy.rawSqlProhibited !== false;
  let rawSqlCount = 0;
  let dbTypeLeakCount = 0;
  let migrationAtomicityMisuseCount = 0;

  for (const pkg of packages ?? []) {
    const rawSqlFragments = pkg.rawSqlFragments ?? [];
    if (rawSqlProhibited && rawSqlFragments.length > 0) {
      rawSqlCount += rawSqlFragments.length;
      details.push(`${pkg.id} uses raw SQL`);
    }
    const dbSpecificTypes = pkg.dbSpecificTypes ?? [];
    if (LEAK_PRONE_LAYERS.has(pkg.layer) && dbSpecificTypes.length > 0) {
      dbTypeLeakCount += dbSpecificTypes.length;
      details.push(`${pkg.id} leaks DB-specific types into layer ${pkg.layer}`);
    }
    if (pkg.migrationAsAtomicity === true && (pkg.layer === 'domain' || pkg.layer === 'protocol')) {
      migrationAtomicityMisuseCount += 1;
      details.push(`${pkg.id} treats migration atomicity as domain atomicity`);
    }
  }

  return {
    raw_sql_count: rawSqlCount,
    db_type_leak_count: dbTypeLeakCount,
    migration_atomicity_misuse_count: migrationAtomicityMisuseCount,
    details,
  };
}
