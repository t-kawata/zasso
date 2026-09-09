// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C005
/**
 * Per-seed local checks (corrected ALLOCATE §3 G3).
 *
 * These checks keep a single seed structurally honest before the global parity
 * gate runs: required headings present/ordered/non-empty, the Allocation Index
 * matching this package's expected allocation, and no neighbor-owned item
 * claimed in the index. Prose quality is never graded here.
 */
import { SEED_REQUIRED_SECTIONS, assertSeedBodyValid } from './seed-model.mjs';

const ALLOWED_CATEGORIES = new Set(['object', 'claim', 'invariant', 'state_machine', 'error_code', 'required_test']);

/**
 * Run the local checks for one parsed seed.
 *
 * @param {{ parsedSeed: object, package: object, expectedAllocation: Array<object> }} input
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function runSeedLocalChecks({ parsedSeed, package: pkg, expectedAllocation = [] }) {
  const errors = [];

  const expectedKeys = new Set(expectedAllocation.map((item) => itemKey(item.category, item.inventory_ref)));

  const sections = parsedSeed.headings ?? [];
  if (sections.length !== SEED_REQUIRED_SECTIONS.length) {
    errors.push(`seed has ${sections.length} headings, expected ${SEED_REQUIRED_SECTIONS.length}`);
  }
  for (let i = 0; i < SEED_REQUIRED_SECTIONS.length; i += 1) {
    const expected = SEED_REQUIRED_SECTIONS[i];
    const actual = sections[i];
    if (!actual) {
      errors.push(`heading ${expected.index} is missing`);
      continue;
    }
    if (actual.index !== expected.index || actual.title !== expected.title) {
      errors.push(`heading ${expected.index} is out of order or mistitled`);
    }
    const reason = assertSeedBodyValid(actual.body);
    if (reason !== null) {
      errors.push(`heading ${expected.index} body invalid: ${reason}`);
    }
  }

  const rows = parsedSeed.allocationIndexRows ?? [];
  const seen = new Set();
  for (const row of rows) {
    const key = itemKey(row.category, row.inventory_ref);
    if (!ALLOWED_CATEGORIES.has(row.category)) {
      errors.push(`index row has unknown category ${row.category}`);
    }
    if (!expectedKeys.has(key)) {
      errors.push(`index claims non-owned item ${key}`);
    }
    if (seen.has(key)) {
      errors.push(`index repeats item ${key}`);
    }
    seen.add(key);
  }
  for (const key of expectedKeys) {
    if (!seen.has(key)) {
      errors.push(`index is missing owned item ${key}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function itemKey(category, inventoryRef) {
  return `${category}:${inventoryRef}`;
}
