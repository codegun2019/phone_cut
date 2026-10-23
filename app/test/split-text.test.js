import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { zipStore } from "../public/zip.js";
import { splitPhoneTexts } from "../lib/split-text.js";

const sampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../sample-project");

test("splits text in the browser the same way as the local saver", async () => {
  const inputs = [];
  for (const name of ["list-a.txt", "list-b.txt", "list-c.txt"]) {
    inputs.push({ name, text: await fs.readFile(path.join(sampleDir, name), "utf8") });
  }
  const result = splitPhoneTexts(inputs, {
    prefix: "num",
    pad: 3,
    start: 1,
    maxPerFile: 4,
    now: new Date(2026, 9, 23, 19, 33, 5),
  });
  assert.equal(result.unique, 7);
  assert.equal(result.duplicates, 7);
  assert.equal(result.invalid, 4);
  assert.equal(result.batchDir, "23-10-2026_19-33-05");
  assert.equal(result.outputDir, "num_out/23-10-2026_19-33-05");
  assert.equal(
    result.files[0].body,
    ["Phone Number", "0812345678", "0899999999", "0822222222", "0833333333", ""].join("\n"),
  );
  assert.equal(result.files[1].count, 3);
});

test("zip archive contains the split files", () => {
  const archive = zipStore([{ name: "23-10-2026_19-33-05/num_001.txt", text: "Phone Number\n0812345678\n" }]);
  assert.equal(archive[0], 0x50);
  assert.equal(archive[1], 0x4b);
  const text = new TextDecoder().decode(archive);
  assert.match(text, /num_001\.txt/);
  assert.match(text, /0812345678/);
});
