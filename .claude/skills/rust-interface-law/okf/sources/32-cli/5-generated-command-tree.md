---
type: "Section"
title: "5. Generated Command Tree"
description: "The generator emits one subcommand per operation, derived from the catalog:"
sources: 
  - resource: "sources/32-CLI.md"
    id: "32-cli-5-generated-command-tree"
    title: "5. Generated Command Tree"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/32-CLI.md"
x-source-span: "82-121"
---
## 5. Generated Command Tree

The generator emits one subcommand per operation, derived from the catalog:

```rust
#[derive(clap::Parser)]
pub struct Cli {
    #[command(flatten)]
    pub common: CommonFlags,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(clap::Subcommand)]
pub enum Command {
    AccountAdd(AccountAddArgs),
    AccountGet(AccountGetArgs),
    // one variant per catalog operation
}

#[derive(clap::Args)]
pub struct AccountAddArgs {
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub email: String,
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CLI-01 | Argument types are generated separately from operation types. Clap attributes never appear on operation structs. | Separation. | Argument names. | V1; V2 derive scan. |
| CLI-02 | Every catalog operation has one subcommand. | One-to-one. | Command name. | V3 catalog test. |
| CLI-03 | A composition command is allowed only when documented and mapped to a sequence of operations. | Documentation. | Composition set. | V3 test. |
| CLI-04 | The command converts arguments into the operation request and calls the dispatcher. | Conversion path. | Argument mapping. | V3 test. |

---

