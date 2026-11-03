# GIF animation fixtures

These fixtures are **synthetic**. They are not anonymized real data. They are small on
purpose: each file contains only the fields a parser needs to make the decisions described
in `docs/progress-gif/GIF-ANIMATION-INFO-SUPPLEMENT.md`.

The implemented renderer consumes these bundles in `tests/conver/`; `workspace-min.json`
is the manifests-only acceptance case that must exit zero.

## Materialization

Each `workspace-*.json` is a bundle:

```json
{
  "root": "workspace-mixed",
  "files": {
    "WORKSPACIFY-TREE-MANIFEST.json": { "artifact_kind": "…" },
    "spec.md": "# text"
  }
}
```

- An object value is written as `JSON.stringify(value)`.
- A string value is written as raw text.
- Create `<target>/<root>/`, then write each `files` entry under it.
- No ellipses or comments are used; every bundle is valid JSON.

A minimal materializer:

```js
import fs from 'node:fs';
import path from 'node:path';

const [bundlePath, target] = process.argv.slice(2);
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const root = path.join(target, bundle.root);
for (const [rel, value] of Object.entries(bundle.files)) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}
```

## Caveats

- All hashes are synthetic. Digest-freshness checks (smooth `inputDigest`,
  graphify/boundify/split `lastOutputDigest`) are exercised only by the stale case and by
  recomputing them in the test; do not expect the synthetic values to match a real
  `sha256`.
- The `EXPLAIN-RFC-SEED.md` facts blocks are abbreviated to the seven section keys. They
  are valid Markdown/JSON, but they do not carry the fixed fact-id set of a real producer.
  Use them to test section counting, not full ledger reconstruction.
- The `Tickets.json` contract objects are minimal but satisfy the required
  `id/sourceEdge/precondition/postcondition/invariant` shape.
- `workspace-mixed` is intentionally inconsistent in places (e.g. a graph exists while
  `Status.state` is `GRILLING`; smooth digests are synthetic). The expected file records
  these as warnings or undeterminable, not as clean passes.

## Case map

| Case | Fixture | What it tests |
|---|---|---|
| 1 | `workspace-min.json` | workspacify complete, no later artifacts; legacy root `Tickets.json` ignored |
| 2 | `workspace-mixed.json` (alpha, beta, gamma) | packages at explain/graphify/boundify |
| 3 | `workspace-mixed.json` (delta) | todo/made/planned/done/reviewed tickets |
| 4 | `workspace-mixed.json` (epsilon) | unresolved/resolved stubs, crimes, OMISSIONS, consolidation manifest |
| 5 | `workspace-mixed.json` (zeta) | crystalize complete+residue, drill mid-session |
| 6 | `workspace-mixed.json` (root) vs `workspace-min.json` | legitimate root package vs unowned legacy aggregate |
| 7 | `workspace-mixed.json` (eta, beta decoys) | stale digest, `.delta`/`.bak`/`archive` decoys |

`expected.json` gives, per case: detected packages, adopted/ignored artifacts, per-stage
state with evidence, directly computable counts, recoverable events and time precision,
undeterminable items, and warnings.
