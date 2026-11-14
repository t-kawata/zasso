---
type: "Page"
title: "Appendix A — Exact source files"
description: "Repository paths below are reconstruction targets. Copy contents verbatim; chmod +x lab scripts/*.sh; run python3 scripts/make-tone.py to reconstruct binary WAV fixture. Three base Compose files..."
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-13"
    title: "Appendix A — Exact source files"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "b20a056a8f4b1ce3556e54cf8d7cb193251dc9746707db6f5933f98a51a7490f"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "548-2828"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/2-files-exact-topologies-placement"
---
## Appendix A — Exact source files

Repository paths below are reconstruction targets. Copy contents verbatim; chmod +x lab scripts/*.sh; run python3 scripts/make-tone.py to reconstruct binary WAV fixture. Three base Compose files are alternatives, NOT simultaneous deployments.

### .gitignore

```text
artifacts/
cache/
private/
config/tls/
config/coturn.tls.conf
probe/target/
accept/target/
```

### AGENTS.md

```text
# Execution contract
Read README.md before modification. Agent stays OUTSIDE containers. Docker API access HOST ONLY.
No host firewall edits, privileged containers, host network, Docker-socket mounts, public relay fallback,
GUI, microphone, speaker, manual listening, unverified NAT labels, synthetic MOS, or swallowed failures.
Run one topology at a time. Resolve dependencies ONLINE before isolated tests. Preserve every failed run.
PASS scopes distinct: infrastructure; NAT-profile; utility-surrogate; actual Rust SUT; quality; long-haul.
NOT_RUN != PASS. No full-environment certification until all required scopes pass for pinned revisions.
For actual applications implement contracts in README; do not claim surrogate coverage as product coverage.
Record changed config + seed + commit + lockfile + image IDs + kernel + packets + machine-readable results.
Inspect all packet-drop counters. Failure to collect evidence invalidates relevant assertions.
```

### Dockerfile

```text
FROM rust:1-bookworm AS probes
WORKDIR /build
COPY probe/ .
RUN cargo build --release --offline

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN printf 'wireshark-common wireshark-common/install-setuid boolean false\n' | debconf-set-selections \
    && apt-get update && apt-get install -y --no-install-recommends \
    iproute2 nftables conntrack tcpdump tshark iputils-ping iputils-tracepath \
    ethtool python3 curl ca-certificates openssl jq procps coreutils \
    asterisk coturn socat && rm -rf /var/lib/apt/lists/*
COPY --from=probes /build/target/release/netprobe /usr/local/bin/netprobe
COPY scripts/ /lab/
RUN chmod +x /lab/*.sh
ENTRYPOINT ["/lab/node.sh"]
CMD ["sleep","infinity"]
```

### Dockerfile.iroh

```text
FROM rust:1-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends git pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*
ARG IROH_REF
RUN test -n "$IROH_REF" && echo "$IROH_REF" | grep -Eq '^[0-9a-f]{40}$' \
    && git clone https://github.com/n0-computer/iroh.git /src \
    && cd /src && git checkout --detach "$IROH_REF"
WORKDIR /src
RUN cargo build --locked --release --package iroh-relay --features server --bin iroh-relay
FROM natlab-node:local
COPY --from=build /src/target/release/iroh-relay /usr/local/bin/iroh-relay
```

### Dockerfile.pjsua

```text
FROM natlab-node:local AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git libssl-dev uuid-dev && rm -rf /var/lib/apt/lists/*
ARG PJPROJECT_REF=2.15.1
RUN git clone --depth 1 --branch "$PJPROJECT_REF" https://github.com/pjsip/pjproject.git /pj
WORKDIR /pj
RUN ./configure --disable-video --disable-sound --disable-libyuv --disable-ffmpeg --disable-v4l2 \
    && make dep && make -j2 \
    && find pjsip-apps/bin -maxdepth 1 -type f -name 'pjsua-*' -executable -exec cp '{}' /usr/local/bin/pjsua \;
FROM natlab-node:local
COPY --from=build /usr/local/bin/pjsua /usr/local/bin/pjsua
```

### Dockerfile.sut

```text
# Build dependencies ONLINE; execute SUT/tests only inside isolated runtime namespaces.
FROM rust:1-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config libssl-dev clang libclang-dev cmake \
    iproute2 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /work
# Adapt native dependencies to the ACTUAL PJSIP binding; commit Cargo.lock/toolchain.
# COPY Cargo.toml Cargo.lock ... ; RUN cargo fetch --locked ...
CMD ["sleep","infinity"]
```

### accept/Cargo.toml

```toml
[package]
name = "natlab-accept"
version = "0.1.0"
edition = "2021"
```

### accept/tests/lab.rs

```rust
use std::{process::{Command,Output},env,fs};
fn run(args:&[&str])->Output{
    let o=Command::new("./lab").args(args).output().unwrap();
    eprintln!("./lab {:?}\n{}{}",args,String::from_utf8_lossy(&o.stdout),String::from_utf8_lossy(&o.stderr));o
}
fn ok(args:&[&str])->String{let o=run(args);assert!(o.status.success(),"command failed: {args:?}");String::from_utf8(o.stdout).unwrap()}
#[test]
fn topology_nat_faults(){
    // Mutates network policy: serialize this test; fresh lab required.
    ok(&["exec","a","test","-f","/run/lab.ready"]);
    for peer in ["a","b"] {
        let out=ok(&["exec",peer,"netprobe","udp","10.77.0.20:9000","42000","10","20"]);
        let wan=if peer=="b"{"10.77.0.3"}else if env::var("LAB_VARIANT").unwrap_or_default()=="double"{"10.77.0.4"}else{"10.77.0.2"};
        assert!(out.contains(&format!("\"observed\":\"{wan}:")),"unexpected NAT egress");
        ok(&["exec",peer,"netprobe","tcp","10.77.0.20:9000","262144"]);
    }
    // Mixed-port and alternate-address probes: observations, NOT an EIM/APDM assertion.
    for dst in ["10.77.0.20:9000","10.77.0.20:9001","10.77.0.21:9000"] {
        ok(&["exec","a","netprobe","udp",dst,"42000","1","0"]);
    }
    ok(&["exec","ra","/lab/policy.sh","cut"]);
    let u=run(&["exec","a","netprobe","udp","10.77.0.20:9000","42000","1","0"]);
    let t=run(&["exec","a","netprobe","tcp","10.77.0.20:9000","16"]);
    ok(&["exec","ra","/lab/policy.sh","normal"]);
    assert!(!u.status.success()&&!t.status.success(),"NAT bypass detected");
    ok(&["exec","ra","/lab/policy.sh","udp-block"]);
    let u=run(&["exec","a","netprobe","udp","10.77.0.20:9000","42000","1","0"]);
    let t=run(&["exec","a","netprobe","tcp","10.77.0.20:9000","16"]);
    ok(&["exec","ra","/lab/policy.sh","normal"]);
    assert!(!u.status.success()&&t.status.success(),"UDP block not selective");
    ok(&["exec","a","netprobe","udp","10.77.0.20:9000","42000","3","20"]);
    fs::write("artifacts/acceptance.json","{\"infrastructure\":\"pass\",\"sip\":\"not_run\",\"turn\":\"not_run\",\"iroh\":\"not_run\",\"nat_behavior_qualification\":\"not_run\"}\n").unwrap();
}
```

### accept/tests/turn.rs

```rust
use std::{process::Command,fs};
#[test]
#[ignore="coturn utility smoke; not a two-host Rust SUT interoperability test"]
fn turn_udp_and_tcp_transport(){
 for tcp in [false,true]{
  let mut args=vec!["exec","a","timeout","45","turnutils_uclient","-y","-u","lab","-w","lab-secret","-p","3478","-n","100","-z","10"];
  if tcp{args.push("-t");}args.push("10.77.0.30");
  let o=Command::new("./lab").args(&args).output().unwrap();
  let s=format!("{}{}",String::from_utf8_lossy(&o.stdout),String::from_utf8_lossy(&o.stderr));
  fs::write(format!("artifacts/turn-{}.log",if tcp{"tcp"}else{"udp"}),&s).unwrap();
  assert!(o.status.success(),"{s}");
  // Utility output format is version-specific. No fabricated packet-loss pass.
  assert!(s.contains("Total transmit time"),"missing utility completion statistics: {s}");
 }
}
```

### accept/tests/voip.rs

```rust
use std::{process::Command,time::{Duration,Instant},thread,fs};
fn cmd(args:&[&str])->String{
 let o=Command::new("./lab").args(args).output().unwrap();
 assert!(o.status.success(),"{args:?}: {}",String::from_utf8_lossy(&o.stderr));
 String::from_utf8_lossy(&o.stdout).into_owned()
}
fn wait(mut f:impl FnMut()->bool){let t=Instant::now();while !f(){assert!(t.elapsed()<Duration::from_secs(60),"readiness timeout");thread::sleep(Duration::from_millis(500));}}
fn wav(path:&str){
 let b=fs::read(path).unwrap();assert!(&b[..4]==b"RIFF"&&&b[8..12]==b"WAVE");
 let mut pos=12;let mut rate=0u32;let mut data=vec![];
 while pos+8<=b.len(){let n=u32::from_le_bytes(b[pos+4..pos+8].try_into().unwrap())as usize;
  let end=pos+8+n;assert!(end<=b.len());let q=&b[pos+8..end];
  if &b[pos..pos+4]==b"fmt "{assert!(q.len()>=16);assert_eq!(u16::from_le_bytes(q[..2].try_into().unwrap()),1);assert_eq!(u16::from_le_bytes(q[2..4].try_into().unwrap()),1);rate=u32::from_le_bytes(q[4..8].try_into().unwrap());assert_eq!(u16::from_le_bytes(q[14..16].try_into().unwrap()),16);}
  if &b[pos..pos+4]==b"data"{data.extend_from_slice(q);}pos=end+(n&1);
 }
 assert!(rate>0);let samples:Vec<i16>=data.chunks_exact(2).map(|x|i16::from_le_bytes([x[0],x[1]])).collect();
 let secs=samples.len()as f64/rate as f64;let rms=(samples.iter().map(|x|(*x as f64).powi(2)).sum::<f64>()/samples.len().max(1)as f64).sqrt();
 let clip=samples.iter().filter(|x|(**x as i32).abs()>=32760).count()as f64/samples.len().max(1)as f64;
 eprintln!("{path}: seconds={secs:.3} rms={rms:.3} clipped={clip:.6}");assert!(secs>=10.&&rms>=100.&&clip<0.01);
}
#[test]
#[ignore="requires LAB_IMAGE=natlab-pjsua:local and fresh single/double topology; surrogate, not Rust SUT"]
fn headless_pjsua_bidirectional_audio(){
 assert!(std::env::var("LAB_VARIANT").unwrap_or_default()!="private");
 cmd(&["exec","pbx","asterisk","-rx","pjsip set logger on"]);
 cmd(&["exec-bg","b","python3","/lab/pjsua.py","b","1002","10.77.0.10"]);
 cmd(&["exec-bg","a","python3","/lab/pjsua.py","a","1001","10.77.0.10"]);
 wait(||{let s=cmd(&["exec","pbx","asterisk","-rx","pjsip show contacts"]);s.contains("1001/sip:")&&s.contains("1002/sip:")});
 cmd(&["exec","a","timeout","5","sh","-c","printf 'm\\nsip:1002@10.77.0.10\\n' > /out/a.fifo"]);
 wait(||cmd(&["exec","pbx","asterisk","-rx","core show channels concise"]).matches("!Up!").count()>=2);
 thread::sleep(Duration::from_secs(20));
 for n in ["a","b"]{let c=format!("printf 'q\\n' > /out/{n}.fifo");cmd(&["exec",n,"timeout","5","sh","-c",&c]);}
 wait(||fs::metadata("artifacts/a.wav").is_ok()&&fs::metadata("artifacts/b.wav").is_ok());
 thread::sleep(Duration::from_secs(3));wav("artifacts/a.wav");wav("artifacts/b.wav");
 fs::write("artifacts/voip-surrogate.json","{\"pjsua_baseline\":\"pass\",\"rust_sut\":\"not_run\",\"identity_correlation\":\"not_measured\",\"mos\":\"not_measured\"}\n").unwrap();
}
```

### compose.double.yml

```yaml
services:
  ra:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.1
      transit:
        ipv4_address: 10.77.10.2
    environment:
      ROLE: router
      LAN_IP: 10.77.1.1
      WAN_IP: 10.77.10.2
      LAN_CIDR: 10.77.1.0/24
      GW: 10.77.10.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  cga:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      transit:
        ipv4_address: 10.77.10.1
      wan:
        ipv4_address: 10.77.0.4
    environment:
      ROLE: router
      LAN_IP: 10.77.10.1
      WAN_IP: 10.77.0.4
      LAN_CIDR: 10.77.10.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  rb:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.1
      wan:
        ipv4_address: 10.77.0.3
    environment:
      ROLE: router
      LAN_IP: 10.77.2.1
      WAN_IP: 10.77.0.3
      LAN_CIDR: 10.77.2.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  a:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.10
    environment:
      ROLE: endpoint
      GW: 10.77.1.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  b:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.10
    environment:
      ROLE: endpoint
      GW: 10.77.2.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  obs1:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.20
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  obs2:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.21
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  turn:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.30
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':3478 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - turnserver
    - -c
    - /lab-config/coturn.conf
  pbx:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.10
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    - ./config/asterisk/pjsip.conf:/etc/asterisk/pjsip.conf:ro
    - ./config/asterisk/extensions.conf:/etc/asterisk/extensions.conf:ro
    - ./config/asterisk/rtp.conf:/etc/asterisk/rtp.conf:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && asterisk -rx "core waitfullybooted"
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - asterisk
    - -f
    - -vvv
networks:
  wan:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.0.0/24
        gateway: 10.77.0.254
  lana:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.1.0/24
        gateway: 10.77.1.254
  lanb:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.2.0/24
        gateway: 10.77.2.254
  transit:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.10.0/24
        gateway: 10.77.10.254
```

### compose.iroh.yml

```yaml
services:
  iroh-relay:
    image: natlab-iroh:local
    init: true
    cap_drop: [ALL]
    cap_add: [NET_ADMIN, NET_RAW, DAC_OVERRIDE]
    security_opt: [no-new-privileges:true]
    environment: {ROLE: endpoint}
    networks:
      wan: {ipv4_address: 10.77.0.40}
    sysctls:
      net.ipv4.ip_forward: "0"
      net.ipv4.conf.all.rp_filter: "0"
      net.ipv4.conf.default.rp_filter: "0"
      net.ipv6.conf.all.disable_ipv6: "1"
      net.ipv6.conf.default.disable_ipv6: "1"
    volumes:
      - ./artifacts:/out
      - ./config:/lab-config:ro
    command: [iroh-relay, --dev, --config-path, /lab-config/iroh-dev.toml]
    healthcheck:
      test: [CMD, curl, --noproxy, '*', --fail, --silent, http://10.77.0.40:3340/healthz]
      interval: 2s
      timeout: 2s
      retries: 60
```

### compose.private.yml

```yaml
services:
  ra:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.1
      wan:
        ipv4_address: 10.77.0.2
    environment:
      ROLE: router
      LAN_IP: 10.77.1.1
      WAN_IP: 10.77.0.2
      LAN_CIDR: 10.77.1.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  rb:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.1
      wan:
        ipv4_address: 10.77.0.3
    environment:
      ROLE: router
      LAN_IP: 10.77.2.1
      WAN_IP: 10.77.0.3
      LAN_CIDR: 10.77.2.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  a:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.10
    environment:
      ROLE: endpoint
      GW: 10.77.1.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  b:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.10
    environment:
      ROLE: endpoint
      GW: 10.77.2.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  obs1:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.20
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  obs2:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.21
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  turn:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.30
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':3478 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - turnserver
    - -c
    - /lab-config/coturn.conf
  pbx:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.20
    environment:
      ROLE: endpoint
      GW: 10.77.1.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    - ./config/asterisk/pjsip.private.conf:/etc/asterisk/pjsip.conf:ro
    - ./config/asterisk/extensions.conf:/etc/asterisk/extensions.conf:ro
    - ./config/asterisk/rtp.conf:/etc/asterisk/rtp.conf:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && asterisk -rx "core waitfullybooted"
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - asterisk
    - -f
    - -vvv
networks:
  wan:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.0.0/24
        gateway: 10.77.0.254
  lana:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.1.0/24
        gateway: 10.77.1.254
  lanb:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.2.0/24
        gateway: 10.77.2.254
```

### compose.single.yml

```yaml
services:
  ra:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.1
      wan:
        ipv4_address: 10.77.0.2
    environment:
      ROLE: router
      LAN_IP: 10.77.1.1
      WAN_IP: 10.77.0.2
      LAN_CIDR: 10.77.1.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  rb:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '1'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.1
      wan:
        ipv4_address: 10.77.0.3
    environment:
      ROLE: router
      LAN_IP: 10.77.2.1
      WAN_IP: 10.77.0.3
      LAN_CIDR: 10.77.2.0/24
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  a:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lana:
        ipv4_address: 10.77.1.10
    environment:
      ROLE: endpoint
      GW: 10.77.1.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  b:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      lanb:
        ipv4_address: 10.77.2.10
    environment:
      ROLE: endpoint
      GW: 10.77.2.1
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD
      - test
      - -f
      - /run/lab.ready
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
  obs1:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.20
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  obs2:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.21
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':9000 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - netprobe
    - serve
  turn:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.30
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && ss -H -lun | grep -q ':3478 '
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - turnserver
    - -c
    - /lab-config/coturn.conf
  pbx:
    image: ${LAB_IMAGE:-natlab-node:local}
    init: true
    cap_drop:
    - ALL
    cap_add:
    - NET_ADMIN
    - NET_RAW
    - SETUID
    - SETGID
    - CHOWN
    - DAC_OVERRIDE
    - FOWNER
    security_opt:
    - no-new-privileges:true
    sysctls:
      net.ipv6.conf.all.disable_ipv6: '1'
      net.ipv6.conf.default.disable_ipv6: '1'
      net.ipv4.ip_forward: '0'
      net.ipv4.conf.all.rp_filter: '0'
      net.ipv4.conf.default.rp_filter: '0'
      net.ipv4.conf.all.accept_redirects: '0'
      net.ipv4.conf.default.accept_redirects: '0'
      net.ipv4.conf.all.send_redirects: '0'
      net.ipv4.conf.default.send_redirects: '0'
    networks:
      wan:
        ipv4_address: 10.77.0.10
    environment:
      ROLE: endpoint
    volumes:
    - ./artifacts:/out
    - ./config:/lab-config:ro
    - ./config/asterisk/pjsip.conf:/etc/asterisk/pjsip.conf:ro
    - ./config/asterisk/extensions.conf:/etc/asterisk/extensions.conf:ro
    - ./config/asterisk/rtp.conf:/etc/asterisk/rtp.conf:ro
    healthcheck:
      test:
      - CMD-SHELL
      - test -f /run/lab.ready && asterisk -rx "core waitfullybooted"
      interval: 1s
      timeout: 1s
      retries: 60
    stop_grace_period: 15s
    command:
    - asterisk
    - -f
    - -vvv
networks:
  wan:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.0.0/24
        gateway: 10.77.0.254
  lana:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.1.0/24
        gateway: 10.77.1.254
  lanb:
    driver: bridge
    internal: true
    enable_ipv6: false
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'
      com.docker.network.bridge.inhibit_ipv4: 'true'
      com.docker.network.bridge.enable_icc: 'true'
    ipam:
      config:
      - subnet: 10.77.2.0/24
        gateway: 10.77.2.254
```

### compose.sut.example.yml

```yaml
# Merge with ONE topology. Run: docker compose -p natlab-single -f compose.single.yml -f compose.sut.example.yml ...
services:
  sut-a:
    build:
      context: .
      dockerfile: Dockerfile.sut
    image: natlab-sut:local
    init: true
    network_mode: service:a
    depends_on:
      a: {condition: service_healthy}
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    user: "1000:1000"
    working_dir: /work
    environment:
      CARGO_HOME: /cargo
      CARGO_TARGET_DIR: /target
      RUST_LOG: info
      LAB_NODE: a
      LAB_ARTIFACTS: /out
    volumes:
      - ${SUT_ROOT:?Set SUT_ROOT to actual project root}:/work:ro
      - ./artifacts:/out
      - ./cache/cargo-a:/cargo
      - ./cache/target-a:/target
    command: [sleep, infinity]
  sut-b:
    image: natlab-sut:local
    init: true
    network_mode: service:b
    depends_on:
      b: {condition: service_healthy}
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    user: "1000:1000"
    working_dir: /work
    environment:
      CARGO_HOME: /cargo
      CARGO_TARGET_DIR: /target
      RUST_LOG: info
      LAB_NODE: b
      LAB_ARTIFACTS: /out
    volumes:
      - ${SUT_ROOT:?Set SUT_ROOT}:/work:ro
      - ./artifacts:/out
      - ./cache/cargo-b:/cargo
      - ./cache/target-b:/target
    command: [sleep, infinity]
```

### compose.timeout.example.yml

```yaml
# Merge with a topology; recreate ra before the scenario; current flows must be absent.
services:
  ra:
    sysctls:
      net.netfilter.nf_conntrack_udp_timeout: "10"
      net.netfilter.nf_conntrack_udp_timeout_stream: "10"
```

### compose.turn-tls.yml

```yaml
services:
  turn:
    command: [turnserver, -c, /lab-config/coturn.tls.conf]
```

### config/asterisk/extensions.conf

```text
[general]
static=yes
writeprotect=yes
[lab]
exten => _100[12],1,Dial(PJSIP/${EXTEN},45)
 same => n,Hangup()
exten => 600,1,Answer()
 same => n,Echo()
 same => n,Hangup()
```

### config/asterisk/pjsip.conf

```text
[global]
type=global
user_agent=natlab

[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060

[transport-tcp]
type=transport
protocol=tcp
bind=0.0.0.0:5060

[endpoint-common](!)
type=endpoint
context=lab
disallow=all
allow=ulaw
allow=alaw
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[1001](endpoint-common)
auth=auth1001
aors=1001
[auth1001]
type=auth
auth_type=userpass
username=1001
password=lab-1001
[1001]
type=aor
max_contacts=1
remove_existing=yes
qualify_frequency=10

[1002](endpoint-common)
auth=auth1002
aors=1002
[auth1002]
type=auth
auth_type=userpass
username=1002
password=lab-1002
[1002]
type=aor
max_contacts=1
remove_existing=yes
qualify_frequency=10
```

### config/asterisk/pjsip.private.conf

```text
[global]
type=global
user_agent=natlab

[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060
local_net=10.77.1.0/24
external_signaling_address=10.77.0.2
external_media_address=10.77.0.2

[transport-tcp]
type=transport
protocol=tcp
bind=0.0.0.0:5060
local_net=10.77.1.0/24
external_signaling_address=10.77.0.2
external_media_address=10.77.0.2

[endpoint-common](!)
type=endpoint
context=lab
disallow=all
allow=ulaw
allow=alaw
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

[1001](endpoint-common)
auth=auth1001
aors=1001
[auth1001]
type=auth
auth_type=userpass
username=1001
password=lab-1001
[1001]
type=aor
max_contacts=1
remove_existing=yes
qualify_frequency=10

[1002](endpoint-common)
auth=auth1002
aors=1002
[auth1002]
type=auth
auth_type=userpass
username=1002
password=lab-1002
[1002]
type=aor
max_contacts=1
remove_existing=yes
qualify_frequency=10
```

### config/asterisk/rtp.conf

```text
[general]
rtpstart=10000
rtpend=10199
icesupport=no
```

### config/coturn.conf

```text
listening-ip=10.77.0.30
relay-ip=10.77.0.30
listening-port=3478
min-port=50000
max-port=50199
fingerprint
lt-cred-mech
realm=lab
user=lab:lab-secret
no-cli
no-tls
no-dtls
# Deliberate closed-lab private peer destinations; not a production security template.
log-file=stdout
simple-log
verbose
```

### config/fixture.json

```json
{
  "wan": "10.77.0.2",
  "client_cidr": "10.77.1.0/24",
  "flows": [
    {
      "src": "10.77.1.10",
      "sport": 42000,
      "dst": "10.77.0.20",
      "dport": 9000
    },
    {
      "src": "10.77.1.10",
      "sport": 42000,
      "dst": "10.77.0.20",
      "dport": 9001
    },
    {
      "src": "10.77.1.10",
      "sport": 42000,
      "dst": "10.77.0.21",
      "dport": 9000
    }
  ]
}
```

### config/iroh-dev.toml

```toml
# --dev, relay-only baseline; deliberately no QUIC address discovery / no HTTPS.
http_bind_addr = "0.0.0.0:3340"
enable_relay = true
enable_metrics = true
metrics_bind_addr = "0.0.0.0:9090"
enable_quic_addr_discovery = false
```

### config/iroh-tls.example.toml

```toml
# Validate against the PINNED iroh-relay source/CLI before qualification.
# Run WITHOUT --dev. Use explicit client trust + hostname relay.lab -> 10.77.0.40.
http_bind_addr = "0.0.0.0:80"
enable_relay = true
enable_metrics = true
metrics_bind_addr = "0.0.0.0:9090"
enable_quic_addr_discovery = true
quic_bind_addr = "0.0.0.0:7842"
[tls]
https_bind_addr = "0.0.0.0:443"
hostname = "relay.lab"
cert_mode = "Manual"
manual_cert_path = "/lab-config/tls/relay.crt"
manual_key_path = "/lab-config/tls/relay.key"
```

### config/private-pbx-transport.txt

```text
# In config/asterisk/pjsip.conf add the following lines to EACH [transport-*] section,
# BEFORE the next section header; remove again before using single/double.
local_net=10.77.1.0/24
external_signaling_address=10.77.0.2
external_media_address=10.77.0.2
```

### lab

```text
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
variant=${LAB_VARIANT:-single}
case "$variant" in single|double|private) ;; *) echo 'Invalid LAB_VARIANT' >&2; exit 2;; esac
export LAB_VARIANT="$variant"
project="natlab-${variant}"
dc=(docker compose -p "$project" -f "compose.${variant}.yml")
case "${1:-help}" in
 build) docker build -t natlab-node:local .;;
 pjsua-build) docker build -f Dockerfile.pjsua -t natlab-pjsua:local .;;
 up) mkdir -p artifacts; chmod 1777 artifacts; "${dc[@]}" up -d --wait --wait-timeout 180;;
 down) "${dc[@]}" down --remove-orphans;;
 config) "${dc[@]}" config;;
 ps) "${dc[@]}" ps;;
 exec) shift; "${dc[@]}" exec -T "$@";;
 exec-bg) shift; "${dc[@]}" exec -T -d "$@";;
 logs) "${dc[@]}" logs --no-color --timestamps;;
 test) cargo test --manifest-path accept/Cargo.toml --offline -- --nocapture --test-threads=1;;
 capture-start|capture-stop)
  action=${1#capture-}
  for s in $("${dc[@]}" config --services); do
   "${dc[@]}" exec -T "$s" /lab/capture.sh "$action" "$variant-$s"
  done;;
 collect)
  mkdir -p artifacts/state
  docker version >artifacts/state/docker-version.txt
  docker info >artifacts/state/docker-info.txt
  docker compose version >artifacts/state/compose-version.txt
  "${dc[@]}" config >artifacts/state/resolved-compose.yml
  "${dc[@]}" logs --no-color --timestamps >artifacts/state/compose.log 2>&1
  for s in $("${dc[@]}" config --services); do
   "${dc[@]}" exec -T "$s" /lab/state.sh >"artifacts/state/$s.txt" 2>&1 || true
   id=$("${dc[@]}" ps -q "$s"); docker inspect "$id" >"artifacts/state/$s.inspect.json"
  done
  docker image inspect natlab-node:local >artifacts/state/image.json
  ;;
 smoke)
  "$0" capture-start
  set +e
  "$0" test >artifacts/acceptance.log 2>&1; rc=$?
  "$0" collect; "$0" capture-stop
  exit "$rc";;
 *) echo './lab {build|pjsua-build|up|down|config|ps|exec SERVICE CMD...|exec-bg SERVICE CMD...|logs|test|capture-start|capture-stop|collect|smoke}' >&2; exit 2;;
esac
```

### probe/Cargo.toml

```toml
[package]
name = "netprobe"
version = "0.1.0"
edition = "2021"
```

### probe/src/main.rs

```rust
use std::{env,io::{Read,Write},net::{TcpListener,TcpStream,UdpSocket},thread,time::{Duration,Instant}};
fn server(){
    for port in [9000,9001] {
        let u=UdpSocket::bind(("0.0.0.0",port)).unwrap();
        thread::spawn(move|| {let mut b=[0u8;65535]; loop {
            let (n,peer)=u.recv_from(&mut b).unwrap();
            let mut v=format!("{}|",peer).into_bytes();v.extend_from_slice(&b[..n]);
            u.send_to(&v,peer).unwrap();
        }});
        let l=TcpListener::bind(("0.0.0.0",port)).unwrap();
        thread::spawn(move||for c in l.incoming(){thread::spawn(move|| {
            let mut c=c.unwrap(); let mut b=[0u8;65536];
            loop{match c.read(&mut b){Ok(0)|Err(_)=>break,Ok(n)=>{if c.write_all(&b[..n]).is_err(){break}}}}
        });});
    }
    loop {thread::park();}
}
fn udp(a:&[String]){
    let dst=&a[2];let source:u16=a[3].parse().unwrap();
    let count:u64=a[4].parse().unwrap();let gap:u64=a[5].parse().unwrap();
    let u=UdpSocket::bind(("0.0.0.0",source)).unwrap();
    u.set_read_timeout(Some(Duration::from_millis(700))).unwrap();
    let mut good=0;let mut rtts=vec![];let mut observed=String::new();let mut b=[0u8;65535];
    for seq in 0..count{
        let msg=format!("natlab-{seq:08}");let start=Instant::now();
        u.send_to(msg.as_bytes(),dst).unwrap();
        let deadline=start+Duration::from_millis(700);
        while Instant::now()<deadline {
            match u.recv_from(&mut b){Ok((n,_))=>{
                let x=String::from_utf8_lossy(&b[..n]);
                if let Some((p,body))=x.split_once('|') {if body==msg {
                    observed=p.to_string();good+=1;rtts.push(start.elapsed().as_secs_f64()*1000.0);break;
                }}
            },Err(_)=>break}
        }
        thread::sleep(Duration::from_millis(gap));
    }
    rtts.sort_by(|a,b|a.total_cmp(b));
    let p95=if rtts.is_empty(){0.0}else{rtts[((rtts.len()-1) as f64*0.95).ceil() as usize]};
    println!("{{\"protocol\":\"udp\",\"sent\":{count},\"received\":{good},\"observed\":\"{observed}\",\"rtt_p95_ms\":{p95:.3}}}");
    if good!=count{std::process::exit(1)}
}
fn tcp(a:&[String]){
    let dst=a[2].parse().unwrap();let len:usize=a[3].parse().unwrap();
    let mut c=TcpStream::connect_timeout(&dst,Duration::from_secs(3)).unwrap();
    c.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
    c.set_write_timeout(Some(Duration::from_secs(10))).unwrap();
    let p:Vec<u8>=(0..len).map(|i|(i%251)as u8).collect();let expected=p.clone();
    let mut writer=c.try_clone().unwrap(); let start=Instant::now();
    let t=thread::spawn(move||writer.write_all(&p).unwrap());
    let mut got=vec![0;len];c.read_exact(&mut got).unwrap();t.join().unwrap();assert_eq!(got,expected);
    println!("{{\"protocol\":\"tcp\",\"bytes\":{len},\"integrity\":true,\"elapsed_ms\":{:.3}}}",start.elapsed().as_secs_f64()*1000.0);
}
fn main(){let a:Vec<_>=env::args().collect();match a.get(1).map(String::as_str){
    Some("serve")=>server(),Some("udp")=>udp(&a),Some("tcp")=>tcp(&a),
    _=>{eprintln!("netprobe serve | udp DEST_IP:PORT SOURCE_PORT COUNT GAP_MS | tcp DEST_IP:PORT BYTES");std::process::exit(2)}
}}
```

### requirements.txt

```text
PyYAML>=6,<7
```

### scripts/capture.sh

```sh
#!/bin/sh
set -eu
cmd=${1:?start|stop}; name=${2:-capture}
case "$name" in *[!a-zA-Z0-9_-]*|'') exit 2;; esac
case "$cmd" in
 start)
  test ! -e /run/capture.pid
  # No payload truncation; bounded capture ring; namespace-local visibility.
  tcpdump -i any -s 0 -U -B 8192 -C 32 -W 8 -w "/out/$name.pcap" \
    >/out/"$name".tcpdump.stdout 2>/out/"$name".tcpdump.stderr &
  pid=$!; echo "$pid" >/run/capture.pid
  sleep 1; kill -0 "$pid"
  ;;
 stop)
  if [ -f /run/capture.pid ]; then
   pid=$(cat /run/capture.pid); kill -INT "$pid" 2>/dev/null || true
   for i in $(seq 1 50); do kill -0 "$pid" 2>/dev/null || break; sleep .1; done
   rm -f /run/capture.pid
  fi
  ;;
 *) exit 2;;
esac
```

### scripts/check-audio.py

```python
#!/usr/bin/env python3
# Baseline only: non-silence / duration / clipping, not MOS/POLQA or identity verification.
import wave,array,json,math,sys
out=[]
for path in sys.argv[1:]:
    with wave.open(path,'rb') as w:
        assert w.getsampwidth()==2 and w.getnchannels()==1
        rate=w.getframerate();v=array.array('h',w.readframes(w.getnframes()))
    if sys.byteorder!='little': v.byteswap()
    rms=math.sqrt(sum(x*x for x in v)/max(1,len(v)))
    result={'file':path,'duration_s':len(v)/rate,'rms':rms,'clipped_fraction':sum(abs(x)>=32760 for x in v)/max(1,len(v))}
    result['pass']=result['duration_s']>=10 and rms>=100 and result['clipped_fraction']<0.01
    out.append(result)
print(json.dumps(out,indent=2))
if not all(x['pass'] for x in out):sys.exit(1)
```

### scripts/fixture-nat.py

```python
#!/usr/bin/env python3
# Generate finite-universe UDP EIM or APDM + APDF fixture. Apply ONLY inside a router.
# Required: fixed client source ports; no collisions; no unlisted traffic. Not general NAT.
import sys,json,ipaddress
mode=sys.argv[1]; cfg=json.load(open(sys.argv[2]))
assert mode in ['eim','apdm']
wan=str(ipaddress.ip_address(cfg['wan']))
flows=cfg['flows'];seen=set();slots={};rules=[];nextport=44000
for f in flows:
    src=str(ipaddress.ip_address(f['src']));sport=int(f['sport'])
    dst=str(ipaddress.ip_address(f['dst']));dport=int(f['dport'])
    assert 1<=sport<=65535 and 1<=dport<=65535
    key=(src,sport) if mode=='eim' else (src,sport,dst,dport)
    if key not in slots: slots[key]=nextport;nextport+=1
    assert nextport<65000
    flow=(src,sport,dst,dport);assert flow not in seen;seen.add(flow)
    rules.append(f'ip saddr {src} udp sport {sport} ip daddr {dst} udp dport {dport} counter snat to {wan}:{slots[key]}')
# Separate priority earlier than baseline NAT. Explicit unmatched UDP drop prevents fallback.
print('table ip fixture_nat {')
print(' chain post { type nat hook postrouting priority 90; policy accept;')
for r in rules: print('  '+r)
print(' }\n}')
print('table inet fixture_allow {')
print(' chain forward { type filter hook forward priority -10; policy accept;')
print('  ct state established,related accept')
for f in flows:
    print(f"  ip saddr {f['src']} udp sport {int(f['sport'])} ip daddr {f['dst']} udp dport {int(f['dport'])} accept")
# ACCEPT here cannot bypass later baseline APDF DROP. Reverse unsolicited packets stay blocked.
print(f'  ip saddr {cfg["client_cidr"]} meta l4proto udp counter drop')
print(' }\n}')
```

### scripts/link.sh

```sh
#!/bin/sh
set -eu
direction=${1:?lan|wan}; shift
case "$direction" in lan) dev=$(cat /run/lan.if);; wan) dev=$(cat /run/wan.if);; *) exit 2;; esac
if [ "${1:-}" = clear ]; then tc qdisc del dev "$dev" root 2>/dev/null || true
else tc qdisc replace dev "$dev" root netem "$@"; fi
tc -s qdisc show dev "$dev"
```

### scripts/make-tone.py

```python
#!/usr/bin/env python3
import wave,struct,math
from pathlib import Path
p=Path(__file__).resolve().parent.parent/'config'/'tone.wav'
with wave.open(str(p),'wb') as w:
    w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000)
    w.writeframes(b''.join(struct.pack('<h',int(6000*(math.sin(2*math.pi*440*i/8000)+0.4*math.sin(2*math.pi*701*i/8000)))) for i in range(8000*3)))
```

### scripts/node.sh

```sh
#!/bin/sh
set -eu
umask 022
rm -f /run/lab.ready
mkdir -p /out
# No host networking, no host sysctl/firewall manipulation. Discover interfaces by IP.
iface() { ip -o -4 addr show | awk -v a="$1" '{split($4,b,"/");if(b[1]==a){print $2;exit}}'; }
# Never let Docker's gateway select the experimental path.
while ip -4 route del default 2>/dev/null; do :; done
if [ -n "${GW:-}" ]; then ip -4 route add default via "$GW"; fi
printf 'nameserver 10.77.0.53\noptions attempts:1 timeout:1\n' >/etc/resolv.conf
# Disable NIC offloads where supported. Record failures; never silently claim wire fidelity.
for dev in $(ip -o link show | awk -F': ' '{split($2,a,"@");if(a[1]!="lo") print a[1]}'); do
  ethtool -K "$dev" gro off gso off tso off lro off 2>>/out/offload-errors.log || true
done
nft -f - <<'EOF'
flush ruleset
table inet labguard {
 chain output {
  type filter hook output priority 0; policy drop;
  ip daddr 127.0.0.11 counter drop
  oifname "lo" accept
  ip daddr 10.77.0.0/16 accept
 }
}
EOF
if [ "${ROLE:-endpoint}" = router ]; then
  : "${LAN_IP:?}" "${WAN_IP:?}" "${LAN_CIDR:?}"
  LAN_IF=$(iface "$LAN_IP"); WAN_IF=$(iface "$WAN_IP")
  test -n "$LAN_IF"; test -n "$WAN_IF"
  printf '%s\n' "$LAN_IF" >/run/lan.if
  printf '%s\n' "$WAN_IF" >/run/wan.if
  nft -f - <<EOF
 table inet labfilter {
  chain forward {
   type filter hook forward priority 0; policy drop;
   ct state invalid counter drop
   ct state established,related counter accept
   iifname "$LAN_IF" oifname "$WAN_IF" ip saddr $LAN_CIDR counter accept
  }
 }
 table ip labnat {
  chain prerouting { type nat hook prerouting priority dstnat; policy accept; }
  chain postrouting {
   type nat hook postrouting priority srcnat; policy accept;
   ip saddr $LAN_CIDR oifname "$WAN_IF" counter snat to $WAN_IP
  }
 }
EOF
fi
# IPv4 reference lab: IPv6 disabled via Compose sysctls, not left as a bypass.
touch /run/lab.ready
exec "$@"
```

### scripts/pjsua.py

```python
#!/usr/bin/env python3
import os, sys, subprocess, signal, time, threading
node, user, server = sys.argv[1:4]
base='/out/'+node
fifo=base+'.fifo'
try: os.unlink(fifo)
except FileNotFoundError: pass
os.mkfifo(fifo,0o666)
args=['pjsua','--null-audio','--local-port=5060','--rtp-port=4000',
      '--id=sip:'+user+'@'+server,'--registrar=sip:'+server,
      '--realm=lab','--username='+user,'--password=lab-'+user,
      '--auto-answer=200','--max-calls=1', '--log-level=5',
      '--play-file=/lab-config/tone.wav','--auto-play',
      '--rec-file='+base+'.wav','--auto-rec']
log=open(base+'.pjsua.log','wb',buffering=0)
p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=log,stderr=subprocess.STDOUT)
open(base+'.pid','w').write(str(os.getpid()))
def pump():
    # Open RDWR: no EOF between command writers; commands use legacy pjsua CLI.
    fd=os.open(fifo,os.O_RDWR)
    while p.poll() is None:
        data=os.read(fd,4096)
        if data:
            try: p.stdin.write(data); p.stdin.flush()
            except BrokenPipeError: return
threading.Thread(target=pump,daemon=True).start()
def stop(*_):
    if p.poll() is None:
        try: p.stdin.write(b'q\n'); p.stdin.flush(); p.wait(timeout=10)
        except (BrokenPipeError,subprocess.TimeoutExpired): p.terminate()
signal.signal(signal.SIGTERM,stop); signal.signal(signal.SIGINT,stop)
try: sys.exit(p.wait())
finally:
    log.close()
    try: os.unlink(fifo)
    except FileNotFoundError: pass
```

### scripts/policy.sh

```sh
#!/bin/sh
set -eu
: "${ROLE:?}"
test "$ROLE" = router
case "${1:?normal|cut|udp-block|udp-timeout|clear}" in
 normal)
  nft delete table inet fault 2>/dev/null || true
  ;;
 cut)
  nft delete table inet fault 2>/dev/null || true
  nft -f - <<'EOF'
table inet fault {
 chain forward { type filter hook forward priority -50; policy drop; counter drop; }
}
EOF
  ;;
 udp-block)
  nft delete table inet fault 2>/dev/null || true
  nft -f - <<'EOF'
table inet fault {
 chain forward { type filter hook forward priority -50; policy accept; meta l4proto udp counter drop; }
}
EOF
  ;;
 udp-timeout)
  echo 'Recreate router with namespace sysctls net.netfilter.nf_conntrack_udp_timeout and net.netfilter.nf_conntrack_udp_timeout_stream; no /proc/sys write bypass.' >&2
  exit 2
  ;;
 clear) conntrack -F;;
 *) exit 2;;
esac
```

### scripts/private-pbx.sh

```sh
#!/bin/sh
set -eu
# Execute inside ra, private topology only; maps SIP UDP/TCP and RTP port-preservingly.
wan=$(cat /run/wan.if)
nft add rule ip labnat prerouting iifname "$wan" ip daddr 10.77.0.2 udp dport 5060 dnat to 10.77.1.20
nft add rule ip labnat prerouting iifname "$wan" ip daddr 10.77.0.2 tcp dport 5060 dnat to 10.77.1.20
nft add rule ip labnat prerouting iifname "$wan" ip daddr 10.77.0.2 udp dport 10000-10199 dnat to 10.77.1.20
nft insert rule inet labfilter forward iifname "$wan" ip daddr 10.77.1.20 udp dport '{ 5060, 10000-10199 }' counter accept
nft insert rule inet labfilter forward iifname "$wan" ip daddr 10.77.1.20 tcp dport 5060 counter accept
```

### scripts/qualify-nat.py

```python
#!/usr/bin/env python3
# Host-side orchestrator, sequential port probes; observations only, not full RFC5780.
import subprocess,json,os
out=[]
for dst in ['10.77.0.20:9000','10.77.0.20:9001','10.77.0.21:9000']:
    p=subprocess.run(['./lab','exec','a','netprobe','udp',dst,'42000','1','0'],text=True,capture_output=True)
    if p.returncode: raise SystemExit(p.stderr or p.stdout)
    out.append({'destination':dst,**json.loads(p.stdout)})
print(json.dumps({'mapping_observations':out,'filtering':'NOT_QUALIFIED','classification':'DO_NOT_INFER'},indent=2))
```

### scripts/state.sh

```sh
#!/bin/sh
set -u
printf '\n=== CLOCK ===\n'; date -Ins
printf '\n=== ADDR ===\n'; ip -j address
printf '\n=== ROUTES ===\n'; ip -j -4 route show table all; ip rule
printf '\n=== LINK ===\n'; ip -s link
printf '\n=== SOCKETS ===\n'; ss -tunap
printf '\n=== NFT ===\n'; nft -a list ruleset
printf '\n=== TC ===\n'; tc -s qdisc show
printf '\n=== CONNTRACK ===\n'; conntrack -L -o extended 2>&1
printf '\n=== COUNTERS ===\n'; cat /proc/net/snmp; cat /proc/net/netstat
printf '\n=== OFFLOAD ===\n'
for x in /sys/class/net/*; do ethtool -k "${x##*/}" 2>&1; done
exit 0
```

### scripts/tls.sh

```sh
#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p config/tls private
openssl req -x509 -newkey rsa:3072 -nodes -days 30 \
  -keyout config/tls/ca.key -out config/tls/ca.crt \
  -subj /CN=NATENV-TEST-ONLY-CA -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign'
