import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { makeFilename, safePrefix, timestampFolder } from "./names.js";
import { extractPhones, isHeader } from "./phones.js";

function stampName(date, index) {
  const base = timestampFolder(date);
  return index <= 1 ? base : `${base}-${index}`;
}

async function allocateStampDir(parent, date, { create }) {
  if (create) await fs.promises.mkdir(parent, { recursive: true });
  for (let index = 1; index < 1000; index += 1) {
    const name = stampName(date, index);
    const full = path.join(parent, name);
    if (!create) {
      try {
        await fs.promises.access(full);
      } catch (error) {
        if (error.code === "ENOENT") return { name, full };
        throw error;
      }
      continue;
    }
    try {
      await fs.promises.mkdir(full);
      return { name, full };
    } catch (error) {
      if (error.code === "EEXIST") continue;
      throw error;
    }
  }
  const error = new Error("สร้างโฟลเดอร์ตามเวลาไม่สำเร็จ");
  error.status = 500;
  throw error;
}

async function detectEncoding(file) {
  const handle = await fs.promises.open(file, "r");
  try {
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buffer, 0, 4, 0);
    if (bytesRead >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return "utf16le";
    return "utf8";
  } finally {
    await handle.close();
  }
}

export async function processPhoneFiles({
  files,
  outputDir,
  prefix = "num",
  pad = 3,
  start = 1,
  maxPerFile = 40000,
  header = true,
  mobileOnly = true,
  sort = false,
  dryRun = false,
  stamp = true,
  now = new Date(),
}) {
  const seen = new Set();
  const ordered = [];
  const stats = {
    totalLines: 0,
    emptyLines: 0,
    headerLines: 0,
    valid: 0,
    duplicates: 0,
    invalid: 0,
    invalidSamples: [],
    duplicateSamples: [],
    perFile: [],
  };

  for (const file of files) {
    const fileStat = {
      name: path.basename(file),
      path: file,
      totalLines: 0,
      valid: 0,
      invalid: 0,
      uniqueAdded: 0,
    };
    const encoding = await detectEncoding(file);
    const input = fs.createReadStream(file, { encoding });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });

    for await (const line of lines) {
      stats.totalLines += 1;
      fileStat.totalLines += 1;
      const trimmed = line.replace(/^\uFEFF/, "").trim();
      if (!trimmed) {
        stats.emptyLines += 1;
        continue;
      }
      if (isHeader(trimmed)) {
        stats.headerLines += 1;
        continue;
      }

      const phones = extractPhones(trimmed, { mobileOnly });
      if (phones.length === 0) {
        stats.invalid += 1;
        fileStat.invalid += 1;
        if (stats.invalidSamples.length < 8) stats.invalidSamples.push(trimmed.slice(0, 140));
        continue;
      }

      for (const phone of phones) {
        stats.valid += 1;
        fileStat.valid += 1;
        if (seen.has(phone)) {
          stats.duplicates += 1;
          if (
            stats.duplicateSamples.length < 8 &&
            !stats.duplicateSamples.includes(phone)
          ) {
            stats.duplicateSamples.push(phone);
          }
          continue;
        }
        seen.add(phone);
        ordered.push(phone);
        fileStat.uniqueAdded += 1;
      }
    }

    stats.perFile.push(fileStat);
  }

  if (sort) ordered.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  const safe = safePrefix(prefix);
  const resolvedOutput = path.resolve(outputDir);
  const batch = stamp ? await allocateStampDir(resolvedOutput, now, { create: !dryRun && ordered.length > 0 }) : null;
  const destination = batch?.full || resolvedOutput;
  const planned = [];
  for (let offset = 0, index = start; offset < ordered.length; offset += maxPerFile, index += 1) {
    const slice = ordered.slice(offset, offset + maxPerFile);
    const name = makeFilename(safe, index, pad);
    planned.push({
      name,
      path: path.resolve(destination, name),
      count: slice.length,
      numbers: slice,
    });
  }

  const inputSet = new Set(files.map((file) => path.resolve(file)));
  for (const file of planned) {
    if (inputSet.has(file.path)) {
      const error = new Error(
        `ชื่อไฟล์ผลลัพธ์ชนกับไฟล์ต้นทาง: ${file.name} — เปลี่ยนชื่อหรือโฟลเดอร์ผลลัพธ์`,
      );
      error.status = 400;
      throw error;
    }
  }

  if (!dryRun && ordered.length > 0) {
    if (!batch) await fs.promises.mkdir(destination, { recursive: true });
    for (const file of planned) {
      const lines = [];
      if (header) lines.push("Phone Number");
      lines.push(...file.numbers);
      await fs.promises.writeFile(file.path, `${lines.join("\n")}\n`, "utf8");
    }
  }

  return {
    totalLines: stats.totalLines,
    emptyLines: stats.emptyLines,
    headerLines: stats.headerLines,
    valid: stats.valid,
    unique: ordered.length,
    duplicates: stats.duplicates,
    invalid: stats.invalid,
    invalidSamples: stats.invalidSamples,
    duplicateSamples: stats.duplicateSamples,
    perFile: stats.perFile,
    sample: ordered.slice(0, 8),
    files: planned.map(({ name, path: filePath, count }) => ({
      name,
      path: filePath,
      count,
    })),
    outputDir: destination,
    batchDir: batch?.name || "",
    prefix: safe,
    dryRun: Boolean(dryRun),
    message: ordered.length ? "" : "ไม่พบเบอร์โทรที่ใช้ได้ในไฟล์ที่เลือก",
  };
}
