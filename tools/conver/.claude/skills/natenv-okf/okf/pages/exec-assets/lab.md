---
type: "Procedure"
title: "EXEC_ASSETS/lab"
description: "Base topology CLI for compose, exec, capture, logs, and collection."
sources: 
  - resource: "EXEC_ASSETS/lab"
    id: "exec-asset-lab"
    title: "EXEC_ASSETS/lab"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/lab"
x-asset-sha256: "b4f7b6eea6da1b3795743f0da48addc44d5f50847961695ca64643c5fca6c1ac"
x-content-sha256: "6aeb03dbd354ee1e640f1e79425c6757f4c23039a6afc445333a4bfe8eb961d7"
x-requires: 
  - "pages/pre-okf-original/11-generate-build-start-infrastructure"
x-source-span: "1-30"
x-topic: "exec-assets"
---
## EXEC_ASSETS/lab

Base topology CLI for compose, exec, capture, logs, and collection.

- role: Procedure
- interface: `config|build|up|down|ps|exec|logs|capture-start|capture-stop|collect`
- governing section: [11. Generate, build, start infrastructure](../pre-okf-original/11-generate-build-start-infrastructure.md)
- asset hash: `b4f7b6eea6da1b3795743f0da48addc44d5f50847961695ca64643c5fca6c1ac`
- source span: lines 1-30

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
dc=(docker compose -f compose.json)
case "${1:-}" in
 config) "${dc[@]}" config;;
 build) "${dc[@]}" build;;
 up) "${dc[@]}" up -d --wait --wait-timeout 240;;
 down) "${dc[@]}" down --remove-orphans;;
 ps) "${dc[@]}" ps --all;;
 exec) shift; "${dc[@]}" exec -T "$@";;
 logs) "${dc[@]}" logs --no-color --timestamps;;
 capture-start|capture-stop)
  action=${1#capture-};rc=0
  for s in $("${dc[@]}" config --services);do "${dc[@]}" exec -T "$s" /lab/capture.sh "$action" || rc=1;done
  exit "$rc";;
 collect)
  mkdir -p artifacts/host;rc=0
  docker version >artifacts/host/docker.txt || rc=1
  "${dc[@]}" config >artifacts/host/compose.yml || rc=1
  "${dc[@]}" logs --no-color --timestamps >artifacts/host/compose.log 2>&1 || rc=1
  for s in $("${dc[@]}" config --services);do
   "${dc[@]}" exec -T "$s" /lab/state.sh || rc=1
   id=$("${dc[@]}" ps -aq "$s");docker inspect "$id" >"artifacts/$s/inspect.json" || rc=1
  done
  docker image inspect wan-node:local >artifacts/host/image.json || rc=1
  printf '{"collection_exit":%s}\n' "$rc" >artifacts/host/collection.json
  exit "$rc";;
 *) echo './lab {config|build|up|down|ps|exec SERVICE CMD...|logs|capture-start|capture-stop|collect}' >&2;exit 2;;
esac
```

[^exec-asset-lab]

[^exec-asset-lab]: EXEC_ASSETS/lab — lines 1-30.
