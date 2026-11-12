/**
 * EduEval Studio shared schemas and validation.
 *
 * These helpers are dependency-free so the Host bundle needs no build step and
 * the same rules can be exercised directly by the test suite.
 */

export const SCHEMA_VERSION = 1;
export const JUDGE_PROTOCOL_VERSION = 'edueval-judge-v0.1';
export const BENCHMARK_FORMAT_VERSION = '0.2.0';

export const DEFAULT_RUBRIC = [
  {
    criterion_id: 'content_accuracy',
    name: '学科内容准确性',
    weight: 25,
    full_score_requirements: '关键概念、事实、公式或操作结论准确，无实质性知识错误；能明确纠正题目点出的常见误区。',
  },
  {
    criterion_id: 'task_alignment',
    name: '任务对齐与认知路径',
    weight: 20,
    full_score_requirements: '完整回应题目的全部显性要求，目标、活动与评价之间形成一致、可追踪的认知路径。',
  },
  {
    criterion_id: 'feasibility',
    name: '实施可行性',
    weight: 20,
    full_score_requirements: '步骤、材料、时间与班级规模匹配，教师可直接按方案执行；关键环节包含可操作的记录或组织方式。',
  },
  {
    criterion_id: 'constraints',
    name: '约束遵循与安全',
    weight: 15,
    full_score_requirements: '严格遵守题目给出的课时、人数、材料与安全限制，不引入题设未提供的设备或高风险活动。',
  },
  {
    criterion_id: 'differentiation',
    name: '分层支持与参与',
    weight: 10,
    full_score_requirements: '提供基础与进阶两类可执行任务，并给需要支持的学生明确支架，而非只增加题量。',
  },
  {
    criterion_id: 'assessment',
    name: '形成性评价与反馈',
    weight: 10,
    full_score_requirements: '包含至少两个可观察的形成性评价点，反馈策略具体且能区分不同错误类型。',
  },
];

/**
 * Provider presets verified against the vendors' official OpenAI-compatible
 * documentation on 2026-11-11. The UI only pre-fills; every field stays
 * editable and the final model request records the exact Base URL / model ID.
 */
export const PROVIDER_PRESETS = [
  {
    id: 'glm',
    label: 'GLM',
    vendor: '智谱 AI (Zhipu)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.3',
    models: ['glm-5.3', 'glm-5.2', 'glm-4.7', 'glm-4.6', 'glm-4.7-flash'],
    apiKeyRef: 'EDUEVAL_GLM_API_KEY',
    docs: 'https://docs.bigmodel.cn/cn/guide/start/quick-start',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    vendor: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    apiKeyRef: 'EDUEVAL_DEEPSEEK_API_KEY',
    docs: 'https://api-docs.deepseek.com/quick_start/your_first_api_call',
  },
  {
    id: 'qwen',
    label: 'Qwen',
    vendor: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.8-max',
    models: ['qwen3.8-max', 'qwen-plus', 'qwen-max', 'qwen-turbo'],
    apiKeyRef: 'EDUEVAL_QWEN_API_KEY',
    docs: 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    vendor: 'Moonshot AI',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k3.1-pro',
    models: ['kimi-k3.1-pro', 'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'],
    apiKeyRef: 'EDUEVAL_KIMI_API_KEY',
    docs: 'https://platform.kimi.com/docs/api/chat',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    vendor: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4.1-mini'],
    apiKeyRef: 'EDUEVAL_OPENAI_API_KEY',
    docs: 'https://platform.openai.com/docs/models',
  },
  {
    id: 'custom',
    label: '自定义',
    vendor: 'Custom',
    baseUrl: 'https://api.example.com/v1',
    model: 'model-id',
    models: [],
    apiKeyRef: 'EDUEVAL_CUSTOM_API_KEY',
    docs: '',
  },
];

export function providerPreset(id) {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}

function providerFromPreset(slot, presetId) {
  const preset = providerPreset(presetId);
  return {
    id: slot,
    preset: preset.id,
    label: preset.label,
    vendor: preset.vendor,
    baseUrl: preset.baseUrl,
    model: preset.model,
    apiKeyRef: preset.apiKeyRef,
    temperature: 0.2,
    maxTokens: 0,
    timeoutMs: 300000,
  };
}

export const DEFAULT_PROVIDERS = [
  providerFromPreset('model-1', 'deepseek'),
  providerFromPreset('model-2', 'qwen'),
  providerFromPreset('model-3', 'glm'),
];

