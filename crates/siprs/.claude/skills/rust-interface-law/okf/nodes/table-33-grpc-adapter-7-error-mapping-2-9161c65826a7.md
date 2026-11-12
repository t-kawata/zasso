---
type: Table
id: table/33-grpc-adapter-7-error-mapping/2/9161c65826a7
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: 9161c65826a775768563636300c777cfd06845704256d93cbd711cd35839c46a
source: docs/archive/IMPLEMENTATION-SPEC/33-GRPC.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-10 | Every category maps to the status above. | Table. | Detail payload. | V3 mapping test. |
| GRPC-11 | Rich details are encoded as `google.rpc.Status` details or the JSON detail field; they never contain secrets. | Detail channel. | Encoding. | V3 redaction test. |
