// The ad-hoc surface (PX-240 phase 16; PX-241 contracts C009, C010).
//
// One thing about this work is genuinely not mechanical: a defect class that has never
// been seen needs a check that has never been written, and no amount of apparatus
// produces it. What apparatus can do is make that act cost something and leave a trace.
//
// So a new check is scaffolded rather than hand-written, and the scaffold refuses to be
// produced without the defect that motivated it. The check is built from the
// constructor library rather than from scratch, so the author chooses a shape instead
// of inventing one. And the check is **executed** before it is recorded: the module it
// writes carries a mutation, and a check whose mutation does not redden it, or whose
// reading also fires on correct work, is refused rather than recorded. An unexecuted
// verification written into a record is the failure this module exists to prevent.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { EXECUTION_FIELDS, RAIL_EXIT_FIELDS, railExitStoreFor, readRailExits, writeRailExit, writeRailExits } from './harness.mjs';

/** Where a run keeps the checks it had to write. */
export const ADHOC_DIRECTORY = 'adhoc';

/** The module a scaffolded check builds from, stated once so the writer and the reader agree. */
export const CONSTRUCTOR_MODULE = join(import.meta.dirname, 'checks.mjs');

/**
 * Why a scaffolded module cannot join the running check set.
 *
 * Named once because the scaffold path and the loader refuse the same things, and two
 * copies of a refusal are two things to drift: the executor refuses at scaffold time and
 * the loader refuses on every later run, and a reader who meets one should be able to
 * recognise the other.
 *
 * `NO_RECORD` is the one the scaffold states by its silence. A module whose two bodies
 * are still the stubs the scaffold wrote returns no verdicts and mutates nothing, so
 * loading it would count a check that has never falsified anything as a check that
 * passed. The rail-exit record is the only evidence that separates never falsified from
 * falsified and silent.
 */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
export const ADHOC_REFUSALS = Object.freeze({
  NOT_LOADED: 'does not load',
  NO_CHECK: 'exports no check with a run',
  NO_MUTATION: 'exports no mutation, so nothing falsifies it',
  NO_RECORD: 'has no rail-exit record, so nothing shows it was ever falsified',
});

/** The four fields every scaffolded check declares, in the order they are written. */
export const CHECK_CONTRACT_FIELDS = Object.freeze(['id', 'originatingDefect', 'refuses', 'scope']);

/**
 * The module a scaffolded check is written into.
 *
 * The import specifier is computed from the directory the module lands in rather than
 * written here, because a run keeps its state beside the specification and the
 * distance from there to this library is not a constant.
 */
export function checkModuleSource({ check, defect, refuses, scope, importSpecifier }) {
  return `// A check written for a defect class no declared check was written for.
//
// It carries the defect that motivated it, the reading it refuses to accept, and its
// scope, because a check whose origin is forgotten is the first one deleted when it
// turns red. It is built from the constructor library rather than from scratch: a check
// built from a shape inherits the rule that a check may propose and may never decide.
import { agreeOn, citeFrom, coverEvery, groundIn, pinCheck, placeEach, reachEvery } from '${importSpecifier}';

// [::STUB::] PX-241: replace this body with the reading the defect requires.
export const check = {
  id: ${JSON.stringify(check)},
  originatingDefect: ${JSON.stringify(defect)},
  refuses: ${JSON.stringify(refuses)},
  scope: ${JSON.stringify(scope)},
  run(context) {
    // Return one verdict per refusal: { check: id, subject, reason }.
    return [];
  },
};

// [::STUB::] PX-241: replace this body with the perturbation that produces the defect.
export const mutation = (artifact) => {
  return artifact;
};
`;
}

/** The mutation and counter-mutation that must accompany the check. */
export function caseFileSource({ check, defect }) {
  return `${JSON.stringify({
    check,
    defect,
    mutationCase: {
      name: `${check}-mutation`,
      inputs: 'a subject carrying the defect this check was written for',
      outputShape: 'one verdict naming this check',
      readBy: 'rail/adhoc.mjs runScaffoldCases',
    },
    counterCase: {
      name: `${check}-counter`,
      inputs: 'correct work that looks like the defect but is not',
      outputShape: 'no verdict',
      readBy: 'rail/adhoc.mjs runScaffoldCases',
    },
    promotionCondition: 'promote into CHECKS when a second specification needs the same rule',
  }, null, 2)}\n`;
}

