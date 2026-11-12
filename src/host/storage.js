import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CONFIG,
  DEFAULT_PROVIDERS,
  DEFAULT_JUDGE,
  SCHEMA_VERSION,
  providerPreset,
  summarizeRun,
  validateBenchmark,
} from '../shared/schemas.js';
import { atomicWriteJson, ensureDir, jsonSafe, nowIso, readJson, resolveDataDir } from './util.js';

const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;
const KEY_REF = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const BENCHMARK_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function normalizeUrl(value, label) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`${label} must be a valid http(s) URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${label} must use http or https`);
  if (!url.hostname) throw new Error(`${label} requires a hostname`);
  return url.href.replace(/\/+$/, '');
}

function inferPreset(raw, id) {
  const hint = `${id} ${raw.vendor || ''} ${raw.baseUrl || ''}`.toLowerCase();
  if (hint.includes('bigmodel') || hint.includes('glm') || hint.includes('zhipu')) return 'glm';
  if (hint.includes('deepseek')) return 'deepseek';
  if (hint.includes('dashscope') || hint.includes('qwen') || hint.includes('aliyun')) return 'qwen';
  if (hint.includes('moonshot') || hint.includes('kimi')) return 'kimi';
  if (hint.includes('openai')) return 'openai';
  return 'custom';
}

function normalizeProvider(raw, index) {
  if (!raw || typeof raw !== 'object') throw new Error(`provider[${index}] must be an object`);
  const id = String(raw.id || '').trim().toLowerCase();
  if (!PROVIDER_ID.test(id)) throw new Error(`provider[${index}] has an invalid id`);
  const label = String(raw.label || raw.vendor || id).trim();
  const model = String(raw.model || '').trim();
  if (!model) throw new Error(`provider ${id} requires a model`);
  const apiKeyRef = String(raw.apiKeyRef || `EDUEVAL_${id.replace(/-/g, '_').toUpperCase()}_API_KEY`).trim();
  if (!KEY_REF.test(apiKeyRef)) throw new Error(`provider ${id} has an invalid apiKeyRef`);
  const candidatePreset = providerPreset(String(raw.preset || ''));
  const preset = candidatePreset ? candidatePreset.id : inferPreset(raw, id);
  const maxTokensNumber = Math.round(Number(raw.maxTokens ?? 0));
  return {
    id,
    preset,
    label,
    vendor: String(raw.vendor || label).trim(),
    baseUrl: normalizeUrl(raw.baseUrl, `provider ${id} baseUrl`),
    model,
    apiKeyRef,
    temperature: Math.min(2, Math.max(0, Number(raw.temperature ?? 0.2))),
    // 0 means "do not send a max_tokens field"; there is deliberately no upper cap.
    maxTokens: Number.isFinite(maxTokensNumber) && maxTokensNumber > 0 ? maxTokensNumber : 0,
    timeoutMs: Math.round(Math.min(600000, Math.max(1000, Number(raw.timeoutMs ?? 300000)))),
    // Secrets are deliberately not part of the persisted shape.
  };
}

