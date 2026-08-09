/**
 * Mentions — `@` in a textarea, the link it inserts, and the link it renders.
 *
 * The one shared surface. Both places a person writes prose in this product use exactly these
 * pieces: `useMentionInput` + `MentionPicker` to insert one, `MentionLink` or `MentionText` to
 * draw one, `MentionTargetsProvider` above both so the two agree about what exists.
 *
 * The form itself — `[@label](asset:id)` — is parsed in `designdoc/markdown.ts`, beside the rest
 * of the inline markup, because it IS inline markup and a second parser for it would be a second
 * opinion about what a document says.
 */
export { MentionLink, MentionText, mentionHref } from "./MentionLink";
export { MentionPicker } from "./MentionPicker";
export {
  MentionTargetsProvider,
  kindLabel,
  matchTargets,
  targetName,
  useMentionTarget,
  useMentionTargets,
  useProjectMentionTargets,
  type MentionTarget,
  type MentionTargets,
} from "./targets";
export { useMentionInput, type MentionInput } from "./useMentionInput";
