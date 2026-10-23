import { makeFilename, safeDirName, safePrefix, timestampFolder } from "/name-format.js";

const state = {
  browse: null,
  projectPath: "",
  outputPath: "",
  running: false,
};

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatInt(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function joinPath(dir, name) {
  return `${String(dir).replace(/\/+$/, "")}/${name}`;
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["X-Phone-Tool"] = "1";
  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new Error("ติดต่อโปรแกรมบนเครื่องนี้ไม่สำเร็จ");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "คำขอไม่สำเร็จ");
  return data;
}

function showError(message) {
  const box = $("error");
  box.textContent = message;
  box.classList.remove("hidden");
}

function clearError() {
  $("error").classList.add("hidden");
}

function setStep(step) {
  for (const item of document.querySelectorAll("[data-step]")) {
    const active = Number(item.dataset.step) === step;
    item.className = active
      ? "rounded-full bg-ink px-3 py-1.5 text-white"
      : "rounded-full bg-white px-3 py-1.5 text-stone-500 ring-1 ring-line";
  }
}

function selectedBoxes() {
  return [...document.querySelectorAll(".file-check")];
}

function selectedFiles() {
  return selectedBoxes()
    .filter((box) => box.checked)
    .map((box) => box.dataset.path);
}

function selectedBytes() {
  return selectedBoxes()
    .filter((box) => box.checked)
    .reduce((sum, box) => sum + Number(box.dataset.size || 0), 0);
}

function syncSelection() {
  const boxes = selectedBoxes();
  const checked = boxes.filter((box) => box.checked).length;
  const selectAll = $("select-all");
  selectAll.disabled = boxes.length === 0;
  selectAll.checked = boxes.length > 0 && checked === boxes.length;
  selectAll.indeterminate = checked > 0 && checked < boxes.length;
  $("selected-summary").textContent = boxes.length
    ? `เลือก ${formatInt(checked)} จาก ${formatInt(boxes.length)} ไฟล์ · ${formatBytes(selectedBytes())}`
    : "โฟลเดอร์นี้ยังไม่มีไฟล์ .txt";
  const idle = checked === 0 || state.running;
  $("preview-btn").disabled = idle;
  $("save-btn").disabled = idle;
  $("action-hint").textContent = checked
    ? `พร้อมคัด ${formatInt(checked)} ไฟล์`
    : "เลือกไฟล์ก่อน แล้วค่อยดูก่อนหรือบันทึก";
}

function currentOutputDir() {
  if (state.outputPath) return state.outputPath;
  if (!state.projectPath) return "";
  return joinPath(state.projectPath, safeDirName($("output-name").value));
}

function updateOutputLabel() {
  const target = currentOutputDir();
  const stamp = timestampFolder(new Date());
  $("output-path").textContent = target
    ? `บันทึกที่ ${target}/${stamp}/ เวลาจริงคือตอนกดบันทึก`
    : "เลือกโปรเจกต์ก่อน แล้วระบบจะสร้างโฟลเดอร์ num_out ตามวัน-เดือน-ปี_เวลา";
  const sameFolder =
    state.projectPath &&
    target.replace(/\/+$/, "") === state.projectPath.replace(/\/+$/, "");
  $("output-warning").classList.toggle("hidden", !sameFolder);
  $("output-name-wrap").classList.toggle("hidden", Boolean(state.outputPath));
}

function updateNamePreview() {
  const prefix = safePrefix($("prefix").value);
  const start = Number($("start").value);
  const pad = Number($("pad").value);
  const first = Number.isInteger(start) ? start : 1;
  const box = $("name-preview");
  box.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    box.append(
      el(
        "span",
        "rounded-full bg-white px-3 py-1 text-ink ring-1 ring-line",
        makeFilename(prefix, first + index, pad),
      ),
    );
  }
  box.append(el("span", "self-center text-stone-400", "…"));
}

function syncPresets() {
  const current = $("max").value;
  for (const button of document.querySelectorAll("[data-max]")) {
    const active = button.dataset.max === current;
    button.className = active
      ? "rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white"
      : "rounded-full bg-white px-3 py-1.5 text-xs font-medium ring-1 ring-line";
  }
}

function renderRoots(roots) {
  const box = $("quick-roots");
  box.replaceChildren();
  for (const root of roots) {
    const button = el(
      "button",
      "rounded-full bg-white/10 px-3 py-1.5 text-xs text-stone-100 hover:bg-white/15",
      root.label,
    );
    button.type = "button";
    button.addEventListener("click", () => loadPath(root.path));
    box.append(button);
  }
}

