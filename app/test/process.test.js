import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { processPhoneFiles } from "../lib/process.js";

const sampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../sample-project");
const sampleFiles = ["list-a.txt", "list-b.txt", "list-c.txt"].map((name) =>
  path.join(sampleDir, name),
);

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "phone-clean-"));
}

const savedAt = new Date(2026, 9, 23, 19, 33, 5);

test("deduplicates, drops invalid rows, and splits at the chosen max", async () => {
  const outputDir = path.join(await tempDir(), "num_out");
  await fs.mkdir(outputDir);
  await fs.writeFile(path.join(outputDir, "num_009.txt"), "old\n");
  await fs.writeFile(path.join(outputDir, "notes.txt"), "keep\n");

  const result = await processPhoneFiles({
    files: sampleFiles,
    outputDir,
    prefix: "num",
    pad: 3,
    start: 1,
    maxPerFile: 4,
    header: true,
    mobileOnly: true,
    dryRun: false,
    now: savedAt,
  });

  assert.equal(result.unique, 7);
  assert.equal(result.duplicates, 7);
  assert.equal(result.invalid, 4);
  assert.equal(result.headerLines, 1);
  assert.equal(result.emptyLines, 1);
  assert.deepEqual(
    result.files.map((file) => file.name),
    ["num_001.txt", "num_002.txt"],
  );
  assert.deepEqual(
    result.files.map((file) => file.count),
    [4, 3],
  );

  assert.equal(result.batchDir, "23-10-2026_19-33-05");
  const first = await fs.readFile(path.join(outputDir, result.batchDir, "num_001.txt"), "utf8");
  const second = await fs.readFile(path.join(outputDir, result.batchDir, "num_002.txt"), "utf8");
  assert.equal(
    first,
    ["Phone Number", "0812345678", "0899999999", "0822222222", "0833333333", ""].join("\n"),
  );
  assert.equal(
    second,
    ["Phone Number", "0844444444", "0911111111", "0661234567", ""].join("\n"),
  );
  assert.equal(await fs.readFile(path.join(outputDir, "num_009.txt"), "utf8"), "old\n");
  assert.equal(await fs.readFile(path.join(outputDir, "notes.txt"), "utf8"), "keep\n");

  const again = await processPhoneFiles({
    files: sampleFiles,
    outputDir,
    prefix: "num",
    pad: 3,
    maxPerFile: 4,
    now: savedAt,
  });
  assert.equal(again.batchDir, "23-10-2026_19-33-05-2");
  assert.equal(await fs.readFile(path.join(outputDir, result.batchDir, "num_001.txt"), "utf8"), first);
});

test("dry run plans the files and does not create the folder", async () => {
  const outputDir = path.join(await tempDir(), "missing");
  const result = await processPhoneFiles({
    files: sampleFiles,
    outputDir,
    prefix: "batch",
    pad: 1,
    start: 5,
    maxPerFile: 3,
    dryRun: true,
    now: savedAt,
  });
  assert.equal(result.dryRun, true);
  assert.deepEqual(
    result.files.map((file) => file.name),
    ["batch_5.txt", "batch_6.txt", "batch_7.txt"],
  );
  assert.equal(result.batchDir, "23-10-2026_19-33-05");
  await assert.rejects(fs.access(outputDir));
});

test("can sort and keep non-mobile 10-digit numbers when asked", async () => {
  const dir = await tempDir();
  const source = path.join(dir, "raw.txt");
  await fs.writeFile(source, "0899999999\n0212345678\n0811111111\n", "utf8");
  const outputDir = path.join(dir, "out");
  const result = await processPhoneFiles({
    files: [source],
    outputDir,
    prefix: "num",
    pad: 1,
    maxPerFile: 10,
    header: false,
    mobileOnly: false,
    sort: true,
  });
  assert.deepEqual(result.sample, ["0212345678", "0811111111", "0899999999"]);
  const text = await fs.readFile(result.files[0].path, "utf8");
  assert.equal(text.startsWith("0212345678\n"), true);
});

test("refuses to overwrite an input file with the same name", async () => {
  const dir = await tempDir();
  const source = path.join(dir, "num_1.txt");
  await fs.writeFile(source, "0812345678\n", "utf8");
  await assert.rejects(
    processPhoneFiles({
      files: [source],
      outputDir: dir,
      prefix: "num",
      pad: 0,
      start: 1,
      maxPerFile: 10,
      stamp: false,
    }),
    /ชนกับไฟล์ต้นทาง/,
  );
  assert.equal(await fs.readFile(source, "utf8"), "0812345678\n");
});
