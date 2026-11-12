import { TASK_TYPE_LABELS } from '../shared/schemas.js';
import { aggregateRun } from './analytics.js';
import { csvSafe } from './util.js';

function modelRows(run) {
  const rows = [];
  const models = Array.isArray(run.models) ? run.models : [];
  for (const c of run.cases || []) {
    for (const m of models) {
      const response = run.responses?.[c.id]?.[m.key];
      const judgment = run.judgments?.[c.id]?.[m.key];
      rows.push({ case: c, model: m, response, judgment });
    }
  }
  return rows;
}

function criterionIds(run) {
  const ids = new Set();
  for (const c of run.cases || []) for (const r of c.rubric || []) ids.add(r.criterion_id);
  const preferred = ['knowledge', 'pedagogy', 'activity', 'constraints', 'differentiation', 'assessment'];
  return [...ids].sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });
}

export function exportCsv(run) {
  const ids = criterionIds(run);
  const common = new Set(aggregateRun(run).common_case_ids);
  const header = [
    'run_id',
    'case_id',
    'task_type',
    'stage',
    'grade',
    'subject',
    'difficulty',
    'model_key',
    'model_label',
    'provider',
    'model_id',
    'generation_status',
    'judge_status',
    'total_score',
    ...ids.map((id) => `score_${id}`),
    'critical_errors_found',
    'critical_errors_json',
    'common_sample',
    'generation_error',
    'judge_error',
  ];
  const lines = [header.map(csvSafe).join(',')];
  for (const { case: c, model: m, response, judgment } of modelRows(run)) {
    const scoreById = new Map((judgment?.criteria || []).map((x) => [x.criterion_id, x.score]));
    const found = (judgment?.critical_errors || []).filter((e) => e.found);
    lines.push(
      [
        run.id,
        c.id,
        c.task_type,
        c.stage,
        c.grade,
        c.subject,
        c.difficulty,
        m.key,
        m.label || m.key,
        m.providerId,
        m.model,
        response?.status || 'missing',
        judgment?.status || 'not_judged',
        judgment?.status === 'success' ? judgment.total_score : '',
        ...ids.map((id) => (scoreById.has(id) ? scoreById.get(id) : '')),
        found.length,
        JSON.stringify(found),
        common.has(c.id) ? 'true' : 'false',
        response?.error || '',
        judgment?.error || '',
      ]
        .map(csvSafe)
        .join(','),
    );
  }
  return {
    body: `\uFEFF${lines.join('\r\n')}\r\n`,
    contentType: 'text/csv; charset=utf-8',
    filename: `${run.id}-edueval.csv`,
  };
}

export function exportJson(run) {
  const payload = {
    schema: 'edueval-run-export-v1',
    exported_at: new Date().toISOString(),
    notice: run.mode === 'mock' || run.mock ? 'MOCK RUN: scores are deterministic placeholders, not real model evaluation results.' : undefined,
    run,
  };
  return {
    body: `${JSON.stringify(payload, null, 2)}\n`,
    contentType: 'application/json; charset=utf-8',
    filename: `${run.id}-edueval.json`,
  };
}

function fmt(value) {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : String(value);
}