export function normalizeConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {};
  const providersRaw = Array.isArray(config.providers) && config.providers.length > 0 ? config.providers : DEFAULT_PROVIDERS;
  const providers = providersRaw.slice(0, 12).map(normalizeProvider);
  if (new Set(providers.map((p) => p.id)).size !== providers.length) throw new Error('provider ids must be unique');
  // DSH-era default was deepseek-chat on /v1; DeepSeek's current official
  // OpenAI-compatible preset is deepseek-flash on https://api.deepseek.com.
  for (const provider of providers) {
    if (provider.preset === 'deepseek' && provider.model === 'deepseek-chat') {
      provider.model = 'deepseek-flash';
      provider.baseUrl = 'https://api.deepseek.com';
    }
    if (provider.preset === 'glm') {
      // GLM-5.3 / 5.3-Flash spend a long time on reasoning before visible text.
      if (provider.timeoutMs < 300000) provider.timeoutMs = 300000;
      if (/\/chat\/completions$/.test(provider.baseUrl)) {
        provider.baseUrl = provider.baseUrl.replace(/\/chat\/completions$/, '');
      }
    }
  }
  const selectedRaw = Array.isArray(config.selectedModelIds) ? config.selectedModelIds : providers.slice(0, 3).map((p) => p.id);
  const selectedModelIds = [...new Set(selectedRaw.map(String))].filter((id) => providers.some((p) => p.id === id));
  if (selectedModelIds.length === 0) selectedModelIds.push(providers[0].id);
  const judgeRaw = config.judge && typeof config.judge === 'object' ? config.judge : DEFAULT_JUDGE;
  const judge = {
    label: String(judgeRaw.label || 'Judge').trim(),
    baseUrl: normalizeUrl(judgeRaw.baseUrl || DEFAULT_JUDGE.baseUrl, 'judge baseUrl'),
    model: String(judgeRaw.model || DEFAULT_JUDGE.model).trim(),
    apiKeyRef: String(judgeRaw.apiKeyRef || DEFAULT_JUDGE.apiKeyRef).trim(),
    temperature: Math.min(2, Math.max(0, Number(judgeRaw.temperature ?? 0))),
    maxTokens: Number.isFinite(Math.round(Number(judgeRaw.maxTokens ?? 0))) && Math.round(Number(judgeRaw.maxTokens ?? 0)) > 0
      ? Math.round(Number(judgeRaw.maxTokens ?? 0))
      : 0,
    timeoutMs: Math.round(Math.min(600000, Math.max(1000, Number(judgeRaw.timeoutMs ?? 300000)))),
  };
  if (!judge.model) throw new Error('judge requires a model');
  if (!KEY_REF.test(judge.apiKeyRef)) throw new Error('judge has an invalid apiKeyRef');
  const settings = config.settings && typeof config.settings === 'object' ? config.settings : {};
  return {
    version: SCHEMA_VERSION,
    providers,
    selectedModelIds,
    judge,
    settings: {
      concurrency: Math.round(Math.min(8, Math.max(1, Number(settings.concurrency ?? 3)))),
      retries: Math.round(Math.min(5, Math.max(0, Number(settings.retries ?? 2)))),
      requestTimeoutMs: Math.round(Math.min(600000, Math.max(1000, Number(settings.requestTimeoutMs ?? 120000)))),
      mockMode: settings.mockMode === true,
    },
    benchmarkId: String(config.benchmarkId || '').replace(/^builtin-edueval-v0\.1$/, 'builtin-edueval-v0.2') || 'builtin-edueval-v0.2',
    updated_at: String(config.updated_at || nowIso()),
  };
}

export class Store {
  constructor(options = {}) {
    this.dataDir = path.resolve(options.dataDir || resolveDataDir());
    this.runsDir = path.join(this.dataDir, 'runs');
    this.benchmarksDir = path.join(this.dataDir, 'benchmarks');
    this.configFile = path.join(this.dataDir, 'config.json');
    this.indexFile = path.join(this.dataDir, 'runs', 'index.json');
    this.writeChain = Promise.resolve();
    this.index = { version: 1, runs: [] };
    this.config = null;
    this.ready = false;
  }

  init() {
    if (this.ready) return this;
    ensureDir(this.dataDir);
    ensureDir(this.runsDir);
    ensureDir(this.benchmarksDir);
    try {
      this.config = normalizeConfig(readJson(this.configFile, DEFAULT_CONFIG));
    } catch {
      this.config = normalizeConfig(DEFAULT_CONFIG);
    }
    this.saveConfig(this.config);
    const index = readJson(this.indexFile, null);
    if (index && Array.isArray(index.runs)) {
      this.index = index;
    } else {
      this.rebuildIndex();
    }
    this.markInterruptedRuns();
    this.ready = true;
    return this;
  }

  get pathLabel() {
    return this.dataDir;
  }

