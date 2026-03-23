# Failure Taxonomy

- F1 Ambiguous instruction
- F2 Missing constraint
- F3 Redundant instruction
- F4 Over-broad role framing
- F5 Hallucinated assumption
- F6 Weak output structure
- F7 Missing edge-case handling
- F8 Wrong priority order
- F9 Too much verbosity
- F10 Too little completeness
- F11 Broke existing requirement
- F12 Invalid format or unusable output

## Usage rule
Every logged failure must map to exactly one primary category.
A secondary category may be noted in the observed problem text if needed, but the structured record must still have one primary failure code.
