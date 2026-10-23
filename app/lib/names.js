export function safePrefix(prefix) {
  const cleaned = String(prefix ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .trim()
    .replace(/^\.+/, "")
    .replace(/_+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .trim();
  return cleaned || "num";
}

export function makeFilename(prefix, n, pad) {
  const safe = safePrefix(prefix);
  const index = Number(n);
  const width = Number(pad);
  const num =
    Number.isInteger(width) && width > 0
      ? String(index).padStart(width, "0")
      : String(index);
  return `${safe}_${num}.txt`;
}

export function timestampFolder(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function safeDirName(name) {
  const cleaned = String(name ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 60)
    .trim();
  return cleaned || "num_out";
}
