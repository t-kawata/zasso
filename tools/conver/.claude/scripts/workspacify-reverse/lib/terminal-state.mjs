/**
 * The terminal state the three-command chain is supposed to reach, measured.
 *
 * Design §7.3 records the largest unverified item in the document: "Nobody has
 * ever observed a project reaching the terminal state through the reverse
 * rotation. Every statement in §2 is a design claim, not a measurement." This
 * module is the measurement's instrument — it states §2.3's inventory as data,
 * checks a tree against it, compares two terminal states, and renders the
 * outcome.
 *
 * Two rules shape everything here. **An exit code is not evidence that a
 * structure is complete**: the inventory is asserted against the declared list,
 * never against whatever the run happened to produce. And **a difference of zero
 * is a signal, not health**: §2.4 records that "a difference of zero, or a
 * disagreement of zero, can be a signal of abnormality rather than of health",
 * so a comparison reports its zeroes rather than reporting a clean run.
 *
 * Nothing here decides whether the reverse engineering succeeded. The machine's
 * vocabulary is `proved` and `not proved` and nothing else, the L0-L3 ladder is
 * reported as a position rather than a grade, and only L3 may be called success
 * — which is a human's judgement after several rounds, not one run's output.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The §2.3 inventory, as data.
 *
 * The fourth layer is the package's own RFC material; the fifth is what the two
 * downstream commands add. They are declared separately because a tree can
 * reach the fourth layer and stop, and that is a different outcome from never
 * having started.
 */
export const TERMINAL_ARTEFACTS = Object.freeze({
  root: Object.freeze([
    'RFC-ROOT.md',
    'RFC-ROOT-GRAPH.json',
    'RFC-ROOT-Dirs-Tree.json',
    'RFC-ROOT-GRAPHIFY-Status.json',
    'RFC-ROOT-BOUNDIFY-Status.json',
    'RFC-ROOT-SPLIT-Status.json',
    'Tickets.json',
  ]),
  fifthLayer: Object.freeze([
    'WORKSPACIFY-TREE-MANIFEST.json',
    'WORKSPACIFY-ALLOCATE-MANIFEST.json',
    'ARCHITECTURE-DELTA.json',
    'DesignTree.json',
  ]),
  /** Names in a package directory that do not vary with the package's own name. */
  package: Object.freeze([
    'Tickets.json',
  ]),
  /** Names in a package directory that carry the package's own name. */
  packageNamed: Object.freeze([
    'RFC-{package}.md',
    'RFC-{package}-GRAPH.json',
    'RFC-{package}-Dirs-Tree.json',
    'RFC-{package}-GRAPHIFY-Status.json',
    'RFC-{package}-BOUNDIFY-Status.json',
    'RFC-{package}-SPLIT-Status.json',
  ]),
  /** The fifth layer's per-package artefact: one seed, written by the allocate command. */
  packageFifthLayer: Object.freeze(['RFC-SEED.md']),
});

/** The gate a reverse run refuses through when the plan and the tree disagree. */
export const ALLOCATE_REFUSAL_GATE = 'A1';

/**
 * The ladder §§5.9 declares, weakest first, with L3 the only position a human
 * may call success. It is a sequence of positions rather than a score.
 */
export const LADDER_POSITIONS = Object.freeze(['L0', 'L1', 'L2', 'L2.5', 'L3']);

/** True when a path exists and is a directory. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The package directories a terminal tree declares under its root. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function packagesUnder(root) {
  try {
    return readdirSync(root)
      .filter((entry) => isDirectory(join(root, entry)))
      .filter((entry) => !entry.startsWith('.'))
      .sort();
  } catch {
    return [];
  }
}

/**
 * The state one representative's tree is in, against §2.3's list.
 *
 * `missing` is the finding: it names the scope and the artefact, so a tree that
 * stopped short says where. `complete` is `missing.length === 0` and nothing
 * else — never an exit code, and never an inference from the documents a run
 * happened to publish.
 *
 * @param {{root: string, manifest?: object|null}} params
 * @returns {object} the measured state
 */
