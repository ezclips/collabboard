import { z } from 'zod';
import type { Result } from './result';
import { err } from './result';
import type { DomainError } from './errors';
import { domainError } from './errors';
import type { UserId } from './ids';

/** Who is acting. `null` user = anonymous (share-link visitor). */
export interface CommandContext {
  readonly userId: UserId | null;
}

export interface Command<I, O> {
  readonly name: `${string}.${string}`; // entity.verb (CONVENTIONS.md rule 6)
  (input: unknown, ctx: CommandContext): Promise<Result<O, DomainError>>;
}

/**
 * The single write-path constructor (ARCHITECTURE.md rule 3, first form).
 * Validates input with zod, converts stray throws into `unknown` errors so
 * exceptions never cross the domain boundary.
 */
export function defineCommand<I, O>(definition: {
  name: `${string}.${string}`;
  input: z.ZodType<I>;
  execute: (input: I, ctx: CommandContext) => Promise<Result<O, DomainError>>;
}): Command<I, O> {
  const run = async (input: unknown, ctx: CommandContext): Promise<Result<O, DomainError>> => {
    const parsed = definition.input.safeParse(input);
    if (!parsed.success) {
      return err(
        domainError('validation', `Invalid input for ${definition.name}`, {
          details: parsed.error.issues,
        }),
      );
    }
    try {
      return await definition.execute(parsed.data, ctx);
    } catch (cause: unknown) {
      return err(
        domainError('unknown', `Unhandled exception in ${definition.name}`, { cause }),
      );
    }
  };
  // Function.name is writable:false but configurable:true - defineProperty is
  // the only sanctioned way to set it (Object.assign throws in strict mode).
  Object.defineProperty(run, 'name', { value: definition.name, configurable: true });
  return run as Command<I, O>;
}
