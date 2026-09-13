# JavaScript representative

One of the six **language representatives**: the population the instrument is
validated against. It is not the experiment's input and not the pattern audit's
input — `siprs-for-reverse` is the experiment subject, and the three populations
are named separately in `../LANGUAGES.json`.

It is chosen for the **constructs it contains**, not for its size:

- a computed property name — `{ [widgetKey]: [] }`, so a key that matters is a
  value rather than a literal (`src/widget.js`)
- a dynamic `require` — `require(moduleName)`, whose target no syntax reader can
  resolve (`src/loader.js`)
- a prototype-based method — `Widget.prototype.render`, so a type's methods are
  not enumerated where the type is declared (`src/widget.js`)

Its manifest declares no dependency, so `LANGUAGES.json` records it as
`offline: true` and the execution channels may run it.

What a fuller representative would need, and what this one deliberately does not
carry: enough files for a volume measurement, and a real development history.
`P22-ANALYSIS-TECH.md` §6 records that the adequacy of the corpus size was never
verified, and this tree does not settle it.
