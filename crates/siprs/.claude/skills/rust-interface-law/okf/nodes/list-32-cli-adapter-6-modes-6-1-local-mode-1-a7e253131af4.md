---
type: List
id: list/32-cli-adapter-6-modes-6-1-local-mode/1/a7e253131af4
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: a7e253131af4f2330d54134128d3cc26d6a815c7aac579ce0ea3bac37ec82677
source: sources/32-CLI.md
---
1. reads the local credential from a file, stdin, or TTY;
2. verifies it through `LocalCredentialVerifier`;
3. establishes a `VerifiedIdentity` through `LocalIdentityIssuer`
   (the CLI binding, not a REST or WebSocket binding);
4. calls `Dispatcher::execute_verified`.
