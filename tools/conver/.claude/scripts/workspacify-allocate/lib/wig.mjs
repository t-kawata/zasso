// [::TICKET::] PX-194, PX-196 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-194|PX-196) --for-spec --no-implementation-order`.
// PX-194 @verifies C002
/**
 * Workspace Integration Graph.
 *
 * The extracted contracts form a graph whose violations are all workspace-fatal:
 * a coupling nobody can honour, an owner claimed twice, a state mutated by two
 * directories, an effect started twice, a proof with no verifier, a forbidden
 * path that the composition nevertheless requires. The graph is an intermediate
 * artefact; only its canonical summary and hash are published.
 */
import { sha256Hex } from '../../workspacify-tree/lib/hash.mjs';
import { canonicalSerialize } from '../../workspacify-tree/lib/canonical-json.mjs';
import { detectCycles } from '../../workspacify-tree/lib/dag.mjs';
import { LAYER_FORBIDDEN_TARGETS, PRODUCTION_KINDS } from '../../workspacify-tree/lib/workspace-model.mjs';

const OWNER_SLOTS = ['semantic', 'state', 'side_effect', 'port', 'adapter'];

/** Build the typed graph from the contract index. */
export function buildIntegrationGraph({ contractIndex, manifest }) {
  const packages = manifest?.workspace?.packages ?? [];
  const nodes = packages.map((pkg) => ({
    package_id: pkg.id,
    name: pkg.name,
    path: pkg.path,
    layer: pkg.layer,
    kind: pkg.kind,
    responsibilities: [...(pkg.responsibilities ?? [])],
  }));
  const edges = [];
  for (const entry of contractIndex.values()) {
    const contract = entry.sides?.[entry.consumer_package] ?? entry.sides?.[entry.provider_package] ?? entry.occurrences?.[0]?.edge;
    if (!contract) {
      continue;
    }
    edges.push({
      contract_id: entry.contract_id,
      boundary_id: entry.boundary_id ?? null,
      consumer_package: contract.consumer_package ?? entry.consumer_package ?? null,
      provider_package: contract.provider_package ?? entry.provider_package ?? null,
      connection_kind: contract.connection_kind ?? 'value_only',
      contract,
    });
  }
  edges.sort((left, right) => left.contract_id.localeCompare(right.contract_id));
  return { nodes, edges, cycles: [] };
}

/** Every violation class the workspace must have zero of. */
export function runGraphViolations({ graph, manifest }) {
  const nodeIds = new Set(graph.nodes.map((node) => node.package_id));
  const nodeById = new Map(graph.nodes.map((node) => [node.package_id, node]));
  const declaredContractIds = new Set((manifest?.dependencies?.boundaries ?? []).map((boundary) => `contract-${boundary.id}`));
  const declaredPairs = new Set((manifest?.dependencies?.normal_edges ?? []).map((edge) => `${edge.from}->${edge.to}`));
  const forbiddenPairs = new Set((manifest?.dependencies?.forbidden_edges ?? []).map((edge) => `${edge.from}->${edge.to}`));
  const violations = [];
  const add = (violationClass, entry, detail) => violations.push({ class: violationClass, ...entry, detail });

  const seenContracts = new Set();
  for (const edge of graph.edges) {
    const entry = { contract_id: edge.contract_id, boundary_id: edge.boundary_id };
    if (!nodeIds.has(edge.consumer_package) || !nodeIds.has(edge.provider_package)) {
      add('unknown_package', entry, `edge references a package outside the catalog (${edge.consumer_package} -> ${edge.provider_package})`);
      continue;
    }
    if (edge.consumer_package === edge.provider_package) {
      add('self_loop', entry, 'a package cannot contract with itself');
    }
    if (seenContracts.has(edge.contract_id)) {
      add('duplicate_contract_id', entry, 'the same contract id appears on more than one edge');
    }
    seenContracts.add(edge.contract_id);
    if (!declaredContractIds.has(edge.contract_id)) {
      add('undeclared_edge', entry, 'the contract has no declared boundary');
    } else if (!declaredPairs.has(`${edge.consumer_package}->${edge.provider_package}`)) {
      add('reverse_edge', entry, 'the contract inverts a declared dependency direction');
    }
    if (forbiddenPairs.has(`${edge.consumer_package}->${edge.provider_package}`)) {
      add('forbidden_edge', entry, 'the contract relies on a forbidden edge');
    }
    if (violatesLayerRule(nodeById.get(edge.consumer_package), nodeById.get(edge.provider_package))) {
      add('layer_violation', entry, 'the contract crosses a forbidden layer boundary');
    }
    // A clause is only required when stage 1 declared it in the boundary scope.
    if (declaresClause(edge.contract, manifest, 'tests') && !hasClause(edge.contract, 'tests')) {
      add('missing_test_obligation', entry, 'the contract states no test obligation');
    }
    if (declaresClause(edge.contract, manifest, 'proof_verification') && !hasClause(edge.contract, 'proof_verification')) {
      add('proof_lifecycle_break', entry, 'the contract requires proof semantics but names no verifier');
    }
  }

  const cycles = detectCycles([...nodeIds], graph.edges.map((edge) => ({ from: edge.consumer_package, to: edge.provider_package })));
  for (const cycle of cycles) {
    add('cycle', { package_id: cycle.path[0] }, `dependency cycle: ${cycle.path.join(' -> ')}`);
  }

  for (const collision of findOwnerCollisions(graph.edges)) {
    add('owner_collision', { contract_id: collision.contract_id }, collision.detail);
  }
  for (const conflict of findOwnerConflicts(graph.edges, 'state', 'state_mutation_conflict')) {
    add('state_mutation_conflict', { contract_id: conflict.contract_id }, conflict.detail);
  }
  for (const race of findOwnerConflicts(graph.edges, 'side_effect', 'side_effect_race')) {
    add('side_effect_race', { contract_id: race.contract_id }, race.detail);
  }
  for (const path of findForbiddenFlows({ graph, manifest })) {
    add('forbidden_semantic_flow_path', { package_id: path[0] }, `forbidden semantic flow: ${path.join(' -> ')}`);
  }

  const summary = {
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    by_connection_kind: countBy(graph.edges, (edge) => edge.connection_kind),
    by_layer: countBy(graph.nodes, (node) => node.layer),
  };
  return {
    ok: violations.length === 0,
    violations,
    summary,
    hash: sha256Hex(Buffer.from(canonicalSerialize({ nodes: graph.nodes, edges: graph.edges.map((edge) => ({ contract_id: edge.contract_id, consumer_package: edge.consumer_package, provider_package: edge.provider_package })) }), 'utf8')),
  };
}

