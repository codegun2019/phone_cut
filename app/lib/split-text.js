import { makeFilename, safeDirName, safePrefix, timestampFolder } from "./names.js";
import { extractPhones, isHeader } from "./phones.js";

function linesOf(text) {
  return String(text).replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
}

export function splitPhoneTexts(inputs, options = {}) {
  const {
    prefix = "num",
    pad = 3,
    start = 1,
    maxPerFile = 40000,
    header = true,
    mobileOnly = true,
    sort = false,
    now = new Date(),
    folderName = "num_out",
  } = options;

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

  for (const input of inputs) {
    const fileStat = {
      name: input.name,
      totalLines: 0,
      valid: 0,
      invalid: 0,
      uniqueAdded: 0,
    };
    for (const line of linesOf(input.text)) {
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
          if (stats.duplicateSamples.length < 8 && !stats.duplicateSamples.includes(phone)) {
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
  const batchDir = timestampFolder(now);
  const folder = safeDirName(folderName);
  const files = [];
  for (let offset = 0, index = start; offset < ordered.length; offset += maxPerFile, index += 1) {
    const slice = ordered.slice(offset, offset + maxPerFile);
    const lines = [];
    if (header) lines.push("Phone Number");
    lines.push(...slice);
    files.push({
      name: makeFilename(safe, index, pad),
      count: slice.length,
      body: `${lines.join("\n")}\n`,
    });
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
    files,
    outputDir: `${folder}/${batchDir}`,
    batchDir,
    prefix: safe,
    message: ordered.length ? "" : "ไม่พบเบอร์โทรที่ใช้ได้ในไฟล์ที่เลือก",
  };
}
