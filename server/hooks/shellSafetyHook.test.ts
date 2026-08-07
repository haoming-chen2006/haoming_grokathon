import { describe, expect, test } from "bun:test";
import { decide, extractCommand } from "./shellSafetyHook";

describe("PreToolUse shell safety hook", () => {
  test("allows a routine command", () => {
    expect(decide({ toolName: "run_terminal_command", toolInput: { command: "bun test" } })).toEqual({
      decision: "allow",
    });
  });

  test("denies destructive commands with a reason", () => {
    for (const command of ["rm -rf build", "git push --force origin main", "sudo rm x", "git branch -D main"]) {
      const d = decide({ toolName: "run_terminal_command", toolInput: { command } });
      expect(d.decision).toBe("deny");
      expect(d.reason).toContain("explicit human approval");
    }
  });

  test("ignores non-shell tools", () => {
    expect(decide({ toolName: "read_file", toolInput: { path: "a.ts" } }).decision).toBe("allow");
  });

  test("a shell call with no readable command is denied, not waved through", () => {
    // Failing open here would defeat the entire policy.
    expect(decide({ toolName: "run_terminal_command", toolInput: {} }).decision).toBe("deny");
  });

  test("extractCommand handles the field-name variants", () => {
    expect(extractCommand({ command: "a" })).toBe("a");
    expect(extractCommand({ cmd: "b" })).toBe("b");
    expect(extractCommand({ shell_command: "c" })).toBe("c");
    expect(extractCommand({})).toBeNull();
  });

  test("tool-name matching is case-insensitive", () => {
    expect(decide({ toolName: "Bash", toolInput: { command: "rm -rf /" } }).decision).toBe("deny");
  });
});
