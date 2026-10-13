/**
 * The line-range shape of the live workspace, recorded from the measurement PX-255 performed.
 *
 * 33 segments tile the 15971-line specification, and 29 packages divide those segments among
 * themselves. Recorded rather than regenerated because the numbers this ticket asserts — 15969
 * claimed lines, 14307 of them claimed twice or more — follow from this exact tiling and this
 * exact assignment, and from no other. A fixture chosen for convenience would assert a
 * different workspace than the one the ticket measured.
 *
 * The segment fields are the manifest's own — line_start and line_end, not camelCase. A
 * fixture in the library's spelling would allow a reader that never normalised to pass
 * every test and measure nothing on the real manifest, which is the defect the live run found.
 */

export const SPEC_LINES = 15971;
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.

/** structure.segments, as WORKSPACIFY-TREE-MANIFEST.json carries them. */
export const RECORDED_MANIFEST_SEGMENTS = Object.freeze([
  {
    "id": "s-000001",
    "line_start": 1,
    "line_end": 2
  },
  {
    "id": "s-000002",
    "line_start": 3,
    "line_end": 84
  },
  {
    "id": "s-000003",
    "line_start": 85,
    "line_end": 185
  },
  {
    "id": "s-000004",
    "line_start": 186,
    "line_end": 394
  },
  {
    "id": "s-000005",
    "line_start": 395,
    "line_end": 946
  },
  {
    "id": "s-000006",
    "line_start": 947,
    "line_end": 1230
  },
  {
    "id": "s-000007",
    "line_start": 1231,
    "line_end": 1335
  },
  {
    "id": "s-000008",
    "line_start": 1336,
    "line_end": 1387
  },
  {
    "id": "s-000009",
    "line_start": 1388,
    "line_end": 3882
  },
  {
    "id": "s-000010",
    "line_start": 3883,
    "line_end": 3975
  },
  {
    "id": "s-000011",
    "line_start": 3976,
    "line_end": 4081
  },
  {
    "id": "s-000012",
    "line_start": 4082,
    "line_end": 4796
  },
  {
    "id": "s-000013",
    "line_start": 4797,
    "line_end": 4825
  },
  {
    "id": "s-000014",
    "line_start": 4826,
    "line_end": 5310
  },
  {
    "id": "s-000015",
    "line_start": 5311,
    "line_end": 5605
  },
  {
    "id": "s-000016",
    "line_start": 5606,
    "line_end": 6100
  },
  {
    "id": "s-000017",
    "line_start": 6101,
    "line_end": 6310
  },
  {
    "id": "s-000018",
    "line_start": 6311,
    "line_end": 6801
  },
  {
    "id": "s-000019",
    "line_start": 6802,
    "line_end": 7295
  },
  {
    "id": "s-000020",
    "line_start": 7296,
    "line_end": 9291
  },
  {
    "id": "s-000021",
    "line_start": 9292,
    "line_end": 9521
  },
  {
    "id": "s-000022",
    "line_start": 9522,
    "line_end": 9758
  },
  {
    "id": "s-000023",
    "line_start": 9759,
    "line_end": 9822
  },
  {
    "id": "s-000024",
    "line_start": 9823,
    "line_end": 11616
  },
  {
    "id": "s-000025",
    "line_start": 11617,
    "line_end": 12750
  },
  {
    "id": "s-000026",
    "line_start": 12751,
    "line_end": 13426
  },
  {
    "id": "s-000027",
    "line_start": 13427,
    "line_end": 13892
  },
  {
    "id": "s-000028",
    "line_start": 13893,
    "line_end": 13921
  },
  {
    "id": "s-000029",
    "line_start": 13922,
    "line_end": 13952
  },
  {
    "id": "s-000030",
    "line_start": 13953,
    "line_end": 14022
  },
  {
    "id": "s-000031",
    "line_start": 14023,
    "line_end": 14208
  },
  {
    "id": "s-000032",
    "line_start": 14209,
    "line_end": 15789
  },
  {
    "id": "s-000033",
    "line_start": 15790,
    "line_end": 15971
  }
].map(Object.freeze));

