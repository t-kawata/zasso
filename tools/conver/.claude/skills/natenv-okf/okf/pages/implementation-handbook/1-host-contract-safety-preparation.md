---
type: "Page"
title: "1. Host contract; safety; preparation"
description: "Preferred: dedicated Linux Docker Engine, rootful daemon, Compose v2 with `up --wait`; current supported"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-3"
    title: "1. Host contract; safety; preparation"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "418da351370a949bfb2ee8d1ca286f71caa62c1ad6c7a906521b943e980163e0"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "27-72"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/0-status-scope-non-negotiable-truth"
---
## 1. Host contract; safety; preparation

Preferred: dedicated Linux Docker Engine, rootful daemon, Compose v2 with `up --wait`; current supported
kernel, nftables/conntrack/netem enabled. Docker Desktop: Linux-container backend; actual networking lives
in backend kernel. Run same gates there; no claim of native macOS/Windows network-stack equivalence.
Rootless networking not a supported reference target. Kernel modules missing? Arrange backend/host module
availability OUTSIDE lab under administrator control; do not solve by `--privileged` or global firewall flush.
No access to global Internet required during execution; image/source/Cargo acquisition requires preparatory
Internet access. ARM64: native images/builds preferred; record architecture; emulated CPU invalidates absolute
performance comparison. Single host cannot independently reproduce Internet scale or independent host clocks.

Host commands: Docker CLI/Compose, Rust cargo/rustc, Python3, tar/unzip, shell. Optional host tshark; included
in node image. Enough RAM/CPU/disk for Asterisk, builds, ring captures. Restrict Docker access to trusted agent:
Docker daemon access is effectively host-admin authority. No untrusted source execution on production host.
Trusted infra namespaces have NET_ADMIN/NET_RAW; SUT namespaces joined through unprivileged sidecars.
Do not run arbitrary SUT code via root `./lab exec a`; use `sut-a`/`sut-b` overlay.

Inspect all files, particularly Dockerfiles; then from repository root:

```sh
docker version
docker compose version
rustc -Vv; cargo -V
./lab config > /tmp/natlab-resolved.yml
./lab build
./lab up
./lab ps
./lab smoke
cat artifacts/acceptance.log artifacts/acceptance.json
./lab collect
```

`./lab smoke` starts captures, runs serial Rust infrastructure tests, collects state/logs, stops captures,
returns test exit status. Guard entire host invocation with an external job timeout (e.g. CI timeout 15 min;
Linux `timeout 900 ./lab smoke`). On timeout, explicitly collect/stop before teardown; no missing-evidence PASS.
`./lab up` chmods local artifacts directory 1777 for trusted lab writers; do not place secrets there.
Only one topology concurrently: fixed overlapping subnets intentional. `./lab down` BEFORE variant switch;
archive artifacts between runs; same artifacts filename is not a run database. Do not reuse stale PASS JSON.
Stop active probes/SUT before changing policy. Teardown: `./lab capture-stop`; `./lab collect`; `./lab down`.
Never `docker system prune`, `nft flush ruleset` on host, or arbitrary host-route deletion.

Bootstrap image tags float intentionally until first build. For reproducibility pin base-image digests,
apt repository snapshot/package versions, Rust toolchain, PJPROJECT commit, iroh commit; commit Cargo.lock.
Capture `docker image inspect`, package manifest (`dpkg-query -W`), `rustc -Vv`, source SHA and build arguments.
Image ID pins one local build; tag alone does not. Rebuild detection invalidates prior performance baselines.

[^implementation-handbook-3]

[^implementation-handbook-3]: 1. Host contract; safety; preparation — sources/implementation-handbook.md, lines 27-72.