export const DEFAULT_JUDGE = {
  label: 'DeepSeek Judge',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  apiKeyRef: 'EDUEVAL_JUDGE_API_KEY',
  temperature: 0,
  maxTokens: 0,
  timeoutMs: 300000,
};

export const DEFAULT_CONFIG = {
  version: SCHEMA_VERSION,
  providers: DEFAULT_PROVIDERS,
  selectedModelIds: ['model-1', 'model-2', 'model-3'],
  judge: DEFAULT_JUDGE,
  settings: {
    concurrency: 3,
    retries: 2,
    requestTimeoutMs: 120000,
    mockMode: false,
  },
  benchmarkId: 'builtin-edueval-v0.2',
};

export const TASK_TYPES = ['lesson_plan', 'slide_outline'];
export const TASK_TYPE_LABELS = {
  lesson_plan: '教案生成',
  slide_outline: '课件大纲',
};

export const STAGES = ['小学', '初中', '高中'];
export const DIFFICULTIES = ['基础', '进阶', '挑战'];

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeCriterion(raw, index) {
  if (!isPlainObject(raw)) throw new Error(`rubric[${index}] must be an object`);
  const criterion_id = asString(raw.criterion_id ?? raw.id).trim();
  const name = asString(raw.name).trim();
  const weight = Number(raw.weight);
  const full_score_requirements = asString(
    raw.full_score_requirements ?? raw.fullScoreRequirements ?? raw.description,
  ).trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(criterion_id)) {
    throw new Error(`rubric[${index}] has an invalid criterion_id`);
  }
  if (!name) throw new Error(`rubric[${index}] requires a name`);
  if (!Number.isFinite(weight) || weight <= 0) throw new Error(`rubric[${index}] has an invalid weight`);
  if (!full_score_requirements) throw new Error(`rubric[${index}] requires full_score_requirements`);
  return {
    criterion_id,
    name,
    weight: Math.round(weight * 100) / 100,
    full_score_requirements,
    score_0: asString(raw.score_0).trim() || '未满足要求、与要求矛盾，或存在该项重大事实错误。',
    score_1: asString(raw.score_1).trim() || '部分满足要求，但存在实质遗漏，且无该项重大事实错误。',
    score_2: asString(raw.score_2).trim() || '满足该项列明的全部关键要求，且无明显事实错误。',
  };
}

export function normalizeCase(raw, index = 0) {
  if (!isPlainObject(raw)) throw new Error(`case[${index}] must be an object`);
  const id = asString(raw.id ?? raw.case_id).trim();
  if (!/^[A-Za-z0-9_.:-]{1,96}$/.test(id)) {
    throw new Error(`case[${index}] has an invalid id (use letters, digits, . : _ -)`);
  }
  const query = asString(raw.query).trim();
  if (!query) throw new Error(`case ${id} requires a query`);
  const rubricRaw = raw.rubric;
  if (!Array.isArray(rubricRaw) || rubricRaw.length === 0) throw new Error(`case ${id} requires a non-empty rubric`);
  if (rubricRaw.length > 20) throw new Error(`case ${id} has too many rubric criteria (max 20)`);
  const rubric = rubricRaw.map(normalizeCriterion);
  if (new Set(rubric.map((c) => c.criterion_id)).size !== rubric.length) {
    throw new Error(`case ${id} has duplicate criterion_id values`);
  }
  const sum = rubric.reduce((total, c) => total + c.weight, 0);
  if (Math.abs(sum - 100) > 0.01) throw new Error(`case ${id} rubric weights sum to ${sum}, not 100`);
  const criticalRaw = raw.critical_errors ?? raw.criticalErrors ?? [];
  if (!Array.isArray(criticalRaw)) throw new Error(`case ${id} critical_errors must be an array`);
  const critical_errors = criticalRaw.map((x) => asString(x).trim()).filter(Boolean);
  const tags = Array.isArray(raw.tags) ? raw.tags.map((x) => asString(x).trim()).filter(Boolean) : [];
  return {
    id,
    benchmark_version: asString(raw.benchmark_version, BENCHMARK_FORMAT_VERSION),
    task_type: asString(raw.task_type, 'lesson_plan'),
    stage: asString(raw.stage),
    grade: asString(raw.grade),
    subject: asString(raw.subject),
    topic: asString(raw.topic),
    difficulty: asString(raw.difficulty),
    tags,
    query,
    rubric,
    critical_errors,
  };
}

