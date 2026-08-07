/**
 * Test helpers. Imported only by test files, never by the running application.
 *
 * `waitFor` exists to remove fixed sleeps. Several tests stopped an agent process and then slept a
 * flat 1000–1500ms before asserting the process had exited. That is a guess about scheduling: on a
 * loaded machine the wait is too short and the test fails for reasons unrelated to the code, and on
 * an idle one it wastes the full interval every run. A test that passes on re-run is a defect in
 * the test, not a pass.
 */

/**
 * Poll until `condition` holds, or throw once `timeoutMs` has elapsed.
 *
 * The failure names what was being waited for, because "expected true, got false" several frames
 * later tells you nothing about which wait expired.
 */
export async function waitFor(
  what: string,
  condition: () => boolean | Promise<boolean>,
  { timeoutMs = 15_000, intervalMs = 25 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await condition()) return;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${what}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
