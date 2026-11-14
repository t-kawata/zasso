---
type: "Page"
title: "3. Source acquisition: freeze once, identical per lane"
description: "Tag signature absence needn't make source unavailable, but trust route must be explicitly approved (official repository HTTPS + independently reviewed SHA etc.). Do not `set -e`-ignore signature..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-6"
    title: "3. Source acquisition: freeze once, identical per lane"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "d13815054fc92807af607de4281e7fe77434367f332f34c8d0e95928dc73a9dc"
x-requires: [pages/pjsip-build-guide/2-host-guest-prerequisite-verification-not-vm-rebuild]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "98-144"
x-topic: "pjsip-build-guide"
---
## 3. Source acquisition: freeze once, identical per lane
Mac, network acquisition only; source review required:
```bash
cd "$KIT"
git clone --no-checkout https://github.com/pjsip/pjproject.git cache/pjproject
cd cache/pjproject
git fetch --tags origin
git checkout --detach refs/tags/2.17
git status --porcelain                         # MUST empty
BASE=$(git rev-parse HEAD)
TREE=$(git rev-parse HEAD^{tree})
printf 'pjsip_tag=2.17\npjsip_commit=%s\nsource_tree=%s\n' "$BASE" "$TREE" > "$KIT/locks/$RUN.source.env"
git show -s --format=fuller HEAD > "$KIT/locks/$RUN.commit.txt"
git tag -v 2.17                                # only if tag signed; absence is disclosed, not fabricated verification
```
Tag signature absence needn't make source unavailable, but trust route must be explicitly approved (official repository HTTPS + independently reviewed SHA etc.). Do not `set -e`-ignore signature failure then report signed. `git checkout` above changes only acquisition cache. Fresh per-lane sources exported by `git archive`; PJSIP configure script supplied, no autoconf regeneration needed. Source-vs-generated-file checks become recorded lane delta.

Patch lane (if deploying, mandatory advisory review first):
```bash
# At cache/pjproject, approved source branch only; source patch dependencies reviewed.
git switch -c "pj217-approved-$RUN" "$BASE"
git fetch origin master
# Example VERIFIED Service-Route fix; not complete security patchset:
git show --stat acc03b57cef7a7d31b8e1f5b9117437d7e87c591
git cherry-pick -x acc03b57cef7a7d31b8e1f5b9117437d7e87c591
# Conflict? STOP; cherry-pick --abort; obtain/review correct backport; never guessed source edits.
# Apply remaining reviewed fixes in dependency order; each source/hash/regression recorded.
BASE=$(git rev-parse HEAD); TREE=$(git rev-parse HEAD^{tree})
printf 'pjsip_base_tag=2.17\npjsip_commit=%s\nsource_tree=%s\n' "$BASE" "$TREE" > "$KIT/locks/$RUN.source.env"
```
`pjsip_commit` final approved local/source commit; `source_tree` before generated config_site/configure files. Patch-file SHA/order/advisory dispositions retained. Version string may remain2.17 after backports; never distinguish patches via version alone. Source tree identifier is provenance assertion, not proof binary corresponds; retain build inputs/logs/hashes to audit.

Export:
```bash
git archive HEAD | tar -xf - -C "$KIT/input/$RUN/pjproject"
cd "$KIT"
curl -fL --retry 3 https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz -o cache/opus-1.6.1.tar.gz
printf '%s  %s\n' 6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1 cache/opus-1.6.1.tar.gz | shasum -a 256 -c -
tar -xzf cache/opus-1.6.1.tar.gz --strip-components=1 -C "input/$RUN/opus"
cp -R lane config probe "input/$RUN/kit/"
cp "locks/$RUN.source.env" "input/$RUN/source.env"
# Copy reviewed advisory dispositions/patch hashes/source version record too, if present.
COPYFILE_DISABLE=1 tar -czf "out/$RUN-input.tar.gz" -C "input/$RUN" .
shasum -a 256 "out/$RUN-input.tar.gz" > "locks/$RUN-input.sha256"
```
Opus1.6.1 publisher SHA256 above from official downloads page; source policy can choose another approved version, with recorded hash + retesting. Do not assume system Opus version identical across OS. GNU POSIX builds same Opus source/static PIC; Windows CMake static /MD. Source header/ABI/backend/options may differ per OS by design; source version and logical required capabilities stay matched.

[^pjsip-build-guide-6]

[^pjsip-build-guide-6]: 3. Source acquisition: freeze once, identical per lane — sources/pjsip-build-guide.md, lines 98-144.