export function exportMarkdown(run) {
  const agg = aggregateRun(run);
  const lines = [];
  lines.push(`# EduEval Studio — ${run.benchmark?.name || 'Evaluation'} report`);
  lines.push('');
  if (run.mode === 'mock' || run.mock) {
    lines.push('> **MOCK RUN — NOT A REAL MODEL EVALUATION.** Scores below are deterministic placeholders generated to verify the workflow.');
    lines.push('');
  }
  lines.push(`- **Run ID**: \`${run.id}\``);
  lines.push(`- **Created**: ${run.created_at}`);
  lines.push(`- **Status**: ${run.status}`);
  lines.push(`- **Benchmark**: ${run.benchmark?.name || '—'} (${run.benchmark?.version || '—'})`);
  lines.push(`- **Benchmark hash**: \`${run.benchmark?.hash || '—'}\``);
  lines.push(`- **Cases**: ${run.cases.length}`);
  lines.push(`- **Models**: ${run.models.map((m) => m.label || m.key).join(', ')}`);
  lines.push(`- **Judge**: ${run.judge?.label || '—'} / ${run.judge?.model || '—'}`);
  lines.push(`- **Judge protocol**: ${run.judge?.protocol_version || '—'}`);
  lines.push(`- **Concurrency / retries**: ${run.settings?.concurrency} / ${run.settings?.retries}`);
  lines.push(`- **Common judged cases**: ${agg.common_case_count}`);
  lines.push('');
  lines.push('## Leaderboard');
  lines.push('');
  lines.push('Ranking uses the common sample where every selected model has a successful judgment. Coverage is shown separately; failures are never counted as zero.');
  lines.push('');
  lines.push('| Rank | Model | Common avg | Overall avg | Judged | Coverage | Critical-error cases |');
  lines.push('|---:|---|---:|---:|---:|---:|---:|');
  for (const m of [...agg.leaderboard].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || (b.avg_score ?? -1) - (a.avg_score ?? -1))) {
    lines.push(
      `| ${m.rank ?? '—'} | ${m.label} | ${fmt(m.common_avg_score)} | ${fmt(m.avg_score)} | ${m.judged}/${agg.case_count} | ${fmt(m.coverage)}% | ${m.critical_error_cases} |`,
    );
  }
  lines.push('');
  lines.push('## Dimension scores');
  lines.push('');
  const ids = criterionIds(run);
  const labels = new Map();
  for (const c of run.cases) for (const r of c.rubric) labels.set(r.criterion_id, r.name);
  lines.push(`| Dimension | ${agg.leaderboard.map((m) => m.label).join(' | ')} |`);
  lines.push(`|---|${agg.leaderboard.map(() => '---:').join('|')}|`);
  for (const id of ids) {
    lines.push(`| ${labels.get(id) || id} | ${agg.leaderboard.map((m) => fmt(m.dimensions[id]?.percent)).join(' | ')} |`);
  }
  lines.push('');
  lines.push('Scores in this table are normalized to 0–100 (raw criterion average ÷ 2 × 100).');
  lines.push('');
  lines.push('## Lowest-scoring cases');
  lines.push('');
  lines.push('| Case | Topic | Mean score | Judged models |');
  lines.push('|---|---|---:|---:|');
  for (const c of agg.lowest_cases) lines.push(`| ${c.case_id} | ${c.topic || '—'} | ${c.average} | ${c.count} |`);
  if (agg.lowest_cases.length === 0) lines.push('| — | — | — | — |');
  lines.push('');
  lines.push('## Human vs LLM Judge');
  lines.push('');
  lines.push(`- Reviews: ${agg.human.review_count}`);
  lines.push(`- Compared: ${agg.human.compared_count}`);
  lines.push(`- Mean absolute difference: ${fmt(agg.human.mae)}`);
  lines.push(`- Criterion exact agreement: ${fmt(agg.human.exact_agreement)}%`);
  lines.push(`- Spearman correlation: ${fmt(agg.human.spearman)}${agg.human.spearman === null ? ' (needs ≥ 5 paired reviews)' : ''}`);
  lines.push('');
  if (agg.human.rows.length) {
    lines.push('| Reviewer | Case | Model | Human | Judge | Delta |');
    lines.push('|---|---|---|---:|---:|---:|');
    for (const row of agg.human.rows.slice(0, 40)) {
      lines.push(`| ${row.reviewer_id} | ${row.case_id} | ${row.model_label} | ${row.human_total} | ${row.judge_total} | ${row.delta} |`);
    }
    lines.push('');
  }
  lines.push('## Failures and critical errors');
  lines.push('');
  if (agg.failures.length === 0) lines.push('No generation, judge, or critical-error failures were recorded.');
  else {
    lines.push('| Kind | Case | Model | Detail |');
    lines.push('|---|---|---|---|');
    for (const f of agg.failures.slice(0, 100)) {
      lines.push(
        `| ${f.kind} | ${f.case_id} | ${f.model_label} | ${String(f.error || f.evidence || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 240)} |`,
      );
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Generated by EduEval Studio (DSH plugin).');
  return {
    body: `${lines.join('\n')}\n`,
    contentType: 'text/markdown; charset=utf-8',
    filename: `${run.id}-edueval.md`,
  };
}

export function exportRun(run, format) {
  if (format === 'json') return exportJson(run);
  if (format === 'md' || format === 'markdown') return exportMarkdown(run);
  if (format === 'csv') return exportCsv(run);
  throw new Error('format must be csv, json or markdown');
}

export function taskTypeLabel(value) {
  return TASK_TYPE_LABELS[value] || value;
}
