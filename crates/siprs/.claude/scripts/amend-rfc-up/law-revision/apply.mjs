// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { applyIdentityOperations } from '../revision/identity.mjs';
import { validateInterpretations } from '../revision/interpretations.mjs';
import { assertCoverageComplete } from '../revision/coverage.mjs';
import { validateRevisionPlan } from '../revision/plan.mjs';
import { prepareSkillTree } from '../revision/skill-tree.mjs';
import { loadLawBaseline } from './baseline.mjs';
import { generateLawBundleRevision } from './generate.mjs';
import { applyRegistryOperations } from './registry.mjs';

export async function applyLawRevision(options) {
  const {
    baselineSkill,
    plan,
    documentMap,
    context,
    outDir,
    documentText,
    documentAlias,
    sourceRoot = null,
    revisionPath = null,
    aliasPath = null,
    baselineAliasPath = null,
  } = options;
  validateInterpretations({ interpretations: plan.interpretations ?? [], documentMap });
  const baseline = loadLawBaseline({ baselineSkill });
  validateRevisionPlan({
    plan,
    baseline: {
      rules: Object.fromEntries(baseline.registry.map((row) => [row.id, row])),
      tombstones: baseline.tombstones,
    },
    documentMap,
    policy: context,
  });
  prepareSkillTree({ baselineSkill, outDir });
  const registry = applyRegistryOperations({ baselineRegistry: baseline.registry, operations: plan.operations });
  const identity = applyIdentityOperations({
    baselineRuleIds: Object.keys(baseline.ruleConcepts.byRule ?? {}),
    baselineConceptIds: [],
    tombstones: baseline.tombstones,
    operations: plan.operations,
  });
  const generated = await generateLawBundleRevision({
    baseline,
    revision: { registry, identity, plan, context, documentMap, documentText, documentAlias },
    output: { outDir, sourceRoot, revisionPath, aliasPath, baselineAliasPath },
  });
  assertCoverageComplete(generated.coverage);
  return { baseline, registry, identity, ...generated };
}
