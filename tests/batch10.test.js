import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EduEvalEngine } from '../src/host/runner.js';
import { loadBuiltinBenchmark } from '../src/host/benchmark.js';

test('10 queries × 3 models produces and scores 30 responses on the common sample', async () => {
  const dir = path.join(os.tmpdir(), `edueval-batch10-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const engine = new EduEvalEngine({ get: () => null, logger: { info() {}, warn() {} } }, { dataDir: dir });
    const b = loadBuiltinBenchmark();
    const run = await engine.createRun({
      workflow: 'full',
      cases: b.cases,
      modelIds: ['model-1', 'model-2', 'model-3'],
      mockMode: true,
      concurrency: 4,
      retries: 0,
    });
    let final;
    const started = Date.now();
    while (Date.now() - started < 30000) {
      final = await engine.getRun(run.id);
      if (!['queued', 'generating', 'judging'].includes(final.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(final.status, 'completed');
    assert.equal(final.progress.generation.success, 30);
    assert.equal(final.progress.judge.success, 30);
    assert.equal(final.progress.generation.failed, 0);
    assert.equal(final.progress.judge.failed, 0);
    const analytics = await engine.analytics(run.id);
    assert.equal(analytics.common_case_count, 10);
    assert.equal(analytics.judged_total, 30);
    assert.equal(analytics.leaderboard.length, 3);
    assert.ok(analytics.leaderboard.every((m) => m.coverage === 100 && m.rank >= 1));
    const csv = await engine.export(run.id, 'csv');
    assert.equal(csv.body.split('\r\n').filter(Boolean).length, 31);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