  getConfig() {
    return jsonSafe(this.config);
  }

  saveConfig(next) {
    const normalized = normalizeConfig({ ...next, updated_at: nowIso() });
    atomicWriteJson(this.configFile, normalized);
    this.config = normalized;
    return jsonSafe(normalized);
  }

  rebuildIndex() {
    const runs = [];
    for (const name of fs.readdirSync(this.runsDir)) {
      if (!name.endsWith('.json') || name === 'index.json') continue;
      try {
        const run = readJson(path.join(this.runsDir, name));
        if (run && run.id) runs.push(summarizeRun(run));
      } catch {
        // A single unreadable run must not hide the rest of the history.
      }
    }
    runs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    this.index = { version: 1, runs };
    atomicWriteJson(this.indexFile, this.index);
  }

  markInterruptedRuns() {
    for (const summary of this.index.runs) {
      if (summary.status !== 'running' && summary.status !== 'queued' && summary.status !== 'judging') continue;
      try {
        const run = this.loadRun(summary.id);
        run.status = 'interrupted';
        run.updated_at = nowIso();
        run.error = 'Host stopped while this run was active. Resume it to continue missing tasks.';
        this.saveRun(run);
      } catch {
        // Keep the index usable even if a single run cannot be recovered.
      }
    }
  }

  runFile(runId) {
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(String(runId))) throw new Error('invalid run id');
    return path.join(this.runsDir, `${runId}.json`);
  }

  loadRun(runId) {
    const run = readJson(this.runFile(runId), null);
    if (!run) throw new Error(`run ${runId} not found`);
    return run;
  }

  saveRun(run) {
    run.updated_at = nowIso();
    const snapshot = jsonSafe(run);
    const summary = summarizeRun(snapshot);
    const existing = this.index.runs.findIndex((r) => r.id === snapshot.id);
    if (existing >= 0) this.index.runs[existing] = summary;
    else this.index.runs.unshift(summary);
    this.index.runs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const indexSnapshot = jsonSafe(this.index);
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(() => {
        atomicWriteJson(this.runFile(snapshot.id), snapshot);
        atomicWriteJson(this.indexFile, indexSnapshot);
      });
    return this.writeChain;
  }

  listRuns(limit = 50) {
    return this.index.runs.slice(0, Math.max(1, Math.min(200, limit))).map((r) => jsonSafe(r));
  }

  deleteRun(runId) {
    const file = this.runFile(runId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    this.index.runs = this.index.runs.filter((r) => r.id !== runId);
    atomicWriteJson(this.indexFile, this.index);
  }

  benchmarkFile(id) {
    if (!BENCHMARK_ID.test(String(id))) throw new Error('invalid benchmark id');
    return path.join(this.benchmarksDir, `${id}.json`);
  }

  saveBenchmark(benchmark) {
    const id = String(benchmark.id || '').toLowerCase();
    if (!BENCHMARK_ID.test(id)) throw new Error('benchmark id must use lowercase letters, digits and hyphens');
    const normalized = validateBenchmark(benchmark.cases, {
      id,
      name: benchmark.name,
      version: benchmark.version,
      source: benchmark.source || 'custom',
      created_at: benchmark.created_at,
    });
    atomicWriteJson(this.benchmarkFile(id), normalized);
    return normalized;
  }

  loadBenchmark(id) {
    if (!BENCHMARK_ID.test(String(id))) throw new Error('invalid benchmark id');
    return readJson(this.benchmarkFile(id), null);
  }

  listBenchmarks() {
    const out = [];
    for (const name of fs.readdirSync(this.benchmarksDir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const b = readJson(path.join(this.benchmarksDir, name));
        if (!b || !Array.isArray(b.cases)) continue;
        out.push({
          id: b.id,
          name: b.name,
          version: b.version,
          source: b.source,
          created_at: b.created_at,
          case_count: b.cases.length,
        });
      } catch {
        // Ignore malformed custom benchmark files.
      }
    }
    return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
}