function renderBrowser(data) {
  state.browse = data;
  const input = $("path-input");
  if (document.activeElement !== input) input.value = data.path;
  $("browse-meta").textContent = data.truncated
    ? `แสดงบางส่วน · ไฟล์ .txt ${formatInt(data.txtCount)}`
    : `ไฟล์ .txt ในโฟลเดอร์นี้ ${formatInt(data.txtCount)} · ${formatBytes(data.totalTxtBytes)}`;
  $("up-btn").disabled = !data.parent;
  $("up-btn").classList.toggle("opacity-30", !data.parent);

  const crumbs = $("crumbs");
  crumbs.replaceChildren();
  for (const crumb of data.crumbs) {
    const button = el(
      "button",
      "max-w-40 truncate rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-stone-200 hover:bg-white/15",
      crumb.name,
    );
    button.type = "button";
    button.title = crumb.path;
    button.addEventListener("click", () => loadPath(crumb.path));
    crumbs.append(button);
  }

  const list = $("dir-list");
  list.replaceChildren();
  if (!data.dirs.length) {
    list.append(el("p", "px-2 py-4 text-sm text-stone-500", "ไม่มีโฟลเดอร์ย่อย"));
  }
  for (const dir of data.dirs) {
    const button = el(
      "button",
      "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-stone-100 hover:bg-white/10",
    );
    button.type = "button";
    button.append(el("span", "text-clay", "▸"), el("span", "truncate", dir.name));
    button.addEventListener("click", () => loadPath(dir.path));
    list.append(button);
  }

  const using = state.projectPath && state.projectPath === data.path;
  $("use-folder").textContent = using ? "โหลดไฟล์ในโฟลเดอร์นี้อีกครั้ง" : "ใช้โฟลเดอร์นี้เป็นโปรเจกต์";
}

function renderFiles(files, checked) {
  const list = $("file-list");
  list.replaceChildren();
  if (!files.length) {
    const empty = el("p", "px-4 py-8 text-sm text-stone-500", "ไม่พบไฟล์ .txt ในโฟลเดอร์นี้");
    list.append(empty);
    syncSelection();
    return;
  }
  for (const file of files) {
    const label = el("label", "flex cursor-pointer items-center gap-3 bg-white px-3 py-3 hover:bg-paper");
    const box = el("input", "file-check h-4 w-4 accent-clay");
    box.type = "checkbox";
    box.checked = checked;
    box.dataset.path = file.path;
    box.dataset.size = String(file.size);
    box.addEventListener("change", syncSelection);
    const name = el("span", "min-w-0 flex-1 truncate text-sm font-medium", file.name);
    const size = el("span", "shrink-0 font-mono text-xs text-stone-500", formatBytes(file.size));
    label.append(box, name, size);
    list.append(label);
  }
  syncSelection();
}

function clearResult() {
  const result = $("result");
  result.classList.add("hidden");
  result.replaceChildren();
}

function applyProject(data) {
  state.projectPath = data.path;
  const folderName = data.crumbs.at(-1)?.name || data.path;
  $("project-title").textContent = folderName;
  $("project-path").textContent = data.path;
  const large = data.files.length > 30 || data.totalTxtBytes > 20 * 1024 * 1024;
  $("size-warning").classList.toggle("hidden", !large);
  renderFiles(data.files, !large);
  clearResult();
  setStep(data.files.length ? 2 : 1);
  updateOutputLabel();
  renderBrowser(data);
}

async function loadPath(target) {
  clearError();
  $("browse-meta").textContent = "กำลังเปิดโฟลเดอร์...";
  try {
    const data = await api(`/api/browse?path=${encodeURIComponent(target)}`);
    renderBrowser(data);
  } catch (error) {
    showError(error.message);
    $("browse-meta").textContent = "เปิดโฟลเดอร์ไม่สำเร็จ";
  }
}

function readSettings() {
  const maxPerFile = Number($("max").value);
  const pad = Number($("pad").value);
  const start = Number($("start").value);
  if (!Number.isInteger(maxPerFile) || maxPerFile < 1 || maxPerFile > 500000) {
    throw new Error("จำนวนสูงสุดต่อไฟล์ต้องอยู่ระหว่าง 1 ถึง 500,000");
  }
  if (!Number.isInteger(pad) || pad < 0 || pad > 6) throw new Error("จำนวนหลักไม่ถูกต้อง");
  if (!Number.isInteger(start) || start < 0 || start > 1000000) {
    throw new Error("เลขลำดับเริ่มต้นไม่ถูกต้อง");
  }
  const outputDir = currentOutputDir();
  if (!outputDir) throw new Error("เลือกโปรเจกต์ก่อนบันทึก");
  return {
    prefix: $("prefix").value,
    pad,
    start,
    maxPerFile,
    header: $("header-toggle").checked,
    mobileOnly: $("mobile-toggle").checked,
    sort: $("sort-toggle").checked,
    outputDir,
  };
}

