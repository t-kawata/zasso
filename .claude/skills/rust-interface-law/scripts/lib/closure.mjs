// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
import { sha256 } from './redact.mjs';
import { loadLawNodes } from './law-bundle.mjs';

export { loadOkf } from './okf.mjs';

const PHASE_ORDER = ['scope', 'contract', 'core', 'operation', 'adapter', 'docs', 'conformance', 'review'];

export async function buildLawManifest({ skillRoot, units }) {
  const { nodes } = await loadLawNodes({ skillRoot });
  return buildManifest({ profile: { project: { spec_version: '0.3.2' } }, units, nodes });
}

export function buildManifest({ profile, units, nodes }) {
  const phases = [...new Set(units.flatMap((unit) => unit.phases ?? []))]
    .sort((left, right) => PHASE_ORDER.indexOf(left) - PHASE_ORDER.indexOf(right));

  const selected = new Map();
  for (const node of nodes) {
    if (!phases.includes(node.phase)) continue;
    if (!appliesTo(node, units)) continue;
    selected.set(node.id, {
      ...node,
      delivery: node.delivery ?? 'must',
      reason: ['phase=' + node.phase, 'units=' + units.map((unit) => unit.id).join(',')],
    });
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (selected.has(node.id)) continue;
      const requiring = [...selected.values()].find((entry) => (entry.requires ?? []).includes(node.id));
      if (!requiring) continue;
      selected.set(node.id, {
        ...node,
        delivery: node.delivery ?? 'must',
        reason: ['requires<-' + requiring.id],
      });
      grew = true;
    }
  }

  const must = [...selected.values()];
  const omitted = nodes
    .filter((node) => !selected.has(node.id))
    .map((node) => ({
      id: node.id,
      reason: 'phase=' + node.phase + ' applies_to=' + node.applies_to,
    }));

  return {
    spec_version: profile?.project?.spec_version ?? '0.3.2',
    units: units.map((unit) => ({
      id: unit.id,
      crate: unit.crate,
      role: unit.role,
      interfaces: unit.interfaces ?? [],
    })),
    phases,
    nodes: must,
    omitted,
    closure_sha256: sha256(must.map((node) => node.id).sort().join('\n')),
  };
}

export function appliesTo(node, units) {
  if (!node.applies_to || node.applies_to === 'all') return true;
  return units.some((unit) =>
    (unit.interfaces ?? []).includes(node.applies_to) || unit.role === node.applies_to);
}
