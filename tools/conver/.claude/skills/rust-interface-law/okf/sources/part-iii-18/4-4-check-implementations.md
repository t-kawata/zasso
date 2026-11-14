---
type: "Section"
title: "4.4 Check Implementations"
description: "| Check | Implementation |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/4-4-check-implementations"
    title: "4.4 Check Implementations"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/4-4-check-implementations"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7866-7866"
---
### 4.4 Check Implementations

| Check | Implementation |
|---|---|
| Completeness | Every catalog operation has request/response schema; every field has a schema property; every validation rule has a description; every implemented interface has a binding and a rendered section. |
| English | Scan prose fields (summaries, descriptions, rule descriptions, error messages, examples) for CJK Unified Ideographs, Hiragana, Katakana, and Hangul; reject. Code fences marked `non-english-example` are exempt. |
| Secrets | Reject `-----BEGIN`, `Bearer ` followed by 20+ characters, `sk-`, `AKIA`, `password=`, `secret=`, and configured secret patterns. |
| Determinism | Run render twice into two temporary directories; compare byte-for-byte. Sort maps; no timestamps, random values, absolute paths, or unordered iteration. |

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Missing or incomplete artifact |
| 2 | Invalid input/catalog/schema |
| 3 | English-only violation |
| 4 | Secret violation |
| 5 | Non-deterministic output |

---

## 5. CI Gates

