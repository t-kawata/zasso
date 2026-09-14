# Python representative

One of the six **language representatives**: the population the instrument is
validated against. It is not the experiment's input and not the pattern audit's
input — `siprs-for-reverse` is the experiment subject, and the three populations
are named separately in `../LANGUAGES.json`.

It is chosen for the **constructs it contains**, not for its size:

- a metaclass — `class Widget(metaclass=RegistryMeta)`, so the registry gains an
  entry no class body names (`src/registry.py`)
- a decorator — `@traced`, so the name a caller reaches is not the function the
  `def` statement declared (`src/widget.py`)
- a `__getattr__` hook — a module-level one, so a consumer reaches attributes the
  module body does not declare (`src/widget.py`)

Its manifest declares no dependency and its test command needs nothing fetched,
so `LANGUAGES.json` records it as `offline: true` and the execution channels may
run it.

What a fuller representative would need, and what this one deliberately does not
carry: enough files for a volume measurement, and a real development history.
`P22-ANALYSIS-TECH.md` §6 records that the adequacy of the corpus size was never
verified, and this tree does not settle it.
