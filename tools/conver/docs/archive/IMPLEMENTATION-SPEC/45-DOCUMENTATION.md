# 45 — Documentation Generation

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2

---

## 1. Purpose

Every implemented interface MUST have generated, English usage documentation.
Documentation is a build artifact, not a hand-maintained parallel text.

The generator does not parse Rust source code. It consumes a neutral schema
registry, the operation catalog, the interface bindings, the validation
descriptor registry, and the shared contracts. `utoipa`/OpenAPI is one schema
source and one REST output; it is not the only input and it is not required for
non-REST interfaces.

The mandatory implementation method — crates, macro expansion, inventory
registries, docgen subcommands, and gates — is Part III.18.

---

## 2. Inputs

| Input | Authority |
|---|---|
| Operation catalog | The authoritative operation list, authentication, scope, mode, idempotency, recovery, bindings, and conformance ID. |
| Neutral schema registry | Request/response types, fields, required/optional, enums, descriptions, examples. |
| Validation descriptor registry | Runtime validation rules, standard schema keywords, custom rules, error codes, and English descriptions. |
| Interface bindings | REST method/path/status/headers; WebSocket envelope/stream lifecycle; CLI command/flags/exit codes; gRPC service/method/proto fields/stream mode/metadata; MCP tool/auth/result representation; A2A skill/task/artifact/auth. |
| Shared contracts | Envelope, identity/binding, error categories, streaming, idempotency, authorization, revocation. |
| Operation documentation fields | Summary, description, examples, errors, preconditions, postconditions, failure/compensation, authorization notes. |
| `ApiDoc::openapi()` | Optional additional REST schema input when REST is implemented. |

The neutral schema registry is produced by `schemars::JsonSchema` (recommended)
or `utoipa::ToSchema` (allowed). The generator reads the resulting JSON Schema,
not the Rust source.

---

## 3. Outputs

```text
docs/generated/
├── INDEX.md
├── rest/
│   ├── openapi.json
│   ├── REFERENCE.md
│   └── swagger/              # optional static Swagger UI
├── websocket/REFERENCE.md
├── cli/REFERENCE.md
├── grpc/REFERENCE.md
├── mcp/REFERENCE.md
└── a2a/REFERENCE.md
```

Only the profiles present in `RULES-PROFILE.toml` are generated. A missing
reference for an implemented profile is a build failure.

---

## 4. Pipeline

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

The same generator and the same inputs produce all interface references. The
REST OpenAPI document is a rendering of the shared schema for REST, not the
source from which other interfaces are inferred.

---

## 5. Completeness

Every implemented interface × operation MUST have a section containing:

- operation ID, summary, and description;
- authentication requirement (`required`/`anonymous`) and required scopes;
- request and response schema, required/optional fields, enums, and examples;
- error categories and stable error codes;
- idempotency mode and replay semantics;
- streaming mode and lifecycle (items, EOF, cancel, backpressure), when applicable;
- authorization target, preconditions, postconditions, and failure/compensation;
- interface-specific invocation:
  - REST: method, path, status, headers;
  - WebSocket: envelope, operation ID, stream messages;
  - CLI: command, flags, stdin/stdout, exit codes;
  - gRPC: service, method, protobuf fields, stream mode, metadata;
  - MCP: tool name, applicability, auth/result representation;
  - A2A: skill, task, artifact, task operations, auth;
- conformance ID.

A missing operation, interface, field, error category, auth statement, or
example is a build failure.

---

## 5.1 Validation Constraints

Every input constraint is documented from the `ValidationDescriptor` produced by
the shared input macro (Part III.17). The generator does not infer constraints
from implementation code and does not accept a hand-written constraint list.

Each constraint entry includes:

- field name;
- rule kind and parameters (minimum, maximum, length, items, pattern, enum, or
  custom rule ID);
- unit and regex engine when they affect interpretation;
- error code;
- English description;
- applicability condition for conditional custom rules.

Custom rules are rendered as readable English text in every applicable
interface reference, not only in a vendor extension.

---

## 6. English-Only

| Context | Language |
|---|---|
| Generated documentation | English |
| Schema descriptions, examples, summaries | English |
| Rust doc comments used as documentation input | English |
| Operation catalog documentation fields | English |
| Runtime logs | English |
| UI labels and i18n resources | Per-product, not documentation |

A non-English string in generated documentation is a build failure. UI
localization is a separate artifact and is not generated by this pipeline.

---

## 7. No REST Dependency

Schema generation MUST NOT require a running REST server, a REST router, or the
REST adapter. `utoipa::ToSchema` or `schemars::JsonSchema` produces schema
information without serving HTTP.

