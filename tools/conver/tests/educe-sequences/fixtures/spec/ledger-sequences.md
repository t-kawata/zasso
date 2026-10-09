# ledger.md — sequences

- specification sha256: bae3bb680783bfeb475d747a06172198b4564c1f8c5d8de908fd36f7eb3db8fa
- specification lines: 60
- schema version: 2

## Pins

- predicate line: 10
- row schema line: 14
- enumerations: OperationStatus (closed)
- blocks: 10

## Sequences

- front-matter 1-23 notASequence
- admission 24-26 direct
- rejection 27-33 notASequence
- settlement 34-35 viaNeighbour
- cancellation 36-48 notASequence
- settlement-replays-admission 49-50 unread
- supplied-rule 51-58 notASequence
- non-operation 59-60 unread

## Steps

- admission-1 operator / reads / the signed instruction / the instruction is signed
- admission-2 operator / verifies / the signature against the issuer key / the signature verifies
- admission-3 operator / writes / a Pending row / the row exists
- settlement-1 settler / debits / the payer / the row is pending
- settlement-2 settler / credits / the payee / the payer was debited
- settlement-3 settler / marks / the row Settled / the payee was credited

## Operations

- Admit positioned definition
- Settle positioned definition
- LedgerStatus suppliedRule designer_supplied

## Diagrams

```mermaid
sequenceDiagram
  %% admission 24-26
  participant P1 as operator
  participant P2 as the signed instruction
  participant P3 as the signature against the issuer key
  participant P4 as a Pending row
  P1->>P2: reads [Admit]
  P1->>P3: verifies [Admit]
  P1->>P4: writes [Admit]
```

```mermaid
sequenceDiagram
  %% settlement 34-35
  participant P1 as settler
  participant P2 as the payer
  participant P3 as the payee
  participant P4 as the row Settled
  P1->>P2: debits [Settle]
  P1->>P3: credits [Settle]
  P1->>P4: marks [Settle]
```


## Verify

`node .claude/scripts/educe-sequences/rail/run.mjs <spec-file>` exits 0
