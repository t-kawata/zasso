// [::TICKET::] PX-194 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-194 --for-spec --no-implementation-order`.
// PX-194 @verifies C003
/**
 * Implementation order.
 *
 * Once the coupling contracts are proven, the order in which the directories can
 * be implemented follows from the graph: a package's depth is 0 when it depends on
 * nothing and 1 + (deepest provider's depth) otherwise, so every provider sits in
 * an earlier wave than each of its consumers. Stage 2 derives that order and then
 * PROVES it equals the order stage 1 published; it never invents one.
 */
/** Derive the providers-first wave order from the verified graph. */
export function deriveImplementationOrder({ graph, manifest }) {
  const hasCycle = (graph?.cycles ?? []).length > 0;
  if (hasCycle) {
    return { serial: [], levels: [] };
  }
  const nodeIds = (manifest?.workspace?.packages ?? []).map((pkg) => pkg.id);
  const nodeSet = new Set(nodeIds);
  const providersByConsumer = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of graph?.edges ?? []) {
    if (nodeSet.has(edge.consumer_package) && nodeSet.has(edge.provider_package) && edge.consumer_package !== edge.provider_package) {
      providersByConsumer.get(edge.consumer_package).push(edge.provider_package);
    }
  }

  const depthByNode = new Map();
  const depthOf = (nodeId) => {
    if (depthByNode.has(nodeId)) {
      return depthByNode.get(nodeId);
    }
    depthByNode.set(nodeId, 0);
    const providerDepths = providersByConsumer.get(nodeId).map((providerId) => depthOf(providerId));
    const depth = providerDepths.length === 0 ? 0 : Math.max(...providerDepths) + 1;
    depthByNode.set(nodeId, depth);
    return depth;
  };

  const levels = [];
  for (const nodeId of nodeSet) {
    const depth = depthOf(nodeId);
    levels[depth] = levels[depth] ?? [];
    levels[depth].push(nodeId);
  }
  const sortedLevels = levels.map((level) => [...(level ?? [])].sort());
  return { serial: sortedLevels.flat(), levels: sortedLevels };
}

/**
 * Verify the derived order against the stage-1 proof.
 *
 * @param {{ derived: object, manifest: object }} input
 * @returns {{ ok: boolean, index?: number, reason?: string }} verdict
 */
export function verifyOrderAgainstStage1({ derived, manifest }) {
  const proof = manifest?.dependencies?.dag?.implementation_order;
  if (!proof || !Array.isArray(proof.serial) || !Array.isArray(proof.levels)) {
    return { ok: false, index: 0, reason: 'dependencies.dag.implementation_order is missing' };
  }
  const derivedSerial = derived?.serial ?? [];
  const proofSerial = proof.serial ?? [];
  if (derivedSerial.length !== proofSerial.length) {
    return { ok: false, index: 0, reason: 'implementation_order length differs from the stage-1 proof' };
  }
  for (let index = 0; index < proofSerial.length; index += 1) {
    if (derivedSerial[index] !== proofSerial[index]) {
      return { ok: false, index, reason: `implementation_order diverges at index ${index}: stage 2 has ${derivedSerial[index]}, stage 1 proved ${proofSerial[index]}` };
    }
  }
  const derivedLevels = JSON.stringify(derived?.levels ?? []);
  const proofLevels = JSON.stringify(proof.levels);
  if (derivedLevels !== proofLevels) {
    return { ok: false, index: 0, reason: 'implementation_order levels differ from the stage-1 proof' };
  }
  return { ok: true };
}

/** The order entry injected into a seed's reference block. */
export function describeOrderForPackage({ derived, packageId }) {
  const levels = derived?.levels ?? [];
  const wave = levels.findIndex((level) => level.includes(packageId));
  if (wave < 0) {
    return { before: [], after: [], parallel_with: [], serial_index: -1, wave: -1 };
  }
  return {
    before: [...(levels[wave - 1] ?? [])],
    after: [...(levels[wave + 1] ?? [])],
    parallel_with: levels[wave].filter((id) => id !== packageId),
    serial_index: (derived.serial ?? []).indexOf(packageId),
    wave,
  };
}
