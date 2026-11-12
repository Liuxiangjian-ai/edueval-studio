import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  calculateTotal,
  normalizeCase,
  parseCsv,
  validateJudgment,
} from '../src/shared/schemas.js';
import { EduEvalEngine } from '../src/host/runner.js';
import { normalizeConfig } from '../src/host/storage.js';
import { loadBuiltinBenchmark } from '../src/host/benchmark.js';
import { registerApi } from '../src/host/api.js';
import { exportCsv, exportJson, exportMarkdown } from '../src/host/export.js';

const tmpRoots = [];
function tempDir(label) {
  const dir = path.join(os.tmpdir(), `edueval-test-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  tmpRoots.push(dir);
  return dir;
}

test.after(() => {
  for (const dir of tmpRoots) fs.rmSync(dir, { recursive: true, force: true });
});

function fakeCtx() {
  const services = new Map();
  return {
    get: (name) => services.get(name) || null,
    logger: { info() {}, warn() {} },
    services
  };
}

async function makeEngine() {
  return new EduEvalEngine(fakeCtx(), { dataDir: tempDir('engine') });
}

async function waitRun(engine, runId, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const run = await engine.getRun(runId);
    if (!['queued', 'generating', 'judging'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error('run did not settle');
}

test('built-in benchmark has 10 cases, six weighted criteria, and stable IDs', () => {
  const b = loadBuiltinBenchmark();
  assert.equal(b.cases.length, 10);
  assert.equal(b.cases.filter((c) => c.task_type === 'lesson_plan').length, 5);
  assert.equal(b.cases.filter((c) => c.task_type === 'slide_outline').length, 5);
  for (const c of b.cases) {
    assert.equal(c.rubric.length, 6);
    assert.equal(c.rubric.reduce((sum, r) => sum + r.weight, 0), 100);
    assert.ok(c.critical_errors.length >= 2);
  }
  assert.equal(new Set(b.cases.map((c) => c.id)).size, 10);
});

test('score calculation is weight * score / 2 and range checked', () => {
  const rubric = [
    { criterion_id: 'a', weight: 50 },
    { criterion_id: 'b', weight: 50 },
  ];
  assert.equal(calculateTotal([{ criterion_id: 'a', score: 2 }, { criterion_id: 'b', score: 1 }], rubric), 75);
  assert.equal(calculateTotal([{ criterion_id: 'a', score: 0 }, { criterion_id: 'b', score: 0 }], rubric), 0);
  assert.throws(() => calculateTotal([{ criterion_id: 'a', score: 3 }, { criterion_id: 'b', score: 1 }], rubric));
});

test('judge validation rejects missing criteria and out-of-range scores', () => {
  const c = normalizeCase({
    id: 'CASE-1',
    query: 'q',
    rubric: [
      { criterion_id: 'a', name: 'A', weight: 50, full_score_requirements: 'x' },
      { criterion_id: 'b', name: 'B', weight: 50, full_score_requirements: 'y' },
    ],
    critical_errors: ['bad'],
  });
  assert.throws(() => validateJudgment({
    item_id: 'CASE-1',
    criteria: [{ criterion_id: 'a', score: 2, evidence: 'e', reason: 'r' }],
    critical_errors: [{ error: 'bad', found: false }],
  }, c), /expected 2|omitted/);
  assert.throws(() => validateJudgment({
    item_id: 'CASE-1',
    criteria: [
      { criterion_id: 'a', score: 9, evidence: 'e', reason: 'r' },
      { criterion_id: 'b', score: 2, evidence: 'e', reason: 'r' },
    ],
    critical_errors: [{ error: 'bad', found: false }],
  }, c), /invalid score/);
});

test('CSV parser handles quoted cells and embedded commas', () => {
  const rows = parseCsv('id,query,rubric_json\r\nX-1,"hello, world","[{""a"":1}]"\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].query, 'hello, world');
  assert.equal(rows[0].rubric_json, '[{"a":1}]');
});

test('config normalization never persists a plaintext apiKey property', () => {
  const config = normalizeConfig({
    providers: [{
      id: 'custom', label: 'Custom', baseUrl: 'https://example.com/v1', model: 'm',
      apiKeyRef: 'EDUEVAL_CUSTOM_API_KEY', apiKey: 'sk-secret-should-not-survive'
    }],
    selectedModelIds: ['custom'],
    judge: { baseUrl: 'https://example.com/v1', model: 'j', apiKeyRef: 'EDUEVAL_JUDGE_API_KEY' },
    settings: { concurrency: 3, retries: 2 }
  });
  assert.equal(config.providers[0].apiKey, undefined);
  assert.equal(JSON.stringify(config).includes('sk-secret'), false);
  const uncapped = normalizeConfig({
    providers: [{
      id: 'custom', label: 'Custom', baseUrl: 'https://example.com/v1', model: 'm',
      apiKeyRef: 'EDUEVAL_CUSTOM_API_KEY', maxTokens: 200000
    }],
    selectedModelIds: ['custom'],
    judge: { baseUrl: 'https://example.com/v1', model: 'j', apiKeyRef: 'EDUEVAL_JUDGE_API_KEY', maxTokens: 0 }
  });
  assert.equal(uncapped.providers[0].maxTokens, 200000);
  assert.equal(uncapped.judge.maxTokens, 0);
  const glm = normalizeConfig({
    providers: [{
      id: 'model-3', preset: 'glm', label: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-5.3', apiKeyRef: 'EDUEVAL_GLM_API_KEY', timeoutMs: 120000
    }],
    selectedModelIds: ['model-3'],
    judge: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKeyRef: 'EDUEVAL_JUDGE_API_KEY' }
  });
  assert.equal(glm.providers[0].baseUrl, 'https://open.bigmodel.cn/api/paas/v4');
  assert.equal(glm.providers[0].timeoutMs, 300000);
});

test('mock full run persists, ranks on common sample, supports blind review and exports', async () => {
  const engine = await makeEngine();
  const b = loadBuiltinBenchmark();
  const cases = [b.cases[0], b.cases[1]];
  const run = await engine.createRun({
    workflow: 'full',
    cases,
    modelIds: ['model-1', 'model-2'],
    mockMode: true,
    benchmark: { id: b.id, name: b.name, version: b.version, source: b.source, hash: b.hash },
    concurrency: 2,
    retries: 0,
  });
  const final = await waitRun(engine, run.id);
  assert.equal(final.status, 'completed');
  assert.equal(final.progress.generation.success, 4);
  assert.equal(final.progress.judge.success, 4);
  assert.equal(final.mock, true);
  assert.equal(final.cases.length, 2);
  assert.equal(final.cases[0].rubric.length, 6);

  const analytics = await engine.analytics(run.id);
  assert.equal(analytics.common_case_count, 2);
  assert.equal(analytics.judged_total, 4);
  assert.equal(analytics.leaderboard.length, 2);
  assert.equal(analytics.leaderboard.every((m) => m.coverage === 100), true);
  assert.ok(analytics.leaderboard.every((m) => m.rank >= 1));

  const blind = await engine.getBlind(run.id, cases[0].id);
  assert.equal(blind.candidates.length, 2);
  assert.equal(blind.candidates[0].alias, 'A');
  assert.equal('model' in blind.candidates[0], false);
  assert.equal(JSON.stringify(blind).includes('deepseek'), false);

  const alias = blind.candidates[0].alias;
  const criteria = cases[0].rubric.map((r) => ({ criterion_id: r.criterion_id, score: 2 }));
  const saved = await engine.saveHumanReview({
    runId: run.id, caseId: cases[0].id, reviewerId: 'reviewer-1', alias, criteria, comments: 'ok'
  });
  assert.equal(saved.total_score, 100);
  const updated = await engine.getBlind(run.id, cases[0].id);
  assert.equal(updated.existing_reviews.length, 1);
  assert.equal('model_key' in updated.existing_reviews[0], false);
  const reveal = await engine.revealBlind(run.id, cases[0].id, 'reviewer-1');
  assert.equal(reveal.entries.length, 2);
  assert.ok(reveal.entries.every((entry) => entry.model_label));

  const afterHuman = await engine.analytics(run.id);
  assert.equal(afterHuman.human.review_count, 1);
  assert.ok(afterHuman.human.mae !== null);

  for (const [format, needle] of [['csv', 'case_id'], ['json', 'edueval-run-export-v1'], ['markdown', '# EduEval Studio']]) {
    const artifact = await engine.export(run.id, format);
    assert.ok(artifact.body.includes(needle));
    assert.equal(artifact.body.includes('sk-'), false);
  }
  const csv = exportCsv(final);
  assert.equal(csv.body.split('\r\n').filter(Boolean).length, 5);
  const json = exportJson(final);
  assert.equal(json.body.includes('"apiKey"'), false);
  const md = exportMarkdown(final);
  assert.ok(md.body.includes('MOCK RUN'));
});

test('live run preflight blocks missing keys with an actionable code', async () => {
  const engine = await makeEngine();
  const b = loadBuiltinBenchmark();
  let error;
  try {
    await engine.createRun({
      workflow: 'generation',
      cases: [b.cases[0]],
      modelIds: ['model-1'],
      mockMode: false,
    });
  } catch (err) {
    error = err;
  }
  assert.ok(error);
  assert.equal(error.code, 'MISSING_KEYS');
  assert.ok(error.message.includes('EDUEVAL_DEEPSEEK_API_KEY'));
});

test('credential writer refuses non-EDUEVAL references', async () => {
  const engine = await makeEngine();
  await assert.rejects(() => engine.setKey({ ref: 'DEEPSEEK_API_KEY', key: 'secret-value' }), /prefixed with EDUEVAL_/);
  await engine.setKey({ ref: 'EDUEVAL_OPENAI_API_KEY', key: 'secret-value', remember: false });
  assert.equal(await engine.resolveKey('EDUEVAL_OPENAI_API_KEY'), 'secret-value');
});

test('persisted run survives a new engine instance', async () => {
  const engine = await makeEngine();
  const b = loadBuiltinBenchmark();
  const run = await engine.createRun({
    workflow: 'generation', cases: [b.cases[0]], modelIds: ['model-1'], mockMode: true
  });
  await waitRun(engine, run.id);
  const second = new EduEvalEngine(fakeCtx(), { dataDir: engine.store.dataDir });
  const restored = await second.getRun(run.id);
  assert.equal(restored.status, 'completed');
  assert.equal(restored.responses[b.cases[0].id]['model-1/deepseek-flash'].status, 'success');
});

test('cancelled run can resume missing tasks without duplicating successes', async () => {
  const engine = await makeEngine();
  const b = loadBuiltinBenchmark();
  const run = await engine.createRun({
    workflow: 'generation',
    cases: b.cases.slice(0, 5),
    modelIds: ['model-1'],
    mockMode: true,
    concurrency: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  await engine.cancelRun(run.id);
  let cancelled;
  for (let i = 0; i < 100; i += 1) {
    cancelled = await engine.getRun(run.id);
    if (!['queued', 'generating', 'judging'].includes(cancelled.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.equal(cancelled.status, 'cancelled');
  await engine.resumeRun(run.id, { retryFailed: false });
  const final = await waitRun(engine, run.id);
  assert.equal(final.status, 'completed');
  assert.equal(final.progress.generation.success, 5);
  assert.equal(Object.values(final.responses).flatMap((byModel) => Object.values(byModel)).filter((r) => r.status === 'success').length, 5);
});

test('API routes register and serve bootstrap without exposing keys', async () => {
  const engine = await makeEngine();
  const routes = new Map();
  const ctx = {
    connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } } },
    get: () => null,
    logger: { info() {}, warn() {} }
  };
  registerApi(ctx, engine);
  assert.ok(routes.has('/api/edueval/bootstrap'));
  const response = await routes.get('/api/edueval/bootstrap').fetch(new Request('http://127.0.0.1/api/edueval/bootstrap'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.benchmark.cases.length, 10);
  assert.equal(JSON.stringify(body).includes('session-memory'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body.config.providers[0], 'apiKey'), false);
});
