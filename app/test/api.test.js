import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { start } from "../server.js";

const sampleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../sample-project");

test("browse, preview, save, and download stay on this machine", async () => {
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/health`).then((response) => response.json());
    assert.equal(health.ok, true);

    const html = await fetch(base).then((response) => response.text());
    assert.match(html, /คัดเบอร์/);
    assert.match(html, /tailwindcss/);

    const listing = await fetch(`${base}/api/browse?path=${encodeURIComponent(sampleDir)}`).then(
      (response) => response.json(),
    );
    assert.deepEqual(
      listing.files.map((file) => file.name),
      ["list-a.txt", "list-b.txt", "list-c.txt"],
    );

    const forbidden = await fetch(`${base}/api/browse?path=${encodeURIComponent("/etc")}`);
    assert.equal(forbidden.status, 403);

    const traversal = await fetch(
      `${base}/api/browse?path=${encodeURIComponent(`${sampleDir}/../../../../../../etc`)}`,
    );
    assert.equal(traversal.status, 403);

    const missingHeader = await fetch(`${base}/api/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(missingHeader.status, 403);

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "phone-api-"));
    const saved = await fetch(`${base}/api/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Phone-Tool": "1",
      },
      body: JSON.stringify({
        files: listing.files.map((file) => file.path),
        outputDir,
        prefix: "num",
        pad: 1,
        start: 1,
        maxPerFile: 4,
        header: true,
        mobileOnly: true,
        dryRun: false,
      }),
    }).then(async (response) => {
      const body = await response.json();
      assert.equal(response.status, 200, body.error);
      return body;
    });

    assert.equal(saved.unique, 7);
    assert.equal(saved.files[0].name, "num_1.txt");
    const downloaded = await fetch(
      `${base}/api/download?token=${encodeURIComponent(saved.files[0].token)}`,
    );
    assert.equal(downloaded.status, 200);
    assert.match(await downloaded.text(), /^Phone Number\n0812345678\n/);
    const missing = await fetch(`${base}/api/download?token=nope`);
    assert.equal(missing.status, 404);

    const badMax = await fetch(`${base}/api/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Phone-Tool": "1" },
      body: JSON.stringify({
        files: [listing.files[0].path],
        outputDir,
        maxPerFile: 0,
      }),
    });
    assert.equal(badMax.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
