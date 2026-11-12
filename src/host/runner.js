import crypto from 'node:crypto';
import {
  ALIASES,
  JUDGE_PROTOCOL_VERSION,
  PROVIDER_PRESETS,
  calculateTotal,
  normalizeCase,
  validateBenchmark,
} from '../shared/schemas.js';
import { aggregateRun, availableGroups } from './analytics.js';
import { BUILTIN_BENCHMARK_ID, LEGACY_BUILTIN_BENCHMARK_ID, benchmarkHash, benchmarkSummary, caseSnapshot, loadBuiltinBenchmark, rubricHash } from './benchmark.js';
import { exportRun } from './export.js';
import { JUDGE_SYSTEM_PROMPT, buildJudgePrompt, evaluateResponse, evaluateResponseMock, judgePromptHash } from './judge.js';
import { chatCompletion, generationMessages } from './llm.js';
import { mockGeneration } from './mock.js';
import { Store, normalizeConfig as normalizeConfigExport } from './storage.js';
import {
  abortError,
  average,
  errorText,
  isAbortError,
  nowIso,
  randomId,
  round,
  safeNumber,
  sha256,
  sleep,
  stableHash,
} from './util.js';

export const PLUGIN_VERSION = '1.0.0';
export const ALLOWED_KEY_REF = /^EDUEVAL_[A-Z0-9_]+$/;

function modelKey(providerId, model) {
  return `${providerId}/${model}`;
}

