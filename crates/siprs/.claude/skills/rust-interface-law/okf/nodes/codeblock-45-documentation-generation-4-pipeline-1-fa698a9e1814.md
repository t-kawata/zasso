---
type: CodeBlock
id: codeblock/45-documentation-generation-4-pipeline/1/fa698a9e1814
phase: docs
delivery: must
applies_to: all
requires: []
references: []
content_sha256: fa698a9e18143897a8371bd7b339e2edbe401cc970a909851e2aba00c692831f
source: docs/archive/IMPLEMENTATION-SPEC/45-DOCUMENTATION.md
---
```text
1. Build the neutral schema registry from operation DTOs.
   (No REST server is started; no adapter is required.)
2. Load the operation catalog and interface bindings.
3. Merge shared authentication, error, envelope, streaming, and idempotency
   semantics.
4. Render the REST OpenAPI/Swagger output and the per-interface references.
5. Validate completeness, English-only, determinism, and secret-free output.
6. Publish or check in the generated artifacts.
```
