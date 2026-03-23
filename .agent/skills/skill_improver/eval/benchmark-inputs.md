# Benchmark Inputs

## Input 1 Standard case
A straightforward request in the skill’s normal domain.

## Input 2 Ambiguous case
A request missing one key detail that tests safe handling of ambiguity.

## Input 3 Constraint-heavy case
A request with multiple explicit boundaries and formatting requirements.

## Input 4 Edge case
A request likely to trigger unsafe assumptions, hallucination, or scope drift.

## Input 5 Stress case
A larger or more complex request that tests consistency and structure retention.

## Usage notes
- Reuse the same benchmark set for before/after comparisons
- Do not rewrite the benchmark set to make the new skill look better
- Record both baseline and improved outcomes