/** The record a rail exit must carry; every field is required or the write is refused. */
export function railExitTemplate({ check, defect, cases, executed = null }) {
  return {
    id: `${check}#${defect.length}`,
    check,
    noAnalogueInRecord: defect,
    inputs: cases.mutationCase.inputs,
    outputShape: cases.mutationCase.outputShape,
    readBy: cases.mutationCase.readBy,
    verifiedBy: cases.counterCase.name,
    promoted: false,
    promotionCondition: cases.promotionCondition,
    executed,
  };
}

/**
 * The specifier a scaffolded module uses to reach the constructor library.
 *
 * Returns null when no specifier resolves, so a scaffold that would write a module
 * unable to reach the library is refused rather than written.
 */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function importSpecifierFor(adhocDirectory) {
  // Both ends are resolved through any symlink first: a module specifier is resolved
  // against the path the module is actually loaded from, and a temporary directory
  // whose name is a link would otherwise be counted twice on one side and once on the
  // other, so the traversal would land beside the tool rather than on it.
  const from = realpathSync(adhocDirectory);
  const to = realpathSync(CONSTRUCTOR_MODULE);
  const path = relative(from, to);
  if (path === '' || !existsSync(resolve(from, path))) return null;
  return path.startsWith('.') ? path : `./${path}`;
}

/**
 * Scaffold a check for a defect class with no analogue.
 *
 * @returns {{ok: true, modulePath: string, casesPath: string, record: object}
 *          | {ok: false, problems: string[]}}
 */
export function scaffoldCheck({ directory, check, defect, refuses, scope = 'every artifact' }) {
  const problems = [];
  if (typeof check !== 'string' || check.trim() === '') problems.push('the check has no name');
  if (typeof defect !== 'string' || defect.trim() === '') problems.push('the check has no originating defect');
  if (typeof refuses !== 'string' || refuses.trim() === '') problems.push('the check does not say what reading it refuses');
  if (problems.length > 0) return { ok: false, problems };

  const target = join(directory, ADHOC_DIRECTORY);
  if (!existsSync(target)) mkdirSync(target, { recursive: true });

  const importSpecifier = importSpecifierFor(target);
  if (importSpecifier === null) {
    return { ok: false, problems: [`a module written into ${target} could not reach ${CONSTRUCTOR_MODULE}`] };
  }

  const modulePath = join(target, `${check}.mjs`);
  const casesPath = join(target, `${check}.cases.json`);
  const cases = JSON.parse(caseFileSource({ check, defect }));
  writeFileSync(modulePath, checkModuleSource({ check, defect, refuses, scope, importSpecifier }));
  writeFileSync(casesPath, caseFileSource({ check, defect }));

  return { ok: true, modulePath, casesPath, record: railExitTemplate({ check, defect, cases }) };
}

/**
 * Execute a scaffolded check's mutation and report what was observed.
 *
 * The mutation is applied to a copy, and the check is read twice: once over the
 * mutated artifact, where it must refuse, and once over the artifact as it stands,
 * where it must stay silent. A check that fires on both is refused here, because a
 * rule that fails correct work is a defect in the rule rather than in the subject.
 *
 * @returns {Promise<{ok: boolean, executed?: object, problems?: string[], modulePath?: string}>}
 */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
