/**
 * A wall around one region, so a page that throws takes only its own region down.
 *
 * There was no boundary anywhere in the shell, and React unmounts the entire tree on an uncaught
 * render error. So a single bad payload in one navigator blanked the whole workspace — toolbar,
 * navigator, main and inspector — and left a reload as the only way back. Two separate defects
 * produced exactly that symptom in one afternoon: page slots being called as functions instead of
 * rendered, and `docs.map` on a body that was not an array.
 *
 * The fix for each of those is in the code that had the bug. This is the fix for the *class*: the
 * next one costs a region, not the product.
 *
 * What it deliberately does NOT do is retry, or render a spinner, or say "something went wrong".
 * It states which region failed and what the error was, because the person looking at this is a
 * user whose work has stopped and the only useful thing is the truth.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** What failed, in the user's words — "The Assets page", "Design Documents' list". */
  what: string;
  children: ReactNode;
}

interface State {
  error?: Error;
}

export class SlotBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept, not swallowed: the stack is the only record of where this came from, and a boundary
    // that hides it trades a blank page for a silent one.
    console.error(`[${this.props.what}] failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        data-testid="slot-error"
        role="alert"
        className="flex h-full w-full items-start justify-center p-6"
      >
        <div className="max-w-sm">
          <p className="text-[13px] text-ink">{this.props.what} stopped working.</p>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-faint">
            {this.state.error.message}
          </p>
          <p className="mt-3 text-[11px] text-ink-ghost">
            The rest of the workspace is unaffected. Switching away and back reloads this region.
          </p>
        </div>
      </div>
    );
  }
}
