const fs = require("fs");
const g = require("../RFC-ROOT-GRAPH.json");

const edgeContracts = {};
for (const e of g.edges) {
  for (const c of e.contracts || []) {
    const m = c.id.match(/^C(\d+)$/);
    if (m && parseInt(m[1],10) >= 91) {
      edgeContracts[c.id] = {
        id: c.id,
        sourceEdge: e.from + "→" + e.to,
        precondition: c.precondition,
        postcondition: c.postcondition,
        invariant: c.invariant
      };
    }
  }
}

const byNode = {};
for (const e of g.edges) {
  for (const c of e.contracts || []) {
    const m = c.id.match(/^C(\d+)$/);
    if (m && parseInt(m[1],10) >= 91) {
      (byNode[e.from] = byNode[e.from] || []).push(c.id);
    }
  }
}

const ticketNodes = {
  "P16-1":  ["N0079"],
  "P16-2":  ["N0080"],
  "P16-3":  ["N0081"],
  "P16-4":  ["N0082"],
  "P16-5":  ["N0083"],
  "P16-6":  ["N0084"],
  "P16-7":  ["N0085"],
  "P16-8":  ["N0086"],
  "P16-9":  ["N0087"],
  "P16-10": ["N0088"],
  "P16-11": ["N0089"],
};

const patches = {};
for (const [key, nodes] of Object.entries(ticketNodes)) {
  const cids = nodes.flatMap(n => byNode[n] || []);
  const unique = [...new Set(cids)];
  patches[key] = unique.map(cid => edgeContracts[cid]).filter(Boolean);
  console.log(key, "→", unique.join(", "), `(${patches[key].length})`);
}

fs.writeFileSync("drills/ticket-contract-patches.json", JSON.stringify(patches, null, 2));
console.log("total edge contracts:", Object.keys(edgeContracts).length);
