# C/C++ representative

One of the six **language representatives**: the population the instrument is
validated against. It is not the experiment's input and not the pattern audit's
input — `siprs-for-reverse` is the experiment subject, and the three populations
are named separately in `../LANGUAGES.json`.

It is chosen for the **constructs it contains**, not for its size:

- a function-like macro — `MAX_OF(left, right)`, whose expansion substitutes its
  arguments, so a call is not a call (`src/widget.h`)
- a conditional compilation block — `#if defined(WIDGET_FAST)`, so the code that
  exists is decided before the compiler reads it (`src/widget.cpp`)
- a header included from two translation units — `src/widget.cpp` and
  `src/widget_extra.cpp` both include `widget.h`, so the type is written once and
  read twice

Its manifest declares no fetched dependency, so `LANGUAGES.json` records it as
`offline: true` and the execution channels may run it.

What a fuller representative would need, and what this one deliberately does not
carry: enough files for a volume measurement, and a real development history.
`P22-ANALYSIS-TECH.md` §6 records that the adequacy of the corpus size was never
verified, and this tree does not settle it.
