---
type: "Section"
title: "1. Purpose"
description: "`*-grpc` is a thin gRPC adapter. It generates the protobuf service from the"
sources: 
  - resource: "sources/33-GRPC.md"
    id: "33-grpc-1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/33-GRPC.md"
x-source-span: "10-19"
---
## 1. Purpose

`*-grpc` is a thin gRPC adapter. It generates the protobuf service from the
operation catalog, extracts metadata credentials, verifies them, converts
protobuf messages to operation requests, calls the dispatcher, and maps the
result and errors to gRPC statuses. Generated protobuf types never leave this
crate.

---

