import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { processPhoneFiles } from "./lib/process.js";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(APP_DIR, "..");
const PUBLIC_DIR = path.join(APP_DIR, "public");
const SAMPLE_DIR = path.join(APP_DIR, "sample-project");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

const downloads = new Map();

function allowedRoots() {
  const candidates = [os.homedir(), "/Applications/MAMP/htdocs", "/Volumes", os.tmpdir()];
  const roots = [];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) roots.push(fs.realpathSync(candidate));
    } catch {
      // Ignore roots that disappear while the server is running.
    }
  }
  return [...new Set(roots)];
}

function blockedRoots() {
  const home = os.homedir();
  return [
    path.join(home, ".ssh"),
    path.join(home, ".aws"),
    path.join(home, ".gnupg"),
    path.join(home, "Library", "Keychains"),
  ]
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => fs.realpathSync(candidate));
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function isBlocked(realPath) {
  return blockedRoots().some((root) => isInside(root, realPath));
}

function isAllowed(realPath) {
  return !isBlocked(realPath) && allowedRoots().some((root) => isInside(root, realPath));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function existingRealPath(target) {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) return null;
  return fs.realpathSync(resolved);
}

function assertAllowed(target) {
  const resolved = path.resolve(target);
  let cursor = resolved;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  let real;
  try {
    real = fs.realpathSync(cursor);
  } catch {
    throw httpError(404, "ไม่พบไฟล์หรือโฟลเดอร์");
  }
  if (!isAllowed(real)) throw httpError(403, "โฟลเดอร์นี้อยู่นอกพื้นที่ที่เปิดให้ใช้บนเครื่องนี้");
  if (cursor !== resolved && isBlocked(path.resolve(resolved))) {
    throw httpError(403, "โฟลเดอร์นี้ถูกปิดไว้");
  }
  return { resolved, existing: cursor === resolved ? real : null };
}

function displayRoot(root) {
  try {
    if (root === fs.realpathSync(os.homedir())) return "หน้าแรก";
  } catch {
    // Fall through to the folder name.
  }
  return path.basename(root) || root;
}

function crumbsFor(realPath) {
  const bases = allowedRoots().sort((a, b) => b.length - a.length);
  const base = bases.find((root) => isInside(root, realPath)) || realPath;
  const relative = path.relative(base, realPath);
  const parts = relative ? relative.split(path.sep).filter(Boolean) : [];
  const crumbs = [{ name: displayRoot(base), path: base }];
  let current = base;
  for (const part of parts) {
    current = path.join(current, part);
    crumbs.push({ name: part, path: current });
  }
  return crumbs;
}

async function browse(target) {
  const { existing } = assertAllowed(target);
  if (!existing) throw httpError(404, "ไม่พบโฟลเดอร์");
  const stat = await fs.promises.stat(existing);
  if (!stat.isDirectory()) throw httpError(400, "ตำแหน่งนี้ไม่ใช่โฟลเดอร์");

  const entries = await fs.promises.readdir(existing, { withFileTypes: true });
  const dirs = [];
  const files = [];
  let hidden = 0;

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      hidden += 1;
      continue;
    }
    if (entry.name === "node_modules") continue;
    const full = path.join(existing, entry.name);
    let info;
    try {
      info = await fs.promises.stat(full);
      const real = await fs.promises.realpath(full);
      if (!isAllowed(real)) continue;
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      dirs.push({ name: entry.name, path: full });
    } else if (info.isFile() && path.extname(entry.name).toLowerCase() === ".txt") {
      files.push({ name: entry.name, path: full, size: info.size });
    }
  }

  const collator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });
  dirs.sort((a, b) => collator.compare(a.name, b.name));
  files.sort((a, b) => collator.compare(a.name, b.name));

  const truncated = dirs.length + files.length > 1500;
  const visibleDirs = truncated ? dirs.slice(0, 800) : dirs;
  const visibleFiles = truncated ? files.slice(0, 700) : files;
  const parentPath = path.dirname(existing);
  let parent = null;
  if (parentPath !== existing) {
    try {
      const parentReal = fs.realpathSync(parentPath);
      if (isAllowed(parentReal)) parent = parentReal;
    } catch {
      parent = null;
    }
  }

  return {
    path: existing,
    parent,
    crumbs: crumbsFor(existing),
    dirs: visibleDirs,
    files: visibleFiles,
    truncated,
    hidden,
    txtCount: files.length,
    totalTxtBytes: files.reduce((sum, file) => sum + file.size, 0),
  };
}