/** Each package directory and the segment ids its RFC-SEED.md claims. */
export const RECORDED_PACKAGE_SEGMENTS = Object.freeze([
  {
    "packagePath": "crates/adapters/gaia-ekyc-adapter",
    "segmentIds": []
  },
  {
    "packagePath": "crates/adapters/gaia-stripe-adapter",
    "segmentIds": []
  },
  {
    "packagePath": "crates/adapters/gaia-transport-adapter",
    "segmentIds": []
  },
  {
    "packagePath": "crates/adapters/storage/gaia-store-memory",
    "segmentIds": []
  },
  {
    "packagePath": "crates/adapters/storage/gaia-store-mysql",
    "segmentIds": []
  },
  {
    "packagePath": "crates/adapters/storage/gaia-store-postgres",
    "segmentIds": []
  },
  {
    "packagePath": "crates/adapters/storage/gaia-store-sqlite",
    "segmentIds": []
  },
  {
    "packagePath": "crates/conformance/gaia-conformance",
    "segmentIds": [
      "s-000027"
    ]
  },
  {
    "packagePath": "crates/core/gaia-core",
    "segmentIds": [
      "s-000027"
    ]
  },
  {
    "packagePath": "crates/foundation/gaia-foundation",
    "segmentIds": [
      "s-000027"
    ]
  },
  {
    "packagePath": "crates/interfaces/gaia-cli",
    "segmentIds": []
  },
  {
    "packagePath": "crates/interfaces/gaia-rest",
    "segmentIds": []
  },
  {
    "packagePath": "crates/interfaces/gaia-websocket",
    "segmentIds": []
  },
  {
    "packagePath": "crates/network/gaia-network",
    "segmentIds": [
      "s-000024",
      "s-000026",
      "s-000028",
      "s-000029",
      "s-000031",
      "s-000032",
      "s-000033"
    ]
  },
  {
    "packagePath": "crates/ports/gaia-ports",
    "segmentIds": [
      "s-000024"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-asset",
    "segmentIds": [
      "s-000002",
      "s-000003",
      "s-000004",
      "s-000005",
      "s-000006",
      "s-000009",
      "s-000010",
      "s-000011",
      "s-000012",
      "s-000013",
      "s-000014",
      "s-000015",
      "s-000016",
      "s-000018",
      "s-000019",
      "s-000020",
      "s-000021",
      "s-000024",
      "s-000025",
      "s-000026",
      "s-000027",
      "s-000029",
      "s-000030",
      "s-000033"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-certificates",
    "segmentIds": [
      "s-000002",
      "s-000003",
      "s-000004",
      "s-000005",
      "s-000006",
      "s-000007",
      "s-000009",
      "s-000010",
      "s-000011",
      "s-000012",
      "s-000013",
      "s-000014",
      "s-000015",
      "s-000016",
      "s-000017",
      "s-000018",
      "s-000019",
      "s-000020",
      "s-000021",
      "s-000022",
      "s-000023",
      "s-000024",
      "s-000025",
      "s-000026",
      "s-000027",
      "s-000029",
      "s-000031",
      "s-000033"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-civic",
    "segmentIds": [
      "s-000002",
      "s-000003",
      "s-000004",
      "s-000005",
      "s-000006",
      "s-000009",
      "s-000010",
      "s-000011",
      "s-000012",
      "s-000014",
      "s-000015",
      "s-000019",
      "s-000023",
      "s-000024",
      "s-000025",
      "s-000026",
      "s-000027",
      "s-000029"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-commerce",
    "segmentIds": [
      "s-000002",
      "s-000003",
      "s-000004",
      "s-000005",
      "s-000007",
      "s-000009",
      "s-000010",
      "s-000011",
      "s-000012",
      "s-000015",
      "s-000016",
      "s-000018",
      "s-000020",
      "s-000021",
      "s-000022",
      "s-000024",
      "s-000025",
      "s-000026",
      "s-000027",
      "s-000029",
      "s-000031"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-forum",
    "segmentIds": [
      "s-000002",
      "s-000003",
      "s-000004",
      "s-000005",
      "s-000006",
      "s-000007",
      "s-000009",
      "s-000010",
      "s-000011",
      "s-000012",
      "s-000014",
      "s-000015",
      "s-000016",
      "s-000017",
      "s-000019",
      "s-000020",
      "s-000021",
      "s-000024",
      "s-000025",
      "s-000026",
      "s-000027",
      "s-000029",
      "s-000033"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-heat",
    "segmentIds": [
      "s-000005",
      "s-000014",
      "s-000015",
      "s-000024",
      "s-000030"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-invariants",
    "segmentIds": [
      "s-000002",
      "s-000011"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-maturity",
    "segmentIds": [
      "s-000002",
      "s-000003",
      "s-000004",
      "s-000005",
      "s-000006",
      "s-000007",
      "s-000008",
      "s-000009",
      "s-000010",
      "s-000011",
      "s-000012",
      "s-000014",
      "s-000015",
      "s-000016",
      "s-000017",
      "s-000018",
      "s-000019",
      "s-000020",
      "s-000021",
      "s-000024",
      "s-000025",
      "s-000026",
      "s-000027",
      "s-000029"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-operation",
    "segmentIds": [
      "s-000004",
      "s-000005",
      "s-000009",
      "s-000015",
      "s-000016",
      "s-000017",
      "s-000020",
      "s-000022",
      "s-000024",
      "s-000026",
      "s-000027",
      "s-000029",
      "s-000031",
      "s-000033"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-publication",
    "segmentIds": [
      "s-000005",
      "s-000009",
      "s-000012",
      "s-000013",
      "s-000014",
      "s-000015",
      "s-000016",
      "s-000019",
      "s-000021",
      "s-000024",
      "s-000025",
      "s-000026",
      "s-000027",
      "s-000029",
      "s-000033"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-recommendation",
    "segmentIds": [
      "s-000005",
      "s-000014",
      "s-000021",
      "s-000025",
      "s-000026",
      "s-000027"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-soul",
    "segmentIds": [
      "s-000003",
      "s-000004",
      "s-000005",
      "s-000006",
      "s-000007",
      "s-000009",
      "s-000012",
      "s-000013",
      "s-000014",
      "s-000015",
      "s-000016",
      "s-000017",
      "s-000018",
      "s-000019",
      "s-000020",
      "s-000021",
      "s-000022",
      "s-000023",
      "s-000024",
      "s-000025",
      "s-000026",
      "s-000027",
      "s-000029",
      "s-000031",
      "s-000033"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-storage",
    "segmentIds": [
      "s-000004",
      "s-000005",
      "s-000009",
      "s-000010",
      "s-000012",
      "s-000013",
      "s-000015",
      "s-000016",
      "s-000020",
      "s-000021",
      "s-000022",
      "s-000024",
      "s-000025",
      "s-000026",
      "s-000027",
      "s-000033"
    ]
  },
  {
    "packagePath": "crates/protocol/gaia-time",
    "segmentIds": [
      "s-000004",
      "s-000005",
      "s-000006",
      "s-000009",
      "s-000010",
      "s-000012",
      "s-000015",
      "s-000016",
      "s-000017",
      "s-000018",
      "s-000019",
      "s-000020",
      "s-000021",
      "s-000022",
      "s-000024",
      "s-000025",
      "s-000027",
      "s-000029",
      "s-000031",
      "s-000033"
    ]
  }
].map((entry) => Object.freeze({ ...entry, segmentIds: Object.freeze(entry.segmentIds) })));
