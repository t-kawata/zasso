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
