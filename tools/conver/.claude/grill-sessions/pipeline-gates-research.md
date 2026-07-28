# Pipeline Gates Design — Research Context

## Problem

139 STUB markers were found in siprs crate where all tickets are marked done (`[x]`).
- 12 stubs reference nonexistent tickets (P0-9, P5-3)
- 49 stubs depend on runtime module (P3-2) that was never implemented
- All stubs are genuine (code is actually incomplete), none are "forgotten markers"

## Root Cause

The make→plan→start→review→resolve pipeline has STUB/crime resolution instructions, but they lack:
1. Machine-verifiable gates with exit codes
2. Contract-based validation of targetStubs/targetCrimes
3. A blocking mechanism that prevents progression when violations exist

## Required Design

A 5-phase pipeline (make→plan→start→review→resolve) where each phase has a mechanical validation gate that blocks progression unless all STUB/crime/contract requirements are met.

## Key Design Decisions Needed

1. targetStubs/targetCrimes schema (contracts, pre/post/invariants structure)
2. Per-phase validation scope (ticket-scoped vs directory-scoped)
3. Resolve phase role (final gate behavior)
4. Deferred/crime/exception handling
5. STUB marker format enforcement
6. Contract-to-test binding mechanism
7. False positive handling
8. New ticket (zero existing stubs) handling
9. Session-crossing validation persistence
10. Manual override handling
