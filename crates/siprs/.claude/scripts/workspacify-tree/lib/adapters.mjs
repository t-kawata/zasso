// [::TICKET::] PX-177 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`.
/**
 * Port/adapter boundary checks (§10.1).
 *
 * Domain/protocol packages must not reach concrete external I/O directly;
 * a port owns the abstraction and an adapter implements it. This module
 * reports external capabilities that lack a port and adapters that are not
 * attached to any port.
 */

/**
 * Check port/adapter boundaries.
 *
 * @param {{ ports: Array<object>, packages: Array<object> }} input
 *   ports: [{ id, provides: string[], implementedBy: string[] }]
 *   packages: [{ id, layer, kind, externalImplementations?: string[] }]
 * @returns {{ violations: Array<object>, missingPorts: Array<string> }}
 */
export function checkPortAdapterBoundary({ ports, packages }) {
  const providedCapabilities = new Set();
  const implementedAdapters = new Set();
  for (const port of ports ?? []) {
    for (const capability of port.provides ?? []) {
      providedCapabilities.add(capability);
    }
    for (const packageId of port.implementedBy ?? []) {
      implementedAdapters.add(packageId);
    }
  }

  const violations = [];
  const missingPorts = [];

  for (const pkg of packages ?? []) {
    if (pkg.layer === 'protocol' || pkg.layer === 'domain') {
      for (const capability of pkg.externalImplementations ?? []) {
        if (!providedCapabilities.has(capability)) {
          missingPorts.push(capability);
        }
      }
    }
    if (pkg.kind === 'adapter' && !implementedAdapters.has(pkg.id)) {
      violations.push({ type: 'unattached-adapter', packageId: pkg.id });
    }
  }

  return { violations, missingPorts: [...new Set(missingPorts)] };
}
