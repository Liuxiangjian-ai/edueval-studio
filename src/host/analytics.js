import { average, round } from './util.js';

function judgmentFor(run, caseId, modelKey) {
  return run.judgments?.[caseId]?.[modelKey];
}

function responseFor(run, caseId, modelKey) {
  return run.responses?.[caseId]?.[modelKey];
}

function modelLabel(model) {
  return model.label || `${model.provider || model.providerId}/${model.model}`;
}

function filteredCases(run, filter = {}) {
  const cases = Array.isArray(run.cases) ? run.cases : [];
  return cases.filter((c) => {
    if (filter.stage && c.stage !== filter.stage) return false;
    if (filter.subject && c.subject !== filter.subject) return false;
    if (filter.difficulty && c.difficulty !== filter.difficulty) return false;
    if (filter.task_type && c.task_type !== filter.task_type) return false;
    if (filter.caseId && c.id !== filter.caseId) return false;
    return true;
  });
}

function rankValues(values) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j += 1;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[sorted[k].index] = rank;
    i = j + 1;
  }
  return ranks;
}

export function spearman(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length || xs.length < 3) return null;
  if (xs.some((x) => !Number.isFinite(x)) || ys.some((y) => !Number.isFinite(y))) return null;
  const rx = rankValues(xs);
  const ry = rankValues(ys);
  const n = xs.length;
  const d2 = rx.reduce((sum, r, i) => sum + (r - ry[i]) ** 2, 0);
  const rho = 1 - (6 * d2) / (n * (n * n - 1));
  return Math.max(-1, Math.min(1, rho));
}

export function buildHumanStats(run) {
  const reviews = Array.isArray(run.human_reviews) ? run.human_reviews : [];
  const rows = [];
  let criterionMatches = 0;
  let criterionTotal = 0;
  const humanTotals = [];
  const judgeTotals = [];
  for (const review of reviews) {
    const judgment = judgmentFor(run, review.case_id, review.model_key);
    if (!judgment || judgment.status !== 'success') continue;
    const judgeById = new Map((judgment.criteria || []).map((c) => [c.criterion_id, c.score]));
    let matches = 0;
    let compared = 0;
    for (const item of review.criteria || []) {
      if (!judgeById.has(item.criterion_id)) continue;
      compared += 1;
      if (judgeById.get(item.criterion_id) === item.score) matches += 1;
    }
    criterionMatches += matches;
    criterionTotal += compared;
    const judgeTotal = judgment.total_score;
    const humanTotal = review.total_score;
    humanTotals.push(humanTotal);
    judgeTotals.push(judgeTotal);
    rows.push({
      review_id: review.id,
      case_id: review.case_id,
      model_key: review.model_key,
      model_label: review.alias ? `Candidate ${review.alias}` : review.model_label || review.model_key,
      reviewer_id: review.reviewer_id,
      human_total: humanTotal,
      judge_total: round(judgeTotal, 1),
      delta: round(humanTotal - judgeTotal, 1),
      criterion_matches: matches,
      criterion_compared: compared,
      comments: review.comments || '',
      created_at: review.created_at,
    });
  }
  const deltas = rows.map((r) => r.delta);
  const mae = average(deltas.map((d) => Math.abs(d)));
  return {
    review_count: reviews.length,
    compared_count: rows.length,
    mae: mae === null ? null : round(mae, 2),
    exact_agreement: criterionTotal ? round((criterionMatches / criterionTotal) * 100, 1) : null,
    criterion_matches: criterionMatches,
    criterion_total: criterionTotal,
    spearman: rows.length >= 5 ? round(spearman(humanTotals, judgeTotals), 3) : null,
    rows: rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
  };
}

/**
 * Compute a leaderboard over the run, optionally restricted to metadata
 * filters. Ranking uses the common subset where every selected model has a
 * successful judgment; failure is never treated as a real zero.
 */
