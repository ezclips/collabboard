# Domain Layer Conventions

The domain layer is the ONLY path between UI and infrastructure
(ARCHITECTURE.md §2). Rules, enforced by eslint.boundaries.config.mjs where
mechanically possible:

1. **Purity:** nothing in `lib/domain` imports React, Next.js, `@supabase/*`,
   or anything from `components/` / `app/`. Repository *implementations* live
   in `lib/infra/**` (created in PATCH-004+) and are injected.
2. **Results, not throws:** every public function returns
   `Promise<Result<T>>` (or `Result<T>`). Throwing across the domain boundary
   is a bug; `defineCommand` converts stray throws into `unknown` errors.
3. **Errors are codes:** UI maps `DomainError.code` to user copy. `message` is
   developer-facing and must never be shown to users verbatim.
4. **Zod at every boundary:** command inputs are validated by the command's
   schema before `execute` runs. Never trust caller-supplied shapes.
5. **Branded IDs:** `BoardId`/`PostId`/`UserId` from `core/ids.ts` - never raw
   `string` for entity ids in domain signatures.
6. **Naming:** commands are `entity.verb` (`board.softDelete`); one feature
   folder per aggregate (`boards/`, `posts/`, `comments/`); repositories are
   interfaces named `<Entity>Repository`.
7. **Minimalism:** no combinators, base classes, or generics until a second
   concrete consumer needs them (CTO_PLAYBOOK §7). Additions to `core/`
   require CTO sign-off in the patch that needs them.
