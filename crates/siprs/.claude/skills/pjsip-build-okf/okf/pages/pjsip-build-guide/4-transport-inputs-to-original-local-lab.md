---
type: "Page"
title: "4. Transport inputs to original local lab"
description: "Original CLI convention: `put PLATFORM REMOTE LOCAL`; directory must exist. Examples below preserve source tar checksum; never extract arbitrary unverified archive. Standard builder work area..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-7"
    title: "4. Transport inputs to original local lab"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "918d2273d605221e40f83c13191cf6d131254fb891993b9f7dc01625bbf0a006"
x-requires: [pages/pjsip-build-guide/3-source-acquisition-freeze-once-identical-per-lane]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "145-169"
x-topic: "pjsip-build-guide"
---
## 4. Transport inputs to original local lab
Original CLI convention: `put PLATFORM REMOTE LOCAL`; directory must exist. Examples below preserve source tar checksum; never extract arbitrary unverified archive. Standard builder work area only; root-owned base untouched.
```bash
cd "$LAB"
python3 lab.py exec linux "mkdir -p ~/native/$RUN"
python3 lab.py put linux "native/$RUN/input.tar.gz" "$KIT/out/$RUN-input.tar.gz"
python3 lab.py exec windows --ps "New-Item -ItemType Directory -Force C:/ci/work/native/$RUN | Out-Null"
python3 lab.py put windows "C:/ci/work/native/$RUN/input.tar.gz" "$KIT/out/$RUN-input.tar.gz"
```
Verify SHA exactly from host approved lock BEFORE extraction. POSIX:
```bash
SHA=$(shasum -a 256 "$KIT/out/$RUN-input.tar.gz" | awk '{print $1}')
python3 lab.py exec linux "cd ~/native/$RUN; echo '$SHA  input.tar.gz' | sha256sum -c - && tar -xzf input.tar.gz"
```
Windows (Bash host interpolation; forward slash avoids `\$RUN` escaping dollar):
```bash
python3 lab.py exec windows --ps "\$d='C:/ci/work/native/$RUN'; if((Get-FileHash \"\$d/input.tar.gz\" -Algorithm SHA256).Hash.ToLower() -ne '$SHA'){throw 'source hash mismatch'}; tar.exe -xzf \"\$d/input.tar.gz\" -C \$d; exit \$LASTEXITCODE"
```
Host Mac gets its own fresh copy:
```bash
mkdir -p "$KIT/work/macos/$RUN"
tar -xzf "$KIT/out/$RUN-input.tar.gz" -C "$KIT/work/macos/$RUN"
```
Snapshot source+profile artifact hashes per run; changing config_site after configure invalidates dependent objects. Fresh tree per lane/config; no reuse of Windows-generated headers on Mac/Linux. Case-sensitive vs Windows case-insensitive collisions should be rejected during input review.

[^pjsip-build-guide-7]

[^pjsip-build-guide-7]: 4. Transport inputs to original local lab — sources/pjsip-build-guide.md, lines 145-169.

