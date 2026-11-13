---
type: List
id: list/foundation-unify-seams-not-substance-6-extension-model-6-1-add-an-operation/1/deade2b8eb87
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: deade2b8eb87ad72a6badf794ce6726086310a8c9535aa973df7db6d0aab9ae3
source: sources/00-FOUNDATION.md
---
1. Add the operation to the catalog with the §11 template.
2. Generate the handler skeleton and interface bindings.
3. Implement `Operation::execute` in `*-operation`.
4. Add authorization inside the handler.
5. Add conformance cases (normal, failure, authorization).
6. Regenerate the interface bindings and matrix.
