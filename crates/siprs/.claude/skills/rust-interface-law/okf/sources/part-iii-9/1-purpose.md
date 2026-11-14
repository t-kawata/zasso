---
type: "Section"
title: "1. Purpose"
description: "`*-grpc` is a thin gRPC adapter. It generates the protobuf service from the"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-9/1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-9/1-purpose"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4726-4726"
---
## 1. Purpose

`*-grpc` is a thin gRPC adapter. It generates the protobuf service from the
operation catalog, extracts metadata credentials, verifies them, converts
protobuf messages to operation requests, calls the dispatcher, and maps the
result and errors to gRPC statuses. Generated protobuf types never leave this
crate.

---

## 2. Dependencies

