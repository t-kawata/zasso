# Linux-from-Mac build container (§62.36 Q14).
#
# The producer runs this container with the host `crates/siprs/vendor` mounted
# at `/work/vendor`, so the in-container cmake build writes its artifacts
# directly onto the host volume:
#
#   docker build -t pjsip-prebuilt .
#   docker run --rm -v $(pwd)/vendor:/work/vendor pjsip-prebuilt \
#     cmake -S /work/vendor/pjsip -B /work/vendor/build
#
# [::TICKET::] P18-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P18-2 --for-spec --no-implementation-order`

FROM ubuntu:22.04

# Build essentials plus the PJSIP system deps from RFC §28.4 (Ubuntu x86_64).
# `libasound2-dev` is the ALSA audio backend, `libssl-dev`/`libuuid-dev` are
# required by the TLS/UUID code paths that stay enabled in the prebuilt.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake libasound2-dev libssl-dev libuuid-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work
