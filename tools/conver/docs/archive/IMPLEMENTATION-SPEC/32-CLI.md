# 32 — CLI Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-cli` is a thin command-line adapter. It parses arguments, obtains a
credential, invokes the same operations as every other interface, and formats
the result. Local execution is an explicit mode with an explicit principal; it
is not an implicit administrator backdoor.

---

## 2. Dependencies

```toml
[dependencies]
clap = { workspace = true, features = ["derive"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
tokio = { workspace = true, features = ["rt-multi-thread", "macros"] }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
reqwest = { workspace = true, features = ["json"] }   # remote REST mode
tonic = { workspace = true }                           # remote gRPC mode
```

`*-cli` MUST NOT depend on `*-rest`, `*-grpc`, `*-websocket`, `*-mcp`, or
`*-a2a`. It may speak the protocol directly or use a generated client module.

---

## 3. Layout

```text
*-cli/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # run(), ExitCode
    ├── commands/
    │   ├── mod.rs
    │   ├── generated.rs        # generated command tree from the catalog
    │   └── common.rs           # --json, --timeout-ms, --endpoint, ...
    ├── local/
    │   ├── mod.rs
    │   ├── principal.rs        # explicit local principal
    │   └── verifier.rs         # LocalCredentialVerifier
    ├── remote/
    │   ├── mod.rs
    │   ├── rest.rs             # remote REST client
    │   └── grpc.rs             # remote gRPC client
    ├── output/
    │   ├── mod.rs
    │   ├── json.rs
    │   └── human.rs
    ├── error/
    │   └── exit.rs             # error -> exit code
    └── tests/
```

---

## 4. Public API

```rust
pub fn run(args: impl IntoIterator<Item = String>) -> ExitCode;
```

`run` is the only entry point. It parses arguments, selects local or remote
mode, invokes the operation, writes the result, and returns the exit code.

---

## 5. Generated Command Tree

The generator emits one subcommand per operation, derived from the catalog:

```rust
#[derive(clap::Parser)]
pub struct Cli {
    #[command(flatten)]
    pub common: CommonFlags,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(clap::Subcommand)]
pub enum Command {
    AccountAdd(AccountAddArgs),
    AccountGet(AccountGetArgs),
    // one variant per catalog operation
}

#[derive(clap::Args)]
pub struct AccountAddArgs {
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub email: String,
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-01 | Argument types are generated separately from operation types. Clap attributes never appear on operation structs. | Separation. | Argument names. | V1; V2 derive scan. |
| CLI-02 | Every catalog operation has one subcommand. | One-to-one. | Command name. | V3 catalog test. |
| CLI-03 | A composition command is allowed only when documented and mapped to a sequence of operations. | Documentation. | Composition set. | V3 test. |
| CLI-04 | The command converts arguments into the operation request and calls the dispatcher. | Conversion path. | Argument mapping. | V3 test. |

---

## 6. Modes

### 6.1 Local mode

```rust
pub trait LocalCredentialVerifier: Send + Sync {
    fn verify(
        &self,
        principal: identity_core::SubjectId,
        credential: &str,
    ) -> Result<identity_core::AuthenticatedUser, identity_core::AuthenticationError>;
}

