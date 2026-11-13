---
type: "Section"
title: "6. Modes"
description: "```rust"
sources: 
  - resource: "sources/32-CLI.md"
    id: "32-cli-6-modes"
    title: "6. Modes"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/32-CLI.md"
x-source-span: "122-188"
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

