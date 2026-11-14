---
type: "Section"
title: "6.2 Remote mode"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-8/6-2-remote-mode"
    title: "6.2 Remote mode"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-8/6-2-remote-mode"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4622-4622"
---
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

