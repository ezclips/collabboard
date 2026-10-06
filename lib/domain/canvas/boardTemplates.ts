/**
 * PATCH-293/296. Public entry for the board-template data model and the ONE
 * command that fills an EMPTY board. The implementation lives under
 * `boardTemplates/` (schema, rows, command); this file re-exports it so every
 * existing import keeps resolving here.
 */
export * from './boardTemplates/schema';
export * from './boardTemplates/rows';
export * from './boardTemplates/command';