export function validateBenchmark(rawRows, meta = {}) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) throw new Error('benchmark must contain at least one case');
  if (rawRows.length > 500) throw new Error('benchmark exceeds the 500-case limit');
  const cases = rawRows.map(normalizeCase);
  const ids = new Set();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`duplicate case id ${c.id}`);
    ids.add(c.id);
  }
  return {
    id: asString(meta.id, 'custom-benchmark'),
    name: asString(meta.name, 'Custom benchmark'),
    version: asString(meta.version, BENCHMARK_FORMAT_VERSION),
    source: asString(meta.source, 'custom'),
    created_at: asString(meta.created_at, new Date().toISOString()),
    cases,
  };
}

export function cloneCase(c) {
  return JSON.parse(JSON.stringify(c));
}

export function buildDefaultCase(id, query = '') {
  return normalizeCase({
    id,
    benchmark_version: BENCHMARK_FORMAT_VERSION,
    task_type: 'lesson_plan',
    stage: '初中',
    grade: '',
    subject: '',
    topic: '',
    difficulty: '进阶',
    tags: [],
    query: query || '请描述你的评测问题。',
    rubric: cloneCase(DEFAULT_RUBRIC),
    critical_errors: [],
  });
}

/** Parse a JSONL benchmark document. Blank lines are ignored. */
export function parseJsonl(text, meta = {}) {
  const rows = [];
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      rows.push(JSON.parse(line));
    } catch (err) {
      throw new Error(`JSONL line ${i + 1} is not valid JSON: ${err.message}`);
    }
  });
  return validateBenchmark(rows, meta);
}

/**
 * Minimal RFC4180-ish CSV parser. Handles UTF-8 BOM, quoted cells, escaped
 * quotes, CRLF, and embedded newlines.
 */
export function parseCsv(text) {
  const source = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  if (rows.length < 2) throw new Error('CSV must contain a header row and at least one data row');
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((values, rowIndex) => {
    const record = {};
    headers.forEach((header, i) => {
      record[header] = values[i] ?? '';
    });
    return record;
  });
}

export function benchmarkFromCsv(text, meta = {}) {
  const records = parseCsv(text);
  const rows = records.map((r, i) => {
    const rubricText = r.rubric_json || r.rubric || r.rubricjson || '';
    let rubric;
    try {
      rubric = rubricText ? JSON.parse(rubricText) : cloneCase(DEFAULT_RUBRIC);
    } catch (err) {
      throw new Error(`CSV row ${i + 2}: rubric_json is not valid JSON: ${err.message}`);
    }
    let critical = [];
    const criticalText = r.critical_errors_json || r.critical_errors || '';
    if (criticalText) {
      try {
        const parsed = JSON.parse(criticalText);
        critical = Array.isArray(parsed) ? parsed : String(criticalText).split('|');
      } catch {
        critical = String(criticalText).split('|').map((x) => x.trim()).filter(Boolean);
      }
    }
    return {
      id: r.id || r.case_id || `CSV-${String(i + 1).padStart(3, '0')}`,
      benchmark_version: r.benchmark_version || BENCHMARK_FORMAT_VERSION,
      task_type: r.task_type || 'lesson_plan',
      stage: r.stage || '',
      grade: r.grade || '',
      subject: r.subject || '',
      topic: r.topic || '',
      difficulty: r.difficulty || '',
      tags: r.tags ? r.tags.split('|').map((x) => x.trim()).filter(Boolean) : [],
      query: r.query || '',
      rubric,
      critical_errors: critical,
    };
  });
  return validateBenchmark(rows, meta);
}

export function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows, columns) {
  const head = columns.map((c) => csvEscape(c.label ?? c.key)).join(',');
  const body = rows.map((row) => columns.map((c) => csvEscape(c.value ? c.value(row) : row[c.key])).join(','));
  return `${[head, ...body].join('\r\n')}\r\n`;
}

/** Weighted total: sum(weight * score / 2), 0..100, rounded to one decimal. */
export function calculateTotal(criteria, rubric) {
  const byId = new Map(rubric.map((c) => [c.criterion_id, c]));
  let total = 0;
  for (const item of criteria) {
    const criterion = byId.get(item.criterion_id);
    if (!criterion) throw new Error(`unknown criterion ${item.criterion_id}`);
    const score = Number(item.score);
    if (![0, 1, 2].includes(score)) throw new Error(`criterion ${item.criterion_id} has score ${item.score}`);
    total += criterion.weight * score / 2;
  }
  return Math.round(total * 10) / 10;
}

