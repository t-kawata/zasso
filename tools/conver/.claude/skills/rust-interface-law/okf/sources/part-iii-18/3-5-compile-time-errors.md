---
type: "Section"
title: "3.5 Compile-Time Errors"
description: "The macro returns `syn::Error::new_spanned` for:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-18/3-5-compile-time-errors"
    title: "3.5 Compile-Time Errors"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-18/3-5-compile-time-errors"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7699-7699"
---
### 3.5 Compile-Time Errors

The macro returns `syn::Error::new_spanned` for:

- unknown rule name;
- rule applied to an incompatible field type;
- missing or empty `code`;
- custom rule without `id`, `check`, `fields`, `description`, or `code`;
- custom rule naming a field that does not exist;
- conditional rule without `when` and an English description;
- non-English `description`;
- malformed literal (non-numeric range, invalid regex);
- duplicate rule kind on the same field.

No rule is silently ignored.

### 3.6 Schema Registration

