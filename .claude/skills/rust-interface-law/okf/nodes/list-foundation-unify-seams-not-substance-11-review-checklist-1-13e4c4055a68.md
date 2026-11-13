---
type: List
id: list/foundation-unify-seams-not-substance-11-review-checklist/1/13e4c4055a68
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 13e4c4055a68f94fb2b201d473250158c90c57acd7ed517ebfa5a8fb14d855ef
source: sources/00-FOUNDATION.md
---
1. What seam or invariant does the rule fix?
2. What does the rule explicitly leave open?
3. Does the rule enumerate a closed set of features? If yes, rewrite it.
4. Is the rule verifiable by V1, V2, or V3?
5. Can a project add a new operation, scope, error code, auth method, or
   interface without changing the rule?
6. If the rule blocks a legitimate feature, is the correct action an extension
   of the seam rather than an exception?
7. Is the rule class (C/G/O/P) stated?
