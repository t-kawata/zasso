---
type: CodeBlock
id: codeblock/10-shared-contracts-5-operation-contract-5-7-pipeline/1/3184a03cb1b4
phase: contract
delivery: must
applies_to: all
requires: []
references: []
content_sha256: 3184a03cb1b4e9f55bf63b4378a35483d17efd981a42ad21b352c75ad123af7c
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
```text
1. decode and size check                     dispatcher
2. authenticate (or establish anonymity)     dispatcher
3. authentication requirement check          dispatcher
4. scope check                               dispatcher
5. deadline and admission                    dispatcher
6. generated input validation                 dispatcher/operation
7. idempotency claim                          dispatcher
8a. replay branch: replay_authorize the
    recorded target; return stored result     operation
8b. acquired branch: prepare (schema/domain
    validation, resource load, tenant/
    ownership authorization)                  operation
9. execute: reservation, mutation,
   commit, outbox enqueue                     operation
10. result store / reply                      dispatcher
```
