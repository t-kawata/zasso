# Native-OS WAN/NAT/VoIP/P2P execution assets

The separate English guide is the sole operational specification. This archive contains current executable/configuration assets only. No OS images, credentials, generated keys, product binaries, historical documentation, or alternate implementation generations.

1. Read the guide; choose OS backend, media/template and address plan.
2. Run bootstrap for host and Ubuntu infrastructure; provision same-OS guests.
3. On Ubuntu: python3 generate.py --endpoint <reachable-underlay-IP> --variant single
4. ./lab config; ./lab build; ./lab up; python3 doctor.py
5. Distribute private/a.conf, b.conf, s.conf to distinct native nodes; activate tunnels.
6. Run probe, cut/recovery, then actual product scenarios.
7. Stop products/captures, collect, disable tunnels, ./lab down, stop VMs.

Mac default NAT: host scripts/outer-relay.py carries WireGuard ciphertext when guests cannot reach the infrastructure directly. Preserve OOB management.

bootstrap scripts automate their stated stages, not proprietary OS media acquisition or unknown product dependencies. validate.py is static-only; doctor.py is infrastructure CLI-only. Neither implies native path/product acceptance.
