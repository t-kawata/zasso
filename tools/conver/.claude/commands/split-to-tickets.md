---
description: Analyzes a design document and decomposes it into phases and individual tickets based on dependencies.
argument-hint: </path/to/RFC-*.md> </path/to/*-GRAPH.json> </path/to/*-Dirs-Tree.json>
disable-model-invocation: true
---

# /split-to-tickets

**Role**: Analyzes a design document (Requirements / Functional Specification / RFC / Design Document) and decomposes it into phases and individual tickets based on dependencies. Each ticket is decomposed into implementation units with safe I/O boundaries.

The generated result is saved as `Tickets.json`, which is referenced and updated via scripts from subsequent commands (`/make-ticket`, `/plan-ticket`, `/start-ticket`, `/review-ticket`, etc.).

## Language Protocol

| Context | Language | Reason |
|---------|----------|--------|
| Chat, proposals, explanations | **Japanese** | Japanese is mandatory **ONLY** when addressing the user directly. |
| Code comments | **English** | Must be written in the language AI understands most reliably. |
| Design docs, plans, tasks | **English** | Must be written in the language AI understands most reliably. |
| Runtime logs (`log::info!`, etc.) | **English** | International debugging environment and searchability |
| Everything else, i.e. any context where you are not speaking to the user | **English** | Must be written in the language AI understands most reliably. |

## Argument Interpretation

- **1st argument (required)**: Path to the design document (RFC) file
  - e.g. `conver/RFC-001-process-registry.md`
  - e.g. `/absolute/path/to/design-doc.md`
- **2nd argument (required)**: Path to the I/O boundary relationship graph file
  - e.g. `conver/RFC-001-process-registry-GRAPH.json`
  - e.g. `/absolute/path/to/design-doc-GRAPH.json`
- **3rd argument (required)**: Path to the directory tree file safely delimited from the I/O boundary relationship graph
  - e.g. `conver/RFC-001-process-registry-Dirs-Tree.json`
  - e.g. `/absolute/path/to/design-doc-Dirs-Tree.json`

## Output Destination

- Automatically generates `Tickets.json` in the same directory as the design document
- e.g. `docs/RFC-001-process-registry.md` → `docs/Tickets.json`
- If the file already exists, confirm with the user before overwriting

## List of Scripts Used

Located under `.claude/scripts/tickets/`.

| Script | Arguments | Description |
|--------|-----------|-------------|
| `write-tickets-json-template.js` | `<PATH of Tickets.json> '<metadata-json>'` | Generate Tickets.json skeleton (phases: []) |
| `add-phase.js` | `<PATH of Tickets.json>` (stdin: phase JSON) | Add a phase. phaseID auto-increments from 0 |
| `add-ticket.js` | `<PATH of Tickets.json> P{phaseID}` (stdin: ticket JSON) | Add a ticket (single). ticketID auto-increments within the phase |
| `bulk-add-tickets.js` | `<PATH of Tickets.json>` (stdin: bulk JSON) | Add tickets (bulk). Specify phase via phaseId/phaseName |
| `get-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | Retrieve single ticket by composite key |
| `search-tickets.js` | `<PATH of Tickets.json> <query>` | Full-text search (title/background/scope/referenceSection) |
| `all-tickets.js` | `<PATH of Tickets.json> [status-filter]` | List all tickets. Optional status filter |
| `update-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` (stdin: update JSON) | Update a ticket. phaseId/ticketID are immutable |
| `bulk-update-tickets.js` | `<PATH of Tickets.json>` (stdin: bulk update JSON) | Bulk update multiple tickets |
| `delete-ticket.js` | `<PATH of Tickets.json> P{phaseID}-{ticketID}` | Delete a single ticket |
| `bulk-delete-tickets.js` | `<PATH of Tickets.json>` (stdin: list of deletion keys) | Bulk delete multiple tickets |
| `list-phases-and-tickets.js` | `<PATH of Tickets.json>` | Display in checklist format |
| `update-split-step-status.js` | `--status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <STEP_ID>` | Manage SPLIT-Status.json progress (6 subcommands) |

All scripts run schema validation (`validate-tickets.js`) before writing, and do not save on failure.

## Analysis Procedure

### Step 0: Initialization (argument parsing + Malfeasance.json initialization + determine output destination) and RFC loading

#### 0-1. Initialization

```bash
# Parse all arguments as an array (1st arg=RFC, 2nd arg=GRAPH.json, 3rd arg=Dirs-Tree.json)
IFS=' ' read -r DOC_PATH GRAPH_PATH DIRS_TREE_PATH <<< "$ARGUMENTS"
DOC_DIR="$(dirname "$DOC_PATH")"
BASENAME="$(basename "$DOC_PATH" .md)"
STATUS_PATH="${DOC_DIR}/${BASENAME}-SPLIT-Status.json"
bash .claude/scripts/tickets/init-split-to-ticket.sh --doc-path="$DOC_PATH"
```

Note: From Step 0-1 onwards, use `update-split-step-status.js` to manage progress status.

Example calls at the start and end of each step:

```bash
# Start of Step (STEP_ID is an actual step identifier such as "0-1", "4-2", etc.)
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step <STEP_ID>
# ... processing ...
# Normal end of Step (currentStep advances to the next Step)
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step <STEP_ID>
# On abnormal end (currentStep remains unchanged)
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" fail-step <STEP_ID>
# After error correction, resume
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step <STEP_ID>
```

#### 0-2. Create Malfeasance.json

```bash
# Start Step 0-1
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "0-1"
```

Malfeasance.json is a ledger that records incomplete implementations (those lacking a `[::STUB::]` marker) as "crimes." Initialize it within `DOC_DIR`.

```bash
# Create the crime record ledger as empty if it does not exist
node .claude/scripts/tickets/ensure-malfeasance.js "$DOC_DIR"

# Normal end of Step 0-1
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "0-1"
```

### Resuming from an Error
After fixing the error according to the script's error message, use `reset-to-step "0-1"` to roll back the status and re-execute the Step 0 commands from the beginning.

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "0-1"
```

#### 0-3. Read RFC (understand structure via analyze-source-structure.js → read sections sequentially)

```bash
# Start Step 0-2
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "0-2"

echo "=== RFC Structure Analysis ==="
node ".claude/scripts/rfc-graph/analyze-source-structure.js" "$DOC_PATH"
echo "=============================="
```

Since the RFC document is extremely long, do not attempt to read the entire text at once.
After understanding the section listing (with line ranges) from the structure analysis above, read sections **from top to bottom** sequentially.

How many sections to read at once is left to the AI's judgment, but read through all of them while keeping the following aspects in memory:

- **Purpose and scope**: What this RFC aims to achieve and the extent of its scope
- **Technology stack**: Languages, frameworks, and external dependencies used
- **Key data types**: Struct, enum, trait definitions and their relationships
- **Architecture**: Module dependencies, data flow, and control flow
- **I/O boundaries**: Contracts with the outside (public API, file I/O, network I/O, DB access, etc.)
- **Testing strategy**: Testing methodology, verification criteria, and integration plan

```bash
# Normal end of Step 0-2
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "0-2"
```

### Resuming from an Error
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "0-2"
```

---

### Step 1: Reference I/O boundary information in the RFC

```bash
# Start Step 1
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "1"
```

This I/O boundary reference information was created at the stage when the RFC was written as a detailed design document through grill / drill.
It is a draft of I/O boundaries written when the RFC author's design intent was freshest, and must be respected as much as possible in ticket decomposition.
However, note that the subsequent `/graphify-rfc` may have further divergently subdivided the I/O boundaries, so the current state may not match the I/O boundaries at the time of RFC writing.

If the target RFC has an I/O boundary reference information section, display it.

```bash
echo "=== I/O Boundary Reference ==="
node ".claude/scripts/grill-me-for-rfc/extract-io-boundary.js" "$DOC_PATH" || echo "(No I/O boundary reference. grill/drill needed beforehand. Interrupt split.)"
echo "============================="
```

If no I/O boundary reference exists, prompt prior grill/drill and interrupt split.

```bash
# Normal end of Step 1
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "1"
```

### Resuming from an Error
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "1"
```

---

### Step 2: Examine the relationship graph structure in the RFC design

```bash
# Start Step 2
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "2"
```

This graph structure consists of nodes and their relationships, subdivided by `/graphify-rfc` into safe I/O boundary units finer than the I/O boundary assumptions in the original RFC.
It is one stage more advanced than the I/O boundary reference information from RFC writing time displayed in Step 1, and serves as the primary decision material for ticket decomposition.

If the graph generated by `/graphify-rfc` exists, display the graph structure summary via `show-graph-summary-markdown.js`:

```bash
echo "=== Graph Structure Summary ==="
if [ -f "$GRAPH_PATH" ]; then
  node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="$GRAPH_PATH" --source="$DOC_PATH" --with-cli-examples
else
  echo "(No graph structure summary. graphify needed beforehand. Interrupt split.)"
fi
echo "==============================="
```

If no graph structure summary exists, prompt prior graphify and interrupt split.

```bash
# Normal end of Step 2
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "2"
```

### Resuming from an Error
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "2"
```

---

### Step 3: Examine directory and file structure via boundify

```bash
# Start Step 3
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "3"
```

This directory and file structure is the current implementation directory and file configuration, ultimately generated by the serial pipeline of grill / drill → `/graphify-rfc` → `/boundify-graph`.

**The current directory and file structure must not be modified.** However, **adding** directories or files that expose interfaces for crates, packages, classes, etc. to be used by other programs is permitted as needed.
When adding, you **must explicitly state** in the ticket that these are additional directories or files not defined in the corresponding *-GRAPH.json or *-Dirs-Tree.json.

```bash
echo "=== boundify Directory/File Structure ==="
if [ -f "$DIRS_TREE_PATH" ]; then
  node .claude/scripts/rfc-graph/show-dirs-files-tree.js "$DIRS_TREE_PATH"
else
  echo "(*-Dirs-Tree.json not found. boundify needed beforehand. Interrupt split.)"
fi
echo "========================================="
```

If *-Dirs-Tree.json does not exist, prompt prior boundify and interrupt split.

```bash
# Normal end of Step 3
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "3"
```

### Resuming from an Error
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "3"
```

---

### Step 4: Primary phase design (mechanical phase grouping)

#### 4-1. Phase splitting via script

```bash
# Start Step 4-1
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "4-1"
```

Taking GRAPH.json and Dirs-Tree.json as input, `phasify-graph-and-dirs-files-tree.js` groups all nodes into implementation phases using mathematically safe weighted topological sorting and SCC condensation. The result is written to Tickets.json's `phase[].nodeIds`.

```bash
node .claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js \
  "$GRAPH_PATH" \
  "$DIRS_TREE_PATH"
```

Confirm the summary line at the end of the output shows a pass (✅). If it shows a failure (⚠️), report the cause and interrupt split.

```bash
# Normal end of Step 4-1
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "4-1"
```

### Resuming from an Error
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "4-1"
```

#### 4-2. Write names and summaries for all phases

```bash
# Start Step 4-2 (start of the 4-2 loop)
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "4-2"
```

For all phases written to Tickets.json in 4.1, set the phase name and summary using the following procedure. Two scripts are needed: `show-all-nodes-title-summary.js` (display) and `write-phase-name-summary.js` (writing).

For all phases, execute the following ①→②→③ **sequentially, one phase at a time**. Do not output all phases in bulk.

```bash
# ① Display the list of nodes for the relevant phase (example: phase P0)
node .claude/scripts/rfc-graph/show-all-nodes-title-summary.js \
  --tickets="$TICKETS_PATH" \
  --graph="$GRAPH_PATH" \
  --phase="P0"
```

Example output of ①:
```
N0001: [§1 Purpose — Definition of this crate's responsibilities] Safely wrapping PJSUA from Rust...
N0002: [§1a M20 implementation priority map] All implementation items of the M20 supplement...
```

② AI reads the output of ① and generates an appropriate name and summary for this phase.

```bash
# ③ Write the generated name/summary to Tickets.json
echo '{"name":"Authentication Infrastructure","summary":"Authentication token generation, verification, and session management"}' | \
  node .claude/scripts/rfc-graph/write-phase-name-summary.js \
    "$TICKETS_PATH" \
    "P0"
```

After completing ①→②→③, proceed to the next phase (P1, P2, ...). After all phases are done, verify that the name/summary of every phase is filled using the following script. If verification fails, prohibit progression to Step 5 until all phases are complete.

```bash
node .claude/scripts/rfc-graph/check-phase-names-summaries.js "$TICKETS_PATH"

# Normal end of Step 4-2 (4-2 loop complete)
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "4-2"
```

### Resuming from an Error
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "4-2"
```

### Step 5: Primary ticket definition (ticket creation)

```bash
# Start Step 5-1 (start of the 5-1 node detail display loop)
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-1"
```

For all phases written in 4-2, execute the following 5-1 → 5-2 **sequentially, one phase at a time**.
Do not process all phases in bulk.

#### 5-1: Retrieve detailed information for nodes within a phase

`show-phase-nodes.js` outputs detailed information (ID, title, kind, summary, implementation file path) for all nodes assigned to the specified phase in Markdown format.

```bash
node .claude/scripts/rfc-graph/show-phase-nodes.js \
  --tickets="$TICKETS_PATH" \
  --graph="$GRAPH_PATH" \
  --dirs-tree="$DIRS_TREE_PATH" \
  --phase="P{n}"
```

The AI understands the output and determines, considering the I/O boundary nature and implementation file path of each node, which combination of nodes can be safely implemented in a single implementation.

Once all phase loops in 5-1 are complete, proceed to 5-2.

```bash
# Normal end of Step 5-1 (5-1 loop complete)
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-1"

# Start Step 5-2 (start of the 5-2 ticket creation loop)
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-2"
```

#### 5-2: Ticket creation (add-tickets-for-phase.js)

`add-tickets-for-phase.js` bulk-adds the ticket array received from stdin, and after addition verifies whether all `nodeIds` for that phase have been ticketized. If verification fails, no write occurs (rollback) and the script exits with exit code 1.

```bash
echo '<tickets-array-json>' | node .claude/scripts/tickets/add-tickets-for-phase.js \
  "$TICKETS_PATH" \
  "$DIRS_TREE_PATH" \
  "P{n}" \
  "$GRAPH_PATH"
```

#### Ticket Field Definitions and Detail Level Guidelines

Each field's schema is defined in `tickets-schema.json` `#/definitions/ticket`.
`id`, `phaseId`, and `status` are set automatically by the script and must not be provided as input. All other fields can be added via `additionalProperties: true`.

**Strict guidelines on description length and information density**:

When the AI registers a ticket, **short, simplistic descriptions are considered "cutting corners."** The following are minimum requirements.

| Field | Minimum Guideline | Benchmark (from actual Tickets.json examples) |
|-------|-------------------|-----------------------------------------------|
| `background` | **300+ characters** | 622 chars — Investigation results (bullet points), multiple paragraphs with concrete code-level references |
| `scope` | **Enumerate each item with type signatures** | 828 chars — File name + processing content + type, concrete per item |
| `notes` | **Multiple sections, 500+ characters** | 1342 chars — Structured with implementation summary, test results, translatability, and risks |
| `relatedTicketIds` | **Explicitly state dependency direction and reason** | 251 chars — "P17-1 (depends on: ...), P19-1 (depended by: ...)" format |
| `acceptanceCriteria` | **Concisely describe each condition in one line** | Happy path / Error case / Edge case in one line each, 3-5 items per ticket |

### Reference — Implementation Order (TDD Red-Green-Refactor)

Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.

#### 1. Red — Fully Implement Failing Tests

Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec's **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.

When the ticket defines **Contracts** (Precondition/Postcondition/Invariant from graph edge annotation), the Red phase must first translate each Contract into testable form — input schemas, output assertions, and invariant predicates — before implementing them as concrete test code. A Contract whose Precondition/Postcondition/Invariant cannot be expressed as a testable assertion is not yet fully specified.

- Tests must cover all observable behaviors, edge cases, failure modes, and invariants. Any behavior not covered is considered undefined and fails review.
- If a feature is deterministic yet fundamentally untestable, this is not a testing gap but an architectural defect. Redesign the system until it is testable before proceeding to implementation.
- Confirm that all tests fail red due to the absence of implementation. Tests that pass green by accident (e.g., meaningless assertions) are invalid.

#### 2. Green — Implement Behavior (No Stubs, No Test Modification)

Implement the **behavior** specified by the tests; do not treat passing the tests as an end in itself. Tests are a means of verifying correctness, not the goal itself.

- Implementations that merely satisfy the literal wording of tests—via hardcoding, input-specific branching, or stubbed return values—are prohibited. The implementation must be a generalized, correct solution.
- If it is impossible to distinguish, via testing, whether an implementation is genuine or a disguised green, this indicates a design flaw caused by insufficient coverage. Add tests until the distinction is possible before proceeding with implementation.
- Modifying, deleting, or weakening tests to make an implementation pass is strictly forbidden. The implementation must conform to the tests; the reverse is never acceptable.
- An implementation whose correctness cannot be proven is invalid. It is not considered complete until it (or its design) is restructured into a provably correct form.

#### 3. Refactor — Apply the Boy Scout Rule (Green State Only)

Refactor only after all tests are green. Refactoring in a red state is prohibited.

- Apply the Boy Scout Rule (leave the code cleaner than you found it; readability = translatability) to eliminate `unwrap()` calls, hardcoded values, false comments, and untested code in anything you touch.
- Verify that all tests remain green before and after each refactoring step. If a refactor breaks green, roll it back immediately.

#### Definition of Done

Implementation is considered incomplete unless all of the following are satisfied:

- The tests fully and precisely specify the intended behavior.
- The implementation passes all tests green, without exception.
- Correctness is empirically guaranteed by the tests (not a disguised green).
- No gap exists between test coverage and intended behavior.

Green without red, green achieved by modifying tests, and green achieved through stubs are all violations and constitute incomplete work.

### Test Field Reference

| Field | Requirement | Format |
|-------|------------|--------|
| `testUnit` | Unit tests — automated tests covering individual functions/modules | `UT:` prefix; enumerate normal/edge/failure cases |
| `testIntegration` | Integration tests — automated tests spanning multiple modules | `IT:` prefix; specify which tickets/modules are integrated |
| `testExceptions` | Items that cannot be tested, with mandatory technical justification | Free text; every item must state why it cannot be tested, **and explain why this is not a case of "deterministic yet fundamentally untestable" (which is an architectural defect, not a testing gap)** |

`UT:` and `IT:` are automated test code, not manual tests. Together they must enable verification of the correctness of all implementation code. `testExceptions` is a supplement to this, not a substitute.

The following JSON is an example description that meets the above guidelines. **Do not settle for simplistic placeholders (in `<...>` format).**
`default_files` is set automatically by the script when `--dirs-tree` is specified; the AI must not provide it as input.
`contracts` is required by the schema; set it to an empty array (`[]`) at creation time. It will be auto-populated by `merge-contracts-to-tickets.js` after Step 5-2 completes.

```json
[
  {
    "title": "Authentication Token Generation — Ed448-Goldilocks signature generation and verification API",
    "nodeIds": ["N0001", "N0003"],
    "contracts": [],
    "default_files": [
      "src/auth/keystore.rs",
      "src/auth/token.rs"
    ],
    "background": "Core of Phase 0 \"Authentication Infrastructure.\" N0001 defines token generation processing (key pair generation, signing, verification) using Ed448-Goldilocks, and N0003 defines the token refresh mechanism (expiration detection, re-signing). Both share the same key store (src/auth/keystore.rs) and serialization format for keys, so implementing them in the same ticket makes it easier to verify invariants (key consistency). Key length is fixed at 448 bits, signature algorithm is EdDSA. Implementation targets are src/auth/token.rs and src/auth/keystore.rs.",
    "scope": [
      "pub fn generate_keypair() -> Result<(PrivateKey, PublicKey), CryptoError> — Ed448 key pair generation. Uses system entropy as source with OS-provided CSPRNG.",
      "pub fn sign(payload: &[u8], private_key: &PrivateKey) -> Result<Signature, CryptoError> — Ed448 signature generation for the specified payload. Signature length is fixed at 114 bytes.",
      "pub fn verify(payload: &[u8], signature: &Signature, public_key: &PublicKey) -> Result<bool, CryptoError> — Signature verification. Comparison must be constant-time to prevent timing attacks.",
      "pub struct Token { pub payload: Vec<u8>, pub signature: Signature, pub expires_at: SystemTime } — Token type. Holds an expiration time, compared against the current time during verification.",
      "pub fn refresh(token: &Token, private_key: &PrivateKey) -> Result<Token, CryptoError> — Re-signing of expired tokens. Sets a new expiration time and re-signs tokens within their validity period."
    ],
    "testUnit": [
      "UT: generate_keypair produces a different key pair each time (non-identity verification)",
      "UT: sign → verify returns true for a valid signature (Happy Path)",
      "UT: verify returns false for a tampered payload (tamper detection)",
      "UT: verify returns false for a signature from a different key pair (key binding)",
      "UT: refresh sets a new expiration and re-signs a within-validity token",
      "UT: refresh returns an error when given an expired token",
      "UT: verify returns false when Token's expires_at is in the past (expiration detection)",
      "Boundary: signature generation and verification with an empty payload",
      "Boundary: signature and verification at maximum payload length (65535 bytes)"
    ],
    "testIntegration": [
      "IT: After P0-4 (Session management) implementation, verify end-to-end Token issuance → verify → Session establishment",
      "IT: Confirm authentication flow integrity under 10 concurrent sessions"
    ],
    "testExceptions": ["Memory zeroing of SecretKey (mlock/mprotect) is kernel-dependent and cannot be unit-tested. Verify with valgrind in CI integration tests."],
    "acceptanceCriteria": [
      "All APIs for signing, verification, and refresh work without errors",
      "Return appropriate errors for all abnormal cases: invalid signature, tampered payload, expired token",
      "No failure at boundary values: empty payload and maximum length payload (65535 bytes)"
    ],
    "referenceSection": "RFC-ROOT.md (§3.1 Authentication token format, §3.2 Key management)",
    "relatedTicketIds": "P0-2 (depends on: definition of error type CryptoError), PX-YY (Ed448 library wrapper, must be implemented first), P0-4 (depended by: Session management uses this ticket's Token as input)",
    "notes": "PrivateKey serialization follows PKCS#8 v2 format, PublicKey serialization follows SPKI format. Use subtle::ConstantTimeEq for constant-time comparison."
  }
]
```

**Rules for ticket composition**:
- Bundle one or more nodes into one ticket (a single node is also acceptable)
- Ticketize all `nodeIds` without duplication or omission
- The `nodeIds` array of each ticket must list all node IDs included in that ticket
- Ticketization must be self-contained within the relevant phase and must not include nodes from other phases

After completing 5-1 → 5-2, proceed to the next phase (P1, P2, ...).

After all phases are complete, verify that ticketization of all phases is complete using the following script.
If verification fails, prohibit progression to Step 6 until all phases are complete.

```bash
# Merge edge contracts into each ticket, then verify contract chain closure
node .claude/scripts/tickets/merge-contracts-to-tickets.js "$TICKETS_PATH" "$GRAPH_PATH"
node .claude/scripts/tickets/verify-ticket-closure.js --tickets="$TICKETS_PATH" --graph="$GRAPH_PATH"

node .claude/scripts/tickets/verify-all-ticket-coverage.js "$TICKETS_PATH"

# Normal end of Step 5-2 (5-2 loop complete)
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-2"
```

### Resuming from an Error
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "5-2"
```

### Step 5-3: Phase consolidation

For all phases where ticketization is complete, automatically consolidate phases with fewer than 3 tickets.
`consolidate-phase-tickets.js` scans from the back and safely merges phases below the threshold.

```bash
# Start Step 5-3
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-3"
```

`consolidate-phase-tickets.js` checks the ticket count of all phases and merges phases with fewer than 3 tickets into the following phase. It executes 6 substeps sequentially: guard → validation → backward merge → re-index IDs → regenerate relatedTicketIds → update status.json → final verification.

```bash
node .claude/scripts/tickets/consolidate-phase-tickets.js \
  "$TICKETS_PATH" \
  "$STATUS_PATH"
```

Check for ✅ or ⚠️ at the end of the output. On failure, verify the cause of the error, fix it, then re-run 5-3.

```bash
# Normal end of Step 5-3
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-3"
```

### Resuming from an Error
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "5-3"
```

### Step 6: Output phase and ticket checklist

```bash
# Start Step 6
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "6"
```

Once all tickets have been added, output and report the checklist via list-phases-and-tickets.js:

```bash
node .claude/scripts/tickets/list-phases-and-tickets.js "$TICKETS_PATH"

# Normal end of Step 6 (all steps complete)
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "6"
```

### Resuming from an Error
```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "6"
```

Example output:
```
- [] P0: Pure logic — full isolation verification of state machine
    - [ ] P0-1: Definition of pure data types
    - [ ] P0-2: Definition of error types
    - [ ] P0-3: Definition of process state and registry types
- [] P1: Async runtime — mockable execution foundation
    - [ ] P1-1: Implementation of RestartPolicy::on_crash_default and next_delay
```

## Notes
- If the destination Tickets.json already exists, confirm with the user before overwriting.
