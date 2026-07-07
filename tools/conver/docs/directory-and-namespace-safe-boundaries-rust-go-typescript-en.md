## Safe boundaries built with directories and namespaces (Rust/Go/TypeScript)

### Rust (crate + mod)

- “Directories are just physical layout; **boundaries are defined by the hierarchy of crates and mods**.”  
- Directories reflect the crate/mod structure, but instead of “directory = boundary” you treat it as “express the logical boundaries of crates/mods via directories.”  
- Each file defines its own module, and you align the module hierarchy roughly with the directory hierarchy, but **you always reason about semantics in terms of paths like `crate::foo::bar`**.  
- You only add directories when “the meaning of module boundaries has increased,” and **you avoid excessive nesting and prioritize a flat module structure**.  
- External APIs are exposed only via `pub` at the crate root, and **lower-level modules default to `pub(crate)` to encapsulate internal implementation details**.  
- Code that handles I/O or side effects is consolidated into explicit modules (directories), and **the domain logic side should see only abstractions such as traits**.  

### Go (module + package)

- You treat “**directory = package = boundary**”, with one directory per responsibility and per namespace as the baseline.  
- Package names are chosen based on “what they provide” rather than “what they contain,” and you avoid vague namespaces like `utils` or `common`.  
- Dependencies flow “from higher-level to lower-level” in a single direction, and **you never design a directory structure that introduces cyclic dependencies**.  
- Code that should not be exposed externally is placed under `internal/` packages, **combining Go’s visibility rules with directory boundaries to ensure privacy**.  
- Directory nesting is kept to 1–2 levels, **prioritizing a flat package structure and introducing new directories and boundaries only when complexity grows**.  

### TypeScript (directories + modules + barrels)

- Modules are per-file, but **you treat directories as logical namespaces and design responsibilities and boundaries at the directory level**.  
- Each directory has a barrel (`index.ts`, etc.) that re-exports only the symbols you want to expose from beneath that directory, thereby **making “directory = public surface” explicit**.  
- Imports from other directories go through the barrel by default, and **you do not bypass boundaries by importing files directly via relative paths**.  
- You create new directories only when a new domain, layer, or I/O boundary is needed, **avoiding overly fine-grained splits and the proliferation of meaningless shared directories (like `utils`)**.  
- Types and linting (strict TS, ESLint) enforce both “the direction of inter-directory dependencies” and “imports via barrels,” **so that structural boundary violations can be detected mechanically**.
