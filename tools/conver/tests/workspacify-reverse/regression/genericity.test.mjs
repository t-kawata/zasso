// @verifies C002
// [::TICKET::] P25-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-4 --for-spec --no-implementation-order`.
/**
 * genericity — no project name reaches the operational path as a runtime value.
 *
 * The requirement this phase exists under is that no implementation may be optimised
 * for one project. Measured 2026-09-15, three project names stood as values in the
 * import closure from `run.mjs`: one was `PRODUCTION_MARKERS` naming this repository's
 * answer key inside a guard applied to every subject, and two are the oracle
 * instrument's own tree paths.
 *
 * The first is the defect. The other two are experiment configuration, and they are
 * exempt by declaration rather than hidden by a filter — this file asserts that every
 * exemption matches a real finding, so an entry that stops being needed is removed
 * rather than accumulating.
 *
 * The closure is recomputed in the same run that the sweep reads it, so a remembered
 * module list cannot satisfy this.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readModuleClosure } from '../helpers/module-closure.mjs';
import {
  EXPERIMENT_ONLY_MODULES,
  REPOSITORY_MATERIAL_NAMES,
  projectNameValuesIn,
} from '../helpers/genericity.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUN_ENTRY = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/run.mjs');
const MODULE_DIRECTORY = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib');

const closureModules = () =>
  [...readModuleClosure(RUN_ENTRY, MODULE_DIRECTORY).reached]
    .filter((file) => file.endsWith('.mjs'))
    .map((file) => ({ path: file, text: readFileSync(file, 'utf8') }));

test('C002 precondition: the closure is computed in the same run the sweep reads, and the names swept are declared', () => {
// [::TICKET::] P25-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-5 --for-spec --no-implementation-order`.
  const modules = closureModules();

  assert.ok(modules.length > 40, 'the closure was computed over the library rather than over an empty walk');
  assert.deepEqual(
    [...REPOSITORY_MATERIAL_NAMES].sort(),
    ['siprs-for-reverse', 'siprs-with-4layers'],
    'the names swept are this repository own material, declared rather than derived',
  );
});

test('C002 postcondition: no operational module carries a project name as a runtime value', () => {
  const findings = projectNameValuesIn({ modules: closureModules(), names: REPOSITORY_MATERIAL_NAMES });
  const exempt = new Set(Object.keys(EXPERIMENT_ONLY_MODULES));
  const outside = findings.filter((finding) => !exempt.has(basename(finding.path)));

  assert.deepEqual(
    outside,
    [],
    'a project name as a runtime value in a module the operational entrance reaches is the defect this sweep exists for',
  );
});

test('C002 postcondition: every exemption is a decision with a reason, and every entry is load-bearing', () => {
  const findings = projectNameValuesIn({ modules: closureModules(), names: REPOSITORY_MATERIAL_NAMES });

  for (const [name, reason] of Object.entries(EXPERIMENT_ONLY_MODULES)) {
    assert.ok(reason.trim().length >= 20, `${name} must carry a reason worth reading, not a shrug`);
    assert.ok(
      findings.some((finding) => basename(finding.path) === name),
      `${name} is exempt and must be exempt for something: a stale exemption is removed, not accumulated`,
    );
  }
});

test('C002 invariant: the sweep is driven by a positive fixture, so an empty result is a finding rather than a vacuous pass', () => {
  const fixture = (text) => [{ path: 'lib/offender.mjs', text }];

  assert.deepEqual(
    projectNameValuesIn({ modules: fixture("export const TREE = 'siprs-with-4layers';\n"), names: REPOSITORY_MATERIAL_NAMES }),
    [{ path: 'lib/offender.mjs', line: 1, name: 'siprs-with-4layers' }],
    'a fixture carrying a name is reported by path, line and name',
  );
  assert.deepEqual(
    projectNameValuesIn({ modules: fixture('// siprs-with-4layers is the answer key\n'), names: REPOSITORY_MATERIAL_NAMES }),
    [],
    'a comment is not a runtime value, which is why this distinguishes them rather than counting mentions',
  );
  assert.deepEqual(
    projectNameValuesIn({ modules: fixture("export const TREE = 'isolated';\n"), names: REPOSITORY_MATERIAL_NAMES }),
    [],
    'and a module naming none is clean, so the fixture shows the sweep decides rather than counts',
  );
});
