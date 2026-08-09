/**
 * What a mention becomes by the time an agent reads it.
 *
 * The bug these are against is not a crash. Everything worked: the picker listed the assets, the
 * link inserted, the transcript drew it back, the message sent. The agent received
 * `[@x](asset:asset_…)` — a scheme private to this product and an opaque id — and had nothing that
 * took an asset id. Two uploaded PDFs were mentioned at an agent that could not open either.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AssetStore } from "./assetStore";
import { mentionBlock, resolveMentions, withResolvedMentions } from "./mentionResolution";

const PROJECT = "proj_mentions";

let dataDir: string;
let store: AssetStore;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-mentions-"));
  store = new AssetStore(join(dataDir, "assets"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function upload(title: string, projectId = PROJECT) {
  return store.createAsset({
    projectId,
    type: "document",
    title,
    origin: "uploaded",
    authorId: "user",
  });
}

describe("a mention reaches the agent as something it can open", () => {
  test("the asset is named, with the tool that opens it", () => {
    const asset = upload("Musk_v_Altman_Case_Analysis.pdf");
    const sent = withResolvedMentions(
      `summarise [@${asset.title}](asset:${asset.id})`,
      PROJECT,
      store,
    );

    expect(sent).toContain(asset.id);
    expect(sent).toContain("read_deliverable");
    // The user's own words survive untouched, ahead of anything we add.
    expect(sent.startsWith(`summarise [@${asset.title}](asset:${asset.id})`)).toBe(true);
  });

  test("the added text says it was added, so the agent does not read it as the user's", () => {
    const asset = upload("Brief.md");
    const sent = withResolvedMentions(`read [@Brief](asset:${asset.id})`, PROJECT, store);
    expect(sent).toContain("resolved by the control room");
  });

  test("two mentions of the same asset are resolved once", () => {
    const asset = upload("Brief.md");
    const sent = withResolvedMentions(
      `compare [@a](asset:${asset.id}) with [@a](asset:${asset.id})`,
      PROJECT,
      store,
    );
    expect(sent.split(`- ${asset.id} —`)).toHaveLength(2);
  });

  test("both of two different assets are resolved", () => {
    const one = upload("Musk_v_Altman_Case_Analysis.pdf");
    const two = upload("Musk_v_Altman_Record_Appendix.pdf");
    const sent = withResolvedMentions(
      `cross-reference [@one](asset:${one.id}) against [@two](asset:${two.id})`,
      PROJECT,
      store,
    );
    expect(sent).toContain(one.id);
    expect(sent).toContain(two.id);
  });
});

describe("a message with nothing in it is left exactly as it was", () => {
  test("plain prose is unchanged", () => {
    const text = "run the tests and tell me what broke";
    expect(withResolvedMentions(text, PROJECT, store)).toBe(text);
  });

  test("an ordinary markdown link is not a mention", () => {
    const text = "see [the docs](https://example.com/asset:1)";
    expect(withResolvedMentions(text, PROJECT, store)).toBe(text);
  });

  test("a shell command full of brackets is not touched", () => {
    const text = "run `rg '\\[(asset|doc):' -n` and paste the output";
    expect(withResolvedMentions(text, PROJECT, store)).toBe(text);
  });
});

describe("an id that names nothing this project can see", () => {
  test("a deleted asset is reported, not silently dropped", () => {
    const sent = withResolvedMentions("open [@gone](asset:asset_gone)", PROJECT, store);
    expect(sent).toContain("asset_gone");
    expect(sent).toContain("not found");
    expect(sent).toContain("Do not invent");
  });

  test("another project's asset is indistinguishable from a missing one", () => {
    const theirs = upload("Theirs.md", "proj_someone_else");
    const [resolved] = resolveMentions(`[@t](asset:${theirs.id})`, PROJECT, store);
    expect(resolved!.asset).toBeUndefined();

    // Same section, same wording — an agent cannot learn that the id exists somewhere.
    const mine = mentionBlock(resolveMentions(`[@t](asset:${theirs.id})`, PROJECT, store));
    const absent = mentionBlock(resolveMentions("[@t](asset:asset_nope)", PROJECT, store));
    expect(mine.replace(theirs.id, "ID")).toBe(absent.replace("asset_nope", "ID"));
  });

  test("the title is never taken from the label the user typed", () => {
    // The label is prose. A mention that resolved to nothing must not come back describing an
    // asset by the name the user happened to write for it.
    const sent = withResolvedMentions("open [@Q3 Financials](asset:asset_gone)", PROJECT, store);
    expect(sent).not.toContain('"Q3 Financials" (document');
  });
});

describe("design documents", () => {
  test("are listed by id and not pointed at a tool that answers about a different record", () => {
    const sent = withResolvedMentions("check [@plan](doc:doc_abc123)", PROJECT, store);
    expect(sent).toContain("doc_abc123");
    expect(sent).not.toContain("get_technical_design");
  });
});

describe("what the block says about a real deliverable", () => {
  test("the type and the file mimes are stated, so the agent knows what it is opening", () => {
    const asset = upload("Musk_v_Altman_Case_Analysis.pdf");
    store.attachFile(
      asset.id,
      {
        id: "file_x",
        assetId: asset.id,
        role: "source",
        path: "files/file_x.pdf",
        bytes: 41646,
        sha256: "0".repeat(64),
        mime: "application/pdf",
        createdAt: new Date().toISOString(),
      },
      { authorId: "user" },
    );

    const sent = withResolvedMentions(`[@a](asset:${asset.id})`, PROJECT, store);
    expect(sent).toContain("document");
    expect(sent).toContain("application/pdf");
    expect(sent).toContain("1 file");
  });

  test("a deliverable with no files on it says so rather than claiming one", () => {
    const asset = upload("Empty");
    const sent = withResolvedMentions(`[@a](asset:${asset.id})`, PROJECT, store);
    expect(sent).toContain("no files on it yet");
  });
});
