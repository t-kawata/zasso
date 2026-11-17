---
type: "Page"
title: "20. Asterisk reference service and SIP"
description: "PBX10.77.0.10; UDP/TCP5060; 1001/lab-1001 and1002/lab-1002; ulaw/alaw; RTP10000-10199; direct_media=no; symmetric RTP, force_rport, rewrite_contact; ICE disabled baseline. Passwords intentionally"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-22"
    title: "20. Asterisk reference service and SIP"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "26ee6d07fcc611799a42fa51739dac5c03b99b53b709a5712dfce8f4bfcada81"
x-requires: 
  - "pages/pre-okf-original/19-native-relay-server-and-path-transition"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "553-577"
x-topic: "pre-okf-original"
---
## 20. Asterisk reference service and SIP

PBX10.77.0.10; UDP/TCP5060; 1001/lab-1001 and1002/lab-1002; ulaw/alaw; RTP10000-10199; direct_media=no; symmetric RTP, force_rport, rewrite_contact; ICE disabled baseline. Passwords intentionally fixture-only. No public deployment.

A registers1001, B1002, A dials1002. Extension600 echo checks one endpoint path, not bidirectional peer call. Expected sequence: challenge/authenticated REGISTER/200, contact refresh; INVITE/180-or183/200/ACK; media; BYE/200. Negative: wrong password, timeout, busy, no answer, CANCEL; retransmission and recovery budgets.

Infrastructure CLI:
```sh
./lab exec pbx asterisk -rx 'pjsip show transports'
./lab exec pbx asterisk -rx 'pjsip show endpoints'
./lab exec pbx asterisk -rx 'pjsip show contacts'
./lab exec pbx asterisk -rx 'core show channels concise'
./lab exec pbx asterisk -rx 'pjsip show channelstats'
./lab exec pbx asterisk -rx 'pjsip set logger on'
./lab exec pbx asterisk -rx 'rtp set debug on'
# Diagnostic run only; restore:
./lab exec pbx asterisk -rx 'pjsip set logger off'
./lab exec pbx asterisk -rx 'rtp set debug off'
```
Version-dependent command absent -> `core show help`, identify equivalent; missing evidence is not successful empty output. Heavy RTP debug perturbs timing; separate diagnostic/performance runs.

Private PBX recipe: move PBX to dedicated LAN IP, configure transports local_net plus external_signaling_address/external_media_address, install actual SIP/RTP DNAT and forwarding, give PBX appropriate gateway, qualify from outside node. Same-LAN client uses private registrar unless hairpin specifically implemented. Advertisements alone never open NAT. Keep dedicated config rather than mutating baseline shared file and forgetting to restore.

SIP TLS/video not baseline. Add certificates/transports/codecs/SDP fixtures and real decoded checks when required. Asterisk-anchored RTP can succeed without product ICE/TURN; never infer those features from PBX call success.

[^pre-okf-original-22]

[^pre-okf-original-22]: 20. Asterisk reference service and SIP — sources/pre-okf-original.md, lines 553-577.

