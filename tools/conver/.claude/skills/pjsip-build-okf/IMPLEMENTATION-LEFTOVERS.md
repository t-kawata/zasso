# Implementation leftovers

## Incomplete implementations

None.

## Known adoption gaps

- The canonical distribution check validates the shared-engine schema; module
  hash drift is detected by the local drift mutation, not by a canonical hash
  recomputation check.
- The installed mode never re-derives source hashes; installed tamper
  detection comes from the staging/installed digest parity recorded in the
  acceptance record.
- The canonical verifier does not ship the mutation runner; the mutation
  evidence is produced by the build acceptance runner.