pub trait LocalIdentityIssuer: Send + Sync {
    fn establish(
        &self,
        user: &identity_core::AuthenticatedUser,
        audience: identity_core::Audience,
        ttl: std::time::Duration,
    ) -> Result<std::sync::Arc<identity_core::VerifiedIdentity>, identity_core::AuthenticationError>;
}
```

```text
--local
--principal <uuid>
--credential-file <path>     # local credential, 0600
--audience <interface>       # defaults to "cli"
```

Local mode:

1. reads the local credential from a file, stdin, or TTY;
2. verifies it through `LocalCredentialVerifier`;
3. establishes a `VerifiedIdentity` through `LocalIdentityIssuer`
   (the CLI binding, not a REST or WebSocket binding);
4. calls `Dispatcher::execute_verified`.

There is no implicit administrator. The local credential must be provisioned
explicitly. A missing or invalid credential is exit code 3.

### 6.2 Remote mode

```text
--endpoint <url|host:port>
--protocol rest|grpc
--token-file <path> | --token-stdin | --token-tty
--refresh-file <path>
```

Remote mode:

1. obtains a token through `auth.token.issue` or a stored token;
2. sends the operation request over the selected protocol;
3. maps the protocol error to the operation error category;
4. writes the result.

The CLI MUST NOT pass both `--token-file` and a token in argv. A token in argv
is rejected before execution.

The CLI remote client is a **protocol client**, not an interface adapter. It may
speak REST or gRPC over the network. IF-06 forbids one adapter crate from
depending on another adapter crate; it does not forbid a client from calling a
server.

---

## 7. Output and Exit Codes

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-05 | Data goes to stdout; progress and diagnostics go to stderr. | Channels. | Format. | V3 test. |
| CLI-06 | `--json` emits one JSON value; `--jsonl` emits one JSON object per line. | Modes. | Field set. | V3 test. |
| CLI-07 | Human output is not parsed by scripts; JSON is the machine contract. | Contract. | Human formatting. | V4 review. |
| CLI-08 | Exit codes follow the fixed table. | Table. | Message text. | V3 test. |
| CLI-13 | JSON/JSONL output includes the operation's `request_id`. | Field. | Placement. | V3 test. |
| CLI-14 | The remote client is a protocol client, not an interface-adapter dependency. | Boundary. | Client implementation. | V2 dependency check. |

Exit code table:

| Code | Meaning |
|---|---|
| 0 | Success or normal EOF |
| 2 | Argument or configuration error |
| 3 | Authentication or authorization failure |
| 4 | Target, state, or conflict error |
| 5 | Network or external failure |
| 6 | Timeout or cancellation |
| 7 | Internal error |
| 8 | Capacity or unsupported |
| 130 | SIGINT |

---

## 8. Secrets

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-09 | Secrets are read from a file, stdin, or TTY. | Sources. | Prompt text. | V2 argv scan; V3 test. |
| CLI-10 | A secret in argv is rejected before any operation. | Rejection. | — | V3 test. |
| CLI-11 | Secrets are never written to stdout, logs, or error messages. | Forbidden. | — | V2 scan; V3 redaction test. |
| CLI-12 | Token files are checked for restrictive permissions. | Permission check. | Threshold. | V3 test. |

---

## 9. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, `run` entry point, mode selection. | Argument names, help text, output formatting. |
| Generated one-to-one command mapping. | Composition commands with documentation. |
| Local/remote distinction and explicit principal. | Local credential backend. |
| Exit code table and output channels. | Human-readable presentation. |
| Secret sources and argv rejection. | Token cache and refresh strategy. |
| No cross-interface crate dependency. | Direct protocol client implementation. |

---

## 10. Conformance Obligations

1. Every catalog operation has a subcommand.
2. Local mode rejects a missing or invalid principal.
3. Remote mode rejects a token in argv.
4. Exit codes match the table for every error category.
5. stdout contains no diagnostics; stderr contains no data.
6. JSON/JSONL output matches the operation response schema.
7. No secret appears in output, logs, or errors.
8. No cross-interface crate dependency.
9. `cargo test -p <project>-cli` and `cargo clippy -p <project>-cli -- -D
   warnings`.
10. The conformance report names `CLI-01` through `CLI-14`.

## 11. Implementation Contract

### 11.1 Cargo contract

`clap = { version = "=4.5.50", features = ["derive"] }`; `reqwest = { version = "=0.12.24", features = ["json", "rustls-tls", "stream"] }`; `tonic = { version = "=0.14.2", features = ["transport", "codegen"] }`; `rpassword = "=7.4.0"`; `zeroize = "=1.8.2"`.

### 11.2 Required API sequence

Fallible parse -> validation -> explicit local/REST/gRPC mode -> credential source -> verifier or client -> dispatcher -> output renderer -> exit category.

### 11.3 Forbidden patterns

clap attributes on operation types, argv credential contents, stdout progress, implicit mode fallback, exit code 1 as a generic default.

### 11.4 Template

`templates/cli/`.

### 11.5 Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-15 | clap parsing types MUST be generated inside the CLI adapter and MUST NOT annotate operation-domain types. | Separation. | Command names. | V2 AST; V3 command test. |
| CLI-16 | The CLI MUST reject argv credential contents and MUST read secrets only from approved file, stdin, or TTY sources. | Sources. | Prompt text. | V2 scan; V3 process test. |
| CLI-17 | The CLI MUST reserve stdout for results and MUST use the fixed exit-code table for every termination path. | Channels and exits. | Message text. | V3 subprocess test. |
