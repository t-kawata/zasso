# Brief: adhoc

You are writing a check for a defect class that no declared check was written for.
That act is not mechanical, and nothing here produces it for you. What this brief
gives you is the shape of the answer and the place the tools are kept.

The constructors live in `rail/checks.mjs`. Read what it exports before you write
anything: a check is one of a small number of shapes, and a check you build from a
shape is a check whose origin, refusal and scope are already stated.

Answer this one question.

{{QUESTION}}

The sentence this specification decides by:

{{PREDICATE}}

Rules that decide whether your answer is a check:

- {{VERBATIM_QUOTE}}
- {{NO_LINE_WINDOW}}
- Name the defect, not the symptom: the class of reading this check refuses.
- Choose the constructor whose shape the defect is, and name the subject it runs over.
- Write the mutation that must redden your check and the counter-mutation that must
  stay green. A check whose mutation does not redden is refused rather than recorded.
- Sign every claim with the name of this brief. A claim with no signature is not a check.

Worklist: {{WORKLIST_PATH}}
