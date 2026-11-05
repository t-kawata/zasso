// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
/**
 * A two-package workspace whose RFCs carry Rust fences.
 *
 * The API gate reads the RFC as the design document, the tree manifest as the package
 * list and the allocate manifest as the dependency declarations. This fixture carries
 * exactly those three inputs, so a test that changes a symbol changes one thing.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PROVIDER_ID = 'pkg-0001';
export const CONSUMER_ID = 'pkg-0002';
export const BOUNDARY_ID = 'boundary-001';

const PROVIDER_PATH = 'crates/provider';
const CONSUMER_PATH = 'crates/consumer';
const TREE_MANIFEST = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
const TEMP_PREFIX = 'px369-api-';

/** One RFC with an optional Rust fence. */
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
function rfcText(packageId, rustBody, { noFences = false } = {}) {
  const lines = [`# RFC ${packageId}`, ''];
  if (!noFences) lines.push('```rust', rustBody, '```', '');
  return lines.join('\n');
}

/**
 * @param {{ providerRust?: string, consumerRust?: string, declaredEdge?: boolean,
 *   noFences?: boolean }} input
 * @returns {{ root: string, providerRfc: string, consumerRfc: string, remove: () => void }}
 */
export function materializeApiWorkspace({
  providerRust = '',
  consumerRust = '',
  declaredEdge = true,
  noFences = false,
  noPackages = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  if (noPackages) {
    writeFileSync(join(root, TREE_MANIFEST), JSON.stringify({
      workspace: { packages: [] },
      dependencies: { boundaries: [] },
    }, null, 2));
    writeFileSync(join(root, ALLOCATE_MANIFEST), JSON.stringify({ contract_registry: [] }, null, 2));
    return { root, providerRfc: '', consumerRfc: '', remove: () => rmSync(root, { recursive: true, force: true }) };
  }
  const providerDir = join(root, PROVIDER_PATH);
  const consumerDir = join(root, CONSUMER_PATH);
  mkdirSync(providerDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  writeFileSync(join(root, TREE_MANIFEST), JSON.stringify({
    workspace: {
      packages: [
        { id: PROVIDER_ID, name: 'provider', path: PROVIDER_PATH },
        { id: CONSUMER_ID, name: 'consumer', path: CONSUMER_PATH },
      ],
    },
    dependencies: {
      boundaries: declaredEdge ? [{
        id: BOUNDARY_ID,
        provider_package: PROVIDER_ID,
        consumer_package: CONSUMER_ID,
      }] : [],
    },
  }, null, 2));

  writeFileSync(join(root, ALLOCATE_MANIFEST), JSON.stringify({
    contract_registry: declaredEdge ? [{
      boundary_id: BOUNDARY_ID,
      provider_package: PROVIDER_ID,
      consumer_package: CONSUMER_ID,
    }] : [],
  }, null, 2));

  const providerRfc = join(providerDir, 'RFC.md');
  const consumerRfc = join(consumerDir, 'RFC.md');
  writeFileSync(providerRfc, rfcText(PROVIDER_ID, providerRust, { noFences }));
  writeFileSync(consumerRfc, rfcText(CONSUMER_ID, consumerRust, { noFences }));

  return {
    root,
    providerRfc,
    consumerRfc,
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}