function statCard(label, value, tone) {
  const card = el("div", `rounded-2xl px-4 py-3 ${tone}`);
  card.append(el("p", "text-xs text-stone-500", label), el("p", "mt-1 text-2xl font-semibold tabular-nums", formatInt(value)));
  return card;
}

function renderResult(data) {
  const result = $("result");
  result.classList.remove("hidden");
  result.replaceChildren();

  const saved = !data.dryRun && data.files.length > 0;
  result.append(
    el(
      "p",
      "text-xs font-semibold uppercase tracking-[0.16em] text-pine",
      saved ? "บันทึกแล้ว" : "ตัวอย่าง ยังไม่เขียนไฟล์",
    ),
  );
  const title = data.message
    ? data.message
    : `ได้เบอร์ไม่ซ้ำ ${formatInt(data.unique)} เบอร์ จาก ${formatInt(data.perFile.length)} ไฟล์ แบ่งเป็น ${formatInt(data.files.length)} ไฟล์`;
  result.append(el("h2", "mt-1 text-2xl font-semibold tracking-tight", title));
  result.append(
    el(
      "p",
      "mt-1 text-sm text-stone-500",
      `ใช้เวลา ${(data.elapsedMs / 1000).toFixed(1)} วินาที · ชื่อชุด ${data.prefix}_n${data.batchDir ? ` · โฟลเดอร์ ${data.batchDir}` : ""}`,
    ),
  );

  const stats = el("div", "mt-4 grid gap-3 sm:grid-cols-4");
  stats.append(
    statCard("เบอร์ไม่ซ้ำ", data.unique, "bg-moss"),
    statCard("ตัดเบอร์ซ้ำ", data.duplicates, "bg-paper"),
    statCard("บรรทัดที่ไม่ใช่เบอร์", data.invalid, "bg-paper"),
    statCard("ไฟล์ผลลัพธ์", data.files.length, "bg-paper"),
  );
  result.append(stats);

  if (data.files.length) {
    const heading = el("div", "mt-5 flex items-center justify-between gap-3");
    heading.append(el("h3", "font-semibold", saved ? "ไฟล์ที่เขียน" : "ไฟล์ที่จะถูกสร้าง"));
    if (saved) {
      const reveal = el("button", "rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white", "แสดงใน Finder");
      reveal.type = "button";
      reveal.addEventListener("click", () => revealPath(data.outputDir));
      heading.append(reveal);
    }
    result.append(heading);
    const files = el("div", "mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line");
    for (const file of data.files) {
      const row = el("div", "flex items-center gap-3 bg-white px-3 py-3");
      row.append(el("span", "min-w-0 flex-1 truncate font-mono text-sm", file.name));
      row.append(el("span", "text-sm tabular-nums text-stone-500", `${formatInt(file.count)} เบอร์`));
      if (file.token) {
        const link = el("a", "text-sm font-medium text-pine underline-offset-2 hover:underline", "ดาวน์โหลด");
        link.href = `/api/download?token=${encodeURIComponent(file.token)}`;
        link.download = file.name;
        row.append(link);
      }
      files.append(row);
    }
    result.append(files);
    result.append(el("p", "mt-2 break-all font-mono text-xs text-stone-500", data.outputDir));
  }

  if (data.sample?.length) {
    result.append(el("h3", "mt-5 font-semibold", "ตัวอย่างเบอร์ที่เก็บ"));
    const samples = el("div", "mt-2 flex flex-wrap gap-2");
    for (const phone of data.sample) {
      samples.append(el("span", "rounded-full bg-paper px-3 py-1 font-mono text-sm", phone));
    }
    result.append(samples);
  }

  if (data.duplicateSamples?.length) {
    result.append(el("h3", "mt-5 font-semibold", "ตัวอย่างเบอร์ที่ซ้ำ"));
    const samples = el("div", "mt-2 flex flex-wrap gap-2");
    for (const phone of data.duplicateSamples) {
      samples.append(el("span", "rounded-full bg-[#fde8e1] px-3 py-1 font-mono text-sm text-claydark", phone));
    }
    result.append(samples);
  }

  if (data.invalidSamples?.length) {
    result.append(el("h3", "mt-5 font-semibold", "ตัวอย่างบรรทัดที่ข้าม"));
    const list = el("ul", "mt-2 space-y-1 text-sm text-stone-600");
    for (const line of data.invalidSamples) list.append(el("li", "truncate font-mono", line));
    result.append(list);
  }

  if (data.perFile?.length) {
    const details = el("details", "mt-5 rounded-2xl bg-paper px-4 py-3");
    details.append(el("summary", "cursor-pointer text-sm font-medium", "แยกตามไฟล์ต้นทาง"));
    const list = el("div", "mt-3 space-y-2");
    for (const file of data.perFile) {
      list.append(
        el(
          "p",
          "text-sm text-stone-600",
          `${file.name} · อ่าน ${formatInt(file.valid)} เบอร์ · ใหม่ ${formatInt(file.uniqueAdded)} · ข้าม ${formatInt(file.invalid)} บรรทัด`,
        ),
      );
    }
    details.append(list);
    result.append(details);
  }

  setStep(saved ? 3 : 2);
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function revealPath(target) {
  try {
    await api("/api/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: target }),
    });
  } catch (error) {
    showError(error.message);
  }
}

