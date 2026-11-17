---
type: "Page"
title: "29. Security, provenance, cleanup"
description: "Artifacts may contain SIP auth, identities, plaintext media, private addresses, tokens, optional TLS keys. Restrict access; explicit approval/redaction before upload. Do not collect private WG"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-31"
    title: "29. Security, provenance, cleanup"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "af283712454d493358ff63e71676bceb1649ab660afbada1a282aa8dfa108d63"
x-requires: 
  - "pages/pre-okf-original/28-result-schemas-quality-gates-repetitions"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "779-796"
x-topic: "pre-okf-original"
---
## 29. Security, provenance, cleanup

Artifacts may contain SIP auth, identities, plaintext media, private addresses, tokens, optional TLS keys. Restrict access; explicit approval/redaction before upload. Do not collect private WG configs or key-bearing command dumps. `docker inspect` may reveal env secrets; prefer protected config/secret mechanisms for product credentials.

Run directory unique UTC timestamp+random suffix. Save resolved config, source/lock hashes, image IDs/digests, host/guest/kernel/tool versions, public-key fingerprints only, seed, resource limits, mutation sequence, command/exit/events, PCAP/drop stats, result schema. Static validation and observed execution separate.

Cleanup order:
1. Stop products gracefully; deadline then process-tree termination.
2. Stop/flush captures; collect guest and infrastructure state.
3. Hash/archive complete run, verify copied artifacts.
4. Disable native tunnels; uninstall Windows tunnel services.
5. `./lab down` using actual overlay sequence if applicable.
6. Stop run VMs; keep immutable templates; delete clones only by explicit identity.
7. Remove exact created firewall/route rules; stop host outer relay.
8. Confirm no residual processes/listeners/interfaces/routes.

Never global prune, host nft/pf flush, blanket firewall disable, delete arbitrary host routes/VM disks, or silently destroy existing templates. Generated config/key archive protected; ordinary evidence archive excludes secrets. Failed runs retained.

[^pre-okf-original-31]

[^pre-okf-original-31]: 29. Security, provenance, cleanup — sources/pre-okf-original.md, lines 779-796.

