---
type: "Section"
title: "9.2 Observability"
description: "| ID | Rule | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/9-2-observability"
    title: "9.2 Observability"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/9-2-observability"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "860-860"
---
### 9.2 Observability

| ID | Rule | Verification |
|---|---|---|
| OBS-01 | Logs MUST be structured and include `request_id`, `operation_id`, `subject`, result, and duration. | V3 log test. |
| OBS-02 | Logs MUST NOT include tokens, secrets, authorization codes, or passwords. | V2 scan; V3 test. |
| OBS-03 | Metrics MUST cover operation latency, error rate, authentication failures, and audience rejections. | V2 metric inventory. |
| OBS-04 | Metrics and logs MUST distinguish interface, operation, and error code. | V3 test. |
| OBS-05 | Health endpoints MUST be minimal in public mode; detailed readiness is privileged. | V3 test. |

### 9.3 Security

## Rules in this section

- [OBS-01 — Logs MUST be structured and include `request_id`, `operation_id`, `subject`, ...](../../rules/c/obs-01.md)
- [OBS-02 — Logs MUST NOT include tokens, secrets, authorization codes, or passwords.](../../rules/c/obs-02.md)
- [OBS-03 — Metrics MUST cover operation latency, error rate, authentication failures, an...](../../rules/c/obs-03.md)
- [OBS-04 — Metrics and logs MUST distinguish interface, operation, and error code.](../../rules/c/obs-04.md)
- [OBS-05 — Health endpoints MUST be minimal in public mode; detailed readiness is privil...](../../rules/c/obs-05.md)

