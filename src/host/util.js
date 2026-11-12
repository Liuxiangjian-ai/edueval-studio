import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export function resolveDataDir() {
  if (process.env.EDUEVAL_DATA_DIR) return path.resolve(process.env.EDUEVAL_DATA_DIR);
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'edueval');
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function nowIso() {
  return new Date().toISOString();
}

export function randomId(prefix = 'run') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString('hex')}`;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function stableHash(value) {
  return sha256(typeof value === 'string' ? value : JSON.stringify(value));
}

export function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return fallback;
    throw new Error(`cannot read ${file}: ${err.message}`);
  }
}

export function atomicWriteJson(file, value, mode = 0o600) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const fd = fs.openSync(temp, 'w', mode);
  try {
    fs.writeFileSync(fd, body, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
  return file;
}

export function atomicWriteText(file, body, mode = 0o600) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  const fd = fs.openSync(temp, 'w', mode);
  try {
    fs.writeFileSync(fd, body, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
  return file;
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function abortError() {
  const err = new Error('operation cancelled');
  err.name = 'AbortError';
  return err;
}

export function isAbortError(err) {
  return err && (err.name === 'AbortError' || /aborted|cancelled/i.test(String(err.message)));
}

export function errorText(err) {
  if (!err) return 'unknown error';
  let text = err instanceof Error ? err.message : String(err);
  text = redact(text);
  return text.length > 1500 ? `${text.slice(0, 1500)}…` : text;
}

/** Remove common secret shapes before an error or diagnostic can be stored. */
export function redact(text) {
  return String(text)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key["'\s:=]+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]');
}

export function safeNumber(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function truncate(text, max = 4000) {
  const s = String(text ?? '');
  return s.length <= max ? s : `${s.slice(0, max)}\n… [truncated]`;
}

export function average(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function uniq(array) {
  return [...new Set(array)];
}

export function peek(arr, count) {
  return arr.slice(0, count);
}

export function csvSafe(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function jsonSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function parseBoolean(value) {
  return value === true || value === 'true' || value === '1';
}