function quickRoots() {
  const home = os.homedir();
  const items = [
    ["ไฟล์ตัวอย่าง", SAMPLE_DIR],
    ["โปรเจกต์ phone", WORKSPACE],
    ["เดสก์ท็อป", path.join(home, "Desktop")],
    ["เอกสาร", path.join(home, "Documents")],
    ["ดาวน์โหลด", path.join(home, "Downloads")],
    ["หน้าแรก", home],
  ];
  return items
    .filter(([, candidate]) => fs.existsSync(candidate))
    .map(([label, candidate]) => ({ label, path: fs.realpathSync(candidate) }));
}

function rememberDownload(filePath) {
  const token = crypto.randomBytes(18).toString("hex");
  downloads.set(token, filePath);
  while (downloads.size > 400) {
    const oldest = downloads.keys().next().value;
    downloads.delete(oldest);
  }
  return token;
}

function readInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
}

function validateJob(body) {
  if (!body || !Array.isArray(body.files) || body.files.length === 0) {
    throw httpError(400, "ยังไม่ได้เลือกไฟล์ .txt");
  }
  if (body.files.length > 500) throw httpError(400, "เลือกได้ไม่เกิน 500 ไฟล์ต่อครั้ง");

  const files = [];
  const seen = new Set();
  for (const entry of body.files) {
    if (typeof entry !== "string") throw httpError(400, "รายการไฟล์ไม่ถูกต้อง");
    const resolved = path.resolve(entry);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (path.extname(resolved).toLowerCase() !== ".txt") {
      throw httpError(400, "รองรับเฉพาะไฟล์ .txt");
    }
    const real = existingRealPath(resolved);
    if (!real) throw httpError(404, `ไม่พบไฟล์ ${path.basename(resolved)}`);
    if (!isAllowed(real)) throw httpError(403, "มีไฟล์อยู่นอกพื้นที่ที่เปิดให้ใช้");
    const stat = fs.statSync(real);
    if (!stat.isFile()) throw httpError(400, `${path.basename(real)} ไม่ใช่ไฟล์`);
    if (stat.size > 200 * 1024 * 1024) {
      throw httpError(400, `${path.basename(real)} ใหญ่เกิน 200MB`);
    }
    files.push(real);
  }

  const maxPerFile = readInteger(body.maxPerFile, 40000);
  if (!Number.isInteger(maxPerFile) || maxPerFile < 1 || maxPerFile > 500000) {
    throw httpError(400, "จำนวนสูงสุดต่อไฟล์ต้องเป็นจำนวนเต็ม 1 ถึง 500000");
  }
  const pad = readInteger(body.pad, 3);
  if (!Number.isInteger(pad) || pad < 0 || pad > 6) {
    throw httpError(400, "จำนวนหลักของเลขลำดับต้องอยู่ระหว่าง 0 ถึง 6");
  }
  const start = readInteger(body.start, 1);
  if (!Number.isInteger(start) || start < 0 || start > 1000000) {
    throw httpError(400, "เลขลำดับเริ่มต้นไม่ถูกต้อง");
  }
  if (typeof body.outputDir !== "string" || !body.outputDir.trim()) {
    throw httpError(400, "ยังไม่ได้กำหนดโฟลเดอร์ผลลัพธ์");
  }

  const output = assertAllowed(body.outputDir);
  if (output.existing && fs.statSync(output.existing).isFile()) {
    throw httpError(400, "ตำแหน่งผลลัพธ์เป็นไฟล์อยู่แล้ว");
  }

  return {
    files,
    outputDir: output.existing || output.resolved,
    prefix: typeof body.prefix === "string" ? body.prefix : "num",
    pad,
    start,
    maxPerFile,
    header: body.header !== false,
    mobileOnly: body.mobileOnly !== false,
    sort: Boolean(body.sort),
    dryRun: Boolean(body.dryRun),
  };
}

