---
type: CodeBlock
id: codeblock/32-cli-adapter-5-generated-command-tree/1/6348ee664b5e
phase: adapter
delivery: must
applies_to: cli
requires: []
references: []
content_sha256: 6348ee664b5e00bd40e8e35d1bd2087f4fabf6792a1a4b9b31eb24ef83ff9391
source: docs/archive/IMPLEMENTATION-SPEC/32-CLI.md
---
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
