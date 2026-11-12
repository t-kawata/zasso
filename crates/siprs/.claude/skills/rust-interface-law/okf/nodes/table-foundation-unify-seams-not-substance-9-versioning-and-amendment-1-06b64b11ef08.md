---
type: Table
id: table/foundation-unify-seams-not-substance-9-versioning-and-amendment/1/06b64b11ef08
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 06b64b11ef08b37380d22ff2093e96f584bd1958e4af1bf1e1bc1fce538c452b
source: docs/archive/IMPLEMENTATION-SPEC/00-FOUNDATION.md
---
| ID | Rule |
|---|---|
| VER-01 | The ruleset, shared contracts, generator, and conformance kit share one version. |
| VER-02 | A project pins the version in `RULES-PROFILE.toml`. |
| VER-03 | Removing or changing a closed seam requires a major version and a migration note. |
| VER-04 | Adding an open extension point is a minor version. |
| VER-05 | Adding a rule that would reject a previously valid project requires a major version. |
| VER-06 | A rule that blocks a legitimate feature is amended by extending the seam, not by granting an exception. |