export function measureTerminalState({ root, manifest = null } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('measureTerminalState needs the tree root it measures');
  }

  const missing = [];
  const present = [];
  const record = (scope, artefact) => {
    if (existsSync(join(root, scope === 'root' ? artefact : join(scope, artefact)))) {
      present.push({ scope, artefact });
    } else {
      missing.push({ scope, artefact });
    }
  };

  for (const artefact of TERMINAL_ARTEFACTS.root) record('root', artefact);
  for (const artefact of TERMINAL_ARTEFACTS.fifthLayer) record('root', artefact);

  const packages = packagesUnder(root);
  for (const name of packages) {
    for (const artefact of TERMINAL_ARTEFACTS.package) record(name, artefact);
    for (const template of TERMINAL_ARTEFACTS.packageNamed) {
      record(name, template.replace('{package}', name));
    }
    for (const artefact of TERMINAL_ARTEFACTS.packageFifthLayer) record(name, artefact);
  }

  return {
    root,
    packages,
    present,
    missing,
    complete: missing.length === 0,
    // The prior partition a pattern-2 subject already carried. Read as material
    // and as the prior a difference is taken against — never as the answer.
    prior: manifest?.workspace?.tree ?? null,
    manifestPresent: manifest !== null,
  };
}

/** The artefact names a state holds, per package, with the root's under `''`. */
// [::TICKET::] P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-8 --for-spec --no-implementation-order`.
function artefactNamesOf(state) {
  const byPackage = {};
  for (const entry of state.present) {
    const key = entry.scope === 'root' ? '' : entry.scope;
    if (!byPackage[key]) byPackage[key] = [];
    byPackage[key].push(entry.artefact);
  }
  for (const key of Object.keys(byPackage)) byPackage[key].sort();
  return byPackage;
}

/**
 * Compare two or more terminal states, dimension by dimension.
 *
 * Every dimension is reported for every representative, including the ones that
 * agree — which is the whole point of §2.4's rule. `differences` names what
 * differs and against which representative; `reported` carries the zeroes beside
 * them, because a comparison that printed only the differences would leave a
 * reader unable to tell agreement from a dimension nobody measured.
 *
 * @param {ReadonlyArray<object>} states - measured states, each naming its representative
 * @returns {object} the comparison
 */
export function compareTerminalStates(states) {
  if (!Array.isArray(states)) {
    throw new Error('compareTerminalStates needs the states it compares');
  }

  const representatives = states.map((state) => state.representative);
  const packagePaths = {};
  const artefactNames = {};
  const gates = {};
  for (const state of states) {
    packagePaths[state.representative] = [...state.packages];
    artefactNames[state.representative] = artefactNamesOf(state);
    gates[state.representative] = state.gates ?? {};
  }

  const differences = [];
  const reported = [];
  const dimensions = [
    { dimension: 'packagePaths', value: (state) => JSON.stringify(state.packages) },
    { dimension: 'artefactNames', value: (state) => JSON.stringify(artefactNamesOf(state)) },
  ];

  for (const { dimension, value } of dimensions) {
    const seen = new Map();
    for (const state of states) {
      const rendered = value(state);
      if (seen.has(rendered)) continue;
      seen.set(rendered, state.representative);
    }
    // Zero is the count of representatives that stand apart from the first, so
    // an agreeing pair reports 0 and is not silently dropped.
    const apart = seen.size - (states.length === 0 ? 0 : 1);
    reported.push({ dimension, value: Math.max(apart, 0) });
    if (apart > 0) {
      for (const [rendered, representative] of seen.entries()) {
        const first = seen.entries().next().value;
        if (first[0] === rendered) continue;
        differences.push({
          representative,
          dimension,
          artefact: dimension,
          detail: `${representative} differs from ${first[1]} on ${dimension}`,
        });
      }
    }
  }

  const gateNames = [...new Set(Object.values(gates).flatMap((entry) => Object.keys(entry)))].sort();
  for (const gate of gateNames) {
    const outcomes = new Set(states.map((state) => gates[state.representative]?.[gate] ?? 'not-reported'));
    reported.push({ dimension: 'gates', artefact: gate, value: outcomes.size === 1 ? 0 : outcomes.size - 1 });
    if (outcomes.size > 1) {
      for (const state of states) {
        differences.push({
          representative: state.representative,
          dimension: 'gates',
          artefact: gate,
          detail: `${state.representative} reports ${gates[state.representative]?.[gate] ?? 'not-reported'} for ${gate}`,
        });
      }
    }
  }

  return { representatives, packagePaths, artefactNames, gates, differences, reported };
}