function hasClause(contract, clause) {
  const value = contract?.clauses?.[clause];
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value === 'string' && value.trim().length > 0;
}

/** Whether stage 1 declared this clause for the contract's boundary. */
function declaresClause(contract, manifest, clause) {
  const boundary = (manifest?.dependencies?.boundaries ?? []).find((entry) => `contract-${entry.id}` === contract?.contract_id);
  const scope = boundary?.stage2_contract_scope ?? [];
  return scope.includes(clause) || (clause === 'proof_verification' && scope.includes('signature'));
}

/** Two contracts for the same pair must not claim different owners for a slot. */
function findOwnerCollisions(edges) {
  const collisions = [];
  const byPairAndSlot = new Map();
  for (const edge of edges) {
    for (const slot of OWNER_SLOTS) {
      const owner = edge.contract?.owners?.[slot];
      if (!owner || owner === 'not_applicable') {
        continue;
      }
      const key = `${edge.consumer_package}->${edge.provider_package}#${slot}`;
      const previous = byPairAndSlot.get(key);
      if (previous && previous.owner !== owner) {
        collisions.push({ contract_id: edge.contract_id, detail: `owner slot ${slot} is claimed by both ${previous.owner} and ${owner}` });
      }
      byPairAndSlot.set(key, { owner, contract_id: edge.contract_id });
    }
  }
  return collisions;
}

/** Two contracts for the same pair must not mutate one canonical state twice. */
function findOwnerConflicts(edges, slot, violationClass) {
  const conflicts = [];
  const byPair = new Map();
  for (const edge of edges) {
    const owner = edge.contract?.owners?.[slot];
    if (!owner || owner === 'not_applicable') {
      continue;
    }
    const key = `${edge.consumer_package}->${edge.provider_package}`;
    const previous = byPair.get(key);
    if (previous && previous.owner !== owner) {
      conflicts.push({ contract_id: edge.contract_id, detail: `${violationClass}: ${slot} is held by both ${previous.owner} and ${owner}` });
    }
    byPair.set(key, { owner, contract_id: edge.contract_id });
  }
  return conflicts;
}

/** A reachable path from a forbidden source to a forbidden target. */
function findForbiddenFlows({ graph, manifest }) {
  const rules = manifest?.dependencies?.forbidden_layer_rules ?? [];
  if (rules.length === 0) {
    return [];
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.package_id, node]));
  const adjacency = new Map();
  for (const edge of graph.edges) {
    adjacency.set(edge.consumer_package, [...(adjacency.get(edge.consumer_package) ?? []), edge.provider_package]);
  }
  const paths = [];
  for (const rule of rules) {
    const sources = graph.nodes.filter((node) => node.layer === rule.from_layer).map((node) => node.package_id);
    const targets = new Set(graph.nodes.filter((node) => (rule.forbidden_to ?? []).includes(node.layer)).map((node) => node.package_id));
    for (const source of sources) {
      const stack = [[source]];
      const visited = new Set([source]);
      while (stack.length > 0) {
        const path = stack.pop();
        const current = path[path.length - 1];
        if (targets.has(current) && current !== source) {
          paths.push(path);
          break;
        }
        for (const next of adjacency.get(current) ?? []) {
          if (!visited.has(next)) {
            visited.add(next);
            stack.push([...path, next]);
          }
        }
      }
    }
  }
  return paths.slice(0, 1);
}

function violatesLayerRule(consumer, provider) {
  if (!consumer || !provider) {
    return false;
  }
  const forbiddenTargets = LAYER_FORBIDDEN_TARGETS[consumer.layer];
  if (forbiddenTargets && forbiddenTargets.has(provider.layer)) {
    return true;
  }
  return PRODUCTION_KINDS.has(consumer.kind) && provider.kind === 'conformance';
}

function countBy(entries, pick) {
  const counts = {};
  for (const entry of entries) {
    const key = pick(entry) ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
