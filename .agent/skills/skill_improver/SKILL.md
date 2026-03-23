---
name: skill_improver
description: Audits existing agent skills, logs failures, and improves them through evidence-backed minimal edits.
---

# Skill Improver

## Purpose
Improve existing agent skills through structured failure analysis without replacing, bloating, or destabilizing working skills.

## Scope
This skill does not replace task-specific skills.
It evaluates their outputs, logs weaknesses, and proposes or applies minimal justified improvements.

## Primary responsibilities
1. Analyze weak outputs from an existing skill
2. Classify the failure using the approved taxonomy
3. Identify the exact instruction weakness that allowed the failure
4. Propose the smallest useful fix
5. Update the target skill only when repeated evidence or severe failure justifies it
6. Re-test the updated skill on benchmark inputs

## Non-negotiable rules
- Do not rewrite a skill unless multiple repeated failures share the same root cause
- Preserve instructions that already work
- Prefer minimal edits over broad rewrites
- Every fix must map to a concrete observed failure
- Do not make stylistic edits unless they improve reliability
- Do not modify root `.agent/skill.md` unless the issue is clearly global
- Do not expand scope beyond the target skill unless evidence requires it
- Keep outputs directly usable and structured

## Failure threshold
Promote a change into the target skill only when:
- the same failure appears at least twice
- or one failure made the output unusable

## Input expectations
You may receive:
- the original user task
- the target skill name
- the target skill contents
- the model output produced by that skill
- a description of the quality problem
- prior related failure log entries
- benchmark inputs and previous benchmark results

## Analysis method
For every weak output:
1. Identify what failed
2. Identify why the output was weak or unsafe
3. Identify which exact skill instruction allowed the failure
4. Determine whether the issue is:
   - local to one skill
   - shared by several skills
   - merely stylistic and not worth changing
5. Propose the smallest fix that prevents recurrence

## Revision method
When revising a skill:
1. Read the current skill carefully
2. Review all relevant failure log entries
3. Group overlapping failures
4. Add or tighten only the instructions justified by evidence
5. Remove redundant wording introduced by previous fixes
6. Preserve output format and working constraints
7. Keep the skill lean

## Compression method
After revising a skill:
- remove vague qualifiers
- collapse duplicate rules
- replace soft language with operational instructions
- preserve all constraints that materially affect output quality

## Benchmark method
After meaningful revision:
1. Run the benchmark set
2. Compare baseline vs revised performance
3. Score requirement coverage, structural clarity, ambiguity resistance, hallucination resistance, usability, and consistency
4. Record the results in the evaluation report
5. Append an improvement history entry

## Output types
Return one or more of:
- Failure Log Entry
- Root Cause Analysis
- Minimal Fix Proposal
- Edited Skill Section
- Full Updated Skill
- Benchmark Comparison
- Improvement History Entry

## Review checklist
Before proposing a fix:
- What exactly failed?
- Which instruction allowed the failure?
- Is the problem local or global?
- Is this a one-off preference or a repeatable defect?
- What is the smallest edit that prevents recurrence?

Before finalizing:
- Is the fix evidence-backed?
- Is it minimal?
- Does it preserve working behavior?
- Did it avoid unnecessary prompt growth?
- Is the result directly usable?
