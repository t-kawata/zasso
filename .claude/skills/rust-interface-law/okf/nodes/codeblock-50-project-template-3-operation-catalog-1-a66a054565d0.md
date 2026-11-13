---
type: CodeBlock
id: codeblock/50-project-template-3-operation-catalog/1/a66a054565d0
phase: scope
delivery: must
applies_to: all
requires: []
references: []
content_sha256: a66a054565d04a07ef3663555812a34f486b8e1520522db04b7197ae8e676b31
source: sources/50-PROJECT-TEMPLATE.md
---
```toml
[project]
name = "<project-c>"
spec_version = "0.3.2"

[[operation]]
id = "account.add"
authentication = "required"          # required | anonymous
scope = "control"                    # required operations only
mode = "unary"                       # unary | server_stream | client_stream | bidi
request = "AccountAddRequest"
response = "AccountAddResponse"
prepared = "PreparedAccountAdd"
handler = "crates/<project-c>-operation/src/handlers/account/add.rs"
conformance = "CF_account_add"

# Documentation inputs (English only)
docs = { summary = "Create an account", description = "Creates an account in the caller's tenant.", examples = ["account.add --name 'Example' --email user@example.com"] }

# Idempotency
idempotency = "same-transaction"     # none | same-transaction | external

# External effects
recovery = "compensate"              # compensate | forward | isolate

# Interface bindings
rest = { method = "POST", path = "/accounts", success = 200 }
websocket = { operation_id = "account.add" }
cli = { command = "account add" }
grpc = { service = "DoorsService", method = "AccountAdd", request = "AccountAddRequest", response = "AccountAddResponse" }
mcp = { tool = "account_add", applicable = true }
a2a = { skill = "account_add", applicable = true }

# Result store / cancellation
result_store = "on-cancel"           # none | on-cancel | always
```