export function aggregateRun(run, filter = {}) {
  const cases = filteredCases(run, filter);
  const models = Array.isArray(run.models) ? run.models : [];
  const expected = cases.length * models.length;
  const byModel = [];
  const caseAverages = [];
  for (const c of cases) {
    const values = [];
    for (const m of models) {
      const j = judgmentFor(run, c.id, m.key);
      if (j?.status === 'success') values.push(j.total_score);
    }
    if (values.length) {
      caseAverages.push({
        case_id: c.id,
        topic: c.topic,
        average: round(average(values), 1),
        count: values.length,
      });
    }
  }
  const commonCaseIds = cases
    .filter((c) => models.every((m) => judgmentFor(run, c.id, m.key)?.status === 'success'))
    .map((c) => c.id);
  const commonSet = new Set(commonCaseIds);

  for (const model of models) {
    const allScores = [];
    const commonScores = [];
    let judged = 0;
    let judgeFailed = 0;
    let responses = 0;
    let responseFailed = 0;
    let criticalCount = 0;
    const criterionTotals = new Map();
    for (const c of cases) {
      const r = responseFor(run, c.id, model.key);
      if (r?.status === 'success') responses += 1;
      else if (r?.status === 'failed') responseFailed += 1;
      const j = judgmentFor(run, c.id, model.key);
      if (j?.status === 'success') {
        judged += 1;
        allScores.push(j.total_score);
        if (commonSet.has(c.id)) commonScores.push(j.total_score);
        for (const item of j.criteria || []) {
          const row = criterionTotals.get(item.criterion_id) || { sum: 0, count: 0 };
          row.sum += item.score;
          row.count += 1;
          criterionTotals.set(item.criterion_id, row);
        }
        if ((j.critical_errors || []).some((e) => e.found)) criticalCount += 1;
      } else if (j?.status === 'failed') {
        judgeFailed += 1;
      }
    }
    const dimensions = {};
    for (const [id, row] of criterionTotals) {
      const avg = row.sum / row.count;
      dimensions[id] = { average: round(avg, 2), percent: round((avg / 2) * 100, 1), count: row.count };
    }
    byModel.push({
      key: model.key,
      label: modelLabel(model),
      provider: model.providerId,
      model: model.model,
      judged,
      judge_failed: judgeFailed,
      responses,
      response_failed: responseFailed,
      coverage: cases.length ? round((judged / cases.length) * 100, 1) : 0,
      response_coverage: cases.length ? round((responses / cases.length) * 100, 1) : 0,
      common_judged: commonScores.length,
      avg_score: allScores.length ? round(average(allScores), 1) : null,
      common_avg_score: commonScores.length ? round(average(commonScores), 1) : null,
      critical_error_cases: criticalCount,
      dimensions,
      rank: null,
    });
  }
  const rankable = byModel.filter((m) => m.common_avg_score !== null);
  rankable.sort((a, b) => {
    if (b.common_avg_score !== a.common_avg_score) return b.common_avg_score - a.common_avg_score;
    return (b.avg_score ?? -1) - (a.avg_score ?? -1);
  });
  rankable.forEach((m, index) => {
    m.rank = index + 1;
  });

  const failures = [];
  for (const c of cases) {
    for (const m of models) {
      const r = responseFor(run, c.id, m.key);
      if (r?.status === 'failed') {
        failures.push({
          kind: 'generation',
          case_id: c.id,
          model_key: m.key,
          model_label: modelLabel(m),
          error: r.error,
          at: r.finished_at,
        });
      }
      const j = judgmentFor(run, c.id, m.key);
      if (j?.status === 'failed') {
        failures.push({
          kind: 'judge',
          case_id: c.id,
          model_key: m.key,
          model_label: modelLabel(m),
          error: j.error,
          at: j.finished_at,
        });
      }
      if (j?.status === 'success') {
        for (const e of j.critical_errors || []) {
          if (e.found) {
            failures.push({
              kind: 'critical_error',
              case_id: c.id,
              model_key: m.key,
              model_label: modelLabel(m),
              error: e.error,
              evidence: e.evidence,
              at: j.finished_at,
            });
          }
        }
      }
    }
  }
  const lowest = [...caseAverages].sort((a, b) => a.average - b.average).slice(0, 8);

  return {
    run_id: run.id,
    status: run.status,
    mode: run.mode,
    mock: run.mode === 'mock' || run.mock === true,
    filter,
    case_count: cases.length,
    model_count: models.length,
    expected,
    common_case_count: commonCaseIds.length,
    common_case_ids: commonCaseIds,
    judged_total: byModel.reduce((sum, m) => sum + m.judged, 0),
    judge_failed_total: byModel.reduce((sum, m) => sum + m.judge_failed, 0),
    response_failed_total: byModel.reduce((sum, m) => sum + m.response_failed, 0),
    leaderboard: byModel,
    lowest_cases: lowest,
    failures: failures.slice(0, 200),
    critical_error_total: failures.filter((f) => f.kind === 'critical_error').length,
    human: buildHumanStats(run),
  };
}

export function availableGroups(run) {
  const cases = Array.isArray(run.cases) ? run.cases : [];
  const collect = (key) => [...new Set(cases.map((c) => c[key]).filter(Boolean))].sort();
  return {
    stages: collect('stage'),
    subjects: collect('subject'),
    difficulties: collect('difficulty'),
    task_types: collect('task_type'),
  };
}
