# Go representative

One of the six **language representatives**: the population the instrument is
validated against. It is not the experiment's input and not the pattern audit's
input — `siprs-for-reverse` is the experiment subject, and the three populations
are named separately in `../LANGUAGES.json`.

It is chosen for the **constructs it contains**, not for its size:

- a build tag — `//go:build linux`, so the declarations of this package differ by
  platform (`pkg/widget/widget_linux.go`)
- an embedded struct — `widgetBase` promoted into `Widget`, so the fields a
  widget has are not the fields its declaration writes (`pkg/widget/widget.go`)
- a table-driven test — one test function carrying three cases, so counting test
  functions is not counting expectations (`pkg/widget/widget_test.go`)

Its manifest declares no dependency, so `LANGUAGES.json` records it as
`offline: true` and the execution channels may run it.

What a fuller representative would need, and what this one deliberately does not
carry: enough files for a volume measurement, and a real development history.
`P22-ANALYSIS-TECH.md` §6 records that the adequacy of the corpus size was never
verified, and this tree does not settle it.
