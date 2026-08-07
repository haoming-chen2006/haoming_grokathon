#!/usr/bin/env bun
/**
 * Grok PreToolUse hook: refuse destructive shell commands before they run (V-033, V-047).
 *
 * Agents run with `--always-approve` so unattended work is not blocked on interactive prompts.
 * That removes Grok's own permission gate, so the dangerous-command policy has to live somewhere —
 * this hook is that place. It reuses the same classifier the approval queue uses, so the UI and
 * the agent's tool loop cannot disagree about what counts as destructive.
 *
 * Contract (docs/user-guide/10-hooks.md):
 *   stdin  — JSON with { hookEventName, toolName, toolInput, cwd, … }
 *   stdout — {"decision":"allow"} or {"decision":"deny","reason":"…"}
 */
import { classifyShellCommand } from "../services/approvals";

/** Tool names that carry a shell command, across Grok naming variants. */
const SHELL_TOOLS = new Set(["run_terminal_command", "bash", "shell", "terminal", "run_command"]);

export interface HookInput {
  hookEventName?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

export interface HookDecision {
  decision: "allow" | "deny";
  reason?: string;
}

/** Pull the command string out of a tool input, whatever the field is called. */
export function extractCommand(toolInput: Record<string, unknown> | undefined): string | null {
  if (!toolInput) return null;
  for (const key of ["command", "cmd", "script", "shell_command"]) {
    const value = toolInput[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export function decide(input: HookInput): HookDecision {
  const toolName = (input.toolName ?? "").toLowerCase();
  if (!SHELL_TOOLS.has(toolName)) return { decision: "allow" };

  const command = extractCommand(input.toolInput);
  // A shell tool call whose command we cannot read is refused rather than waved through —
  // failing open here would defeat the whole policy.
  if (!command) {
    return { decision: "deny", reason: "Shell tool call carried no readable command; refusing by default." };
  }

  const verdict = classifyShellCommand(command);
  if (verdict.restricted) {
    return {
      decision: "deny",
      reason:
        `Refused: ${verdict.why}. This command requires explicit human approval in the control room. ` +
        `Command: ${command.slice(0, 200)}`,
    };
  }
  return { decision: "allow" };
}

/** Entry point when executed as a hook. Any failure denies rather than allowing. */
if (import.meta.main) {
  let raw = "";
  try {
    raw = await Bun.stdin.text();
    const parsed = raw.trim() ? (JSON.parse(raw) as HookInput) : {};
    const decision = decide(parsed);
    // Audit trail: every evaluation is recorded, so a refusal can be traced and the hook's
    // participation can be verified rather than inferred.
    if (process.env.OPENUI_HOOK_LOG) {
      try {
        await Bun.write(
          process.env.OPENUI_HOOK_LOG,
          (await Bun.file(process.env.OPENUI_HOOK_LOG).text().catch(() => "")) +
            JSON.stringify({ at: new Date().toISOString(), tool: parsed.toolName, command: extractCommand(parsed.toolInput), decision }) + "\n",
        );
      } catch {}
    }
    process.stdout.write(JSON.stringify(decision));
    // Exit 2 is the documented explicit-deny signal for PreToolUse. The docs also claim a deny in
    // stdout JSON is honored regardless of exit code, but observed behaviour under
    // --always-approve is that it is not — the command ran. Emitting both is what actually blocks.
    if (decision.decision === "deny") process.exit(2);
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        decision: "deny",
        reason: `Safety hook could not evaluate the command: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
    process.exit(2);
  }
}