function pickFolder(purpose) {
  const prompt =
    purpose === "output"
      ? "เลือกโฟลเดอร์ที่จะบันทึกไฟล์ผลลัพธ์"
      : "เลือกโฟลเดอร์โปรเจกต์ที่มีไฟล์ .txt";
  const script = `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)})`;
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout: 180000 }, (error, stdout, stderr) => {
      const message = `${error?.message || ""} ${stderr || ""}`;
      if (error && /user canceled|-128/i.test(message)) {
        resolve(null);
        return;
      }
      if (error) {
        reject(httpError(500, "เปิดหน้าต่างเลือกโฟลเดอร์ไม่สำเร็จ"));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function sendError(res, error) {
  let status = error.status || 500;
  let message = error.message || "เกิดข้อผิดพลาด";
  if (error.code === "EACCES" || error.code === "EPERM") {
    status = 403;
    message = "ไม่มีสิทธิ์เข้าถึงโฟลเดอร์นี้";
  } else if (error.code === "ENOENT") {
    status = 404;
    message = "ไม่พบไฟล์หรือโฟลเดอร์";
  } else if (status >= 500) {
    console.error(error);
    message = "เกิดข้อผิดพลาดภายในระบบ";
  }
  res.status(status).json({ error: message });
}

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  const origin = req.get("origin");
  if (origin) {
    let url;
    try {
      url = new URL(origin);
    } catch {
      res.status(403).json({ error: "ปฏิเสธคำขอข้ามเว็บ" });
      return;
    }
    const hostOk = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const originPort = url.port || (url.protocol === "https:" ? "443" : "80");
    if (url.protocol !== "http:" || !hostOk || originPort !== String(req.socket.localPort)) {
      res.status(403).json({ error: "ปฏิเสธคำขอข้ามเว็บ" });
      return;
    }
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("x-phone-tool") !== "1") {
    res.status(403).json({ error: "คำขอไม่ถูกต้อง" });
    return;
  }
  next();
});

app.get("/api/health", (_req, res) => {
  if (process.env.VERCEL) {
    res.json({ ok: true, mode: "browser" });
    return;
  }
  res.json({
    ok: true,
    mode: "local",
    defaultPath: fs.realpathSync(SAMPLE_DIR),
    workspace: fs.realpathSync(WORKSPACE),
  });
});

app.get("/api/roots", (_req, res) => {
  res.json({ roots: quickRoots() });
});

app.get("/api/browse", async (req, res) => {
  try {
    const target = req.query.path ? String(req.query.path) : SAMPLE_DIR;
    res.json(await browse(target));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/pick-folder", async (req, res) => {
  try {
    if (process.platform !== "darwin") {
      throw httpError(501, "หน้าต่างเลือกโฟลเดอร์ใช้ได้บน macOS");
    }
    const picked = await pickFolder(req.body?.purpose);
    if (!picked) {
      res.json({ canceled: true });
      return;
    }
    res.json({ canceled: false, ...(await browse(picked)) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/process", async (req, res) => {
  const started = Date.now();
  try {
    const job = validateJob(req.body || {});
    const result = await processPhoneFiles(job);
    if (!job.dryRun) {
      for (const file of result.files) file.token = rememberDownload(file.path);
    }
    console.log(
      `${job.dryRun ? "preview" : "saved"} ${job.files.length} files -> ${result.unique} unique / ${result.files.length} parts`,
    );
    res.json({ ...result, elapsedMs: Date.now() - started });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/reveal", (req, res) => {
  try {
    if (process.platform !== "darwin") throw httpError(501, "เปิด Finder ได้บน macOS");
    if (typeof req.body?.path !== "string") throw httpError(400, "ไม่ได้ระบุตำแหน่ง");
    const { existing } = assertAllowed(req.body.path);
    if (!existing) throw httpError(404, "ไม่พบไฟล์หรือโฟลเดอร์");
    const stat = fs.statSync(existing);
    const args = stat.isDirectory() ? [existing] : ["-R", existing];
    execFile("open", args, (error) => {
      if (error) {
        sendError(res, httpError(500, "เปิด Finder ไม่สำเร็จ"));
        return;
      }
      res.json({ ok: true });
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/download", (req, res) => {
  const token = String(req.query.token || "");
  const filePath = downloads.get(token);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "ไม่พบไฟล์ผลลัพธ์ของงานนี้" });
    return;
  }
  res.download(filePath, path.basename(filePath));
});

app.get("/name-format.js", (_req, res) => {
  res.type("js");
  res.sendFile(path.join(APP_DIR, "lib", "names.js"));
});

app.use("/lib", express.static(path.join(APP_DIR, "lib"), { etag: false, maxAge: 0 }));
app.use(express.static(PUBLIC_DIR, { index: "index.html", etag: false, maxAge: 0 }));

export function start(port = 0) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1");
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

export { app };
export default app;

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (!process.env.VERCEL && entry === import.meta.url) {
  const port = Number(process.env.PORT) || 4173;
  start(port)
    .then((server) => {
      const address = server.address();
      console.log(`คัดเบอร์พร้อมใช้งานที่ http://127.0.0.1:${address.port}`);
    })
    .catch((error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`พอร์ต ${port} ถูกใช้งานอยู่แล้ว`);
      } else {
        console.error(error);
      }
      process.exit(1);
    });
}
