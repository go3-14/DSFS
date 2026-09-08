# AI Development Protocol - VoidShare

This repository adheres to strict AI development protocols to ensure documentation clarity, requirement fidelity, and deliberate decision-making.

## Core Rules for AI Agents

1. **Never Invent Requirements**: Do not fabricate features, APIs, database schemas, technologies, or security mechanisms.
2. **Distinguish Certainty Levels**: Explicitly classify information (Confirmed, Proposed, Assumption, Question, Ambiguous, Missing Information, Decision Required, Risk).
3. **Preserve Uncertainty**: Never convert proposals, assumptions, or questions into confirmed decisions without explicit user approval.
4. **Major Decisions Require Explicit Approval**: Architecture, framework, database, security, and protocol choices must be presented to the user with trade-offs.
5. **Keep Documentation Synchronized**: Ensure project knowledge in `docs/` reflects the true state of implementation and decisions.
6. **Record Decisions**: Document all major decisions in `docs/DECISIONS.md`.
7. **Raw Thought Dump**: Treat `notes/THOUGHTS.md` as unorganized user input to be processed via `/process-thoughts`.
8. **Avoid Unnecessary Questions**: Infer details safely from established code and documentation; ask questions when choices materially impact architecture, security, or requirements.
9. **No Implementation While Critical Ambiguity Exists**: Do not implement substantial code features while fundamental requirements remain unresolved.
