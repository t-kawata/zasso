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
