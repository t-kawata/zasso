---
type: Table
id: table/48-implementation-blueprint-mandatory-4-docgen-binary-4-4-check-implementations/1/8d01df960976
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 8d01df960976b7b98316468065c23ac14ce555f0f6db65fcff852447692619c9
source: docs/archive/IMPLEMENTATION-SPEC/48-IMPLEMENTATION-BLUEPRINT.md
---
| Check | Implementation |
|---|---|
| Completeness | Every catalog operation has request/response schema; every field has a schema property; every validation rule has a description; every implemented interface has a binding and a rendered section. |
| English | Scan prose fields (summaries, descriptions, rule descriptions, error messages, examples) for CJK Unified Ideographs, Hiragana, Katakana, and Hangul; reject. Code fences marked `non-english-example` are exempt. |
| Secrets | Reject `-----BEGIN`, `Bearer ` followed by 20+ characters, `sk-`, `AKIA`, `password=`, `secret=`, and configured secret patterns. |
| Determinism | Run render twice into two temporary directories; compare byte-for-byte. Sort maps; no timestamps, random values, absolute paths, or unordered iteration. |