A project that implements only MCP, A2A, CLI, WebSocket, or gRPC MUST still
generate its interface documentation. REST profiles are optional.

---

## 8. Determinism and Versioning

- Same `spec_version` + profile + operation catalog + schema registry +
  interface bindings + generator version → byte-identical output.
- Generated documentation records the `spec_version` and the input digest.
- The documentation version matches `spec_version`.
- Generated files carry `// @generated` or the Markdown equivalent.
- Hand edits to generated documentation are overwritten.
- Documentation is published as a build artifact or checked in; a missing
  artifact fails the build.

---

## 9. Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| DOC-01 | Every implemented interface MUST have generated usage documentation. | Coverage. | Renderer and template. | V2 artifact check; V3 test. |
| DOC-02 | The operation catalog is the authoritative operation list and binding map. | Authority. | Catalog fields beyond the required set. | V3 catalog test. |
| DOC-03 | The generator MUST consume a neutral schema registry, not parse Rust source. | Input boundary. | Schema source implementation. | V2 scan; V3 test. |
| DOC-04 | `utoipa`/OpenAPI MAY be used as a schema source and REST output, but MUST NOT be the only source for non-REST interfaces. | Source independence. | REST rendering. | V3 test. |
| DOC-05 | Interface-specific documentation MUST come from interface bindings, not be inferred from REST. | Source of truth. | Binding fields. | V3 test. |
| DOC-06 | Documentation generation MUST NOT require a running REST server or REST adapter. | Independence. | Build tooling. | V2/V3 test. |
| DOC-07 | Every operation section MUST include schema, examples, auth, errors, idempotency, streaming, authorization, and conformance ID. | Completeness. | Presentation. | V3 completeness test. |
| DOC-08 | Every implemented interface MUST have a reference section for every applicable operation. | Coverage. | Non-applicability reason. | V3 matrix test. |
| DOC-09 | OpenAPI and Swagger UI MUST be generated from the same schema registry as the other references. | Shared source. | UI packaging. | V3 diff test. |
| DOC-10 | A missing operation, interface, field, error category, auth statement, or example MUST fail the build. | Fail-closed. | Error message. | V3 test. |
| DOC-11 | Generated documentation MUST be English-only; a non-English string fails the build. | Language. | — | V2 scan; V3 test. |
| DOC-12 | Generation MUST be deterministic for the same inputs and version. | Determinism. | Renderer. | V3 digest test. |
| DOC-13 | Documentation and examples MUST NOT contain secrets, tokens, or passwords. | Secret-free. | — | V2 scan; V3 test. |
| DOC-14 | Documentation MUST record `spec_version` and the input digest. | Versioning. | Metadata format. | V3 test. |
| DOC-15 | Documentation generation MUST be part of CI/conformance; a missing artifact fails the gate. | CI gate. | CI provider. | V3 test. |
| DOC-16 | Input constraints MUST be documented from the `ValidationDescriptor`, not from a hand-written list or inferred code. | Single source. | Presentation. | V2 scan; V3 test. |
| DOC-17 | Custom validation rules MUST appear as readable English text in every applicable interface reference. | Readability. | Formatting. | V3 test. |

---

## 10. Fixed and Open

| Fixed | Open |
|---|---|
| Inputs, outputs, completeness, English-only, determinism, secret-free. | Renderer, template, static-site generator. |
| Operation catalog as the operation list. | Catalog documentation fields beyond the required set. |
| Schema registry as the neutral source. | `schemars` or `utoipa` selection. |
| Per-interface references and OpenAPI/Swagger. | Visual presentation and navigation. |
| No REST dependency. | Build orchestration. |
| Version and digest metadata. | Artifact storage. |

---

## 11. Conformance Obligations

1. Every implemented profile has a generated reference directory.
2. Every applicable operation appears in each interface reference.
3. Every operation section has the required fields.
4. OpenAPI and the other references agree on schemas and errors.
5. A non-English string fails the English-only gate.
6. A secret in documentation fails the secret-free gate.
7. Two runs with the same inputs produce identical output.
8. A missing artifact fails CI.
9. A REST-free project generates documentation successfully.
10. The conformance report names `DOC-01` through `DOC-17` and `CONF-53` through
    `CONF-60`.

---

## 12. Example Commands

```bash
# Neutral schema + catalog + bindings -> all interface references
cargo run -p <project>-docgen -- \
  --catalog contract/operation-catalog.toml \
  --schema target/schema/registry.json \
  --out docs/generated

# REST-only OpenAPI check (when the REST profile is enabled)
cargo run -p <project>-docgen -- --check openapi docs/generated/rest/openapi.json

# Completeness, English-only, determinism, and secret gates
cargo run -p <project>-docgen -- --check all
```
