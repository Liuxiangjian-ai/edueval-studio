import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EduEvalEngine } from '../src/host/runner.js';
import { loadBuiltinBenchmark } from '../src/host/benchmark.js';
import { chatCompletion } from '../src/host/llm.js';

function tempDir() {
  const dir = path.join(os.tmpdir(), `edueval-live-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeServer() {
  let invalidJudge = false;
  const bodies = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (req.url !== '/v1/chat/completions') {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const body = JSON.parse(raw);
    bodies.push(body);
    const system = body.messages[0]?.content || '';
    const user = body.messages[1]?.content || body.messages[0]?.content || '';
    if (invalidJudge) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"item_id":"wrong"}', role: 'assistant' }, finish_reason: 'stop' }] }));
      return;
    }
    if (system.includes('资深教育内容评估员')) {
      const start = user.indexOf('TASK_JSON:') + 'TASK_JSON:'.length;
      const end = user.indexOf('\n\nCANDIDATE_RESPONSE:');
      const task = JSON.parse(user.slice(start, end).trim());
      const payload = {
        item_id: task.id,
        criteria: task.rubric.map((c) => ({
          criterion_id: c.criterion_id,
          score: 2,
          evidence: 'local stub evidence',
          reason: 'local stub full score',
        })),
        critical_errors: task.critical_errors.map((error) => ({ error, found: false, evidence: '' })),
        notes: 'local integration stub',
        total_score: 0,
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        model: 'stub-judge',
        choices: [{ message: { content: JSON.stringify(payload), role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      model: body.model,
      choices: [{ message: { content: 'LOCAL INTEGRATION RESPONSE', role: 'assistant' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        server,
        bodies,
        setInvalidJudge: (v) => { invalidJudge = v; },
      });
    });
  });
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

test('live OpenAI-compatible path reaches a local HTTP endpoint and validates Judge output', async () => {
  const stub = await makeServer();
  try {
    const engine = new EduEvalEngine({ get: () => null, logger: { info() {}, warn() {} } }, { dataDir: tempDir() });
    const config = engine.store.getConfig();
    config.providers = [{
      id: 'local', label: 'Local Stub', vendor: 'Local', baseUrl: stub.baseUrl,
      model: 'stub-model', apiKeyRef: 'EDUEVAL_LOCAL_API_KEY', temperature: 0.2, maxTokens: 0, timeoutMs: 10000
    }];
    config.selectedModelIds = ['local'];
    config.judge = {
      label: 'Local Judge', baseUrl: stub.baseUrl, model: 'stub-judge', apiKeyRef: 'EDUEVAL_JUDGE_API_KEY',
      temperature: 0, maxTokens: 0, timeoutMs: 10000
    };
    config.settings.retries = 1;
    engine.store.saveConfig(config);
    await engine.setKey({ ref: 'EDUEVAL_LOCAL_API_KEY', key: 'test-key' });
    await engine.setKey({ ref: 'EDUEVAL_JUDGE_API_KEY', key: 'test-key' });
    const b = loadBuiltinBenchmark();
    const run = await engine.createRun({
      workflow: 'full', cases: [b.cases[0]], modelIds: ['local'], mockMode: false, retries: 1,
    });
    const final = await waitRun(engine, run.id);
    assert.equal(final.status, 'completed');
    assert.equal(final.mode, 'live');
    const response = final.responses[b.cases[0].id]['local/stub-model'];
    assert.equal(response.status, 'success');
    assert.equal(response.text, 'LOCAL INTEGRATION RESPONSE');
    const judgment = final.judgments[b.cases[0].id]['local/stub-model'];
    assert.equal(judgment.status, 'success');
    assert.equal(judgment.total_score, 100);
    assert.ok(stub.bodies.length >= 2);
    assert.equal(stub.bodies.every((body) => !Object.prototype.hasOwnProperty.call(body, 'max_tokens')), true);

    const connection = await engine.testConnection({ kind: 'model', providerId: 'local', mockMode: false });
    assert.equal(connection.ok, true);
    assert.equal(connection.text, 'LOCAL INTEGRATION RESPONSE');
    assert.equal(Object.prototype.hasOwnProperty.call(stub.bodies.at(-1), 'max_tokens'), false);

    // Explicit output limits have no upper cap and are passed through.
    await chatCompletion({
      baseUrl: stub.baseUrl, apiKey: 'test-key', model: 'stub-model',
      messages: [{ role: 'system', content: 'stub' }, { role: 'user', content: 'unbounded test' }], maxTokens: 200000, timeoutMs: 10000,
    });
    assert.equal(stub.bodies.at(-1).max_tokens, 200000);

    // Invalid Judge JSON is a failure with no fabricated zero score.
    stub.setInvalidJudge(true);
    const run2 = await engine.createRun({
      workflow: 'full', cases: [b.cases[1]], modelIds: ['local'], mockMode: false, retries: 0,
    });
    const final2 = await waitRun(engine, run2.id);
    assert.equal(final2.status, 'completed_with_errors');
    const judgment2 = final2.judgments[b.cases[1].id]['local/stub-model'];
    assert.equal(judgment2.status, 'failed');
    assert.equal(judgment2.total_score, null);
    assert.match(judgment2.error, /judge output failed validation|item_id/);
    assert.ok(judgment2.raw_output.includes('wrong'));
  } finally {
    stub.server.close();
  }
});
