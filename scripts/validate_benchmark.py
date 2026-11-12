"""Validate the bundled EduEval 10Q dataset using the Python standard library."""
from collections import Counter
import csv
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate():
    source = ROOT / 'data/benchmark_v0.2.jsonl'
    rows = []
    for line_number, line in enumerate(source.read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f'{source.name}:{line_number}: {exc}') from exc
        require(isinstance(row, dict), f'Line {line_number}: task must be an object')
        rows.append(row)
    require(len(rows) == 10, f'Expected 10 tasks, got {len(rows)}')
    require([r.get('id') for r in rows] == [f'EDU-{n:02d}' for n in range(1, 11)], 'Task IDs must be ordered EDU-01 to EDU-10')
    require(Counter(r.get('task_type') for r in rows) == {'lesson_plan': 5, 'slide_outline': 5}, 'Expected 5 lesson plans and 5 slide outlines')
    require(Counter(r.get('stage') for r in rows) == {'小学': 3, '初中': 4, '高中': 3}, 'Unexpected stage distribution')
    require(Counter(r.get('difficulty') for r in rows) == {'基础': 2, '进阶': 4, '挑战': 4}, 'Unexpected difficulty distribution')
    for row in rows:
        item_id = row['id']
        require(row.get('benchmark_version') == '0.2.0', f'{item_id}: expected version 0.2.0')
        for field in ['grade', 'subject', 'topic', 'query']:
            require(isinstance(row.get(field), str) and row[field].strip(), f'{item_id}: missing {field}')
        errors = row.get('critical_errors')
        require(isinstance(errors, list) and errors and all(isinstance(e, str) and e.strip() for e in errors), f'{item_id}: invalid critical_errors')
        rubric = row.get('rubric')
        require(isinstance(rubric, list) and len(rubric) == 6, f'{item_id}: expected six rubric criteria')
        ids, weights = [], []
        for criterion in rubric:
            require(isinstance(criterion, dict), f'{item_id}: criterion must be an object')
            for field in ['criterion_id', 'name', 'full_score_requirements']:
                require(isinstance(criterion.get(field), str) and criterion[field].strip(), f'{item_id}: criterion missing {field}')
            weight = criterion.get('weight')
            require(type(weight) in (int, float) and math.isfinite(weight) and weight > 0, f'{item_id}: weight must be finite and positive')
            ids.append(criterion['criterion_id'])
            weights.append(weight)
        require(len(set(ids)) == 6, f'{item_id}: criterion IDs must be unique')
        require(math.isclose(sum(weights), 100, rel_tol=0, abs_tol=1e-9), f'{item_id}: weights must total 100')
    with (ROOT / 'benchmark/selection_manifest.csv').open(encoding='utf-8-sig', newline='') as handle:
        manifest = list(csv.DictReader(handle))
    require([r.get('id') for r in manifest] == [r['id'] for r in rows], 'Manifest IDs do not match dataset')
    for row, selected in zip(rows, manifest):
        for field in ['task_type', 'stage', 'grade', 'subject', 'topic', 'difficulty']:
            require(selected.get(field) == row[field], f'{row["id"]}: manifest mismatch for {field}')
        require(bool(selected.get('selection_rationale', '').strip()), f'{row["id"]}: selection rationale is empty')
    print('PASS: 10 ordered tasks, 5 lesson plans + 5 slide outlines, 6 criteria each, weights total 100')
    print('PASS: stage/difficulty coverage and selection manifest match')


if __name__ == '__main__':
    try:
        validate()
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        sys.exit(1)
