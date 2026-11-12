import { benchmarkHash, importBenchmarkText, slugifyBenchmarkId } from './benchmark.js';
import { errorText } from './util.js';

const NS = '/api/edueval';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function fail(err) {
  const status = err?.code === 'MISSING_KEYS' ? 409 : err?.statusCode || 400;
  return json(
    {
      ok: false,
      error: errorText(err),
      code: err?.code || 'BAD_REQUEST',
      missing: err?.missing,
    },
    status,
  );
}

async function body(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('request body must be valid JSON');
  }
}

function query(request) {
  return new URL(request.url).searchParams;
}

function requireParam(params, key) {
  const value = params.get(key);
  if (!value) throw new Error(`missing query parameter ${key}`);
  return value;
}

function route(ctx, path, methods, handler) {
  const dispose = ctx.connection.fetch.register({
    path: `${NS}${path}`,
    methods,
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        return await handler(request);
      } catch (err) {
        return fail(err);
      }
    },
  });
  return typeof dispose === 'function' ? dispose : () => {};
}

export function registerApi(ctx, engine) {
  const disposers = [];
  const add = (path, methods, handler) => disposers.push(route(ctx, path, methods, handler));

  add('/health', ['GET'], async () => json({ ok: true, plugin: 'dsh-plugin-edueval', version: '1.0.0' }));

  add('/bootstrap', ['GET'], async () => json(await engine.bootstrap()));

  add('/benchmark', ['GET'], async (request) => {
    const id = requireParam(query(request), 'id');
    const benchmark = await engine.getBenchmark(id);
    return json({ benchmark: { ...benchmark, hash: benchmark.hash } });
  });

  add('/benchmark/import', ['POST'], async (request) => {
    const payload = await body(request);
    const benchmark = engine.store.saveBenchmark(
      importBenchmarkText({
        format: payload.format,
        content: payload.content,
        name: payload.name,
        id: payload.id,
      }),
    );
    return json({ ok: true, benchmark: { ...benchmark, hash: benchmarkHash(benchmark) } });
  });

  add('/benchmark/save', ['POST'], async (request) => {
    const payload = await body(request);
    const saved = engine.store.saveBenchmark({
      id: payload.id || slugifyBenchmarkId(payload.name || 'custom'),
      name: payload.name || 'Custom benchmark',
      version: payload.version || '0.1.0',
      source: 'custom',
      cases: payload.cases,
    });
    return json({ ok: true, benchmark: { ...saved, hash: benchmarkHash(saved) } });
  });

  add('/config', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, ...(await engine.saveConfig(payload)) });
  });

  add('/keys', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, ...(await engine.setKey(payload)) });
  });

  add('/keys/clear', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, ...(await engine.clearKey(payload.ref)) });
  });

  add('/keys/status', ['GET'], async () => json({ ok: true, keys: await engine.keyInfos() }));

  add('/runs', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, run: await engine.createRun(payload) });
  });

  add('/run', ['GET'], async (request) => {
    const runId = requireParam(query(request), 'run_id');
    return json({ ok: true, run: await engine.getRun(runId) });
  });

  add('/history', ['GET'], async (request) => {
    const limit = Number(query(request).get('limit') || 30);
    return json({ ok: true, runs: engine.store.listRuns(limit) });
  });

  add('/cancel', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, run: await engine.cancelRun(payload.runId) });
  });

  add('/resume', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, run: await engine.resumeRun(payload.runId, { retryFailed: payload.retryFailed === true }) });
  });

  add('/evaluate', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, run: await engine.evaluateRun(payload.runId, payload) });
  });

  add('/run/delete', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, ...(await engine.deleteRun(payload.runId)) });
  });

  add('/test', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, ...(await engine.testConnection(payload)) });
  });

  add('/analytics', ['GET'], async (request) => {
    const params = query(request);
    const runId = requireParam(params, 'run_id');
    const filter = {};
    for (const key of ['stage', 'subject', 'difficulty', 'task_type', 'caseId']) {
      const value = params.get(key);
      if (value) filter[key] = value;
    }
    return json({ ok: true, analytics: await engine.analytics(runId, filter) });
  });

  add('/blind', ['GET'], async (request) => {
    const params = query(request);
    const runId = requireParam(params, 'run_id');
    const caseId = requireParam(params, 'case_id');
    return json({ ok: true, blind: await engine.getBlind(runId, caseId) });
  });

  add('/blind/review', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, ...(await engine.saveHumanReview(payload)) });
  });

  add('/blind/reveal', ['POST'], async (request) => {
    const payload = await body(request);
    return json({ ok: true, reveal: await engine.revealBlind(payload.runId, payload.caseId, payload.reviewerId) });
  });

  add('/export', ['GET'], async (request) => {
    const params = query(request);
    const runId = requireParam(params, 'run_id');
    const format = (params.get('format') || 'json').toLowerCase();
    const artifact = await engine.export(runId, format);
    return new Response(artifact.body, {
      status: 200,
      headers: {
        'content-type': artifact.contentType,
        'content-disposition': `attachment; filename="${artifact.filename}"`,
        'cache-control': 'no-store',
      },
    });
  });

  return disposers;
}
