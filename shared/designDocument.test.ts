import { describe, expect, test } from "bun:test";
import { parseRequirements, firstHeading } from "./designDocument";

describe("reading requirements from a design document", () => {
  test("all three list forms are recognised", () => {
    expect(parseRequirements(`
- AUTH-01: Login returns a token
* AUTH-02 — Sessions rotate hourly
- AUTH-03 - Account deletion is irreversible
`)).toEqual([
      { id: "AUTH-01", description: "Login returns a token" },
      { id: "AUTH-02", description: "Sessions rotate hourly" },
      { id: "AUTH-03", description: "Account deletion is irreversible" },
    ]);
  });

  test("ordinary prose bullets are not requirements", () => {
    // A loose pattern fills the project with phantom requirements, which is worse than none.
    expect(parseRequirements(`
- Follow existing repository patterns.
- No new dependencies.
* Use the shared logger - it is already configured.
- lowercase-01: not a requirement id
`)).toEqual([]);
  });

  test("a duplicated id is imported once", () => {
    const found = parseRequirements("- A-1: first\n- A-1: mentioned again later\n");
    expect(found).toHaveLength(1);
    expect(found[0].description).toBe("first");
  });

  test("indentation and surrounding sections do not matter", () => {
    expect(parseRequirements(`
## Requirements
  - GREET-01: greet(name) returns a greeting

### Out of scope
  * GREET-99: internationalisation
`).map((r) => r.id)).toEqual(["GREET-01", "GREET-99"]);
  });

  test("an empty or absent document yields nothing rather than throwing", () => {
    expect(parseRequirements("")).toEqual([]);
    expect(parseRequirements(undefined)).toEqual([]);
  });

  test("the first level-one heading becomes the goal", () => {
    expect(firstHeading("# Greeting Service\n\n## Requirements\n")).toBe("Greeting Service");
    expect(firstHeading("## Only a subheading\n")).toBeUndefined();
  });
});
