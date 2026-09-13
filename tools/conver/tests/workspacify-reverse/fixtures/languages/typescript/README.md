# TypeScript representative

One of the six **language representatives**: the population the instrument is
validated against. It is not the experiment's input and not the pattern audit's
input — `siprs-for-reverse` is the experiment subject, and the three populations
are named separately in `../LANGUAGES.json`.

It is chosen for the **constructs it contains**, not for its size:

- `export *` — a re-export, so a published name is declared in a module other
  than the one that publishes it (`src/index.ts`)
- a declaration merge — `interface Box` declared twice, so the shape a consumer
  sees is written in no single place (`src/model.ts`)
- a dynamic import — `import(moduleName)`, whose specifier is a value rather than
  a name, so the module that arrives is not in the text (`src/loader.ts`)

Its build needs the TypeScript compiler, which is declared as a dependency and
must be fetched, so `LANGUAGES.json` records it as `offline: false`. That is not
a defect of the tree: §5.8 separates the static measurements, which this
representative serves, from the execution channels, which it does not.

What a fuller representative would need, and what this one deliberately does not
carry: enough files for a volume measurement, and a real development history.
`P22-ANALYSIS-TECH.md` §6 records that the adequacy of the corpus size was never
verified, and this tree does not settle it.
