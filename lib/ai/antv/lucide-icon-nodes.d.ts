/**
 * PATCH-241. Lucide ships each icon's geometry as a `__iconNode` export from
 * its per-icon ESM modules, but no declarations for the deep path. We import
 * only that data (not the React components), so declare it here.
 */
declare module 'lucide-react/dist/esm/icons/*.js' {
  export type LucideIconNodeChild = readonly [string, Readonly<Record<string, string | number>>];
  export const __iconNode: readonly LucideIconNodeChild[];
}