for pair in 'turn:10.77.0.30' 'relay:10.77.0.40' 'pbx:10.77.0.10'; do
  n=${pair%%:*}; ip=${pair#*:}
  openssl req -newkey rsa:2048 -nodes -keyout config/tls/$n.key \
    -out config/tls/$n.csr -subj "/CN=$n.lab"
  printf 'subjectAltName=DNS:%s.lab,IP:%s\nextendedKeyUsage=serverAuth\n' "$n" "$ip" >config/tls/$n.ext
  openssl x509 -req -in config/tls/$n.csr -CA config/tls/ca.crt \
    -CAkey config/tls/ca.key -CAcreateserial -days 14 \
    -extfile config/tls/$n.ext -out config/tls/$n.crt
  # Only throwaway isolated-lab service keys; CA key remains host-only below.
  chmod 644 config/tls/$n.key config/tls/$n.crt
done
# Never mount CA signing key into a container.
mv config/tls/ca.key private/ca-signing-key.DO-NOT-MOUNT
chmod 600 private/ca-signing-key.DO-NOT-MOUNT
sed '/^no-tls$/d; /^no-dtls$/d' config/coturn.conf >config/coturn.tls.conf
cat >>config/coturn.tls.conf <<'EOF'
tls-listening-port=5349
cert=/lab-config/tls/turn.crt
pkey=/lab-config/tls/turn.key
EOF

chmod 755 config/tls
chmod 644 config/tls/ca.crt
```

[^implementation-handbook-13]

[^implementation-handbook-13]: Appendix A — Exact source files — sources/implementation-handbook.md, lines 548-2828.

