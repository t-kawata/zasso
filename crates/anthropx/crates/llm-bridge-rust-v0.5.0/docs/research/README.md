# Research Directory

This directory contains research notes, prior art analysis, and technical investigations related to `llm-bridge-rust`.

## Contents

Research documents should follow these conventions:

- **File naming:** `{topic}-{type}.md` where type is `prior-art`, `comparison`, `investigation`, or `notes`
- **Date format:** Include creation date in YAML frontmatter
- **Status:** Mark documents as `draft`, `in-review`, or `final`

## Templates

### Prior Art Analysis

```yaml
---
title: "{Project/Tool Name} - Prior Art Analysis"
date: YYYY-MM-DD
status: draft | in-review | final
author: @github-username
---

## Overview
Brief description of the project/tool.

## Key Features
What does it do? How does it work?

## Comparison with llm-bridge-rust
How does it compare to our approach?

## Lessons Learned
What can we learn from this project?

## References
Links to documentation, source code, etc.
```

### Technical Investigation

```yaml
---
title: "{Topic} - Technical Investigation"
date: YYYY-MM-DD
status: draft | in-review | final
author: @github-username
---

## Question
What are we trying to learn?

## Approach
How did we investigate?

## Findings
What did we discover?

## Recommendations
What should we do based on these findings?

## References
Links, data sources, etc.
```

## Current Research

_(Add research documents here as they are created)_

## Suggested Topics

- Protocol transform performance comparison across languages
- SSE streaming patterns in Rust HTTP servers
- Error handling strategies for cross-protocol translation
- Authentication/authorization patterns in API proxies
