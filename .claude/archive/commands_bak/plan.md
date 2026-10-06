---
description: Plan mode for designing implementation approaches. Use when a task is non-trivial and needs structured planning before coding.
---

# /plan

**IMPORTANT**: WAIT for user CONFIRM before touching any code. The plan must be reviewed and approved before implementation begins. I will **NOT** write any code until you explicitly confirm.

**Example output when waiting**: `WAITING FOR CONFIRMATION`

Use this command to plan implementation approaches for non-trivial tasks. Do not call the Task tool or any subagent by default — planning should be done inline within the conversation context. If the `planner` subagent is unavailable, fall back to a manual structured analysis covering requirements, affected files, and implementation steps.
