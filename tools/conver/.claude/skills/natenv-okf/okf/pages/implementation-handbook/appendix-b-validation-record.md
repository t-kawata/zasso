---
type: "Page"
title: "Appendix B — Validation record"
description: "Appendix B — Validation record"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-14"
    title: "Appendix B — Validation record"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "c93ee5dfea4c908caa960d882cd6421f29c3ffecc1740c16368d7c477ef04cec"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "2829-2987"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/9-machine-verifiable-quality-repetitions-final-gate"
---
## Appendix B — Validation record

```json
{
  "status": "static_checks_only",
  "checks": [
    {
      "check": "shell_syntax",
      "file": "scripts/node.sh",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/capture.sh",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/state.sh",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/policy.sh",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/link.sh",
      "status": "pass"
    },
    {
      "check": "python_syntax",
      "file": "scripts/pjsua.py",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "lab",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.single.yml",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.double.yml",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.private.yml",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.sut.example.yml",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/private-pbx.sh",
      "status": "pass"
    },
    {
      "check": "python_syntax",
      "file": "scripts/qualify-nat.py",
      "status": "pass"
    },
    {
      "check": "python_syntax",
      "file": "scripts/fixture-nat.py",
      "status": "pass"
    },
    {
      "check": "python_syntax",
      "file": "scripts/check-audio.py",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.timeout.example.yml",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.iroh.yml",
      "status": "pass"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/tls.sh",
      "status": "pass"
    },
    {
      "check": "yaml_parse",
      "file": "compose.turn-tls.yml",
      "status": "pass"
    },
    {
      "check": "topology_static_invariants",
      "variant": "single",
      "status": "pass"
    },
    {
      "check": "topology_static_invariants",
      "variant": "double",
      "status": "pass"
    },
    {
      "check": "topology_static_invariants",
      "variant": "private",
      "status": "pass"
    },
    {
      "check": "fixture_generator_apdm",
      "status": "pass"
    },
    {
      "check": "fixture_generator_eim",
      "status": "pass"
    },
    {
      "check": "rust_compile",
      "manifest": "probe/Cargo.toml",
      "status": "not_run",
      "reason": "cargo unavailable"
    },
    {
      "check": "rust_compile",
      "manifest": "accept/Cargo.toml",
      "status": "not_run",
      "reason": "cargo unavailable"
    },
    {
      "check": "docker_runtime",
      "status": "not_run",
      "reason": "No usable Docker daemon was available to this execution environment; no runtime tests claimed."
    },
    {
      "check": "python_syntax",
      "file": "scripts/make-tone.py",
      "status": "pass"
    }
  ],
  "not_certified": [
    "Docker build/runtime",
    "nft rules execution",
    "Asterisk/PJSUA calls",
    "coturn relay transfer",
    "iroh relay/client interoperation",
    "actual user Rust SUT",
    "full NAT filtering/lifetime qualification",
    "media quality SLOs"
  ]
}
```

[^implementation-handbook-14]

[^implementation-handbook-14]: Appendix B — Validation record — sources/implementation-handbook.md, lines 2829-2987.