async function run(dryRun) {
  if (state.running) return;
  clearError();
  const files = selectedFiles();
  if (!files.length) {
    showError("ยังไม่ได้เลือกไฟล์ .txt");
    return;
  }
  let settings;
  try {
    settings = readSettings();
  } catch (error) {
    showError(error.message);
    return;
  }
  const bytes = selectedBytes();
  if (!dryRun && bytes > 50 * 1024 * 1024) {
    const ok = window.confirm(
      `ไฟล์ที่เลือกมีขนาดรวม ${formatBytes(bytes)} งานนี้อาจใช้เวลาสักครู่และจะเขียนไฟล์ลงดิสก์ ดำเนินการต่อหรือไม่`,
    );
    if (!ok) return;
  }

  state.running = true;
  syncSelection();
  const preview = $("preview-btn");
  const save = $("save-btn");
  const previousPreview = preview.textContent;
  const previousSave = save.textContent;
  const active = dryRun ? preview : save;
  active.textContent = "กำลังคัดเบอร์...";

  try {
    const data = await api("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, files, dryRun }),
    });
    renderResult(data);
  } catch (error) {
    showError(error.message);
  } finally {
    state.running = false;
    preview.textContent = previousPreview;
    save.textContent = previousSave;
    syncSelection();
  }
}

async function pickFromFinder(purpose) {
  clearError();
  const button = $(purpose === "output" ? "pick-output" : "pick-project");
  const previous = button.textContent;
  button.textContent = "กำลังเปิด Finder...";
  button.disabled = true;
  try {
    const data = await api("/api/pick-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose }),
    });
    if (data.canceled) return;
    if (purpose === "output") {
      state.outputPath = data.path;
      updateOutputLabel();
      return;
    }
    applyProject(data);
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

async function init() {
  $("preview-btn").disabled = true;
  $("save-btn").disabled = true;
  updateNamePreview();
  syncPresets();
  updateOutputLabel();
  try {
    const [{ roots }, health] = await Promise.all([api("/api/roots"), api("/api/health")]);
    renderRoots(roots);
    await loadPath(health.defaultPath);
  } catch (error) {
    showError(error.message);
  }
}

$("path-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = $("path-input").value.trim();
  if (value) loadPath(value);
});
$("up-btn").addEventListener("click", () => {
  if (state.browse?.parent) loadPath(state.browse.parent);
});
$("use-folder").addEventListener("click", () => {
  if (state.browse) applyProject(state.browse);
});
$("pick-project").addEventListener("click", () => pickFromFinder("project"));
$("pick-output").addEventListener("click", () => pickFromFinder("output"));
$("reset-output").addEventListener("click", () => {
  state.outputPath = "";
  updateOutputLabel();
});
$("prefix").addEventListener("input", updateNamePreview);
$("start").addEventListener("input", updateNamePreview);
$("pad").addEventListener("change", updateNamePreview);
$("max").addEventListener("input", syncPresets);
$("output-name").addEventListener("input", updateOutputLabel);
$("max-presets").addEventListener("click", (event) => {
  const button = event.target.closest("[data-max]");
  if (!button) return;
  $("max").value = button.dataset.max;
  syncPresets();
});
$("select-all").addEventListener("change", () => {
  const checked = $("select-all").checked;
  for (const box of selectedBoxes()) box.checked = checked;
  syncSelection();
});
$("preview-btn").addEventListener("click", () => run(true));
$("save-btn").addEventListener("click", () => run(false));

init();
