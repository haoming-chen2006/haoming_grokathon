/**
 * The one import 05-software publishes, so mounting it is a single line.
 *
 * There is no `software` page in `client/src/control-room/shell/contract.ts`, and that is correct
 * rather than an omission: software is one of the five **asset types**, not a sixth page
 * (`grok-workspace.md` §5.2), and `loops/05-software.md` opens by saying this surface must not exist
 * loudly. So these three components are offered two ways, and the request in
 * `loops/handoff/pivot-software.md` names both:
 *
 *   - **02-assets** renders `SoftwarePage` / `SoftwareInspector` when the selected asset is
 *     `kind: "software"`. This is the one that matches the contract.
 *   - **07-shell** adds a page slot, if reconciliation would rather see it standing alone first.
 *
 * Both take the published `WorkspacePageProps` and nothing else, so neither needs a change here.
 */

export { SoftwareInspector, SoftwareNavigator, SoftwarePage } from "./SoftwarePage";
export type { AppState, PreviewState, PreviewView, SoftwareAppView } from "./types";
