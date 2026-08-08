/**
 * Vite serves `?raw` imports as strings. Declared inside shell/ rather than in a client-wide
 * vite-env.d.ts, because that file would be a new shared file at the root of client/src and this
 * worktree owns only its own directory.
 */
declare module "*.md?raw" {
  const content: string;
  export default content;
}
