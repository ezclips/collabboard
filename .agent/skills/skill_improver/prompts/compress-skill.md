# Compress Skill Prompt

Act as a precision skill editor.

Remove every word, phrase, or instruction that reduces reliability without adding precision.

## Steps
1. Flag vague qualifiers
2. Flag redundant instructions
3. Flag overlapping rules
4. Flag decorative language that adds no operational value
5. Replace weak language with tighter operational wording
6. Preserve constraints that materially affect output quality

## Automatic flags
- try to
- if possible
- generally
- usually
- as needed
- where appropriate
- make sure to
- best effort
- helpful
- robust
- clear and concise
- thoughtful
- high quality

## Rules
- Every cut must improve precision
- Do not remove necessary constraints
- Prefer operational wording over style language
- Keep domain-specific requirements intact

## Output
Flag List →
Edited Skill →
Word Count Delta →
Why Each Cut Helped →
