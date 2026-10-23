const TOKEN_RE = /(?<!\d)(?:\+?66[\s\-.]*)?(?:\d[\s\-.]*){8,11}\d(?!\d)/g;

const HEADER_RE =
  /^(?:phone[\s_-]*numbers?|msisdn|mobile(?:[\s_-]*numbers?)?|tel(?:ephone)?|เบอร์(?:โทร)?(?:ศัพท์)?|หมายเลข(?:โทรศัพท์)?|phone|number)$/i;

export function isHeader(line) {
  const value = String(line).replace(/^\uFEFF/, "").trim();
  return HEADER_RE.test(value);
}

export function normalizePhone(token, mobileOnly = true) {
  let digits = String(token).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("66") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(2);
    if (!digits.startsWith("0")) digits = `0${digits}`;
  }

  if (/^[689]\d{8}$/.test(digits)) digits = `0${digits}`;
  if (!/^0\d{9}$/.test(digits)) return null;
  if (mobileOnly && !/^0[689]\d{8}$/.test(digits)) return null;
  return digits;
}

export function extractPhones(line, { mobileOnly = true } = {}) {
  const raw = String(line).replace(/^\uFEFF/, "").trim();
  if (!raw || raw.length > 2000 || isHeader(raw)) return [];

  const matches = raw.match(TOKEN_RE);
  if (!matches) return [];

  const phones = [];
  for (const token of matches) {
    const phone = normalizePhone(token, mobileOnly);
    if (phone) phones.push(phone);
  }
  return phones;
}