/**
 * Summarise the stage records a run published.
 *
 * A stage that refused is named with its input rather than worked around: the
 * chain either reached every declared stage or it did not, and a summary that
 * omitted the refusing stage would report a broken run as a short one.
 */
export function summariseStages(records) {
  const list = Array.isArray(records) ? records : [];
  const reached = list.filter((entry) => entry.status !== 'refused').map((entry) => entry.stage);
  const refused = list
    .filter((entry) => entry.status === 'refused')
    .map((entry) => ({ stage: entry.stage, input: entry.input ?? null }));
  return { reached, refused, complete: refused.length === 0 && list.length > 0 };
}

/**
 * The outcome, rendered.
 *
 * The paragraph under the table is the instrument's own vocabulary: `proved` or
 * `not proved`, the ladder position as a position, and the statement that the
 * judgement is a human's. `omission 0` is reported as material and never as the
 * success condition, because §5.9 says in as many words that it is not.
 *
 * @param {{states: ReadonlyArray<object>, comparison: object|null, ladder: object, stages?: object|null}} params
 * @returns {string} the report
 */
export function renderTerminalStateReport({
  states = [], comparison = null, ladder = { position: 'L0' }, stages = null,
} = {}) {
  const lines = ['# Terminal state', ''];

  if (states.length === 0) {
    lines.push('No representative reached the terminal state in this observation.', '');
  } else {
    lines.push('| Representative | Packages | Missing artefacts |', '|---|---|---|');
    for (const state of states) {
      lines.push(`| ${state.representative} | ${state.packages.length} | ${state.missing.length} |`);
      for (const entry of state.missing) {
        lines.push(`| | ${entry.scope} | ${entry.artefact} |`);
      }
    }
    lines.push('');
  }

  if (stages !== null) {
    lines.push('## Stages', '');
    lines.push(`Reached: ${stages.reached.join(', ') || 'none'}.`);
    for (const refused of stages.refused) {
      lines.push(`- \`${refused.stage}\` refused, with input \`${JSON.stringify(refused.input)}\`.`);
    }
    lines.push('');
  }

  if (comparison !== null) {
    lines.push('## The comparison', '');
    lines.push('Every dimension is reported for every representative, including where the value is zero.');
    lines.push('');
    lines.push('| Dimension | Representative | Value |', '|---|---|---|');
    for (const entry of comparison.reported) {
      lines.push(`| ${entry.dimension}${entry.artefact ? ` (${entry.artefact})` : ''} | all | ${entry.value} |`);
    }
    lines.push('');
    if (comparison.differences.length === 0) {
      lines.push(
        'The structures agree on every dimension measured. A difference of zero is reported here as a '
          + 'signal rather than as health: it says these representatives were compared and no difference '
          + 'was found, not that the comparison was skipped.',
        '',
      );
    } else {
      lines.push('The differences below are recorded, not resolved. A recorded difference is not a contradiction.');
      lines.push('');
      for (const difference of comparison.differences) {
        lines.push(`- \`${difference.representative}\` — ${difference.artefact}: ${difference.detail}`);
      }
      lines.push('');
    }
  }

  lines.push('## The outcome', '');
  lines.push(`Ladder position reached: \`${ladder.position}\`.`);
  lines.push('');
  lines.push(
    'Only L3 may be called success, and that judgement is a human’s, taken after several rounds. This '
      + 'report states a position rather than a grade and reaches no conclusion about the project.',
    '',
  );
  if (ladder.omissionZero !== undefined) {
    lines.push(
      `\`omission 0\` result: ${JSON.stringify(ladder.omissionZero)}. It is material for the human’s `
        + 'decision and is not the success condition.',
      '',
    );
  }
  if (ladder.residue !== undefined) {
    lines.push(`Residue: ${JSON.stringify(ladder.residue)}.`, '');
  }
  return lines.join('\n');
}