export async function runScaffoldCases({ directory, check, artifact, specLines }) {
  const modulePath = join(directory, ADHOC_DIRECTORY, `${check}.mjs`);
  if (!existsSync(modulePath)) return { ok: false, problems: [`no scaffolded module ${check}`] };

  let loaded;
  try {
    loaded = await import(pathToFileURL(modulePath).href);
  } catch (error) {
    return { ok: false, problems: [`${check} ${ADHOC_REFUSALS.NOT_LOADED}: ${error.message}`] };
  }
  if (typeof loaded.check?.run !== 'function') return { ok: false, problems: [`${check} ${ADHOC_REFUSALS.NO_CHECK}`] };
  if (typeof loaded.mutation !== 'function') return { ok: false, problems: [`${check} ${ADHOC_REFUSALS.NO_MUTATION}`] };

  const verdictsOnDefect = loaded.check.run({ specLines, artifact: loaded.mutation(structuredClone(artifact)) });
  const executed = {
    reddened: verdictsOnDefect.length > 0,
    attributable: verdictsOnDefect.every((verdict) => verdict.check === check),
    counterGreen: loaded.check.run({ specLines, artifact: structuredClone(artifact) }).length === 0,
  };

  if (!executed.reddened) return { ok: false, problems: [`the mutation does not redden ${check}`], executed, modulePath };
  if (!executed.attributable) return { ok: false, problems: [`${check} reported a verdict under another name`], executed, modulePath };
  if (!executed.counterGreen) return { ok: false, problems: [`the counter-mutation reddened ${check}: the rule is defective, not the subject`], executed, modulePath };
  return { ok: true, executed, modulePath };
}

/**
 * Load the checks a run has scaffolded, so a caller passes values rather than a path.
 *
 * The engine stays synchronous and free of dynamic import, so the loading happens here
 * and its failures are answered rather than thrown away: a module that cannot join the
 * set is refused by name and the caller refuses the run, because a check that vanished
 * from the count would read as a check that passed.
 *
 * @returns {Promise<{checks: Array<{id: string, run: Function}>, problems: string[]}>}
 */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
export async function loadAdhocChecks({ directory }) {
  const checks = [];
  const problems = [];
  const recorded = new Set(readRailExits(railExitStoreFor(directory)).map((record) => record.check));

  for (const check of scaffoldedCheckNames(directory)) {
    const modulePath = join(directory, ADHOC_DIRECTORY, `${check}.mjs`);
    let loaded;
    try {
      loaded = await import(pathToFileURL(modulePath).href);
    } catch (error) {
      problems.push(`${check} ${ADHOC_REFUSALS.NOT_LOADED}: ${error.message}`);
      continue;
    }
    if (typeof loaded.check?.run !== 'function') {
      problems.push(`${check} ${ADHOC_REFUSALS.NO_CHECK}`);
      continue;
    }
    if (typeof loaded.mutation !== 'function') {
      problems.push(`${check} ${ADHOC_REFUSALS.NO_MUTATION}`);
      continue;
    }
    if (!recorded.has(check)) {
      problems.push(`${check} ${ADHOC_REFUSALS.NO_RECORD}`);
      continue;
    }
    checks.push({ id: check, run: loaded.check.run });
  }

  return { checks, problems };
}

/** The records whose promotion condition has been met but which are still ad-hoc. */
export function promotionCandidates(records) {
  return records.filter((record) => record.promoted === false);
}

/**
 * Promote a record, once a second specification has needed the same rule.
 *
 * The record is rewritten in place with `promoted` set and the spec that needed it
 * named, because a promotion that deleted the record would erase the evidence that the
 * check was ever ad-hoc.
 */
export function promoteRecord(records, id, { secondSpecification }) {
  if (typeof secondSpecification !== 'string' || secondSpecification.trim() === '') {
    return { ok: false, problems: ['a promotion names the second specification that needed the rule'] };
  }
  const found = records.find((record) => record.id === id);
  if (found === undefined) return { ok: false, problems: [`no rail-exit record ${id}`] };
  return { ok: true, record: { ...found, promoted: true, promotionCondition: `promoted by ${secondSpecification}` } };
}

/** The scaffolded check names a run directory holds, so the gate can read the registry. */
export function scaffoldedCheckNames(directory) {
  const target = join(directory, ADHOC_DIRECTORY);
  if (!existsSync(target)) return [];
  return readdirSync(target).filter((name) => name.endsWith('.mjs')).map((name) => name.slice(0, -'.mjs'.length));
}

/** Read a scaffolded check's cases file, so a caller can see what it claimed to falsify. */
export function readCasesFile(directory, check) {
  const path = join(directory, ADHOC_DIRECTORY, `${check}.cases.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/** The rail-exit records on disk, re-exported so a caller has one import. */
export { EXECUTION_FIELDS, RAIL_EXIT_FIELDS, railExitStoreFor, readRailExits, writeRailExit, writeRailExits };
