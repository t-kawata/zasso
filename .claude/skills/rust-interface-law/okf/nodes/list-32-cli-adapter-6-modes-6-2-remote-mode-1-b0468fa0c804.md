---
type: List
id: list/32-cli-adapter-6-modes-6-2-remote-mode/1/b0468fa0c804
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: b0468fa0c8046e1a4303ca7f91d91e907377a295b6baa53902175c97dbde5543
source: docs/archive/IMPLEMENTATION-SPEC/32-CLI.md
---
1. obtains a token through `auth.token.issue` or a stored token;
2. sends the operation request over the selected protocol;
3. maps the protocol error to the operation error category;
4. writes the result.
