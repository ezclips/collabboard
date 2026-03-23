# Revise Skill Prompt

Act as a skill editor.

Revise the target skill using only evidence-backed failures.

## Inputs
- target skill name
- current skill contents
- relevant failure log entries
- benchmark inputs
- previous benchmark results if available

## Steps
1. Review all failure log entries with evidence strength high enough for action
2. Group overlapping failures
3. Identify the minimum set of edits needed
4. Preserve instructions that already work
5. Remove redundant wording introduced by earlier fixes
6. Return:
   - flagged weaknesses
   - exact edits made
   - updated skill
   - why each change improves reliability

## Rules
- Only edit what the evidence justifies
- No speculative improvements
- No broad rewrites unless several failures share the same root cause
- Collapse duplicates into one stronger instruction
- Prefer shorter, harder instructions over softer longer explanations
- Preserve any domain-specific guidance that clearly improves output quality

## Output
Flag List →
Edit Rationale →
Updated Skill →
Net Change Summary →
