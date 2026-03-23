# Skill Improver

## Purpose
This skill audits other `.agent` skills and improves them through structured, evidence-backed edits.

## It does not
- replace domain skills
- execute product work instead of task skills
- rewrite the entire agent system
- change root `.agent/skill.md` unless the defect is clearly global

## Core loop
1. Run the target skill normally
2. If the result is weak, capture the failure
3. Log the failure in structured form
4. Promote fixes only when repeated evidence or severe failure justifies it
5. Revise the target skill minimally
6. Re-test against benchmark inputs
7. Append improvement history

## Promotion threshold
A fix should only be promoted when:
- the same defect appears at least twice
- or one defect made the output unusable

## Recommended first targets
- canvas_client_refactoring
- ai_component_pipeline
- workspace_invitations
