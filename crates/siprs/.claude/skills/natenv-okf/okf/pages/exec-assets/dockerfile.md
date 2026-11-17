---
type: "Procedure"
title: "EXEC_ASSETS/Dockerfile"
description: "Ubuntu 24.04 image with routers, ingress, observers, PBX, TURN, and capture tools."
sources: 
  - resource: "EXEC_ASSETS/Dockerfile"
    id: "exec-asset-dockerfile"
    title: "EXEC_ASSETS/Dockerfile"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/Dockerfile"
x-asset-sha256: "067919c95656e8c8a4344975910bd4fd8e9dc9f5dfc071ae47602701156e73c9"
x-content-sha256: "7015c7ba4f0ccca9c2eaa8f5d8b150e7a06e77fe292aa2d65d64778810ab6be7"
x-requires: 
  - "pages/pre-okf-original/6-ubuntu-infrastructure-bootstrap"
x-source-span: "1-10"
x-topic: "exec-assets"
---
## EXEC_ASSETS/Dockerfile

Ubuntu 24.04 image with routers, ingress, observers, PBX, TURN, and capture tools.

- role: Procedure
- interface: `docker build`
- governing section: [6. Ubuntu infrastructure bootstrap](../pre-okf-original/6-ubuntu-infrastructure-bootstrap.md)
- asset hash: `067919c95656e8c8a4344975910bd4fd8e9dc9f5dfc071ae47602701156e73c9`
- source span: lines 1-10

```dockerfile
ARG UBUNTU_IMAGE=ubuntu:24.04
FROM ${UBUNTU_IMAGE}
ENV DEBIAN_FRONTEND=noninteractive
RUN printf 'wireshark-common wireshark-common/install-setuid boolean false\n' | debconf-set-selections \
 && apt-get update && apt-get install -y --no-install-recommends \
 iproute2 nftables conntrack tcpdump tshark wireguard-tools python3 openssl curl ca-certificates jq procps iputils-ping asterisk coturn \
 && rm -rf /var/lib/apt/lists/*
COPY scripts /lab
RUN chmod 0755 /lab/*.sh
ENTRYPOINT ["/lab/node.sh"]
```

[^exec-asset-dockerfile]

[^exec-asset-dockerfile]: EXEC_ASSETS/Dockerfile — lines 1-10.
