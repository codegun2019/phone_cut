import assert from "node:assert/strict";
import test from "node:test";
import { makeFilename, timestampFolder } from "../lib/names.js";
import { extractPhones, isHeader, normalizePhone } from "../lib/phones.js";

test("normalizes thai mobile formats", () => {
  assert.equal(normalizePhone("0812345678"), "0812345678");
  assert.equal(normalizePhone("081-234-5678"), "0812345678");
  assert.equal(normalizePhone("+66812345678"), "0812345678");
  assert.equal(normalizePhone("+66 81-234-5678"), "0812345678");
  assert.equal(normalizePhone("08 1234 5678"), "0812345678");
  assert.equal(normalizePhone("812345678"), "0812345678");
  assert.equal(normalizePhone("0661234567"), "0661234567");
});

test("rejects landlines and national ids when mobile only", () => {
  assert.equal(normalizePhone("02-123-4567"), null);
  assert.equal(normalizePhone("0212345678"), null);
  assert.equal(normalizePhone("0212345678", false), "0212345678");
  assert.deepEqual(extractPhones("1234567890123"), []);
  assert.deepEqual(extractPhones("hello"), []);
  assert.deepEqual(extractPhones("Phone Number"), []);
  assert.deepEqual(extractPhones("Phone_Number"), []);
  assert.equal(isHeader("Phone_Number"), true);
});

test("extracts several numbers from one line without merging them", () => {
  assert.deepEqual(extractPhones("0812345678, 0898765432"), ["0812345678", "0898765432"]);
  assert.deepEqual(extractPhones("เบอร์ติดต่อ: 08 1234 5678"), ["0812345678"]);
});

test("names a batch folder as day-month-year_time", () => {
  assert.equal(timestampFolder(new Date(2026, 9, 23, 19, 33, 5)), "23-10-2026_19-33-05");
  assert.equal(timestampFolder(new Date(2026, 0, 7, 8, 4, 9)), "07-01-2026_08-04-09");
});

test("builds num_n filenames and strips path pieces from the prefix", () => {
  assert.equal(makeFilename("num", 1, 3), "num_001.txt");
  assert.equal(makeFilename("num", 12, 0), "num_12.txt");
  assert.equal(makeFilename("../../num", 1, 3), "num_001.txt");
  assert.equal(makeFilename("   ", 2, 2), "num_02.txt");
});
