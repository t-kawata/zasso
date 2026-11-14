---
type: "Section"
title: "1. Purpose"
description: "`*-websocket` is a thin, long-lived adapter. It authenticates the upgrade with a"
sources: 
  - resource: "sources/31-WEBSOCKET.md"
    id: "31-websocket-1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/31-WEBSOCKET.md"
x-source-span: "10-18"
---
## 1. Purpose

`*-websocket` is a thin, long-lived adapter. It authenticates the upgrade with a
one-time session ticket, converts messages to operation invocations, correlates
responses, forwards events and streams, and manages connection state,
backpressure, expiry, and cleanup.

---