export function validateJudgment(parsed, caseSnapshot) {
  if (!isPlainObject(parsed)) throw new Error('judge output must be a JSON object');
  if (parsed.item_id !== caseSnapshot.id) throw new Error(`judge item_id ${parsed.item_id} does not match ${caseSnapshot.id}`);
  if (!Array.isArray(parsed.criteria)) throw new Error('judge output is missing criteria[]');
  const expected = caseSnapshot.rubric;
  if (parsed.criteria.length !== expected.length) {
    throw new Error(`judge returned ${parsed.criteria.length} criteria, expected ${expected.length}`);
  }
  const expectedIds = new Set(expected.map((c) => c.criterion_id));
  const seen = new Set();
  const criteria = parsed.criteria.map((item, i) => {
    if (!isPlainObject(item)) throw new Error(`judge criteria[${i}] is not an object`);
    const id = asString(item.criterion_id).trim();
    if (!expectedIds.has(id)) throw new Error(`judge returned unknown criterion ${id}`);
    if (seen.has(id)) throw new Error(`judge returned duplicate criterion ${id}`);
    seen.add(id);
    const score = Number(item.score);
    if (!Number.isInteger(score) || score < 0 || score > 2) {
      throw new Error(`judge criterion ${id} has invalid score ${item.score}`);
    }
    const evidence = asString(item.evidence).trim();
    const reason = asString(item.reason).trim();
    if (!evidence) throw new Error(`judge criterion ${id} is missing evidence`);
    if (!reason) throw new Error(`judge criterion ${id} is missing reason`);
    return { criterion_id: id, score, evidence, reason };
  });
  for (const id of expectedIds) if (!seen.has(id)) throw new Error(`judge omitted criterion ${id}`);
  if (!Array.isArray(parsed.critical_errors)) throw new Error('judge output is missing critical_errors[]');
  const expectedErrors = caseSnapshot.critical_errors;
  const got = new Map();
  for (const item of parsed.critical_errors) {
    if (!isPlainObject(item)) throw new Error('judge critical_errors item is not an object');
    const error = asString(item.error).trim();
    if (!error) throw new Error('judge critical_errors item has an empty error');
    if (got.has(error)) throw new Error(`judge returned duplicate critical error ${error}`);
    got.set(error, {
      error,
      found: item.found === true,
      evidence: asString(item.evidence).trim(),
    });
  }
  for (const error of expectedErrors) {
    if (!got.has(error)) throw new Error(`judge omitted critical error ${error}`);
  }
  for (const error of got.keys()) {
    if (!expectedErrors.includes(error)) throw new Error(`judge returned unknown critical error ${error}`);
  }
  const critical_errors = expectedErrors.map((error) => got.get(error));
  const total_score = calculateTotal(criteria, expected);
  return {
    item_id: caseSnapshot.id,
    criteria,
    critical_errors,
    notes: asString(parsed.notes).trim(),
    total_score,
    reported_total_score: typeof parsed.total_score === 'number' ? parsed.total_score : null,
  };
}

export function summarizeRun(run) {
  const models = run.models || [];
  const judgments = run.judgments || {};
  let judged = 0;
  let failedJudgments = 0;
  let responses = 0;
  let failedResponses = 0;
  for (const byModel of Object.values(judgments)) {
    for (const j of Object.values(byModel)) {
      if (j.status === 'success') judged += 1;
      else if (j.status === 'failed') failedJudgments += 1;
    }
  }
  for (const byModel of Object.values(run.responses || {})) {
    for (const r of Object.values(byModel)) {
      if (r.status === 'success') responses += 1;
      else if (r.status === 'failed') failedResponses += 1;
    }
  }
  return {
    id: run.id,
    created_at: run.created_at,
    updated_at: run.updated_at,
    status: run.status,
    mode: run.mode,
    benchmark_name: run.benchmark?.name,
    benchmark_version: run.benchmark?.version,
    case_count: run.cases?.length || 0,
    model_count: models.length,
    models: models.map((m) => ({ key: m.key, label: m.label, provider: m.providerId, model: m.model })),
    judge: run.judge?.model || '',
    mock: run.mode === 'mock' || run.mock === true,
    progress: run.progress,
    response_count: responses,
    response_failed: failedResponses,
    judged_count: judged,
    judge_failed: failedJudgments,
    human_review_count: Array.isArray(run.human_reviews) ? run.human_reviews.length : 0,
  };
}

export function scoreBand(score) {
  if (!Number.isFinite(score)) return 'na';
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'watch';
  return 'weak';
}

export const ALIASES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