function isRetryable(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return err.name === 'TimeoutError';
  const status = Number(err.status);
  if (status === 408 || status === 409 || status === 425 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  if (status >= 400 && status < 500) return false;
  return /fetch failed|network|ECONN|ETIMEDOUT|ENOTFOUND|socket|timeout/i.test(String(err.message));
}

function emptyCounts() {
  return { total: 0, pending: 0, running: 0, success: 0, failed: 0, cancelled: 0, done: 0 };
}

function countItems(nested) {
  const counts = emptyCounts();
  for (const byModel of Object.values(nested || {})) {
    for (const item of Object.values(byModel || {})) {
      counts.total += 1;
      const status = item?.status || 'pending';
      if (status === 'success') counts.success += 1;
      else if (status === 'failed') counts.failed += 1;
      else if (status === 'cancelled') counts.cancelled += 1;
      else if (status === 'running') counts.running += 1;
      else counts.pending += 1;
    }
  }
  counts.done = counts.success + counts.failed + counts.cancelled;
  return counts;
}

export class EduEvalEngine {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.store = options.store || new Store({ dataDir: options.dataDir });
    this.store.init();
    this.builtin = loadBuiltinBenchmark();
    this.memoryKeys = new Map();
    this.active = new Map();
    this.startedAt = nowIso();
    this.credentials = null;
    try {
      this.credentials = ctx?.get?.('credentials') || ctx?.credentials || null;
    } catch {
      this.credentials = null;
    }
  }

  get config() {
    return this.store.getConfig();
  }

  async bootstrap() {
    const config = await this.config;
    const benchmark = this.builtin;
    const benchmarkSummaries = [benchmarkSummary(benchmark), ...this.store.listBenchmarks()];
    const runs = this.store.listRuns(30);
    return {
      plugin: {
        name: 'dsh-plugin-edueval',
        version: PLUGIN_VERSION,
        dsh: '0.2.1-rc.3',
        judge_protocol: JUDGE_PROTOCOL_VERSION,
      },
      data_dir: this.store.pathLabel,
      benchmark: {
        ...benchmarkSummary(benchmark),
        cases: benchmark.cases,
      },
      benchmarks: benchmarkSummaries,
      presets: PROVIDER_PRESETS,
      config,
      keys: await this.keyInfos(config),
      runs,
      active_runs: [...this.active.keys()],
      limits: { max_cases: 200, max_models: 8, max_concurrency: 8 },
    };
  }

  async getBenchmark(id) {
    if (!id || id === BUILTIN_BENCHMARK_ID || id === LEGACY_BUILTIN_BENCHMARK_ID) return this.builtin;
    const custom = this.store.loadBenchmark(id);
    if (!custom) throw new Error(`benchmark ${id} not found`);
    custom.hash = benchmarkHash(custom);
    return custom;
  }

  async listBenchmarks() {
    return [benchmarkSummary(this.builtin), ...this.store.listBenchmarks()];
  }

  keyRefs(config = this.config) {
    return [...new Set([...config.providers.map((p) => p.apiKeyRef), config.judge.apiKeyRef])];
  }

  async resolveKey(ref) {
    if (!ref) return '';
    if (this.memoryKeys.has(ref)) return this.memoryKeys.get(ref);
    if (this.credentials?.resolve) {
      try {
        const hit = await this.credentials.resolve(ref);
        if (hit?.value) return hit.value;
      } catch {
        // Fall through to the environment.
      }
    }
    return process.env[ref] || '';
  }

  async describeKey(ref) {
    if (this.memoryKeys.has(ref)) return { ref, configured: true, source: 'session-memory', writable: true };
    if (this.credentials?.describe) {
      try {
        const info = await this.credentials.describe(ref);
        if (info) {
          return {
            ref,
            configured: Boolean(info.configured),
            source: info.source || 'credential-store',
            writable: info.writable !== false,
          };
        }
      } catch {
        // Fall through.
      }
    }
    const envValue = process.env[ref];
    return { ref, configured: Boolean(envValue), source: envValue ? 'environment' : 'unset', writable: true };
  }

  async keyInfos(config = this.config) {
    const out = [];
    for (const ref of this.keyRefs(config)) out.push(await this.describeKey(ref));
    return out;
  }

  async setKey({ ref, key, remember = false }) {
    if (!ALLOWED_KEY_REF.test(String(ref || ''))) {
      throw new Error('EduEval may only write credential references prefixed with EDUEVAL_');
    }
    const value = String(key || '').trim();
    if (value.length < 4) throw new Error('API key is too short');
    if (value.length > 1000) throw new Error('API key is too long');
    this.memoryKeys.set(ref, value);
    let stored = false;
    let warning = '';
    if (remember) {
      if (!this.credentials?.set) {
        warning = 'Credential store is unavailable; the key is kept in this Host session only.';
      } else {
        try {
          await this.credentials.set(ref, value);
          stored = true;
        } catch (err) {
          warning = `Credential store rejected the key; kept in Host memory only: ${errorText(err)}`;
        }
      }
    }
    return { ref, configured: true, stored, source: stored ? 'credential-store' : 'session-memory', warning };
  }

  async clearKey(ref) {
    if (!ALLOWED_KEY_REF.test(String(ref || ''))) throw new Error('invalid EduEval credential reference');
    this.memoryKeys.delete(ref);
    if (this.credentials?.unset) {
      try {
        await this.credentials.unset(ref);
      } catch {
        // A missing credential store is not a failure for clearing memory.
      }
    }
    return { ref, configured: Boolean(process.env[ref]), source: process.env[ref] ? 'environment' : 'unset' };
  }

  async saveConfig(raw) {
    const saved = this.store.saveConfig(raw);
    return { config: saved, keys: await this.keyInfos(saved) };
  }

  modelSpecs(config, modelIds) {
    const ids = Array.isArray(modelIds) && modelIds.length ? modelIds : config.selectedModelIds;
    const specs = [];
    for (const id of ids) {
      const provider = config.providers.find((p) => p.id === id);
      if (!provider) throw new Error(`unknown model provider ${id}`);
      specs.push({
        key: modelKey(provider.id, provider.model),
        providerId: provider.id,
        providerLabel: provider.label,
        preset: provider.preset,
        vendor: provider.vendor,
        label: `${provider.label} · ${provider.model}`,
        model: provider.model,
        baseUrl: provider.baseUrl,
        apiKeyRef: provider.apiKeyRef,
        temperature: provider.temperature,
        maxTokens: provider.maxTokens,
        timeoutMs: provider.timeoutMs,
      });
    }
    if (specs.length === 0) throw new Error('select at least one model');
    if (specs.length > 8) throw new Error('at most 8 models per run');
    if (new Set(specs.map((s) => s.key)).size !== specs.length) throw new Error('duplicate model selections');
    return specs;
  }

  async preflightKeys(config, models, judge, mock, needsJudge = true) {
    if (mock) return;
    const missing = [];
    for (const model of models) {
      if (!(await this.resolveKey(model.apiKeyRef))) missing.push(model.apiKeyRef);
    }
    if (needsJudge && !(await this.resolveKey(judge.apiKeyRef))) missing.push(judge.apiKeyRef);
    if (missing.length) {
      const err = new Error(`Missing key value for reference ${[...new Set(missing)].join(', ')}. Enter the key in Model Configuration and click "Save Key" (or use Mock mode).`);
      err.code = 'MISSING_KEYS';
      err.missing = [...new Set(missing)];
      throw err;
    }
  }

  async createRun(payload = {}) {
    const config = this.config;
    const workflow = payload.workflow === 'generation' ? 'generation' : 'full';
    const mock = payload.mockMode === true || (payload.mockMode === undefined && config.settings.mockMode === true);
    const models = this.modelSpecs(config, payload.modelIds);
    let judgeSource = config.judge;
    if (payload.judge && typeof payload.judge === 'object') {
      judgeSource = normalizeConfigExport({ ...config, judge: payload.judge }).judge;
    }
    let benchmark;
    let cases;
    if (Array.isArray(payload.cases) && payload.cases.length) {
      benchmark = validateBenchmark(payload.cases, {
        id: payload.benchmark?.id || 'selection',
        name: payload.benchmark?.name || 'Selected cases',
        version: payload.benchmark?.version || 'custom',
        source: payload.benchmark?.source || 'selection',
      });
      cases = benchmark.cases;
    } else {
      benchmark = await this.getBenchmark(payload.benchmarkId);
      const ids = new Set(payload.caseIds || benchmark.cases.map((c) => c.id));
      cases = benchmark.cases.filter((c) => ids.has(c.id)).map(normalizeCase);
    }
    if (cases.length === 0) throw new Error('select at least one case');
    if (cases.length > 200) throw new Error('at most 200 cases per run');
    const judge = {
      ...judgeSource,
      protocol_version: JUDGE_PROTOCOL_VERSION,
      prompt_hash: judgePromptHash(),
      system_prompt: JUDGE_SYSTEM_PROMPT,
    };
    await this.preflightKeys(config, models, judge, mock, workflow === 'full');
    const runId = randomId('run');
    const timestamp = nowIso();
    const responses = {};
    const judgments = {};
    for (const c of cases) {
      responses[c.id] = {};
      judgments[c.id] = {};
      for (const m of models) {
        responses[c.id][m.key] = {
          case_id: c.id,
          model_key: m.key,
          model_id: m.model,
          provider_id: m.providerId,
          provider_label: m.providerLabel,
          model_label: m.label,
          status: 'pending',
          text: '',
          error: '',
          attempts: 0,
          usage: null,
          started_at: null,
          finished_at: null,
          duration_ms: null,
        };
        judgments[c.id][m.key] = {
          case_id: c.id,
          model_key: m.key,
          status: 'pending',
          error: '',
          attempts: 0,
          total_score: null,
          criteria: [],
          critical_errors: [],
          started_at: null,
          finished_at: null,
          duration_ms: null,
        };
      }
    }
    const fullHash = benchmarkHash({ cases });
    const run = {
      schema: 'edueval-run-v1',
      id: runId,
      created_at: timestamp,
      updated_at: timestamp,
      status: 'queued',
      mode: mock ? 'mock' : 'live',
      workflow,
      mock,
      benchmark: {
        id: benchmark.id,
        name: benchmark.name,
        version: benchmark.version,
        hash: fullHash,
        selected_hash: benchmarkHash({ cases }),
        source_hash: payload.benchmark?.hash || null,
        case_count: cases.length,
      },
      cases: cases.map((c) => ({ ...caseSnapshot(c), rubric_hash: rubricHash(c) })),
      generation_protocol: {
        version: 'edueval-generation-v0.1',
        system_prompt: generationMessages('').find((m) => m.role === 'system')?.content || '',
        temperature_policy: 'provider configuration; recorded per model below',
      },
      models,
      judge: {
        label: judge.label,
        model: judge.model,
        base_url: judge.baseUrl,
        temperature: judge.temperature,
        max_tokens: judge.maxTokens,
        timeout_ms: judge.timeoutMs,
        protocol_version: judge.protocol_version,
        prompt_hash: judge.prompt_hash,
        system_prompt: judge.system_prompt,
        key_ref: judge.apiKeyRef,
      },
      settings: {
        concurrency: safeNumber(payload.concurrency, config.settings.concurrency, 1, 8),
        retries: safeNumber(payload.retries, config.settings.retries, 0, 5),
        timeout_ms: config.settings.requestTimeoutMs,
      },
      blind_salt: crypto.randomBytes(16).toString('hex'),
      responses,
      judgments,
      human_reviews: [],
      events: [],
      progress: { generation: emptyCounts(), judge: emptyCounts(), overall_percent: 0 },
      cancel_requested: false,
      error: '',
    };
    run.progress = this.progress(run);
    this.event(run, 'run', `Created ${mock ? 'MOCK ' : ''}${workflow} run with ${cases.length} cases × ${models.length} models.`);
    await this.store.saveRun(run);
    void this.execute(run, { judgeOnly: false });
    return this.safeRun(run);
  }

  event(run, type, message) {
    run.events = run.events || [];
    run.events.push({ at: nowIso(), type, message: String(message).slice(0, 500) });
    if (run.events.length > 120) run.events.shift();
  }

  progress(run) {
    const generation = countItems(run.responses);
    const judge = run.workflow === 'full' ? countItems(run.judgments) : emptyCounts();
    const total = generation.total + judge.total;
    const done = generation.done + judge.done;
    return {
      generation,
      judge,
      overall_percent: total ? round((done / total) * 100, 1) : 0,
    };
  }

  safeRun(run) {
    return JSON.parse(JSON.stringify(run));
  }

  async getRun(runId) {
    return this.safeRun(this.store.loadRun(runId));
  }

  async execute(run, { judgeOnly = false } = {}) {
    if (this.active.has(run.id)) return;
    const controller = new AbortController();
    this.active.set(run.id, { controller, startedAt: nowIso() });
    run.cancel_requested = false;
    run.error = '';
    try {
      if (!judgeOnly) {
        run.status = 'generating';
        this.event(run, 'status', 'Generation started.');
        await this.store.saveRun(run);
        await this.runGeneration(run, controller.signal);
      }
      if (run.workflow === 'full') {
        run.status = 'judging';
        this.event(run, 'status', 'Judge started.');
        await this.store.saveRun(run);
        await this.runJudging(run, controller.signal);
      }
      if (controller.signal.aborted) {
        run.status = 'cancelled';
        run.error = 'Run cancelled by user.';
      } else {
        const p = this.progress(run);
        const failed = p.generation.failed + p.judge.failed;
        run.status = failed > 0 ? 'completed_with_errors' : 'completed';
        run.error = failed > 0 ? `${failed} task(s) failed; successful tasks were preserved.` : '';
      }
      this.event(run, 'status', `Run finished with status ${run.status}.`);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        run.status = 'cancelled';
        run.error = 'Run cancelled by user.';
      } else {
        run.status = 'failed';
        run.error = errorText(err);
        this.event(run, 'error', run.error);
      }
    } finally {
      run.progress = this.progress(run);
      run.cancel_requested = false;
      await this.store.saveRun(run);
      this.active.delete(run.id);
    }
  }

  async runWithRetries(run, task, retries, signal, label, onAttempt) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (signal.aborted) throw abortError();
      if (onAttempt) onAttempt(attempt);
      try {
        return await task();
      } catch (err) {
        if (isAbortError(err) || signal.aborted) throw abortError();
        if (attempt >= retries || !isRetryable(err)) throw err;
        const base = Math.min(8000, 600 * 2 ** attempt);
        const delay = base + Math.floor(Math.random() * 250);
        run.progress = this.progress(run);
        this.event(run, 'retry', `${label} attempt ${attempt + 1} failed; retrying in ${delay}ms: ${errorText(err).slice(0, 180)}`);
        await this.store.saveRun(run);
        await sleep(delay, signal);
      }
    }
    throw new Error(`${label} exhausted retries`);
  }

  async runGeneration(run, signal) {
    const tasks = [];
    for (const c of run.cases) {
      for (const m of run.models) {
        const item = run.responses[c.id][m.key];
        if (item.status === 'success' || item.status === 'failed' || item.status === 'cancelled') continue;
        if (item.status === 'running') item.status = 'pending';
        tasks.push({ c, m, item });
      }
    }
    await this.runTasks(run, tasks, async ({ c, m, item }) => {
      item.status = 'running';
      item.started_at = nowIso();
      item.error = '';
      run.progress = this.progress(run);
      await this.store.saveRun(run);
      try {
        if (run.mock) {
          await sleep(10, signal);
          const text = mockGeneration(c, m, run.models.indexOf(m));
          item.status = 'success';
          item.text = text;
          item.usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          item.mock = true;
          item.prompt_hash = sha256(JSON.stringify(generationMessages(c.query)));
        } else {
          const apiKey = await this.resolveKey(m.apiKeyRef);
          if (!apiKey) throw new Error(`missing API key ${m.apiKeyRef}; enter it and click "Save Key"`);
          const messages = generationMessages(c.query);
          item.prompt_hash = sha256(JSON.stringify(messages));
          const completion = await this.runWithRetries(
            run,
            () =>
              chatCompletion({
                baseUrl: m.baseUrl,
                apiKey,
                model: m.model,
                messages,
                temperature: m.temperature,
                maxTokens: m.maxTokens,
                timeoutMs: m.timeoutMs,
                signal,
              }),
            run.settings.retries,
            signal,
            `${c.id}/${m.key}`,
            () => {
              item.attempts += 1;
            },
          );
          item.status = 'success';
          item.text = completion.text;
          item.usage = completion.usage;
          item.finish_reason = completion.finish_reason;
          item.resolved_model = completion.model;
        }
        item.finished_at = nowIso();
        item.duration_ms = item.started_at ? Date.parse(item.finished_at) - Date.parse(item.started_at) : null;
      } catch (err) {
        item.finished_at = nowIso();
        if (isAbortError(err) || signal.aborted) {
          item.status = 'cancelled';
          item.error = 'cancelled';
        } else {
          item.status = 'failed';
          item.error = errorText(err);
          this.event(run, 'generation_failed', `${c.id}/${m.key}: ${item.error}`);
        }
      }
      run.progress = this.progress(run);
      await this.store.saveRun(run);
    }, signal);
  }

  async runJudging(run, signal) {
    const tasks = [];
    for (const c of run.cases) {
      for (const m of run.models) {
        const response = run.responses[c.id][m.key];
        const judgment = run.judgments[c.id][m.key];
        if (judgment.status === 'success' || judgment.status === 'failed' || judgment.status === 'cancelled') continue;
        if (response.status !== 'success') continue;
        if (judgment.status === 'running') judgment.status = 'pending';
        tasks.push({ c, m, response, judgment });
      }
    }
    await this.runTasks(run, tasks, async ({ c, m, response, judgment }) => {
      judgment.status = 'running';
      judgment.started_at = nowIso();
      judgment.error = '';
      run.progress = this.progress(run);
      await this.store.saveRun(run);
      try {
        let result;
        if (run.mock) {
          await sleep(5, signal);
          result = evaluateResponseMock({ caseSnapshot: c, responseText: response.text, judge: run.judge });
        } else {
          const apiKey = await this.resolveKey(run.judge.key_ref);
          if (!apiKey) throw new Error(`missing API key ${run.judge.key_ref}; enter it and click "Save Key"`);
          result = await this.runWithRetries(
            run,
            () =>
              evaluateResponse({
                caseSnapshot: c,
                responseText: response.text,
                judge: {
                  ...run.judge,
                  baseUrl: run.judge.base_url,
                  maxTokens: run.judge.max_tokens,
                  timeoutMs: run.judge.timeout_ms,
                },
                apiKey,
                signal,
                callJudge: chatCompletion,
              }),
            run.settings.retries,
            signal,
            `judge ${c.id}/${m.key}`,
            () => {
              judgment.attempts += 1;
            },
          );
        }
        Object.assign(judgment, result, {
          case_id: c.id,
          model_key: m.key,
          response_hash: sha256(response.text),
        });
        judgment.status = 'success';
        judgment.finished_at = nowIso();
        judgment.duration_ms = judgment.started_at ? Date.parse(judgment.finished_at) - Date.parse(judgment.started_at) : null;
        if ((judgment.critical_errors || []).some((e) => e.found)) {
          this.event(run, 'critical_error', `${c.id}/${m.key}: critical error detected.`);
        }
      } catch (err) {
        judgment.finished_at = nowIso();
        if (isAbortError(err) || signal.aborted) {
          judgment.status = 'cancelled';
          judgment.error = 'cancelled';
        } else {
          judgment.status = 'failed';
          judgment.error = errorText(err);
          if (err.rawOutput) judgment.raw_output = String(err.rawOutput).slice(0, 20000);
          this.event(run, 'judge_failed', `${c.id}/${m.key}: ${judgment.error}`);
        }
      }
      run.progress = this.progress(run);
      await this.store.saveRun(run);
    }, signal);
  }

  async runTasks(run, tasks, worker, signal) {
    if (tasks.length === 0) return;
    const concurrency = Math.max(1, Math.min(run.settings.concurrency || 3, tasks.length));
    let cursor = 0;
    const runners = Array.from({ length: concurrency }, async () => {
      while (true) {
        if (signal.aborted) return;
        const index = cursor;
        cursor += 1;
        if (index >= tasks.length) return;
        await worker(tasks[index]);
      }
    });
    await Promise.all(runners);
  }

  async cancelRun(runId) {
    const run = this.store.loadRun(runId);
    run.cancel_requested = true;
    this.event(run, 'status', 'Cancellation requested.');
    await this.store.saveRun(run);
    const active = this.active.get(runId);
    if (active) active.controller.abort();
    else {
      run.status = 'cancelled';
      run.error = 'Run cancelled.';
      await this.store.saveRun(run);
    }
    return this.safeRun(run);
  }

  async resumeRun(runId, { retryFailed = false } = {}) {
    if (this.active.has(runId)) throw new Error('run is already active');
    const run = this.store.loadRun(runId);
    if (run.status === 'completed') return this.safeRun(run);
    run.cancel_requested = false;
    run.error = '';
    for (const byModel of Object.values(run.responses)) {
      for (const item of Object.values(byModel)) {
        if (item.status === 'cancelled') item.status = 'pending';
        if (retryFailed && item.status === 'failed') item.status = 'pending';
      }
    }
    for (const byModel of Object.values(run.judgments)) {
      for (const item of Object.values(byModel)) {
        if (item.status === 'cancelled') item.status = 'pending';
        if (retryFailed && item.status === 'failed') item.status = 'pending';
      }
    }
    run.status = 'queued';
    run.progress = this.progress(run);
    this.event(run, 'status', retryFailed ? 'Retrying failed tasks.' : 'Resuming missing tasks.');
    await this.store.saveRun(run);
    void this.execute(run, { judgeOnly: false });
    return this.safeRun(run);
  }

  async evaluateRun(runId, payload = {}) {
    if (this.active.has(runId)) throw new Error('run is already active');
    const run = this.store.loadRun(runId);
    const config = this.config;
    if (payload.judge && typeof payload.judge === 'object') {
      const normalized = normalizeConfig({ ...config, judge: payload.judge });
      run.judge = {
        label: normalized.judge.label,
        model: normalized.judge.model,
        base_url: normalized.judge.baseUrl,
        temperature: normalized.judge.temperature,
        max_tokens: normalized.judge.maxTokens,
        timeout_ms: normalized.judge.timeoutMs,
        protocol_version: JUDGE_PROTOCOL_VERSION,
        prompt_hash: judgePromptHash(),
        system_prompt: JUDGE_SYSTEM_PROMPT,
        key_ref: normalized.judge.apiKeyRef,
      };
    }
    if (payload.mockMode === true) {
      run.mode = 'mock';
      run.mock = true;
    }
    if (!run.mock && !(await this.resolveKey(run.judge.key_ref))) {
      throw new Error(`Missing judge API key ${run.judge.key_ref}. Configure it or use Mock mode.`);
    }
    const hasResponse = Object.values(run.responses || {}).some((byModel) =>
      Object.values(byModel).some((r) => r.status === 'success'),
    );
    if (!hasResponse) throw new Error('run has no successful responses to evaluate');
    run.workflow = 'full';
    for (const byModel of Object.values(run.judgments)) {
      for (const item of Object.values(byModel)) {
        if (item.status === 'failed' || item.status === 'cancelled') {
          item.status = 'pending';
          item.error = '';
        }
      }
    }
    run.status = 'queued';
    run.progress = this.progress(run);
    this.event(run, 'status', 'Evaluation requested for existing responses.');
    await this.store.saveRun(run);
    void this.execute(run, { judgeOnly: true });
    return this.safeRun(run);
  }

  async deleteRun(runId) {
    this.store.deleteRun(runId);
    return { deleted: true, id: runId };
  }

  async testConnection(payload) {
    const config = this.config;
    const kind = payload.kind === 'judge' ? 'judge' : 'model';
    let spec;
    if (kind === 'judge') {
      spec = {
        label: config.judge.label,
        baseUrl: config.judge.baseUrl,
        model: config.judge.model,
        apiKeyRef: config.judge.apiKeyRef,
        temperature: 0,
        maxTokens: 0,
        timeoutMs: config.judge.timeoutMs,
      };
    } else {
      const provider = config.providers.find((p) => p.id === payload.providerId);
      if (!provider) throw new Error('provider not found');
      spec = provider;
    }
    if (payload.mockMode === true || config.settings.mockMode) {
      return { ok: true, mock: true, model: spec.model, text: 'MOCK OK', latency_ms: 0 };
    }
    const apiKey = await this.resolveKey(spec.apiKeyRef);
    if (!apiKey) throw new Error(`API key reference ${spec.apiKeyRef} has no saved value. Enter the key and click "Save Key" (or "Test" after entering it).`);
    const started = Date.now();
    const completion = await chatCompletion({
      baseUrl: spec.baseUrl,
      apiKey,
      model: spec.model,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      temperature: 0,
      // A tiny cap can be consumed entirely by a thinking model's reasoning
      // tokens (notably GLM-5.3), producing empty content. Omit max_tokens.
      maxTokens: 0,
      timeoutMs: 30000,
    });
    return { ok: true, model: completion.model, text: completion.text.slice(0, 100), latency_ms: Date.now() - started };
  }

  blindEntries(run, caseId) {
    const c = run.cases.find((x) => x.id === caseId);
    if (!c) throw new Error(`case ${caseId} not found in run`);
    const entries = run.models.map((m) => {
      const response = run.responses[c.id][m.key];
      return {
        model: m,
        response,
        hash: sha256(`${run.blind_salt}:${c.id}:${m.key}`),
      };
    });
    entries.sort((a, b) => a.hash.localeCompare(b.hash));
    return entries.map((entry, index) => ({ ...entry, alias: ALIASES[index] || `C${index + 1}` }));
  }

  async getBlind(runId, caseId) {
    const run = this.store.loadRun(runId);
    const c = run.cases.find((x) => x.id === caseId);
    if (!c) throw new Error('case not found');
    const entries = this.blindEntries(run, caseId);
    return {
      run_id: run.id,
      case_id: c.id,
      query: c.query,
      rubric: c.rubric,
      critical_errors: c.critical_errors,
      candidates: entries.map((e) => ({
        alias: e.alias,
        status: e.response.status,
        text: e.response.status === 'success' ? e.response.text : '',
      })),
      existing_reviews: (run.human_reviews || [])
        .filter((r) => r.case_id === c.id)
        .map((r) => ({ reviewer_id: r.reviewer_id, alias: r.alias, total_score: r.total_score })),
    };
  }

  async saveHumanReview(payload) {
    const run = this.store.loadRun(payload.runId);
    const c = run.cases.find((x) => x.id === payload.caseId);
    if (!c) throw new Error('case not found');
    const entries = this.blindEntries(run, payload.caseId);
    const entry = entries.find((e) => e.alias === payload.alias);
    if (!entry) throw new Error('unknown blind alias');
    if (entry.response.status !== 'success') throw new Error('this anonymous candidate has no successful response');
    const reviewer = String(payload.reviewerId || '').trim();
    if (!reviewer) throw new Error('reviewer ID is required');
    if (reviewer.length > 80) throw new Error('reviewer ID is too long');
    if (!Array.isArray(payload.criteria) || payload.criteria.length !== c.rubric.length) {
      throw new Error(`score all ${c.rubric.length} rubric criteria`);
    }
    const byId = new Map(c.rubric.map((x) => [x.criterion_id, x]));
    const seen = new Set();
    const criteria = payload.criteria.map((item) => {
      const id = String(item.criterion_id || '');
      if (!byId.has(id)) throw new Error(`unknown criterion ${id}`);
      if (seen.has(id)) throw new Error(`duplicate criterion ${id}`);
      seen.add(id);
      const score = Number(item.score);
      if (![0, 1, 2].includes(score)) throw new Error(`criterion ${id} must be 0, 1 or 2`);
      return {
        criterion_id: id,
        score,
        evidence: String(item.evidence || '').trim().slice(0, 1000),
      };
    });
    for (const id of byId.keys()) if (!seen.has(id)) throw new Error(`missing criterion ${id}`);
    const total = calculateTotal(criteria, c.rubric);
    if (total < 0 || total > 100) throw new Error('human total out of range');
    const now = nowIso();
    const review = {
      id: stableHash(`${run.id}:${c.id}:${reviewer}:${entry.model.key}`).slice(0, 24),
      run_id: run.id,
      case_id: c.id,
      reviewer_id: reviewer,
      alias: entry.alias,
      model_key: entry.model.key,
      model_label: entry.model.label,
      criteria,
      critical_errors_found: Array.isArray(payload.criticalErrorsFound)
        ? payload.criticalErrorsFound.filter((e) => c.critical_errors.includes(e))
        : [],
      comments: String(payload.comments || '').trim().slice(0, 4000),
      total_score: total,
      created_at: now,
      updated_at: now,
      rubric_hash: rubricHash(c),
    };
    run.human_reviews = run.human_reviews || [];
    const index = run.human_reviews.findIndex(
      (r) => r.reviewer_id === reviewer && r.case_id === c.id && r.model_key === entry.model.key,
    );
    if (index >= 0) {
      review.created_at = run.human_reviews[index].created_at;
      run.human_reviews[index] = review;
    } else {
      run.human_reviews.push(review);
    }
    this.event(run, 'human_review', `${reviewer} reviewed ${c.id} candidate ${entry.alias}.`);
    await this.store.saveRun(run);
    return { saved: true, review_id: review.id, total_score: total, alias: entry.alias };
  }

  async revealBlind(runId, caseId, reviewerId) {
    const run = this.store.loadRun(runId);
    const c = run.cases.find((x) => x.id === caseId);
    if (!c) throw new Error('case not found');
    const reviews = (run.human_reviews || []).filter((r) => r.case_id === c.id);
    if (!reviews.length) throw new Error('submit at least one blind review before revealing');
    if (reviewerId && !reviews.some((r) => r.reviewer_id === reviewerId)) {
      throw new Error('no saved review for this reviewer on this case');
    }
    return {
      case_id: c.id,
      entries: this.blindEntries(run, c.id).map((e) => {
        const judgment = run.judgments[c.id][e.model.key];
        return {
          alias: e.alias,
          model_key: e.model.key,
          model_label: e.model.label,
          model: e.model.model,
          provider: e.model.providerId,
          judge_total: judgment.status === 'success' ? judgment.total_score : null,
          judge_status: judgment.status,
          human_reviews: reviews
            .filter((r) => r.model_key === e.model.key)
            .map((r) => ({ reviewer_id: r.reviewer_id, total_score: r.total_score })),
        };
      }),
    };
  }

  async analytics(runId, filter = {}) {
    const run = this.store.loadRun(runId);
    return {
      ...aggregateRun(run, filter),
      groups: availableGroups(run),
    };
  }

  async export(runId, format) {
    const run = this.store.loadRun(runId);
    return exportRun(run, format);
  }

  dispose() {
    for (const { controller } of this.active.values()) controller.abort();
    this.active.clear();
  }
}
