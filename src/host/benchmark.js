import fs from 'node:fs';
import {
  BENCHMARK_FORMAT_VERSION,
  benchmarkFromCsv,
  cloneCase,
  parseJsonl,
  validateBenchmark,
} from '../shared/schemas.js';
import { sha256, stableHash } from './util.js';

const BUILTIN_PATH = new URL('../../data/benchmark_v0.2.jsonl', import.meta.url);
export const BUILTIN_BENCHMARK_ID = 'builtin-edueval-v0.2';
export const LEGACY_BUILTIN_BENCHMARK_ID = 'builtin-edueval-v0.1';

let builtinCache = null;

export function loadBuiltinBenchmark() {
  if (builtinCache) return builtinCache;
  const text = fs.readFileSync(BUILTIN_PATH, 'utf8');
  const benchmark = parseJsonl(text, {
    id: BUILTIN_BENCHMARK_ID,
    name: 'EduEval Benchmark 10Q v0.2',
    version: BENCHMARK_FORMAT_VERSION,
    source: 'builtin',
    created_at: '2026-11-11T00:00:00.000Z',
  });
  benchmark.hash = benchmarkHash(benchmark);
  builtinCache = benchmark;
  return builtinCache;
}

export function benchmarkHash(benchmark) {
  return sha256(JSON.stringify((benchmark.cases || []).map(caseSnapshot)));
}

export function rubricHash(caseSnapshot) {
  return stableHash(caseSnapshot.rubric);
}

export function caseSnapshot(c) {
  return {
    id: c.id,
    benchmark_version: c.benchmark_version,
    task_type: c.task_type,
    stage: c.stage,
    grade: c.grade,
    subject: c.subject,
    topic: c.topic,
    difficulty: c.difficulty,
    tags: [...(c.tags || [])],
    query: c.query,
    rubric: cloneCase(c.rubric),
    critical_errors: [...(c.critical_errors || [])],
  };
}

export function slugifyBenchmarkId(name) {
  const base = String(name || 'custom')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'custom'}-${Date.now().toString(36)}`.slice(0, 64);
}

export function importBenchmarkText({ format, content, name, id }) {
  const benchmarkId = id || slugifyBenchmarkId(name);
  const meta = {
    id: benchmarkId,
    name: name || 'Imported benchmark',
    version: BENCHMARK_FORMAT_VERSION,
    source: 'import',
  };
  if (format === 'csv') return benchmarkFromCsv(content, meta);
  if (format === 'jsonl' || format === 'json') {
    if (format === 'json') {
      const parsed = JSON.parse(content);
      const cases = Array.isArray(parsed) ? parsed : parsed.cases;
      return validateBenchmark(cases, meta);
    }
    return parseJsonl(content, meta);
  }
  throw new Error('format must be jsonl, json or csv');
}

export function benchmarkSummary(benchmark) {
  return {
    id: benchmark.id,
    name: benchmark.name,
    version: benchmark.version,
    source: benchmark.source,
    created_at: benchmark.created_at,
    hash: benchmark.hash || benchmarkHash(benchmark),
    case_count: benchmark.cases.length,
  };
}

export { BENCHMARK_FORMAT_VERSION };
