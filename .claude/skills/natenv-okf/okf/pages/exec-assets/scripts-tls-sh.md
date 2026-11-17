---
type: "Procedure"
title: "EXEC_ASSETS/scripts/tls.sh"
description: "Create a throwaway CA and service certificates for TURN TLS."
sources: 
  - resource: "EXEC_ASSETS/scripts/tls.sh"
    id: "exec-asset-scripts-tls-sh"
    title: "EXEC_ASSETS/scripts/tls.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/tls.sh"
x-asset-sha256: "b0a42dbf6c458bd208c63dda0f2c843f91a958d4552605c15595af9d55bf5cfa"
x-content-sha256: "6a00ed8687fe0293af76c3945c16cd0b4c5f44f0cc6562f24803c55030d6e798"
x-requires: 
  - "pages/pre-okf-original/22-coturn-stun-turn-tls"
x-source-span: "1-23"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/tls.sh

Create a throwaway CA and service certificates for TURN TLS.

- role: Procedure
- interface: `bash scripts/tls.sh`
- governing section: [22. coturn, STUN, TURN, TLS](../pre-okf-original/22-coturn-stun-turn-tls.md)
- asset hash: `b0a42dbf6c458bd208c63dda0f2c843f91a958d4552605c15595af9d55bf5cfa`
- source span: lines 1-23

```bash
#!/bin/bash
set -euo pipefail
umask 077
mkdir -p private/ca config/tls
[ ! -e private/ca/ca.key ] || { echo 'CA exists: preserve or archive explicitly before regenerating' >&2;exit 2; }
openssl req -x509 -newkey rsa:3072 -nodes -keyout private/ca/ca.key -out config/tls/ca.crt -days 30 -subj '/CN=Closed WAN Test CA'
issue() {
 n=$1;san=$2
 openssl req -newkey rsa:2048 -nodes -keyout "config/tls/$n.key" -out "private/ca/$n.csr" -subj "/CN=$n.lab"
 printf 'subjectAltName=%s\nextendedKeyUsage=serverAuth\n' "$san" >"private/ca/$n.ext"
 openssl x509 -req -in "private/ca/$n.csr" -CA config/tls/ca.crt -CAkey private/ca/ca.key -CAcreateserial -out "config/tls/$n.crt" -days 7 -extfile "private/ca/$n.ext"
}
issue turn 'DNS:turn.lab,IP:10.77.0.30'
issue relay 'DNS:relay.lab,IP:10.79.0.10'
sed -e '/^no-tls$/d' config/coturn.conf > config/coturn-tls.conf
cat >>config/coturn-tls.conf <<'EOF'
tls-listening-port=5349
cert=/lab-config/tls/turn.crt
pkey=/lab-config/tls/turn.key
EOF
chmod 0600 config/tls/*.key
chmod 0644 config/tls/*.crt
printf '%s\n' 'TLS fixture created; verify service UID access, merge compose.tls.json, recreate turn'
```

[^exec-asset-scripts-tls-sh]

[^exec-asset-scripts-tls-sh]: EXEC_ASSETS/scripts/tls.sh — lines 1-23.
