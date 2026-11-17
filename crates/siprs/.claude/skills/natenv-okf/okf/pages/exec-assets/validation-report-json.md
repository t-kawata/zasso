---
type: "Reference"
title: "EXEC_ASSETS/validation/report.json"
description: "Static validation report for the execution assets."
sources: 
  - resource: "EXEC_ASSETS/validation/report.json"
    id: "exec-asset-validation-report-json"
    title: "EXEC_ASSETS/validation/report.json"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/validation/report.json"
x-asset-sha256: "a9050b17998cc60f59e96833caa53b627469217d60d803775ab70f72ac4acc2e"
x-content-sha256: "bae24445992f0d90223f2b948e45cec4d4cde396f7f80e622dd950cd00eaeb2a"
x-requires: 
  - "pages/pre-okf-original/32-source-grounded-platform-facts-and-verification-scope"
x-source-span: "1-285"
x-topic: "exec-assets"
---
## EXEC_ASSETS/validation/report.json

Static validation report for the execution assets.

- role: Reference
- interface: none
- governing section: [32. Source-grounded platform facts and verification scope](../pre-okf-original/32-source-grounded-platform-facts-and-verification-scope.md)
- asset hash: `a9050b17998cc60f59e96833caa53b627469217d60d803775ab70f72ac4acc2e`
- source span: lines 1-285

```json
{
  "edition": "2026-11-17",
  "checks": [
    {
      "check": "shell_syntax",
      "file": "scripts/node.sh",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/policy.sh",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/link.sh",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/capture.sh",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/state.sh",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "scripts/probe.py",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "scripts/outer-relay.py",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "generate.py",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "lab",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "bootstrap/ubuntu.sh",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "bootstrap/macos.sh",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "bootstrap/freeze.sh",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "vm/macos-collect.sh",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "scripts/nat-observe.py",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "scripts/inject.py",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "scripts/fixture.py",
      "status": "PASS"
    },
    {
      "check": "json_parse",
      "file": "config/fixture.json",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "scripts/observer.py",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/tls.sh",
      "status": "PASS"
    },
    {
      "check": "json_parse",
      "file": "compose.tls.json",
      "status": "PASS"
    },
    {
      "check": "json_parse",
      "file": "compose.timeout.json",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "scripts/linux-endpoint.sh",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "agent-run.py",
      "status": "PASS"
    },
    {
      "check": "json_parse",
      "file": "inventory.example.json",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "doctor.py",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "validate.py",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "jobs/mac-state.sh",
      "status": "PASS"
    },
    {
      "check": "shell_syntax",
      "file": "jobs/infra-state.sh",
      "status": "PASS"
    },
    {
      "check": "python_ast",
      "file": "scripts/media.py",
      "status": "PASS"
    },
    {
      "check": "generator_invariants_with_mock_keygen",
      "variant": "single",
      "services": 9,
      "status": "PASS"
    },
    {
      "check": "generator_invariants_with_mock_keygen",
      "variant": "double",
      "services": 10,
      "status": "PASS"
    },
    {
      "check": "loopback_probe",
      "protocol": "udp",
      "result": {
        "observed": [
          "127.0.0.1",
          54047
        ],
        "reply_from": [
          "127.0.0.1",
          35245
        ],
        "integrity": true,
        "protocol": "udp",
        "elapsed_ms": 0.2214099999946484
      },
      "status": "PASS"
    },
    {
      "check": "loopback_probe",
      "protocol": "tcp",
      "result": {
        "bytes": 262144,
        "sha256": "31a1f9dea0169551092d05e8bf4a446228c8c3eb4c9b713c66adcb7fd53c89be",
        "integrity": true,
        "protocol": "tcp",
        "elapsed_ms": 12.576889999991181
      },
      "status": "PASS"
    },
    {
      "check": "loopback_outer_udp_carrier",
      "ports": [
        51821,
        51822,
        51823
      ],
      "payload_bytes": 1200,
      "status": "PASS"
    },
    {
      "check": "loopback_same_socket_alternate_observers",
      "result": {
        "event": "mapping",
        "socket_preserved": true,
        "observations": [
          {
            "destination": "127.0.0.3:9000",
            "observed": [
              "127.0.0.1",
              42820
            ]
          },
          {
            "destination": "127.0.0.3:9001",
            "observed": [
              "127.0.0.1",
              42820
            ]
          },
          {
            "destination": "127.0.0.4:9000",
            "observed": [
              "127.0.0.1",
              42820
            ]
          }
        ],
        "filtering": "NOT_QUALIFIED"
      },
      "status": "PASS"
    },
    {
      "check": "media_identity_positive",
      "result": {
        "seconds": 3.0,
        "rms": 3624.7615050740465,
        "clipping_fraction": 0.0,
        "correlation": 0.9999999999999998,
        "lag_ms": 0.0,
        "overlap_seconds": 3.0,
        "identity_method": "bounded-lag FFT peak then centered normalized correlation; no drift correction",
        "pass": true
      },
      "status": "PASS"
    },
    {
      "check": "media_identity_negative",
      "result": {
        "seconds": 3.0,
        "rms": 3450.5700037578335,
        "clipping_fraction": 0.0,
        "correlation": 0.8474852228300894,
        "lag_ms": -5.75,
        "overlap_seconds": 2.99425,
        "identity_method": "bounded-lag FFT peak then centered normalized correlation; no drift correction",
        "pass": false
      },
      "status": "PASS"
    },
    {
      "check": "finite_fixture_generation",
      "mode": "eim",
      "status": "PASS"
    },
    {
      "check": "finite_fixture_generation",
      "mode": "apdm",
      "status": "PASS"
    },
    {
      "check": "english_only_and_prohibited_name_absent",
      "status": "PASS"
    }
  ],
  "not_executed": [
    "Docker image build/container startup/dataplane",
    "Hyper-V or Windows guest runtime",
    "Tart or macOS guest runtime",
    "WireGuard/nft/conntrack/netem kernel path",
    "actual SIP/TURN/custom-product interoperability",
    "PowerShell parser/runtime"
  ],
  "interpretation": "Local test results only; target-machine scopes have their own acceptance procedures"
}
```

[^exec-asset-validation-report-json]

[^exec-asset-validation-report-json]: EXEC_ASSETS/validation/report.json — lines 1-285.
