---
type: "Reference"
title: "EXEC_ASSETS/MANIFEST.json"
description: "Asset manifest with file roles and checksums."
sources: 
  - resource: "EXEC_ASSETS/MANIFEST.json"
    id: "exec-asset-manifest-json"
    title: "EXEC_ASSETS/MANIFEST.json"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/MANIFEST.json"
x-asset-sha256: "2b05ac80e81f5ae2db6c9614aa659bade2ffe4774da5c3d33392443952e97f0f"
x-content-sha256: "28e8889b97a86a5877ab95123b330305b935135c43e5c2f3d75ea9d8242f9087"
x-requires: 
  - "pages/pre-okf-original/31-asset-map-and-edit-discipline"
x-source-span: "1-179"
x-topic: "exec-assets"
---
## EXEC_ASSETS/MANIFEST.json

Asset manifest with file roles and checksums.

- role: Reference
- interface: none
- governing section: [31. Asset map and edit discipline](../pre-okf-original/31-asset-map-and-edit-discipline.md)
- asset hash: `2b05ac80e81f5ae2db6c9614aa659bade2ffe4774da5c3d33392443952e97f0f`
- source span: lines 1-179

```json
{
  "edition": "2026-11-17",
  "guide_filename": "COMPLETE_GUIDE.md",
  "assets": {
    ".gitignore": {
      "bytes": 72,
      "sha256": "afad7b57a0d686a610fee080e1b44fc31fcb6ec9a17480bea3a9307eee22a9e6"
    },
    "AGENTS.md": {
      "bytes": 1113,
      "sha256": "ae54286acb93bdb1bd96e16da6c938ebdf6f0da522097584bf3c92c9f860a639"
    },
    "Dockerfile": {
      "bytes": 499,
      "sha256": "067919c95656e8c8a4344975910bd4fd8e9dc9f5dfc071ae47602701156e73c9"
    },
    "README.md": {
      "bytes": 1214,
      "sha256": "2fcd1d68ab9beecefcb2db55715f79a5436a615fba0a9bb980c826cc0ee472ca"
    },
    "agent-run.py": {
      "bytes": 2453,
      "sha256": "caa830597ae8049cdcbfa7e6e69769a826378bedbb70ee3f28e504c4836ab036"
    },
    "bootstrap/freeze.sh": {
      "bytes": 466,
      "sha256": "4b38887be93f702a3e47c0f7f99da4185b88cbaedc0feeb55f87fb2f24c0a69f"
    },
    "bootstrap/macos.sh": {
      "bytes": 564,
      "sha256": "b6b9b1f5e6e935103def97609da2d3db675f3d66c4b949f4ce3400a4895336fe"
    },
    "bootstrap/ubuntu.sh": {
      "bytes": 1048,
      "sha256": "e4756667bfdefb15aca0566238a41255537c27bf4916db74eb809c665f288a9a"
    },
    "bootstrap/verified-download.ps1": {
      "bytes": 491,
      "sha256": "60841707cf9a01d2ed800fb9614ec998ed68247035b2e2bbbd9e089b3d2bce83"
    },
    "bootstrap/windows.ps1": {
      "bytes": 1366,
      "sha256": "7fb5de0db4de841fb1ccc940110d1ac592558f57fa9bbfcab401c381373f2478"
    },
    "compose.timeout.json": {
      "bytes": 187,
      "sha256": "2328ad9d9d58218a0139cb4739d4abb155502418e5509afb14ae436cbf2b8111"
    },
    "compose.tls.json": {
      "bytes": 145,
      "sha256": "60f3b844d9e6ece24187175b2292d71f49273770ea7a641b7fd17a538df6e33c"
    },
    "config/asterisk/extensions.conf": {
      "bytes": 170,
      "sha256": "c224c793cf000cbaff674f8c5d84d47b96ce0c0bfde11993d66c541386cf5332"
    },
    "config/asterisk/pjsip.conf": {
      "bytes": 681,
      "sha256": "eadbeccf641c59f2695ab473b5fd4d4d311e62a808e398f7aeb9fb8fcf2a0ad3"
    },
    "config/asterisk/rtp.conf": {
      "bytes": 52,
      "sha256": "963a0c2e39150d3729e11eeff3643ff1c25933a7b4c448def6d5008ba7523a37"
    },
    "config/coturn.conf": {
      "bytes": 206,
      "sha256": "11cb4673d4d77d9e561711ebf271228303596836e2b40c5e3725aeae65149b44"
    },
    "config/fixture.json": {
      "bytes": 402,
      "sha256": "cd5d8a6d827aedf4a06828bc80c99a99c56e64b3c0e8a966a1b050ef8849dd2a"
    },
    "doctor.py": {
      "bytes": 1193,
      "sha256": "b2afe4a784d1600333d07f275baaef301d3050bda19e61ddbec7dacebd36b511"
    },
    "generate.py": {
      "bytes": 5408,
      "sha256": "96e6dbc280eed6093aee405f535fad974bbed07f177af1681fa5bd5f3299090d"
    },
    "inventory.example.json": {
      "bytes": 407,
      "sha256": "80f884e3798de11aba1b9e1e60a3f1af9d1b98ad676164dfc3ddf17cdcdb776a"
    },
    "jobs/infra-state.sh": {
      "bytes": 60,
      "sha256": "906cb9aa1c70e2b3827ba0b09a5e3ccc6e2d01042e536105e6472b89c1326867"
    },
    "jobs/mac-state.sh": {
      "bytes": 53,
      "sha256": "0b79cc171c4ba5d1d90e42e4637e5478e12c7485a7dcd0c0df95cb59053d0b1d"
    },
    "jobs/windows-state.ps1": {
      "bytes": 196,
      "sha256": "1ec2eba3d9325b66d474e37a05e9242c866625f6536bb1f82efba66456043885"
    },
    "lab": {
      "bytes": 1264,
      "sha256": "b4f7b6eea6da1b3795743f0da48addc44d5f50847961695ca64643c5fca6c1ac"
    },
    "requirements-media.txt": {
      "bytes": 15,
      "sha256": "99f43573522565d7c480efd1f954892948033915df6a4e685327e995d3396eb6"
    },
    "scripts/capture.sh": {
      "bytes": 588,
      "sha256": "ca1bf84287b453aade1f34486cceb86dfa65d893ac84d39745455e938ff15838"
    },
    "scripts/fixture.py": {
      "bytes": 1335,
      "sha256": "4faa80581efc790c4350c1a5c3c64f6ccdedad0ab5ff817a4c68872d80d3752a"
    },
    "scripts/inject.py": {
      "bytes": 527,
      "sha256": "c665fd96de3b5846374d2f2fff41d354be12353d75e8f20d803f90e5c46ec5eb"
    },
    "scripts/link.sh": {
      "bytes": 251,
      "sha256": "5b74124c49b6fe507c42b24c1f6448a32bde4862b3f4f0bf2cb142ec85cdf031"
    },
    "scripts/linux-endpoint.sh": {
      "bytes": 1288,
      "sha256": "d6e63fbfbec755e3ac9981cf6456759f78a6e01ebaa0f7a1e786674ab96d58ff"
    },
    "scripts/media.py": {
      "bytes": 2693,
      "sha256": "09199b8fafc2ceeb8e3b88de0c7dbfe55aa27063d22cb6ba675a76fb41e8f0db"
    },
    "scripts/nat-observe.py": {
      "bytes": 1127,
      "sha256": "901f069be9072e9165e7f85655fb4284cb7222a5e83f0de7b500349c9712df0e"
    },
    "scripts/node.sh": {
      "bytes": 1961,
      "sha256": "d98b2773c92807497fa78e0b419e394cc18b864244d86781404529f963170263"
    },
    "scripts/observer.py": {
      "bytes": 872,
      "sha256": "e1024bb2879cd53ca32a49342388238a826614a947fce7ed091783bec48a2d94"
    },
    "scripts/outer-relay.py": {
      "bytes": 1326,
      "sha256": "776e6ca02f1b976386caf9a43af69723f8e1397069b0b507bcc9730cbf3de2a5"
    },
    "scripts/policy.sh": {
      "bytes": 453,
      "sha256": "49bb54861d64c9ab4f1d91cbcc516c32dd915ef499bf98f420aa3101087a7a67"
    },
    "scripts/probe.py": {
      "bytes": 2139,
      "sha256": "4656d7aebea4d6617cb8047464ade22faf5665ee9fb2d994801a37c416e5685a"
    },
    "scripts/state.sh": {
      "bytes": 611,
      "sha256": "faed8bce64da9766b2a7122386fb41288902f039452a37bac77bc821693d904c"
    },
    "scripts/tls.sh": {
      "bytes": 1136,
      "sha256": "b0a42dbf6c458bd208c63dda0f2c843f91a958d4552605c15595af9d55bf5cfa"
    },
    "validate.py": {
      "bytes": 990,
      "sha256": "50daf04150d21c30483c4cbd187509b45a7bf3b3e329b8be62ea211018b7ff88"
    },
    "vm/macos-collect.sh": {
      "bytes": 402,
      "sha256": "4036b889f8d887c1503970bd585e8b5356a12aa907454443d43dea9f397dc0fb"
    },
    "vm/windows-collect.ps1": {
      "bytes": 963,
      "sha256": "82da17730f1d29e5505b9386a7a71903113e7c50b1ad272901dceed4411cc3c4"
    },
    "vm/windows-create.ps1": {
      "bytes": 833,
      "sha256": "1845c209203606efe3cff7e2ab3d85e8e102f45ed8ffcb81ce4f79372fc27b7a"
    }
  },
  "guide_sha256": "c8c727d8a1ef24049b979271998ac2ad1f2f0af137b2b56c320745bc836c5648"
}
```

[^exec-asset-manifest-json]

[^exec-asset-manifest-json]: EXEC_ASSETS/MANIFEST.json — lines 1-179.
