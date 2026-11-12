---
type: List
id: list/55-implementation-contracts-2-policy-model-2-1-effective-policy/1/e6ea60ecb0e1
phase: adapter
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: e6ea60ecb0e1eaa8395e016b48c4a27070bc8c908080fdb02ba97c6ff9898d0e
source: docs/archive/IMPLEMENTATION-SPEC/55-IMPLEMENTATION-CONTRACTS.md
---
1. Read the skill baseline.
2. Read the project manifest.
3. If the project has no dependency, use the baseline exact pin.
4. If the project has a compatible dependency, use the project pin.
5. If the project pin is incompatible, fail closed with a policy conflict.
6. Write `effective-policy.json` with the resolved pins, features, and hashes.
