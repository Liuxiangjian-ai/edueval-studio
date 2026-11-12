window.__ModuleLoader__.load({
  id: 'dsh-plugin-edueval',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } = React;
    const NS = 'edueval';
    const API_BASE = new URL('./api/edueval/', document.baseURI).pathname;
    const ACTIVE_STATUS = new Set(['queued', 'generating', 'judging']);
    const MODEL_COLORS = ['#4f6ef7', '#0d9488', '#d97706', '#7c3aed', '#dc2626', '#0284c7', '#65a30d', '#db2777'];
    const DEFAULT_RUBRIC = [
      { criterion_id: 'content_accuracy', name: '学科内容准确性', weight: 25, full_score_requirements: '关键概念、事实、公式或操作结论准确，无实质性知识错误；能明确纠正题目点出的常见误区。', score_0: '未满足、与要求矛盾或存在重大事实错误。', score_1: '部分满足但有实质遗漏。', score_2: '满足全部关键要求。' },
      { criterion_id: 'task_alignment', name: '任务对齐与认知路径', weight: 20, full_score_requirements: '完整回应题目显性要求，目标、活动与评价形成一致、可追踪的认知路径。', score_0: '未回应任务或路径矛盾。', score_1: '部分回应但缺环。', score_2: '完整对齐且路径清晰。' },
      { criterion_id: 'feasibility', name: '实施可行性', weight: 20, full_score_requirements: '步骤、材料、时间与班级规模匹配，教师可直接执行。', score_0: '无法实施。', score_1: '部分可实施。', score_2: '可直接执行。' },
      { criterion_id: 'constraints', name: '约束遵循与安全', weight: 15, full_score_requirements: '严格遵守课时、人数、材料与安全限制。', score_0: '违反硬约束。', score_1: '基本遵循但有遗漏。', score_2: '完全遵循。' },
      { criterion_id: 'differentiation', name: '分层支持与参与', weight: 10, full_score_requirements: '提供基础与进阶任务及明确支架。', score_0: '没有分层。', score_1: '分层不完整。', score_2: '分层可执行。' },
      { criterion_id: 'assessment', name: '形成性评价与反馈', weight: 10, full_score_requirements: '至少两个可观察评价点与具体反馈策略。', score_0: '没有评价。', score_1: '评价不完整。', score_2: '评价与反馈完整。' }
    ];

    // Client-side fallback so the provider dropdown remains populated even
    // while an older Host half is still running and bootstrap has no `presets`.
    const FALLBACK_PRESETS = [
      { id: 'glm', label: 'GLM', vendor: '智谱 AI (Zhipu)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3', models: ['glm-5.3', 'glm-5.2', 'glm-4.7', 'glm-4.6', 'glm-4.7-flash'], apiKeyRef: 'EDUEVAL_GLM_API_KEY', docs: 'https://docs.bigmodel.cn/cn/guide/start/quick-start' },
      { id: 'deepseek', label: 'DeepSeek', vendor: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', models: ['deepseek-flash', 'deepseek-v4-pro'], apiKeyRef: 'EDUEVAL_DEEPSEEK_API_KEY', docs: 'https://api-docs.deepseek.com/quick_start/your_first_api_call' },
      { id: 'qwen', label: 'Qwen', vendor: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.8-max', models: ['qwen3.8-max', 'qwen-plus', 'qwen-max', 'qwen-turbo'], apiKeyRef: 'EDUEVAL_QWEN_API_KEY', docs: 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope' },
      { id: 'kimi', label: 'Kimi', vendor: 'Moonshot AI', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3.1-pro', models: ['kimi-k3.1-pro', 'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'], apiKeyRef: 'EDUEVAL_KIMI_API_KEY', docs: 'https://platform.kimi.com/docs/api/chat' },
      { id: 'openai', label: 'OpenAI', vendor: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4.1-mini'], apiKeyRef: 'EDUEVAL_OPENAI_API_KEY', docs: 'https://platform.openai.com/docs/models' },
      { id: 'custom', label: '自定义', vendor: 'Custom', baseUrl: 'https://api.example.com/v1', model: 'model-id', models: [], apiKeyRef: 'EDUEVAL_CUSTOM_API_KEY', docs: '' }
    ];

    const zh = { nav: 'EduEval Studio' };
    const en = { nav: 'EduEval Studio' };

    function cx(...args) {
      return args.filter(Boolean).join(' ');
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function fmtScore(value, digits = 1) {
      return value === null || value === undefined || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(digits);
    }

    function fmtPct(value) {
      return value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`;
    }

    function fmtDate(value) {
      if (!value) return '—';
      try {
        return new Date(value).toLocaleString(document.documentElement.lang || 'zh-CN', { hour12: false });
      } catch {
        return String(value);
      }
    }

    function fmtDuration(ms) {
      if (!Number.isFinite(Number(ms))) return '—';
      const n = Number(ms);
      return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
    }

    function weightSum(criteria) {
      return (criteria || []).reduce((sum, c) => sum + Number(c.weight || 0), 0);
    }

    function scoreBand(score) {
      if (score === null || score === undefined) return 'na';
      if (score >= 85) return 'excellent';
      if (score >= 70) return 'good';
      if (score >= 50) return 'watch';
      return 'weak';
    }

    function statusLabel(status, L) {
      const map = {
        queued: ['排队中', 'Queued'],
        generating: ['生成中', 'Generating'],
        judging: ['评分中', 'Judging'],
        completed: ['已完成', 'Completed'],
        completed_with_errors: ['完成（有失败）', 'Completed with errors'],
        cancelled: ['已取消', 'Cancelled'],
        interrupted: ['已中断', 'Interrupted'],
        failed: ['失败', 'Failed'],
        pending: ['待处理', 'Pending'],
        running: ['进行中', 'Running'],
        success: ['成功', 'Success'],
        not_judged: ['未评分', 'Not judged'],
        missing: ['缺失', 'Missing']
      };
      const pair = map[status] || [status || '—', status || '—'];
      return L(pair[0], pair[1]);
    }

    function taskTypeLabel(value, L) {
      if (value === 'lesson_plan') return L('教案生成', 'Lesson plan');
      if (value === 'slide_outline') return L('课件大纲', 'Slide outline');
      return value || '—';
    }

    function normalizeWeights(criteria) {
      const list = criteria.map((c) => ({ ...c, weight: Math.max(0, Number(c.weight) || 0) }));
      const sum = list.reduce((a, b) => a + b.weight, 0);
      if (!sum) {
        const each = Math.round((100 / list.length) * 100) / 100;
        list.forEach((c) => { c.weight = each; });
      } else {
        list.forEach((c) => { c.weight = Math.round(((c.weight / sum) * 100) * 100) / 100; });
      }
      const diff = Math.round((100 - list.reduce((a, b) => a + b.weight, 0)) * 100) / 100;
      if (list.length) list[list.length - 1].weight = Math.round((list[list.length - 1].weight + diff) * 100) / 100;
      return list;
    }

    function makeDefaultCase(id, L) {
      return {
        id,
        benchmark_version: '0.1.0',
        task_type: 'lesson_plan',
        stage: L('初中', 'Middle school'),
        grade: '',
        subject: '',
        topic: L('自定义评测题', 'Custom evaluation case'),
        difficulty: L('进阶', 'Advanced'),
        tags: [],
        query: L('请描述要评测的任务、约束和期望产出。', 'Describe the task, constraints, and expected deliverable.'),
        rubric: clone(DEFAULT_RUBRIC),
        critical_errors: []
      };
    }

    async function api(path, options = {}) {
      const url = `${API_BASE}${path}`;
      const init = {
        method: options.method || 'GET',
        credentials: 'same-origin',
        headers: { accept: 'application/json', ...(options.headers || {}) }
      };
      if (options.body !== undefined) {
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }
      const response = await fetch(url, init);
      const type = response.headers.get('content-type') || '';
      let payload;
      if (type.includes('application/json')) payload = await response.json();
      else payload = await response.text();
      if (!response.ok) {
        const err = new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`);
        err.status = response.status;
        err.code = payload && payload.code;
        err.missing = payload && payload.missing;
        throw err;
      }
      return payload;
    }

    async function downloadReport(runId, format) {
      const response = await fetch(`${API_BASE}export?run_id=${encodeURIComponent(runId)}&format=${encodeURIComponent(format)}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Export failed: HTTP ${response.status}`);
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match ? match[1] : `${runId}.${format === 'markdown' ? 'md' : format}`;
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.style.display = 'none';
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    }

    function useLang(locale) {
      const snapshot = useSyncExternalStore(
        (cb) => locale.subscribe(cb),
        () => locale.getSnapshot(),
        () => locale.getSnapshot()
      );
      return String(snapshot && snapshot.active || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }

    function Btn({ children, variant = 'secondary', size = 'md', className, ...rest }) {
      return h('button', {
        type: 'button',
        className: cx('ee-btn', `ee-btn-${variant}`, size === 'sm' && 'ee-btn-sm', className),
        ...rest
      }, children);
    }

    function IconBtn({ label, children, ...rest }) {
      return h('button', { type: 'button', className: 'ee-icon-btn', title: label, 'aria-label': label, ...rest }, children);
    }

    function Badge({ tone = 'neutral', children, className }) {
      return h('span', { className: cx('ee-badge', `ee-badge-${tone}`, className) }, children);
    }

    function Field({ label, children, className }) {
      return h('label', { className: cx('ee-field', className) },
        h('span', { className: 'ee-field-label' }, label),
        children
      );
    }

    function SectionHeading({ no, title, right }) {
      return h('div', { className: 'ee-section-heading' },
        h('div', { className: 'ee-section-title-wrap' },
          h('span', { className: 'ee-section-no' }, no),
          h('div', null,
            h('h2', { className: 'ee-section-title' }, title)
          )
        ),
        right ? h('div', { className: 'ee-section-actions' }, right) : null
      );
    }

    function ProgressBar({ value, tone = 'brand', label }) {
      const pct = Math.max(0, Math.min(100, Number(value) || 0));
      return h('div', { className: 'ee-progress-wrap' },
        label ? h('div', { className: 'ee-progress-label' }, h('span', null, label), h('b', null, `${pct.toFixed(1)}%`)) : null,
        h('div', { className: 'ee-progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
          h('i', { className: cx('ee-progress-fill', `ee-tone-${tone}`), style: { width: `${pct}%` } })
        )
      );
    }

    function Modal({ title, onClose, children, wide = false }) {
      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onClose]);
      return h('div', { className: 'ee-overlay', role: 'presentation', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h('div', { className: cx('ee-modal', wide && 'ee-modal-wide'), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
          h('div', { className: 'ee-modal-head' },
            h('div', null, h('h3', null, title)),
            h(IconBtn, { label: 'Close', onClick: onClose }, '✕')
          ),
          h('div', { className: 'ee-modal-body' }, children)
        )
      );
    }

    function EmptyState({ icon = '◌', title, action }) {
      return h('div', { className: 'ee-empty' },
        h('div', { className: 'ee-empty-icon', 'aria-hidden': 'true' }, icon),
        h('h3', null, title),
        action || null
      );
    }

    function Toggle({ checked, onChange, label, disabled }) {
      return h('label', { className: cx('ee-toggle-row', disabled && 'ee-disabled') },
        h('button', {
          type: 'button', role: 'switch', 'aria-checked': checked, disabled,
          className: cx('ee-switch', checked && 'ee-switch-on'),
          onClick: () => !disabled && onChange(!checked)
        }, h('span', { className: 'ee-switch-thumb' })),
        h('span', { className: 'ee-toggle-text' },
          h('b', null, label)
        )
      );
    }

    function EduEvalIcon({ size = 20, active = false }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': 'true', className: cx('ee-nav-icon', active && 'is-active') },
        h('rect', { x: 2, y: 2, width: 28, height: 28, rx: 8, fill: active ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.8, opacity: active ? 0.16 : 1 }),
        h('path', { d: 'M7 13.5 16 9l9 4.5-9 4.5-9-4.5Z', fill: 'currentColor', opacity: 0.95 }),
        h('path', { d: 'M10.5 16.3v4.4c3.1 2.4 8 2.4 11 0v-4.4', stroke: 'currentColor', strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' }),
        h('path', { d: 'M25 15v5.5', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
        h('rect', { x: 9, y: 23.5, width: 2.6, height: 3, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 14.7, y: 22, width: 2.6, height: 4.5, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 20.4, y: 20.5, width: 2.6, height: 6, rx: 1, fill: 'currentColor' })
      );
    }

    const CSS = String.raw`
      .ee-page {
        box-sizing: border-box;
        min-height: 100%;
        height: 100%;
        overflow: auto;
        color: var(--dsw-alias-label-primary, #1f2328);
        background:
          radial-gradient(1200px 520px at 8% -10%, color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 10%, transparent), transparent 70%),
          var(--dsw-alias-bg-base, #f7f8fa);
        font-family: var(--ds-font-family-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
        font-size: 13px;
        line-height: 1.55;
      }
      .ee-shell { box-sizing: border-box; width: min(1500px, 100%); margin: 0 auto; padding: calc(22px + var(--dsh-frame-top-clearance, 0px)) 26px 80px; }
      .ee-topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; flex-wrap: wrap; }
      .ee-brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
      .ee-logo { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #1b2a4a, #2f6fed); box-shadow: 0 8px 24px #2f6fed33; flex: none; }
      .ee-brand h1 { margin: 0; font-size: 24px; line-height: 1.15; letter-spacing: -0.03em; font-weight: 700; }
      .ee-brand p { margin: 4px 0 0; color: var(--dsw-alias-label-secondary, #5c6570); font-size: 12px; }
      .ee-title-badges { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 7px; }
      .ee-top-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .ee-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l2, #e5e7eb); border-radius: 999px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary, #5c6570); padding: 6px 10px; font-size: 11.5px; white-space: nowrap; }
      .ee-chip b { color: var(--dsw-alias-label-primary, #1f2328); font-weight: 650; }
      .ee-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary, #9ca3af); flex: none; }
      .ee-dot.on { background: var(--dsw-alias-state-success-primary, #16a34a); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 16%, transparent); }
      .ee-dot.warn { background: var(--dsw-alias-state-warn-primary, #b45309); }
      .ee-dot.err { background: var(--dsw-alias-state-error-primary, #dc2626); }
      .ee-card { background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1, #fff)); border: .5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l3, #d9dde3)); border-radius: 18px; box-shadow: var(--dsw-shadow-lv1, 0 1px 2px #1f23280a); min-width: 0; }
      .ee-card-pad { padding: 16px; }
      .ee-section { margin-top: 26px; scroll-margin-top: 24px; }
      .ee-section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 0 2px 11px; flex-wrap: wrap; }
      .ee-section-title-wrap { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
      .ee-section-no { color: var(--dsw-alias-brand-primary, #4f6ef7); font-variant-numeric: tabular-nums; font-size: 11px; font-weight: 800; letter-spacing: .1em; border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 30%, transparent); background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 7%, transparent); border-radius: 7px; padding: 4px 7px; line-height: 1; margin-top: 3px; }
      .ee-section-title { margin: 0; font-size: 17px; line-height: 1.25; font-weight: 680; letter-spacing: -.015em; }
      .ee-section-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .ee-grid-2 { display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(0, .88fr); gap: 16px; align-items: start; }
      .ee-grid-equal { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
      .ee-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 15px 16px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f4); }
      .ee-card-head h3 { margin: 0; font-size: 13.5px; font-weight: 680; }
      .ee-card-body { padding: 14px 16px 16px; }
      .ee-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .ee-toolbar-spacer { flex: 1 1 auto; }
      .ee-btn { appearance: none; border: .5px solid var(--dsw-alias-border-l3, #d1d5db); border-radius: 9px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2328); font: inherit; font-size: 12.5px; font-weight: 600; height: 34px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; cursor: pointer; transition: background .14s, border-color .14s, transform .14s, color .14s; white-space: nowrap; }
      .ee-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #2631480f); border-color: var(--dsw-alias-label-dimmed, #c8ccd4); }
      .ee-btn:active:not(:disabled) { transform: translateY(1px); }
      .ee-btn:disabled { opacity: .48; cursor: not-allowed; }
      .ee-btn-primary { background: var(--dsw-alias-button-primary-fill, #111827); color: var(--dsw-alias-label-primary-foreground, #fff); border-color: transparent; }
      .ee-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover, #000); border-color: transparent; }
      .ee-btn-brand { background: var(--dsw-alias-brand-primary, #4f6ef7); color: #fff; border-color: transparent; }
      .ee-btn-brand:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 86%, #000); border-color: transparent; }
      .ee-btn-ghost { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary, #5c6570); }
      .ee-btn-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #2631480f); }
      .ee-btn-danger { color: var(--dsw-alias-state-error-primary, #dc2626); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 30%, transparent); background: transparent; }
      .ee-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 8%, transparent); }
      .ee-btn-sm { height: 28px; border-radius: 7px; padding: 0 9px; font-size: 11.5px; }
      .ee-icon-btn { width: 28px; height: 28px; padding: 0; display: inline-grid; place-items: center; border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary, #6b7280); font: inherit; font-size: 13px; cursor: pointer; }
      .ee-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover, #2631480f); color: var(--dsw-alias-label-primary, #1f2328); }
      .ee-input, .ee-select, .ee-textarea { box-sizing: border-box; width: 100%; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2328); font: inherit; font-size: 12.5px; padding: 7px 9px; outline: none; transition: border-color .14s, box-shadow .14s; }
      .ee-input:focus, .ee-select:focus, .ee-textarea:focus { border-color: var(--dsw-alias-brand-primary, #4f6ef7); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 15%, transparent); }
      .ee-input::placeholder, .ee-textarea::placeholder { color: var(--dsw-alias-label-dimmed, #9ca3af); }
      .ee-textarea { min-height: 74px; resize: vertical; line-height: 1.6; }
      .ee-textarea-lg { min-height: 130px; }
      .ee-select { appearance: none; padding-right: 28px; background-image: linear-gradient(45deg, transparent 50%, var(--dsw-alias-label-tertiary, #8b93a1) 50%), linear-gradient(135deg, var(--dsw-alias-label-tertiary, #8b93a1) 50%, transparent 50%); background-position: calc(100% - 14px) calc(50% - 1px), calc(100% - 9px) calc(50% - 1px); background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
      .ee-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
      .ee-field-label { font-size: 11.5px; font-weight: 650; color: var(--dsw-alias-label-secondary, #5c6570); }
      .ee-badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 2px 8px; font-size: 10.5px; font-weight: 650; line-height: 18px; white-space: nowrap; border: 1px solid transparent; }
      .ee-badge-neutral { background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-secondary, #5c6570); }
      .ee-badge-brand { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 10%, transparent); color: var(--dsw-alias-brand-primary, #4f6ef7); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 20%, transparent); }
      .ee-badge-success { background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 10%, transparent); color: var(--dsw-alias-state-success-primary, #15803d); }
      .ee-badge-warn { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b45309) 11%, transparent); color: var(--dsw-alias-state-warn-primary, #b45309); }
      .ee-badge-danger { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 9%, transparent); color: var(--dsw-alias-state-error-primary, #dc2626); }
      .ee-badge-mock { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
      .ee-progress-wrap { display: flex; flex-direction: column; gap: 5px; }
      .ee-progress-label { display: flex; justify-content: space-between; gap: 12px; color: var(--dsw-alias-label-tertiary, #8b93a1); font-size: 11px; }
      .ee-progress-label b { color: var(--dsw-alias-label-secondary, #5c6570); font-variant-numeric: tabular-nums; }
      .ee-progress { height: 5px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #eef0f4); overflow: hidden; }
      .ee-progress-fill { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary, #4f6ef7); transition: width .35s ease; }
      .ee-tone-success { background: var(--dsw-alias-state-success-primary, #16a34a); }
      .ee-tone-warn { background: var(--dsw-alias-state-warn-primary, #b45309); }
      .ee-tone-danger { background: var(--dsw-alias-state-error-primary, #dc2626); }
      .ee-toggle-row { display: flex; align-items: flex-start; gap: 9px; cursor: pointer; user-select: none; }
      .ee-toggle-row.ee-disabled { opacity: .55; cursor: not-allowed; }
      .ee-switch { width: 34px; height: 20px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l3, #d1d5db); background: var(--dsw-alias-bg-layer-2, #eef0f4); padding: 2px; cursor: pointer; flex: none; transition: background .14s, border-color .14s; }
      .ee-switch-thumb { display: block; width: 14px; height: 14px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, #fff); box-shadow: 0 1px 3px #0003; transition: transform .14s; }
      .ee-switch-on { background: var(--dsw-alias-brand-primary, #4f6ef7); border-color: transparent; }
      .ee-switch-on .ee-switch-thumb { transform: translateX(14px); }
      .ee-toggle-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .ee-toggle-text b { font-size: 12px; font-weight: 650; }
      .ee-toggle-text small { color: var(--dsw-alias-label-tertiary, #8b93a1); font-size: 10.5px; line-height: 1.35; }
      .ee-bench-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
      .ee-bench-bar .ee-select { width: auto; min-width: 190px; flex: 1 1 190px; }
      .ee-filter-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin: 10px 0; }
      .ee-case-list { border: 1px solid var(--dsw-alias-border-l2, #eef0f4); border-radius: 11px; overflow: hidden; max-height: 292px; overflow-y: auto; background: var(--dsw-alias-bg-layer-1, #fff); }
      .ee-case-row { display: flex; align-items: flex-start; gap: 9px; padding: 8px 9px; border-bottom: 1px solid var(--dsw-alias-border-l1, #f2f4f7); cursor: pointer; transition: background .12s; }
      .ee-case-row:last-child { border-bottom: 0; }
      .ee-case-row:hover { background: var(--dsw-alias-interactive-bg-hover, #2631480a); }
      .ee-case-row.active { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 7%, transparent); box-shadow: inset 3px 0 0 var(--dsw-alias-brand-primary, #4f6ef7); }
      .ee-case-check { margin-top: 3px; accent-color: var(--dsw-alias-brand-primary, #4f6ef7); width: 14px; height: 14px; flex: none; }
      .ee-case-main { min-width: 0; flex: 1; }
      .ee-case-id { font-family: var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace); font-size: 10.5px; color: var(--dsw-alias-label-tertiary, #8b93a1); }
      .ee-case-title { margin: 1px 0 4px; font-size: 12px; font-weight: 650; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .ee-case-meta { display: flex; gap: 4px; flex-wrap: wrap; }
      .ee-mini-tag { font-size: 9.5px; line-height: 16px; border-radius: 4px; padding: 0 5px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-tertiary, #8b93a1); white-space: nowrap; }
      .ee-query-meta { display: grid; grid-template-columns: 1.4fr 1fr 1fr .8fr; gap: 8px; margin: 12px 0; }
      .ee-provider-list { display: flex; flex-direction: column; gap: 9px; }
      .ee-provider-catalog { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 10px; }
      .ee-provider-catalog .ee-field-label { margin-right: 3px; }
      .ee-provider-catalog .ee-mini-tag { background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 8%, transparent); color: var(--dsw-alias-brand-primary, #4f6ef7); border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 16%, transparent); font-size: 10px; line-height: 18px; padding: 0 7px; }
      .ee-provider { border: 1px solid var(--dsw-alias-border-l2, #e7eaf0); border-radius: 12px; padding: 10px; background: var(--dsw-alias-bg-layer-1, #fff); }
      .ee-provider.selected { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 45%, transparent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 8%, transparent); }
      .ee-provider-head { display: flex; align-items: flex-start; gap: 8px; }
      .ee-provider-head .ee-case-check { margin-top: 2px; }
      .ee-provider-title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
      .ee-provider-title b { font-size: 12.5px; }
      .ee-provider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 9px; }
      .ee-key-row { display: flex; gap: 6px; margin-top: 8px; align-items: flex-start; }
      .ee-key-row .ee-input { flex: 1; min-width: 0; height: 31px; padding-top: 5px; padding-bottom: 5px; }
      .ee-key-row .ee-btn { flex: none; }
      .ee-key-status { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 7px; }
      .ee-provider-select-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); }
      .ee-advanced { margin-top: 10px; border-top: 1px dashed var(--dsw-alias-border-l2, #e7eaf0); padding-top: 9px; }
      .ee-advanced summary { cursor: pointer; color: var(--dsw-alias-label-secondary, #5c6570); font-size: 11px; font-weight: 600; }
      .ee-advanced-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px; margin-top: 8px; }
      .ee-runbar { margin: 20px 0 4px; border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 22%, transparent); background: linear-gradient(120deg, color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 6%, transparent), transparent 55%), var(--dsw-alias-bg-layer-1, #fff); border-radius: 16px; padding: 14px 15px; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; box-shadow: 0 8px 22px #1f23280a; }
      .ee-runbar-main { display: flex; flex-direction: column; gap: 4px; min-width: 220px; }
      .ee-runbar-main b { font-size: 13px; }
      .ee-runbar-main span { color: var(--dsw-alias-label-tertiary, #8b93a1); font-size: 11.5px; }
      .ee-runbar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .ee-runstatus { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .ee-responses { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
      .ee-response-card { border: 1px solid var(--dsw-alias-border-l2, #e7eaf0); border-radius: 13px; background: var(--dsw-alias-bg-layer-1, #fff); min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
      .ee-response-head { padding: 10px 11px; border-bottom: 1px solid var(--dsw-alias-border-l1, #f1f3f6); display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .ee-response-head b { font-size: 12px; display: block; }
      .ee-response-body { padding: 10px 11px 11px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
      .ee-preview { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary, #4b5563); font-size: 11.5px; line-height: 1.55; max-height: 170px; overflow: hidden; position: relative; }
      .ee-preview:after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 34px; background: linear-gradient(transparent, var(--dsw-alias-bg-layer-1, #fff)); pointer-events: none; }
      .ee-response-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .ee-score-pill { display: inline-flex; align-items: baseline; gap: 3px; font-variant-numeric: tabular-nums; font-weight: 750; font-size: 17px; }
      .ee-score-pill small { font-size: 10px; font-weight: 500; color: var(--dsw-alias-label-tertiary, #8b93a1); }
      .ee-score-excellent { color: var(--dsw-alias-state-success-primary, #16a34a); }
      .ee-score-good { color: #0d9488; }
      .ee-score-watch { color: var(--dsw-alias-state-warn-primary, #b45309); }
      .ee-score-weak { color: var(--dsw-alias-state-error-primary, #dc2626); }
      .ee-score-na { color: var(--dsw-alias-label-tertiary, #8b93a1); }
      .ee-rubric-list { display: flex; flex-direction: column; gap: 9px; }
      .ee-rubric-item { border: 1px solid var(--dsw-alias-border-l2, #e7eaf0); border-radius: 11px; padding: 10px; background: var(--dsw-alias-bg-layer-1, #fff); }
      .ee-rubric-head { display: grid; grid-template-columns: 22px minmax(0, 1fr) 82px 30px; gap: 7px; align-items: center; }
      .ee-rubric-index { width: 22px; height: 22px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-tertiary, #8b93a1); display: grid; place-items: center; font-size: 10px; font-weight: 700; }
      .ee-rubric-weight { position: relative; }
      .ee-rubric-weight .ee-input { padding-right: 20px; text-align: right; }
      .ee-rubric-weight:after { content: '%'; position: absolute; right: 7px; top: 50%; transform: translateY(-50%); color: var(--dsw-alias-label-tertiary, #8b93a1); font-size: 10px; pointer-events: none; }
      .ee-rubric-desc { margin-top: 7px; }
      .ee-rubric-desc .ee-textarea { min-height: 48px; font-size: 11px; }
      .ee-weight-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
      .ee-weight-total { margin-left: auto; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 700; }
      .ee-weight-total.ok { color: var(--dsw-alias-state-success-primary, #16a34a); }
      .ee-weight-total.bad { color: var(--dsw-alias-state-error-primary, #dc2626); }
      .ee-tabs { display: inline-flex; align-items: center; gap: 2px; padding: 3px; background: var(--dsw-alias-bg-layer-2, #eef0f4); border-radius: 9px; }
      .ee-tab { border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #5c6570); font: inherit; font-size: 11.5px; font-weight: 600; height: 27px; padding: 0 11px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
      .ee-tab.active { background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2328); box-shadow: 0 0 0 .5px var(--dsw-alias-border-l3, #d1d5db); }
      .ee-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
      .ee-stat { border: 1px solid var(--dsw-alias-border-l2, #e7eaf0); border-radius: 12px; padding: 11px 12px; background: var(--dsw-alias-bg-layer-1, #fff); min-width: 0; }
      .ee-stat-label { color: var(--dsw-alias-label-tertiary, #8b93a1); font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
      .ee-stat-value { margin-top: 2px; font-size: 23px; line-height: 1.15; font-weight: 750; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
      .ee-table-wrap { border: 1px solid var(--dsw-alias-border-l2, #e7eaf0); border-radius: 11px; overflow: auto; }
      .ee-table { width: 100%; border-collapse: collapse; font-size: 11.5px; min-width: 610px; }
      .ee-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: var(--dsw-alias-label-tertiary, #8b93a1); background: var(--dsw-alias-bg-layer-2, #f7f8fa); padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l2, #e7eaf0); white-space: nowrap; }
      .ee-table td { padding: 9px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1, #f1f3f6); vertical-align: middle; }
      .ee-table tr:last-child td { border-bottom: 0; }
      .ee-table tr:hover td { background: var(--dsw-alias-interactive-bg-hover, #26314808); }
      .ee-rank { font-weight: 800; color: var(--dsw-alias-brand-primary, #4f6ef7); font-variant-numeric: tabular-nums; }
      .ee-model-cell { display: flex; align-items: center; gap: 7px; min-width: 0; }
      .ee-model-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .ee-model-cell b { font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 210px; }
      .ee-chart { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
      .ee-chart-row { display: grid; grid-template-columns: 112px minmax(0, 1fr) 48px; gap: 8px; align-items: center; }
      .ee-chart-label { color: var(--dsw-alias-label-secondary, #5c6570); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ee-chart-track { height: 9px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f0f2f6); display: flex; gap: 2px; overflow: hidden; }
      .ee-chart-seg { height: 100%; border-radius: 2px; min-width: 2px; }
      .ee-chart-value { color: var(--dsw-alias-label-tertiary, #8b93a1); font-variant-numeric: tabular-nums; font-size: 10px; text-align: right; }
      .ee-legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 9px; color: var(--dsw-alias-label-tertiary, #8b93a1); font-size: 10px; }
      .ee-legend span { display: inline-flex; align-items: center; gap: 4px; }
      .ee-legend i { width: 7px; height: 7px; border-radius: 2px; display: inline-block; }
      .ee-failures { display: flex; flex-direction: column; gap: 6px; max-height: 290px; overflow: auto; }
      .ee-failure { border: 1px solid var(--dsw-alias-border-l2, #e7eaf0); border-radius: 9px; background: var(--dsw-alias-bg-layer-1, #fff); padding: 8px 9px; display: flex; align-items: flex-start; gap: 8px; }
      .ee-failure-mark { width: 6px; align-self: stretch; border-radius: 99px; background: var(--dsw-alias-state-error-primary, #dc2626); flex: none; }
      .ee-failure.judge .ee-failure-mark { background: var(--dsw-alias-state-warn-primary, #b45309); }
      .ee-failure.critical .ee-failure-mark { background: #7c3aed; }
      .ee-failure-main { min-width: 0; }
      .ee-failure-main b { display: block; font-size: 11.5px; }
      .ee-failure-main p { margin: 2px 0 0; color: var(--dsw-alias-label-secondary, #5c6570); font-size: 11px; overflow-wrap: anywhere; }
      .ee-human-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .95fr); gap: 16px; align-items: start; }
      .ee-blind-tabs { display: flex; gap: 7px; flex-wrap: wrap; margin: 10px 0; }
      .ee-blind-tab { border: 1px solid var(--dsw-alias-border-l2, #e7eaf0); background: var(--dsw-alias-bg-layer-1, #fff); border-radius: 9px; min-width: 46px; height: 34px; font: inherit; font-size: 12px; font-weight: 750; cursor: pointer; color: var(--dsw-alias-label-secondary, #5c6570); }
      .ee-blind-tab.active { border-color: var(--dsw-alias-brand-primary, #4f6ef7); color: var(--dsw-alias-brand-primary, #4f6ef7); background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4f6ef7) 7%, transparent); }
      .ee-blind-tab:disabled { opacity: .4; cursor: not-allowed; }
      .ee-answer { border: 1px solid var(--dsw-alias-border-l2, #e7eaf0); border-radius: 11px; background: var(--dsw-alias-bg-layer-1, #fff); padding: 11px; max-height: 410px; overflow: auto; }
      .ee-answer pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 11.5px; line-height: 1.65; color: var(--dsw-alias-label-secondary, #4b5563); }
      .ee-score-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 9px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #f1f3f6); }
      .ee-score-row:last-child { border-bottom: 0; }
      .ee-score-row-name { font-size: 11.5px; font-weight: 650; }
      .ee-score-btns { display: flex; gap: 3px; }
      .ee-score-btn { width: 30px; height: 28px; border: 1px solid var(--dsw-alias-border-l2, #e7eaf0); background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary, #6b7280); border-radius: 6px; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
      .ee-score-btn.active[data-score="0"] { background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 12%, transparent); color: var(--dsw-alias-state-error-primary, #dc2626); border-color: currentColor; }
      .ee-score-btn.active[data-score="1"] { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b45309) 12%, transparent); color: var(--dsw-alias-state-warn-primary, #b45309); border-color: currentColor; }
      .ee-score-btn.active[data-score="2"] { background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #16a34a) 12%, transparent); color: var(--dsw-alias-state-success-primary, #16a34a); border-color: currentColor; }
      .ee-kv { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #f1f3f6); font-size: 11.5px; }
      .ee-kv:last-child { border-bottom: 0; }
      .ee-kv span { color: var(--dsw-alias-label-tertiary, #8b93a1); }
      .ee-kv b { text-align: right; overflow-wrap: anywhere; font-weight: 600; }
      .ee-history { display: flex; flex-direction: column; gap: 5px; max-height: 250px; overflow: auto; }
      .ee-history-row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--dsw-alias-border-l2, #e7eaf0); background: var(--dsw-alias-bg-layer-1, #fff); border-radius: 8px; padding: 7px 9px; cursor: pointer; text-align: left; font: inherit; color: inherit; }
      .ee-history-row:hover { background: var(--dsw-alias-interactive-bg-hover, #26314808); }
      .ee-history-row.active { border-color: var(--dsw-alias-brand-primary, #4f6ef7); }
      .ee-history-main { flex: 1; min-width: 0; }
      .ee-history-main b { display: block; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ee-empty { padding: 36px 22px; text-align: center; color: var(--dsw-alias-label-secondary, #5c6570); }
      .ee-empty-icon { font-size: 26px; color: var(--dsw-alias-label-dimmed, #c8ccd4); margin-bottom: 6px; }
      .ee-empty h3 { margin: 0 0 4px; font-size: 13px; color: var(--dsw-alias-label-primary, #1f2328); }
      .ee-overlay { position: fixed; inset: 0; z-index: 80; background: #0f172a70; backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; padding: 20px; }
      .ee-modal { width: min(760px, 100%); max-height: 88vh; background: var(--dsw-alias-bg-layer-1, #fff); border: 1px solid var(--dsw-alias-border-l3, #d1d5db); border-radius: 16px; box-shadow: 0 24px 80px #0003; display: flex; flex-direction: column; overflow: hidden; }
      .ee-modal-wide { width: min(1040px, 100%); }
      .ee-modal-head { padding: 14px 16px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--dsw-alias-border-l2, #e7eaf0); }
      .ee-modal-head h3 { margin: 0; font-size: 15px; }
      .ee-modal-body { padding: 15px 16px 18px; overflow: auto; }
      .ee-toast { position: fixed; right: 24px; bottom: 24px; z-index: 100; max-width: min(430px, calc(100vw - 40px)); border-radius: 11px; padding: 10px 13px; background: var(--dsw-alias-toast-bg, #111827); color: var(--dsw-alias-toast-label, #fff); box-shadow: 0 12px 40px #0003; font-size: 12px; display: flex; align-items: flex-start; gap: 9px; }
      .ee-toast.error { background: #7f1d1d; }
      .ee-toast.success { background: #14532d; }
      .ee-toast-close { margin-left: auto; cursor: pointer; opacity: .7; flex: none; }
      .ee-loading { min-height: 60vh; display: grid; place-items: center; color: var(--dsw-alias-label-tertiary, #8b93a1); }
      .ee-spinner { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l2, #e5e7eb); border-top-color: var(--dsw-alias-brand-primary, #4f6ef7); animation: ee-spin .8s linear infinite; margin: 0 auto 10px; }
      @keyframes ee-spin { to { transform: rotate(360deg); } }
      .ee-mono { font-family: var(--ds-font-family-code, ui-monospace, Menlo, Consolas, monospace); }
      .ee-nowrap { white-space: nowrap; }
      .ee-scroll-x { overflow-x: auto; }
      .ee-mt-8 { margin-top: 8px; }
      .ee-mt-12 { margin-top: 12px; }
      .ee-mt-16 { margin-top: 16px; }
      .ee-flex { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .ee-grow { flex: 1; min-width: 0; }
      .ee-warn-banner { border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b45309) 28%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #b45309) 7%, transparent); color: var(--dsw-alias-state-warn-primary, #92400e); border-radius: 10px; padding: 8px 10px; font-size: 11px; line-height: 1.5; display: flex; gap: 8px; align-items: flex-start; }
      .ee-error-banner { border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 28%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 7%, transparent); color: var(--dsw-alias-state-error-primary, #b91c1c); border-radius: 10px; padding: 8px 10px; font-size: 11px; line-height: 1.5; margin-bottom: 10px; white-space: pre-wrap; }
      @media (max-width: 1100px) {
        .ee-grid-2, .ee-human-grid { grid-template-columns: minmax(0, 1fr); }
        .ee-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 720px) {
        .ee-shell { padding: calc(14px + var(--dsh-frame-top-clearance, 0px)) 12px 60px; }
        .ee-brand h1 { font-size: 20px; }
        .ee-grid-equal, .ee-summary-grid { grid-template-columns: minmax(0, 1fr); }
        .ee-filter-row { grid-template-columns: 1fr 1fr; }
        .ee-query-meta { grid-template-columns: 1fr 1fr; }
        .ee-provider-grid, .ee-advanced-grid { grid-template-columns: 1fr; }
        .ee-rubric-head { grid-template-columns: 22px minmax(0, 1fr) 64px 28px; }
        .ee-runbar { align-items: flex-start; }
      }
    `;

    function installStyle() {
      const id = 'dsh-plugin-edueval/style';
      if (document.querySelector(`style[data-plugin-style="${id}"]`)) return () => {};
      const style = document.createElement('style');
      style.dataset.pluginStyle = id;
      style.textContent = CSS;
      document.head.appendChild(style);
      return () => style.remove();
    }

    function KeyControl(props) {
      const { draft, onDraft, onSave, onClear, onTest, L, remember, setRemember, busy } = props;
      const { keyInfo } = props;
      const [show, setShow] = useState(false);
      const configured = Boolean(keyInfo && keyInfo.configured);
      return h('div', { className: 'ee-key-block' },
        h('div', { className: 'ee-key-row' },
          h('input', {
            className: 'ee-input',
            type: show ? 'text' : 'password',
            autoComplete: 'off',
            spellCheck: false,
            value: draft || '',
            placeholder: configured ? L('已配置，输入新 Key 替换', 'Configured, enter a new key to replace') : L('输入 API Key', 'Enter API key'),
            onChange: (e) => onDraft(e.target.value)
          }),
          h(Btn, { size: 'sm', variant: 'ghost', onClick: () => setShow(!show) }, show ? L('隐藏', 'Hide') : L('显示', 'Show')),
          h(Btn, { size: 'sm', variant: 'brand', disabled: !draft || busy, onClick: onSave }, L('保存 Key', 'Save Key')),
          configured ? h(Btn, { size: 'sm', variant: 'ghost', onClick: onClear }, L('清除', 'Clear')) : null,
          onTest ? h(Btn, { size: 'sm', variant: 'ghost', onClick: onTest }, L('测试连接', 'Test')) : null
        ),
        h('div', { className: 'ee-key-status' },
          draft ? h(Badge, { tone: 'warn' }, L('未保存', 'Unsaved')) : null,
          configured ? h(Badge, { tone: 'success' }, L('Key 已配置', 'Key configured')) : h(Badge, { tone: 'danger' }, L('Key 未配置', 'Key missing'))
        ),
        h('label', { className: 'ee-toggle-row', style: { marginTop: '8px' } },
          h('input', { type: 'checkbox', checked: remember, onChange: (e) => setRemember(e.target.checked) }),
          h('span', { className: 'ee-toggle-text' }, h('b', null, L('记住 Key', 'Remember key')))
        )
      );
    }

    function QueryEditor(props) {
      const {
        L, cases, baseCases, selectedIds, setSelectedIds, activeCaseId, setActiveCaseId,
        updateCase, addCase, resetCase, benchmarks, benchmark, loadBenchmark, importFile, saveBenchmark,
        benchmarkName, setBenchmarkName, filters, setFilters, busy
      } = props;
      const fileRef = useRef(null);
      const activeCase = cases.find((c) => c.id === activeCaseId);
      const visible = useMemo(() => {
        const q = String(filters.search || '').trim().toLowerCase();
        return cases.filter((c) => {
          if (filters.stage && c.stage !== filters.stage) return false;
          if (filters.subject && c.subject !== filters.subject) return false;
          if (filters.difficulty && c.difficulty !== filters.difficulty) return false;
          if (filters.task_type && c.task_type !== filters.task_type) return false;
          if (q && !`${c.id} ${c.query} ${c.topic} ${c.subject} ${c.grade}`.toLowerCase().includes(q)) return false;
          return true;
        });
      }, [cases, filters]);
      const stages = [...new Set(cases.map((c) => c.stage).filter(Boolean))];
      const subjects = [...new Set(cases.map((c) => c.subject).filter(Boolean))];
      const difficulties = [...new Set(cases.map((c) => c.difficulty).filter(Boolean))];
      const taskTypes = [...new Set(cases.map((c) => c.task_type).filter(Boolean))];
      const toggleSelected = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
      };
      const selectVisible = () => {
        const next = new Set(selectedIds);
        visible.forEach((c) => next.add(c.id));
        setSelectedIds(next);
      };
      const clearSelected = () => setSelectedIds(new Set());
      const patch = (key) => (event) => updateCase(activeCaseId, { [key]: event.target.value });
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('Query Editor', 'Query Editor'))),
          h(Badge, { tone: 'brand' }, `${selectedIds.size} / ${cases.length}`)
        ),
        h('div', { className: 'ee-card-body' },
          h('div', { className: 'ee-bench-bar' },
            h('select', {
              className: 'ee-select',
              value: benchmark.id,
              onChange: (e) => loadBenchmark(e.target.value),
              disabled: busy
            }, benchmarks.map((b) => h('option', { key: b.id, value: b.id }, `${b.name} · ${b.case_count}${b.source === 'builtin' ? L(' 题（内置）', ' cases (built-in)') : ''}`))),
            h(Btn, { size: 'sm', onClick: () => fileRef.current && fileRef.current.click(), disabled: busy }, L('导入 JSONL / CSV', 'Import JSONL / CSV')),
            h('input', {
              ref: fileRef, type: 'file', accept: '.jsonl,.json,.csv,text/csv,application/json', style: { display: 'none' },
              onChange: (e) => { const file = e.target.files && e.target.files[0]; if (file) importFile(file); e.target.value = ''; }
            }),
            h(Btn, { size: 'sm', variant: 'ghost', onClick: addCase }, L('+ 手动新题', '+ New query'))
          ),
          h('div', { className: 'ee-filter-row' },
            h('select', { className: 'ee-select', value: filters.stage, onChange: (e) => setFilters({ ...filters, stage: e.target.value }) },
              h('option', { value: '' }, L('全部学段', 'All stages')), stages.map((v) => h('option', { key: v, value: v }, v))),
            h('select', { className: 'ee-select', value: filters.subject, onChange: (e) => setFilters({ ...filters, subject: e.target.value }) },
              h('option', { value: '' }, L('全部学科', 'All subjects')), subjects.map((v) => h('option', { key: v, value: v }, v))),
            h('select', { className: 'ee-select', value: filters.difficulty, onChange: (e) => setFilters({ ...filters, difficulty: e.target.value }) },
              h('option', { value: '' }, L('全部难度', 'All difficulties')), difficulties.map((v) => h('option', { key: v, value: v }, v))),
            h('select', { className: 'ee-select', value: filters.task_type, onChange: (e) => setFilters({ ...filters, task_type: e.target.value }) },
              h('option', { value: '' }, L('全部任务类型', 'All task types')), taskTypes.map((v) => h('option', { key: v, value: v }, taskTypeLabel(v, L))))
          ),
          h('div', { className: 'ee-flex', style: { marginBottom: '8px' } },
            h('input', { className: 'ee-input', style: { flex: '1 1 160px' }, value: filters.search, placeholder: L('搜索 ID、主题、Query…', 'Search ID, topic, query…'), onChange: (e) => setFilters({ ...filters, search: e.target.value }) }),
            h(Btn, { size: 'sm', variant: 'ghost', onClick: selectVisible }, L('选择当前', 'Select visible')),
            h(Btn, { size: 'sm', variant: 'ghost', onClick: clearSelected }, L('清空', 'Clear'))
          ),
          h('div', { className: 'ee-case-list', role: 'listbox', 'aria-label': L('题目列表', 'Case list') },
            visible.length === 0 ? h(EmptyState, { title: L('没有匹配的题目', 'No matching cases') }) : visible.map((c) => {
              const sum = weightSum(c.rubric);
              return h('div', {
                key: c.id,
                className: cx('ee-case-row', c.id === activeCaseId && 'active'),
                onClick: () => setActiveCaseId(c.id),
                role: 'option', 'aria-selected': c.id === activeCaseId, tabIndex: 0,
                onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') setActiveCaseId(c.id); }
              },
                h('input', {
                  className: 'ee-case-check', type: 'checkbox', checked: selectedIds.has(c.id),
                  onClick: (e) => e.stopPropagation(), onChange: () => toggleSelected(c.id)
                }),
                h('div', { className: 'ee-case-main' },
                  h('div', { className: 'ee-case-id' }, c.id),
                  h('div', { className: 'ee-case-title' }, c.topic || c.query.slice(0, 60)),
                  h('div', { className: 'ee-case-meta' },
                    c.stage ? h('span', { className: 'ee-mini-tag' }, c.stage) : null,
                    c.subject ? h('span', { className: 'ee-mini-tag' }, c.subject) : null,
                    c.difficulty ? h('span', { className: 'ee-mini-tag' }, c.difficulty) : null,
                    h('span', { className: 'ee-mini-tag' }, taskTypeLabel(c.task_type, L)),
                    h('span', { className: 'ee-mini-tag', style: sum !== 100 ? { color: 'var(--dsw-alias-state-error-primary,#dc2626)' } : null }, `${sum}%`)
                  )
                )
              );
            })
          ),
          activeCase ? h('div', { className: 'ee-query-editor' },
            h('div', { className: 'ee-query-meta' },
              h(Field, { label: L('编号', 'ID') }, h('input', { className: 'ee-input', value: activeCase.id, disabled: true })),
              h(Field, { label: L('主题', 'Topic') }, h('input', { className: 'ee-input', value: activeCase.topic || '', onChange: patch('topic') })),
              h(Field, { label: L('学段', 'Stage') }, h('input', { className: 'ee-input', value: activeCase.stage || '', onChange: patch('stage') })),
              h(Field, { label: L('难度', 'Difficulty') }, h('input', { className: 'ee-input', value: activeCase.difficulty || '', onChange: patch('difficulty') }))
            ),
            h('div', { className: 'ee-query-meta' },
              h(Field, { label: L('年级', 'Grade') }, h('input', { className: 'ee-input', value: activeCase.grade || '', onChange: patch('grade') })),
              h(Field, { label: L('学科', 'Subject') }, h('input', { className: 'ee-input', value: activeCase.subject || '', onChange: patch('subject') })),
              h(Field, { label: L('任务类型', 'Task type') }, h('select', { className: 'ee-select', value: activeCase.task_type, onChange: patch('task_type') },
                h('option', { value: 'lesson_plan' }, L('教案生成', 'Lesson plan')),
                h('option', { value: 'slide_outline' }, L('课件大纲', 'Slide outline'))
              )),
              h(Field, { label: L('基准版本', 'Benchmark version') }, h('input', { className: 'ee-input', value: activeCase.benchmark_version || '', onChange: patch('benchmark_version') }))
            ),
            h(Field, { label: 'Query' },
              h('textarea', { className: 'ee-textarea ee-textarea-lg', value: activeCase.query, onChange: patch('query') })
            ),
            h('div', { className: 'ee-flex ee-mt-12' },
              h('input', {
                className: 'ee-input', style: { flex: '1 1 180px' }, value: benchmarkName,
                placeholder: L('自定义 Benchmark 名称', 'Custom benchmark name'), onChange: (e) => setBenchmarkName(e.target.value)
              }),
              h(Btn, { size: 'sm', onClick: saveBenchmark, disabled: busy }, L('保存为自定义 Benchmark', 'Save as custom benchmark')),
              h(Btn, { size: 'sm', variant: 'ghost', onClick: () => resetCase(activeCase.id) }, L('从源重置本题', 'Reset this case'))
            )
          ) : null
        )
      );
    }

    function ResponseSection(props) {
      const { L, run, caseId, setCaseId, openResponse } = props;
      if (!run) {
        return h('div', { className: 'ee-card' },
          h(EmptyState, { icon: '⌁', title: L('还没有生成回答', 'No responses yet') })
        );
      }
      const activeId = run.cases.some((c) => c.id === caseId) ? caseId : (run.cases[0] && run.cases[0].id);
      const c = run.cases.find((x) => x.id === activeId);
      const judged = Object.values(run.judgments?.[activeId] || {}).filter((j) => j.status === 'success');
      const scores = judged.map((j) => j.total_score);
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('Model Responses', 'Model Responses'))),
          h('div', { className: 'ee-toolbar' },
            avg !== null ? h('span', { className: 'ee-chip' }, L('本题均分', 'Case mean'), h('b', null, fmtScore(avg))) : null,
            run.cases.length > 1 ? h('select', { className: 'ee-select', style: { width: 'auto', maxWidth: '260px' }, value: activeId, onChange: (e) => setCaseId(e.target.value) },
              run.cases.map((x) => h('option', { key: x.id, value: x.id }, `${x.id} · ${x.topic || ''}`))
            ) : null
          )
        ),
        h('div', { className: 'ee-card-body' },
          null,
          h('div', { className: 'ee-responses' }, run.models.map((m, index) => {
            const response = run.responses?.[activeId]?.[m.key];
            const judgment = run.judgments?.[activeId]?.[m.key];
            const score = judgment && judgment.status === 'success' ? judgment.total_score : null;
            const critical = judgment && judgment.status === 'success' && (judgment.critical_errors || []).some((e) => e.found);
            return h('article', { key: m.key, className: 'ee-response-card' },
              h('div', { className: 'ee-response-head' },
                h('div', null,
                  h('b', null, h('span', { className: 'ee-model-dot', style: { background: MODEL_COLORS[index % MODEL_COLORS.length], display: 'inline-block', marginRight: '6px' } }), m.label)
                ),
                h('div', { className: 'ee-flex' },
                  critical ? h(Badge, { tone: 'danger' }, 'Critical') : null,
                  h(Badge, { tone: response?.status === 'success' ? 'success' : response?.status === 'failed' ? 'danger' : 'neutral' }, statusLabel(response?.status || 'pending', L))
                )
              ),
              h('div', { className: 'ee-response-body' },
                response?.status === 'success'
                  ? h('pre', { className: 'ee-preview' }, response.text.slice(0, 850))
                  : h('div', { className: 'ee-error-banner', style: { marginBottom: 0 } }, response?.error || L('尚未生成回答。', 'No response generated yet.')),
                h('div', { className: 'ee-response-foot' },
                  h('div', { className: `ee-score-pill ee-score-${scoreBand(score)}` }, fmtScore(score), h('small', null, '/ 100')),
                  h(Btn, { size: 'sm', variant: 'ghost', disabled: !response?.text, onClick: () => openResponse(activeId, m.key) }, L('查看全文', 'View full'))
                )
              )
            );
          }))
        )
      );
    }

    function RubricEditor(props) {
      const { L, activeCase, updateCase, resetCase } = props;
      if (!activeCase) return h('div', { className: 'ee-card' }, h(EmptyState, { title: L('先选择一道题', 'Select a case first') }));
      const criteria = activeCase.rubric || [];
      const sum = weightSum(criteria);
      const setCriteria = (next) => updateCase(activeCase.id, { rubric: next });
      const patchCriterion = (id, patch) => setCriteria(criteria.map((c) => c.criterion_id === id ? { ...c, ...patch } : c));
      const removeCriterion = (id) => {
        if (criteria.length <= 1) return;
        setCriteria(normalizeWeights(criteria.filter((c) => c.criterion_id !== id)));
      };
      const addCriterion = () => {
        let n = criteria.length + 1;
        while (criteria.some((c) => c.criterion_id === `criterion_${n}`)) n += 1;
        const next = [...criteria, {
          criterion_id: `criterion_${n}`,
          name: L('新评分维度', 'New criterion'),
          weight: 10,
          full_score_requirements: L('描述达到 2 分所需的全部可验证要求。', 'Describe every verifiable requirement for a score of 2.'),
          score_0: L('未满足或存在重大错误。', 'Not met or materially wrong.'),
          score_1: L('部分满足但有实质遗漏。', 'Partially met with material gaps.'),
          score_2: L('满足全部关键要求。', 'All key requirements met.')
        }];
        setCriteria(normalizeWeights(next));
      };
      const setCritical = (text) => updateCase(activeCase.id, { critical_errors: text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) });
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('Rubric Editor', 'Rubric Editor'))),
          h('div', { className: 'ee-toolbar' },
            h(Badge, { tone: 'brand' }, activeCase.id),
            h(Btn, { size: 'sm', variant: 'ghost', onClick: () => resetCase(activeCase.id) }, L('恢复源 Rubric', 'Reset rubric'))
          )
        ),
        h('div', { className: 'ee-card-body' },
          h('div', { className: 'ee-weight-bar' },
            h('span', { className: 'ee-field-label' }, L('权重合计', 'Weight total')),
            h('span', { className: cx('ee-weight-total', sum === 100 ? 'ok' : 'bad') }, `${sum.toFixed(2)}%`),
            sum !== 100 ? h(Badge, { tone: 'danger' }, L('必须等于 100%', 'Must equal 100%')) : h(Badge, { tone: 'success' }, L('有效', 'Valid')),
            h('div', { className: 'ee-grow' }),
            h(Btn, { size: 'sm', variant: 'ghost', onClick: addCriterion }, L('+ 添加维度', '+ Criterion'))
          ),
          h('div', { className: 'ee-rubric-list' }, criteria.map((c, index) => h('div', { key: c.criterion_id, className: 'ee-rubric-item' },
            h('div', { className: 'ee-rubric-head' },
              h('span', { className: 'ee-rubric-index' }, String(index + 1).padStart(2, '0')),
              h('input', { className: 'ee-input', value: c.name, onChange: (e) => patchCriterion(c.criterion_id, { name: e.target.value }) }),
              h('div', { className: 'ee-rubric-weight' }, h('input', { className: 'ee-input', type: 'number', min: '0', max: '100', step: '0.5', value: c.weight, onChange: (e) => patchCriterion(c.criterion_id, { weight: Number(e.target.value) }) })),
              h(IconBtn, { label: L('删除维度', 'Remove criterion'), onClick: () => removeCriterion(c.criterion_id) }, '✕')
            ),
            h('div', { className: 'ee-rubric-desc' },
              h('textarea', {
                className: 'ee-textarea', value: c.full_score_requirements,
                placeholder: L('2 分（完全满足）的可验证判据', 'Verifiable requirements for a full score'),
                onChange: (e) => patchCriterion(c.criterion_id, { full_score_requirements: e.target.value })
              })
            )
          ))),
          h('div', { className: 'ee-mt-12' },
            h(Field, { label: 'Critical Errors' },
              h('textarea', { className: 'ee-textarea', value: (activeCase.critical_errors || []).join('\n'), onChange: (e) => setCritical(e.target.value), placeholder: L('例如：断言浮力方向竖直向下', 'e.g. asserts buoyancy points downward') })
            )
          )
        )
      );
    }

    function JudgeConfig(props) {
      const {
        L, config, presets, updateJudge, providerPreset, setProviderPreset,
        keys, keyDraft, setKeyDraft, saveKey, clearKey, testProvider, remember, setRemember
      } = props;
      const judge = config.judge;
      const keyInfo = (keys || []).find((k) => k.ref === judge.apiKeyRef);
      const options = (presets && presets.length) ? presets : FALLBACK_PRESETS;
      const selectedPreset = options.find((item) => item.id === providerPreset);
      const modelOptions = [...new Set([...(selectedPreset && selectedPreset.models ? selectedPreset.models : []), judge.model].filter(Boolean))];
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('Judge Configuration', 'Judge Configuration'))),
          h(Badge, { tone: 'brand' }, 'judge-v0.1')
        ),
        h('div', { className: 'ee-card-body' },
          h('div', { className: 'ee-provider-grid' },
            h(Field, { label: L('从厂商预设填充', 'Fill from provider preset') },
              h('select', { className: 'ee-select', value: providerPreset, onChange: (e) => {
                const id = e.target.value;
                setProviderPreset(id);
                const p = options.find((x) => x.id === id);
                if (p) updateJudge({ baseUrl: p.baseUrl, model: p.model });
              } },
                h('option', { value: '' }, L('自定义', 'Custom')),
                options.filter((p) => p.id !== 'custom').map((p) => h('option', { key: p.id, value: p.id }, p.label))
              )),
            h(Field, { label: 'Judge Model ID' },
              h(React.Fragment, null,
                h('input', { className: 'ee-input', value: judge.model, list: 'edueval-judge-model-options', onChange: (e) => updateJudge({ model: e.target.value }) }),
                h('datalist', { id: 'edueval-judge-model-options' }, modelOptions.map((model) => h('option', { key: model, value: model })))
              )
            ),
            h(Field, { label: 'Base URL' }, h('input', { className: 'ee-input', value: judge.baseUrl, onChange: (e) => updateJudge({ baseUrl: e.target.value }) })),
            h(Field, { label: L('API Key 引用', 'API Key reference') }, h('input', { className: 'ee-input', value: judge.apiKeyRef, onChange: (e) => updateJudge({ apiKeyRef: e.target.value }) }))
          ),
          h('div', { className: 'ee-provider-grid' },
            h(Field, { label: 'Temperature' }, h('input', { className: 'ee-input', type: 'number', min: '0', max: '2', step: '0.1', value: judge.temperature, onChange: (e) => updateJudge({ temperature: Number(e.target.value) }) })),
            h(Field, { label: L('最大输出 Token（0 = 不限制）', 'Max output tokens (0 = no explicit limit)') },
              h('input', { className: 'ee-input', type: 'number', min: '0', step: '1', value: judge.maxTokens ?? 0, onChange: (e) => updateJudge({ maxTokens: Math.max(0, Math.round(Number(e.target.value) || 0)) }) })
            )
          ),
          h(KeyControl, {
            provider: { apiKeyRef: judge.apiKeyRef }, keyInfo, L, remember, setRemember,
            draft: keyDraft[judge.apiKeyRef] || '', onDraft: (v) => setKeyDraft({ ...keyDraft, [judge.apiKeyRef]: v }),
            onSave: () => saveKey(judge.apiKeyRef), onClear: () => clearKey(judge.apiKeyRef),
            onTest: () => testProvider('judge')
          }),
          h('div', { className: 'ee-mt-12' },
            h(Field, { label: L('评分模式', 'Scoring mode') },
              h('div', { className: 'ee-flex' },
                h(Badge, { tone: 'neutral' }, '0 / 1 / 2')
              )
            )
          )
        )
      );
    }

    function HistoryCard({ L, runs, run, loadRun }) {
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('评测历史', 'Evaluation history'))),
          h(Badge, { tone: 'neutral' }, `${runs.length}`)
        ),
        h('div', { className: 'ee-card-body' },
          runs.length === 0 ? h(EmptyState, { title: L('暂无历史', 'No history yet') }) : h('div', { className: 'ee-history' }, runs.map((r) => h('button', {
            key: r.id, type: 'button', className: cx('ee-history-row', run && run.id === r.id && 'active'),
            onClick: () => loadRun(r.id)
          },
            h('span', { className: `ee-dot ${r.status === 'completed' ? 'on' : r.status === 'failed' || r.status === 'completed_with_errors' ? 'err' : 'warn'}` }),
            h('div', { className: 'ee-history-main' },
              h('b', null, `${r.id}${r.mock ? ' · MOCK' : ''}`)
            ),
            h(Badge, { tone: r.judge_failed > 0 ? 'warn' : 'neutral' }, `${r.judged_count || 0} ${L('评分', 'judged')}`)
          )))
        )
      );
    }

    function Leaderboard({ L, analytics, run }) {
      const rows = analytics ? [...analytics.leaderboard].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || (b.avg_score ?? -1) - (a.avg_score ?? -1)) : [];
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('综合排行榜', 'Leaderboard'))),
          analytics ? h('span', { className: 'ee-chip' }, L('共同样本', 'Common'), h('b', null, `${analytics.common_case_count} / ${analytics.case_count}`)) : null
        ),
        h('div', { className: 'ee-card-body' },
          !analytics ? h(EmptyState, { title: L('等待评分数据', 'Waiting for scores') }) : h('div', { className: 'ee-table-wrap' },
            h('table', { className: 'ee-table' },
              h('thead', null, h('tr', null,
                h('th', null, '#'),
                h('th', null, L('模型', 'Model')),
                h('th', null, L('共同均分', 'Common avg')),
                h('th', null, L('总体均分', 'Overall avg')),
                h('th', null, L('评分覆盖', 'Judge coverage')),
                h('th', null, L('Critical', 'Critical')),
                h('th', null, L('状态', 'Status'))
              )),
              h('tbody', null, rows.map((m) => {
                const idx = run.models.findIndex((x) => x.key === m.key);
                return h('tr', { key: m.key },
                  h('td', { className: 'ee-rank' }, m.rank ? `#${m.rank}` : '—'),
                  h('td', null, h('div', { className: 'ee-model-cell' },
                    h('span', { className: 'ee-model-dot', style: { background: MODEL_COLORS[Math.max(0, idx) % MODEL_COLORS.length] } }),
                    h('b', null, m.label)
                  )),
                  h('td', null, h('b', { style: { fontSize: '14px' } }, fmtScore(m.common_avg_score))),
                  h('td', null, h('span', { className: `ee-score-pill ee-score-${scoreBand(m.avg_score)}`, style: { fontSize: '13px' } }, fmtScore(m.avg_score))),
                  h('td', null, `${m.judged}/${analytics.case_count} · ${fmtPct(m.coverage)}`),
                  h('td', null, m.critical_error_cases ? h(Badge, { tone: 'danger' }, `${m.critical_error_cases}`) : '0'),
                  h('td', null, m.common_judged === analytics.case_count ? h(Badge, { tone: 'success' }, L('完整', 'Complete')) : h(Badge, { tone: 'warn' }, L('部分', 'Partial')))
                );
              }))
            )
          ),
          analytics && analytics.common_case_count === 0 && analytics.judged_total > 0
            ? h('div', { className: 'ee-warn-banner', style: { marginTop: '9px' } }, h('span', null, '⚠'), h('span', null, L('尚无所有模型共同成功评分的样本，因此没有排名；这不是 0 分。', 'No common sample where every model was judged successfully, so no rank is shown. This is not zero.'))) : null
        )
      );
    }

    function DimensionChart({ L, analytics, run }) {
      if (!analytics) return h('div', { className: 'ee-card' }, h(EmptyState, { title: L('等待评分数据', 'Waiting for scores') }));
      const firstCase = run.cases[0];
      const criteria = firstCase ? firstCase.rubric : [];
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('维度评分比较', 'Dimension comparison'))),
          h('span', { className: 'ee-chip' }, `${analytics.leaderboard.length} ${L('模型', 'models')}`)
        ),
        h('div', { className: 'ee-card-body' },
          h('div', { className: 'ee-chart' }, criteria.map((c) => {
            const rows = analytics.leaderboard.map((m) => ({ m, value: m.dimensions[c.criterion_id]?.percent ?? null }));
            const max = Math.max(1, ...rows.map((r) => r.value || 0));
            return h('div', { className: 'ee-chart-row', key: c.criterion_id },
              h('div', { className: 'ee-chart-label', title: c.name }, c.name),
              h('div', { className: 'ee-chart-track' }, rows.filter((r) => r.value !== null).map((r) => {
                const idx = run.models.findIndex((x) => x.key === r.m.key);
                return h('span', { key: r.m.key, className: 'ee-chart-seg', title: `${r.m.label}: ${fmtScore(r.value)}`, style: { width: `${(r.value / max) * 100 / Math.max(1, rows.filter((x) => x.value !== null).length)}%`, background: MODEL_COLORS[Math.max(0, idx) % MODEL_COLORS.length] } });
              })),
              h('div', { className: 'ee-chart-value' }, `${fmtScore(averageOf(rows.map((r) => r.value)))}`)
            );
          })),
          h('div', { className: 'ee-legend' }, analytics.leaderboard.map((m) => {
            const idx = run.models.findIndex((x) => x.key === m.key);
            return h('span', { key: m.key }, h('i', { style: { background: MODEL_COLORS[Math.max(0, idx) % MODEL_COLORS.length] } }), m.label);
          }))
        )
      );
    }

    function averageOf(values) {
      const nums = values.filter((v) => Number.isFinite(Number(v)));
      return nums.length ? nums.reduce((a, b) => a + Number(b), 0) / nums.length : null;
    }

    function FailurePanel({ L, analytics, onOpenCase }) {
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('失败案例与 Critical Errors', 'Failures and critical errors'))),
          analytics ? h(Badge, { tone: analytics.failures.length ? 'danger' : 'success' }, `${analytics.failures.length}`) : null
        ),
        h('div', { className: 'ee-card-body' },
          !analytics || analytics.failures.length === 0
            ? h(EmptyState, { icon: '✓', title: L('没有记录到失败', 'No recorded failures') })
            : h('div', { className: 'ee-failures' }, analytics.failures.slice(0, 30).map((f, i) => h('button', {
              type: 'button', key: `${f.kind}-${f.case_id}-${f.model_key}-${i}`,
              className: `ee-failure ${f.kind}`, onClick: () => onOpenCase(f.case_id)
            },
              h('span', { className: 'ee-failure-mark' }),
              h('div', { className: 'ee-failure-main' },
                h('b', null, `${f.kind === 'generation' ? L('生成失败', 'Generation') : f.kind === 'judge' ? L('Judge 失败', 'Judge') : L('Critical Error', 'Critical error')} · ${f.case_id} · ${f.model_label}`),
                h('p', null, f.error || f.evidence || '')
              )
            )))
        )
      );
    }

    function HumanStats({ L, analytics }) {
      const human = analytics ? analytics.human : null;
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('Human vs LLM Judge', 'Human vs LLM Judge'))),
          human ? h(Badge, { tone: human.compared_count ? 'brand' : 'neutral' }, `${human.compared_count} ${L('配对', 'pairs')}`) : null
        ),
        h('div', { className: 'ee-card-body' },
          !human || human.compared_count === 0
            ? h(EmptyState, { icon: '👤', title: L('还没有人工评分', 'No human reviews yet') })
            : h('div', null,
              h('div', { className: 'ee-summary-grid', style: { gridTemplateColumns: 'repeat(3, minmax(0,1fr))', marginBottom: '10px' } },
                h('div', { className: 'ee-stat' }, h('div', { className: 'ee-stat-label' }, 'MAE'), h('div', { className: 'ee-stat-value', style: { fontSize: '20px' } }, fmtScore(human.mae, 2))),
                h('div', { className: 'ee-stat' }, h('div', { className: 'ee-stat-label' }, L('一致率', 'Exact agreement')), h('div', { className: 'ee-stat-value', style: { fontSize: '20px' } }, `${fmtScore(human.exact_agreement)}%`)),
                h('div', { className: 'ee-stat' }, h('div', { className: 'ee-stat-label' }, 'Spearman'), h('div', { className: 'ee-stat-value', style: { fontSize: '20px' } }, human.spearman === null ? '—' : fmtScore(human.spearman, 3)))
              ),
              h('div', { className: 'ee-table-wrap' },
                h('table', { className: 'ee-table' },
                  h('thead', null, h('tr', null, h('th', null, L('评审人', 'Reviewer')), h('th', null, L('题目', 'Case')), h('th', null, L('模型', 'Model')), h('th', null, 'Human'), h('th', null, 'Judge'), h('th', null, 'Δ'))),
                  h('tbody', null, human.rows.slice(0, 12).map((r) => h('tr', { key: r.review_id },
                    h('td', null, r.reviewer_id), h('td', null, r.case_id), h('td', null, r.model_label),
                    h('td', null, fmtScore(r.human_total)), h('td', null, fmtScore(r.judge_total)),
                    h('td', { style: { color: Math.abs(r.delta) >= 10 ? 'var(--dsw-alias-state-error-primary,#dc2626)' : undefined } }, `${r.delta > 0 ? '+' : ''}${r.delta}`)
                  )))
                )
              )
            )
        )
      );
    }

    function ResponseModal({ L, data, onClose }) {
      if (!data) return null;
      const { run, caseId, modelKey } = data;
      const c = run.cases.find((x) => x.id === caseId);
      const m = run.models.find((x) => x.key === modelKey);
      const response = run.responses?.[caseId]?.[modelKey];
      const judgment = run.judgments?.[caseId]?.[modelKey];
      return h(Modal, {
        title: `${m ? m.label : modelKey} · ${caseId}`,
        onClose, wide: true
      },
        judgment && judgment.status === 'success' ? h('div', { className: 'ee-flex', style: { marginBottom: '10px', gap: '10px' } },
          h('div', { className: `ee-score-pill ee-score-${scoreBand(judgment.total_score)}` }, fmtScore(judgment.total_score), h('small', null, '/ 100')),
          judgment.critical_errors && judgment.critical_errors.some((e) => e.found) ? h(Badge, { tone: 'danger' }, 'Critical Error') : h(Badge, { tone: 'success' }, L('无 Critical Error', 'No critical error')),
          h(Badge, { tone: 'neutral' }, judgment.protocol_version || 'judge-v0.1')
        ) : null,
        h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '0 0 14px', fontSize: '12px', lineHeight: 1.65, fontFamily: 'inherit' } }, response?.status === 'success' ? response.text : response?.error || L('无回答', 'No response')),
        judgment && judgment.status === 'success' ? h('div', null,
          h('h4', { style: { margin: '0 0 7px', fontSize: '12px' } }, L('逐项评分', 'Criterion scores')),
          h('div', { className: 'ee-table-wrap' }, h('table', { className: 'ee-table', style: { minWidth: '640px' } },
            h('thead', null, h('tr', null, h('th', null, L('维度', 'Criterion')), h('th', null, L('权重', 'Weight')), h('th', null, L('分数', 'Score')), h('th', null, L('证据', 'Evidence')), h('th', null, L('理由', 'Reason')))),
            h('tbody', null, judgment.criteria.map((item) => {
              const rubric = c?.rubric.find((r) => r.criterion_id === item.criterion_id);
              return h('tr', { key: item.criterion_id },
                h('td', null, h('b', null, rubric ? rubric.name : item.criterion_id)),
                h('td', null, `${rubric ? rubric.weight : '—'}%`),
                h('td', null, h('b', { style: { fontSize: '14px' } }, item.score)),
                h('td', null, item.evidence),
                h('td', null, item.reason)
              );
            }))
          )),
          h('div', { className: 'ee-mt-12' },
            h('h4', { style: { margin: '0 0 7px', fontSize: '12px' } }, L('Critical Errors 判定', 'Critical errors')),
            h('div', { className: 'ee-flex' }, (judgment.critical_errors || []).map((e) => h(Badge, { key: e.error, tone: e.found ? 'danger' : 'success' }, `${e.found ? 'FOUND' : 'OK'} · ${e.error}`)))
          ),
          h('details', { className: 'ee-advanced' },
            h('summary', null, L('Judge 原始输出与参数', 'Raw judge output and parameters')),
            h('pre', { className: 'ee-mono', style: { whiteSpace: 'pre-wrap', fontSize: '10.5px', maxHeight: '300px', overflow: 'auto', marginTop: '8px' } }, judgment.raw_output || '')
          )
        ) : h('div', { className: 'ee-error-banner' }, judgment?.error || L('尚未评分', 'Not judged yet'))
      );
    }

    function EduEvalPage(props) {
      const { t, locale } = props;
      const lang = useLang(locale);
      const L = useCallback((zh, en) => lang === 'zh' ? zh : en, [lang]);
      const [loading, setLoading] = useState(true);
      const [fatal, setFatal] = useState('');
      const [toast, setToast] = useState(null);
      const toastTimer = useRef(null);
      const showToast = useCallback((text, tone = 'info') => {
        setToast({ text, tone });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 4200);
      }, []);
      useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

      const [cases, setCases] = useState([]);
      const [baseCases, setBaseCases] = useState([]);
      const [benchmark, setBenchmark] = useState({ id: 'builtin-edueval-v0.2', name: 'EduEval Benchmark 10Q v0.2', version: '0.2.0', source: 'builtin', hash: '' });
      const [benchmarks, setBenchmarks] = useState([]);
      const [benchmarkName, setBenchmarkName] = useState('EduEval custom benchmark');
      const [activeCaseId, setActiveCaseId] = useState('');
      const [selectedIds, setSelectedIds] = useState(new Set());
      const [filters, setFilters] = useState({ stage: '', subject: '', difficulty: '', task_type: '', search: '' });
      const [config, setConfig] = useState(null);
      const [presets, setPresets] = useState([]);
      const [keys, setKeys] = useState([]);
      const [keyDraft, setKeyDraft] = useState({});
      const [remember, setRemember] = useState(false);
      const [mockMode, setMockMode] = useState(false);
      const [judgePreset, setJudgePreset] = useState('');
      const [runs, setRuns] = useState([]);
      const [run, setRun] = useState(null);
      const [selectedRunId, setSelectedRunId] = useState('');
      const [analytics, setAnalytics] = useState(null);
      const [groups, setGroups] = useState({ stages: [], subjects: [], difficulties: [], task_types: [] });
      const [analyticsFilter, setAnalyticsFilter] = useState({ stage: '', subject: '', difficulty: '', task_type: '' });
      const [loadingAnalytics, setLoadingAnalytics] = useState(false);
      const [analyticsNonce, setAnalyticsNonce] = useState(0);
      const [busy, setBusy] = useState(false);
      const [savingConfig, setSavingConfig] = useState(false);
      const [runBusy, setRunBusy] = useState(false);
      const [responseCaseId, setResponseCaseId] = useState('');
      const [responseModal, setResponseModal] = useState(null);
      const [dataDir, setDataDir] = useState('');

      const applyBenchmark = useCallback((b, selectAll = false) => {
        const cloned = clone(b.cases || []);
        setBenchmark({ id: b.id, name: b.name, version: b.version, source: b.source, hash: b.hash || '' });
        setCases(cloned);
        setBaseCases(clone(cloned));
        setBenchmarkName(b.name || 'EduEval custom benchmark');
        setActiveCaseId(cloned[0] ? cloned[0].id : '');
        setSelectedIds(new Set(selectAll ? cloned.map((c) => c.id) : cloned.slice(0, 3).map((c) => c.id)));
      }, []);

      const loadBootstrap = useCallback(async () => {
        setLoading(true);
        setFatal('');
        try {
          const data = await api('bootstrap');
          setConfig(data.config);
          setPresets(data.presets || []);
          setMockMode(data.config.settings.mockMode === true);
          setKeys(data.keys || []);
          setRuns(data.runs || []);
          setBenchmarks(data.benchmarks || []);
          setDataDir(data.data_dir || '');
          applyBenchmark(data.benchmark, false);
          if (data.runs && data.runs.length) setSelectedRunId(data.runs[0].id);
        } catch (err) {
          setFatal(err.message);
        } finally {
          setLoading(false);
        }
      }, [applyBenchmark]);

      useEffect(() => { loadBootstrap(); }, [loadBootstrap]);

      const refreshHistory = useCallback(async () => {
        try {
          const data = await api('history?limit=40');
          setRuns(data.runs || []);
        } catch {}
      }, []);

      const loadRun = useCallback(async (id) => {
        if (!id) return;
        setSelectedRunId(id);
        try {
          const data = await api(`run?run_id=${encodeURIComponent(id)}`);
          setRun(data.run);
          setResponseCaseId((prev) => data.run.cases.some((c) => c.id === prev) ? prev : (data.run.cases[0] ? data.run.cases[0].id : ''));
          if (!ACTIVE_STATUS.has(data.run.status)) refreshHistory();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }, [refreshHistory, showToast]);

      useEffect(() => {
        if (selectedRunId) loadRun(selectedRunId);
      }, [selectedRunId]);

      useEffect(() => {
        if (!run || !ACTIVE_STATUS.has(run.status)) return;
        const id = setInterval(async () => {
          try {
            const data = await api(`run?run_id=${encodeURIComponent(run.id)}`);
            setRun(data.run);
            if (!ACTIVE_STATUS.has(data.run.status)) {
              refreshHistory();
            }
          } catch {
            // Polling failures are transient; the next tick retries.
          }
        }, 1200);
        return () => clearInterval(id);
      }, [run && run.id, run && run.status, refreshHistory]);

      useEffect(() => {
        if (!run) { setAnalytics(null); return; }
        let cancelled = false;
        setLoadingAnalytics(true);
        const params = new URLSearchParams({ run_id: run.id });
        for (const key of ['stage', 'subject', 'difficulty', 'task_type']) if (analyticsFilter[key]) params.set(key, analyticsFilter[key]);
        api(`analytics?${params.toString()}`).then((data) => {
          if (cancelled) return;
          setAnalytics(data.analytics);
          if (data.analytics.groups) setGroups(data.analytics.groups);
        }).catch((err) => { if (!cancelled) showToast(err.message, 'error'); }).finally(() => { if (!cancelled) setLoadingAnalytics(false); });
        return () => { cancelled = true; };
      }, [run && run.id, run && run.status, analyticsFilter.stage, analyticsFilter.subject, analyticsFilter.difficulty, analyticsFilter.task_type, analyticsNonce]);

      const flushKeyDrafts = useCallback(async () => {
        const entries = Object.entries(keyDraft || {}).filter(([, value]) => String(value || '').trim());
        if (!entries.length) return 0;
        for (const [ref, key] of entries) {
          await api('keys', { method: 'POST', body: { ref, key: String(key).trim(), remember } });
        }
        setKeyDraft((prev) => {
          const next = { ...prev };
          for (const [ref] of entries) delete next[ref];
          return next;
        });
        const status = await api('keys/status');
        setKeys(status.keys || []);
        showToast(L(`${entries.length} 个 API Key 已保存${remember ? '（DSH Credential Store）' : '（仅当前 Host 内存）'}`, `${entries.length} API key(s) saved${remember ? ' to DSH Credential Store' : ' in Host memory only'}`), 'success');
        return entries.length;
      }, [keyDraft, remember, L, showToast]);

      const saveConfig = useCallback(async () => {
        if (!config) return null;
        setSavingConfig(true);
        try {
          await flushKeyDrafts();
          const data = await api('config', { method: 'POST', body: config });
          setConfig(data.config);
          setKeys(data.keys || []);
          showToast(L('配置已保存', 'Configuration saved'), 'success');
          return data.config;
        } catch (err) {
          showToast(err.message, 'error');
          return null;
        } finally {
          setSavingConfig(false);
        }
      }, [config, flushKeyDrafts, L, showToast]);

      const startRun = useCallback(async (workflow) => {
        if (!config) return;
        const selectedCases = cases.filter((c) => selectedIds.has(c.id));
        if (selectedCases.length === 0) { showToast(L('请至少选择一道题', 'Select at least one case'), 'error'); return; }
        const bad = selectedCases.find((c) => Math.abs(weightSum(c.rubric) - 100) > 0.01);
        if (bad) { setActiveCaseId(bad.id); showToast(L(`题目 ${bad.id} 的 Rubric 权重不等于 100%`, `Rubric weights for ${bad.id} do not sum to 100%`), 'error'); return; }
        if (!config.selectedModelIds.length) { showToast(L('请至少选择一个被测模型', 'Select at least one model'), 'error'); return; }
        setRunBusy(true);
        try {
          await flushKeyDrafts();
          const saved = await api('config', { method: 'POST', body: config });
          setConfig(saved.config);
          setKeys(saved.keys || []);
          const data = await api('runs', {
            method: 'POST',
            body: {
              workflow,
              cases: selectedCases,
              modelIds: config.selectedModelIds,
              judge: config.judge,
              mockMode,
              concurrency: config.settings.concurrency,
              retries: config.settings.retries,
              benchmark: { id: benchmark.id, name: benchmark.name, version: benchmark.version, source: benchmark.source, hash: benchmark.hash }
            }
          });
          setRun(data.run);
          setSelectedRunId(data.run.id);
          setResponseCaseId(selectedCases[0].id);
          showToast(workflow === 'full' ? L('完整评测已启动', 'Full evaluation started') : L('生成任务已启动', 'Generation started'), 'success');
          refreshHistory();
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          setRunBusy(false);
        }
      }, [cases, selectedIds, config, mockMode, benchmark, L, showToast, refreshHistory, flushKeyDrafts]);

      const evaluateRun = useCallback(async () => {
        if (!run) return;
        setRunBusy(true);
        try {
          await flushKeyDrafts();
          const saved = await api('config', { method: 'POST', body: config });
          setConfig(saved.config);
          const data = await api('evaluate', { method: 'POST', body: { runId: run.id, judge: config.judge, mockMode } });
          setRun(data.run);
          showToast(L('Judge 已启动', 'Judge started'), 'success');
        } catch (err) { showToast(err.message, 'error'); } finally { setRunBusy(false); }
      }, [run, config, mockMode, L, showToast, flushKeyDrafts]);

      const cancelRun = useCallback(async () => {
        if (!run) return;
        setRunBusy(true);
        try {
          const data = await api('cancel', { method: 'POST', body: { runId: run.id } });
          setRun(data.run);
          showToast(L('已请求取消', 'Cancellation requested'), 'success');
        } catch (err) { showToast(err.message, 'error'); } finally { setRunBusy(false); }
      }, [run, L, showToast]);

      const resumeRun = useCallback(async (retryFailed) => {
        if (!run) return;
        setRunBusy(true);
        try {
          const data = await api('resume', { method: 'POST', body: { runId: run.id, retryFailed } });
          setRun(data.run);
          showToast(retryFailed ? L('正在重试失败任务', 'Retrying failed tasks') : L('正在继续缺失任务', 'Resuming missing tasks'), 'success');
        } catch (err) { showToast(err.message, 'error'); } finally { setRunBusy(false); }
      }, [run, L, showToast]);

      const updateProvider = (id, patch) => {
        setConfig((prev) => ({ ...prev, providers: prev.providers.map((p) => p.id === id ? { ...p, ...patch } : p) }));
      };
      const toggleModel = (id) => {
        setConfig((prev) => {
          const set = new Set(prev.selectedModelIds);
          if (set.has(id)) set.delete(id); else set.add(id);
          if (set.size === 0) return prev;
          return { ...prev, selectedModelIds: [...set] };
        });
      };
      const applyPreset = (id, presetId) => {
        const preset = (presets || []).find((item) => item.id === presetId);
        if (!preset) return;
        updateProvider(id, presetId === 'custom'
          ? { preset: 'custom', label: L('自定义', 'Custom'), vendor: 'Custom' }
          : {
              preset: preset.id,
              label: preset.label,
              vendor: preset.vendor,
              baseUrl: preset.baseUrl,
              model: preset.model,
              apiKeyRef: preset.apiKeyRef
            });
      };
      const addProvider = () => {
        setConfig((prev) => {
          let n = prev.providers.length + 1;
          while (prev.providers.some((p) => p.id === `model-${n}`)) n += 1;
          const id = `model-${n}`;
          const preset = (presets || []).find((item) => item.id === 'glm') || (presets || [])[0] || {
            id: 'custom', label: '自定义', vendor: 'Custom', baseUrl: 'https://api.example.com/v1',
            model: 'model-id', apiKeyRef: `EDUEVAL_CUSTOM_${n}_API_KEY`
          };
          const provider = {
            id,
            preset: preset.id,
            label: preset.label,
            vendor: preset.vendor,
            baseUrl: preset.baseUrl,
            model: preset.model,
            apiKeyRef: preset.apiKeyRef,
            temperature: 0.2,
            maxTokens: 0,
            timeoutMs: 300000
          };
          return { ...prev, providers: [...prev.providers, provider], selectedModelIds: [...prev.selectedModelIds, id] };
        });
      };
      const removeProvider = (id) => {
        setConfig((prev) => {
          if (prev.providers.length <= 1) return prev;
          return {
            ...prev,
            providers: prev.providers.filter((p) => p.id !== id),
            selectedModelIds: prev.selectedModelIds.filter((x) => x !== id)
          };
        });
      };
      const updateJudge = (patch) => setConfig((prev) => ({ ...prev, judge: { ...prev.judge, ...patch } }));
      const saveKey = async (ref) => {
        const key = (keyDraft[ref] || '').trim();
        if (!key) return;
        try {
          const data = await api('keys', { method: 'POST', body: { ref, key, remember } });
          setKeyDraft({ ...keyDraft, [ref]: '' });
          const status = await api('keys/status');
          setKeys(status.keys || []);
          if (data.warning) showToast(data.warning, 'warn');
          else showToast(L('Key 已保存', 'Key saved'), 'success');
        } catch (err) { showToast(err.message, 'error'); }
      };
      const clearKey = async (ref) => {
        try {
          await api('keys/clear', { method: 'POST', body: { ref } });
          const status = await api('keys/status');
          setKeys(status.keys || []);
          showToast(L('Key 已清除', 'Key cleared'), 'success');
        } catch (err) { showToast(err.message, 'error'); }
      };
      const testProvider = async (kind, providerId) => {
        setSavingConfig(true);
        try {
          await flushKeyDrafts();
          const saved = await api('config', { method: 'POST', body: config });
          setConfig(saved.config);
          setKeys(saved.keys || []);
          const data = await api('test', { method: 'POST', body: { kind, providerId, mockMode } });
          showToast(`${L('连接成功', 'Connection OK')} · ${data.model || ''} · ${data.latency_ms} ms · ${data.text || ''}`, 'success');
        } catch (err) {
          const failedProvider = kind === 'judge' ? null : config.providers.find((p) => p.id === providerId);
          const quotaHint = /429|余额不足|insufficient|quota|balance/i.test(err.message);
          const hint = failedProvider && failedProvider.preset === 'glm' && quotaHint
            ? L('；GLM 账户余额不足时可切换到 glm-4.7-flash（免费模型）验证接入。', '; if GLM has no balance, switch to glm-4.7-flash (free) to verify connectivity.')
            : '';
          showToast(`${err.message}${hint}`, 'error');
        } finally { setSavingConfig(false); }
      };

      const loadBenchmark = async (id) => {
        try {
          const data = await api(`benchmark?id=${encodeURIComponent(id)}`);
          applyBenchmark(data.benchmark, false);
          showToast(L(`已载入 ${data.benchmark.cases.length} 题`, `Loaded ${data.benchmark.cases.length} cases`), 'success');
        } catch (err) { showToast(err.message, 'error'); }
      };
      const importFile = async (file) => {
        try {
          const content = await file.text();
          const lower = file.name.toLowerCase();
          const format = lower.endsWith('.csv') ? 'csv' : lower.endsWith('.json') ? 'json' : 'jsonl';
          const name = file.name.replace(/\.(jsonl|json|csv)$/i, '');
          const data = await api('benchmark/import', { method: 'POST', body: { format, content, name } });
          applyBenchmark(data.benchmark, false);
          const list = await api('bootstrap');
          setBenchmarks(list.benchmarks || []);
          showToast(L(`已导入 ${data.benchmark.cases.length} 题`, `Imported ${data.benchmark.cases.length} cases`), 'success');
        } catch (err) { showToast(err.message, 'error'); }
      };
      const saveBenchmark = async () => {
        try {
          const data = await api('benchmark/save', { method: 'POST', body: { name: benchmarkName || 'EduEval custom benchmark', version: benchmark.version || '0.1.0', cases } });
          applyBenchmark(data.benchmark, true);
          const list = await api('bootstrap');
          setBenchmarks(list.benchmarks || []);
          showToast(L('自定义 Benchmark 已保存', 'Custom benchmark saved'), 'success');
        } catch (err) { showToast(err.message, 'error'); }
      };
      const addCase = () => {
        const id = `CUSTOM-${Date.now().toString(36).toUpperCase()}`;
        const c = makeDefaultCase(id, L);
        setCases((prev) => [...prev, c]);
        setSelectedIds((prev) => new Set([...prev, id]));
        setActiveCaseId(id);
        showToast(L('已添加自定义题；编辑后请保存 Benchmark', 'Custom case added; save the benchmark after editing'), 'info');
      };
      const updateCase = (id, patch) => setCases((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
      const resetCase = (id) => {
        const source = baseCases.find((c) => c.id === id);
        if (source) {
          setCases((prev) => prev.map((c) => c.id === id ? clone(source) : c));
          showToast(L('已恢复源题目', 'Case reset to source'), 'success');
        } else showToast(L('该题没有源快照', 'No source snapshot for this case'), 'warn');
      };
      const exportRun = async (format) => {
        if (!run) return;
        try { await downloadReport(run.id, format); showToast(L('导出已开始', 'Export started'), 'success'); }
        catch (err) { showToast(err.message, 'error'); }
      };
      const openResponse = (caseId, modelKey) => setResponseModal({ run, caseId, modelKey });
      const onOpenCase = (caseId) => {
        setActiveCaseId(caseId);
        setResponseCaseId(caseId);
        setSelectedIds((prev) => new Set([...prev, caseId]));
        const el = document.getElementById('edueval-responses');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      if (loading) {
        return h('div', { className: 'ee-page' }, h('div', { className: 'ee-loading' }, h('div', null, h('div', { className: 'ee-spinner' }), L('正在加载 EduEval Studio…', 'Loading EduEval Studio…'))));
      }
      if (fatal || !config) {
        return h('div', { className: 'ee-page' }, h('div', { className: 'ee-shell' },
          h('div', { className: 'ee-card' }, h('div', { className: 'ee-card-body' },
            h('div', { className: 'ee-error-banner' }, fatal || L('无法加载配置', 'Could not load configuration')),
            h(Btn, { variant: 'brand', onClick: loadBootstrap }, L('重试', 'Retry'))
          ))
        ));
      }
      const activeCase = cases.find((c) => c.id === activeCaseId);
      const selectedModelCount = config.selectedModelIds.length;
      const runActive = run && ACTIVE_STATUS.has(run.status);
      return h('div', { className: 'ee-page' },
        h('div', { className: 'ee-shell' },
          h('header', { className: 'ee-topbar' },
            h('div', { className: 'ee-brand' },
              h('div', { className: 'ee-logo' }, h(EduEvalIcon, { size: 27 })),
              h('div', null,
                h('h1', null, 'EduEval Studio'),
                h('div', { className: 'ee-title-badges' },
                  h(Badge, { tone: 'brand' }, 'DSH Plugin'),
                  h(Badge, { tone: 'neutral' }, 'v1.0.0 · DSH 0.2.1-rc.3'),
                  mockMode ? h(Badge, { tone: 'mock' }, 'MOCK MODE') : h(Badge, { tone: 'success' }, L('LIVE API', 'LIVE API')),
                  h('span', { className: 'ee-chip', title: dataDir }, h('span', { className: `ee-dot ${runActive ? 'on' : run ? 'warn' : ''}` }), L('数据目录', 'Data'), h('b', null, dataDir ? dataDir.split(/[\\/]/).slice(-2).join('/') : '—'))
                )
              )
            ),
            h('div', { className: 'ee-top-actions' },
              h(Btn, { size: 'sm', variant: 'ghost', onClick: loadBootstrap }, L('刷新', 'Refresh')),
              h(Btn, { size: 'sm', variant: mockMode ? 'danger' : 'secondary', onClick: () => { setMockMode(!mockMode); setConfig((prev) => ({ ...prev, settings: { ...prev.settings, mockMode: !mockMode } })); } }, mockMode ? L('退出 Mock', 'Exit mock') : L('Mock 模式', 'Mock mode')),
              h(Btn, { size: 'sm', variant: 'brand', onClick: saveConfig, disabled: savingConfig }, savingConfig ? L('保存中…', 'Saving…') : L('保存配置', 'Save config'))
            )
          ),

          h('section', { className: 'ee-section' },
            h(SectionHeading, {
              no: '01', title: L('MODEL GENERATION', 'MODEL GENERATION')
            }),
            h('div', { className: 'ee-grid-2' },
              h(QueryEditor, {
                L, cases, baseCases, selectedIds, setSelectedIds, activeCaseId, setActiveCaseId,
                updateCase, addCase, resetCase, benchmarks, benchmark, loadBenchmark, importFile, saveBenchmark,
                benchmarkName, setBenchmarkName, filters, setFilters, busy
              }),
              h(ModelConfig, {
                L, config, presets, updateProvider, applyPreset, removeProvider, addProvider, toggleModel, saveConfig, saveConfigBusy: savingConfig,
                keys, keyDraft, setKeyDraft, saveKey, clearKey, testProvider, remember, setRemember, mockMode, setMockMode: (v) => {
                  setMockMode(v);
                  setConfig((prev) => ({ ...prev, settings: { ...prev.settings, mockMode: v } }));
                }
              })
            )
          ),

          h('section', { className: 'ee-section', id: 'edueval-responses' },
            h(SectionHeading, {
              no: '02', title: L('MODEL RESPONSES', 'MODEL RESPONSES'),
              subtitle: L('查看同一 Query 下每个模型的回答、状态与评分入口。', 'Inspect each model response, status, and score for the same query.'),
              right: run ? h(Badge, { tone: mockMode ? 'mock' : 'neutral' }, mockMode ? 'MOCK' : L('真实 API', 'Live')) : null
            }),
            h(ResponseSection, { L, run, caseId: responseCaseId || activeCaseId, setCaseId: setResponseCaseId, openResponse })
          ),

          h('section', { className: 'ee-section' },
            h(SectionHeading, {
              no: '03', title: L('EVALUATION', 'EVALUATION'),
              subtitle: L('为当前题目编辑 Rubric，并独立配置 Judge。', 'Edit the per-case rubric and configure the independent Judge.'),
              right: activeCase ? h(Badge, { tone: weightSum(activeCase.rubric) === 100 ? 'success' : 'danger' }, `${L('权重', 'Weights')} ${weightSum(activeCase.rubric).toFixed(1)}%`) : null
            }),
            h('div', { className: 'ee-grid-2' },
              h(RubricEditor, { L, activeCase, updateCase, resetCase }),
              h(JudgeConfig, {
                L, config, presets, updateJudge, providerPreset: judgePreset, setProviderPreset: setJudgePreset,
                keys, keyDraft, setKeyDraft, saveKey, clearKey, testProvider, remember, setRemember
              })
            )
          ),

          h(RunBar, {
            L, selectedCount: selectedIds.size, selectedModelCount, config, run, busy: runBusy,
            onRun: startRun, onEvaluate: evaluateRun, onCancel: cancelRun,
            onResume: () => resumeRun(false), onRetry: () => resumeRun(true),
            mockMode, setMockMode: (v) => {
              setMockMode(v);
              setConfig((prev) => ({ ...prev, settings: { ...prev.settings, mockMode: v } }));
            }
          }),

          h('section', { className: 'ee-section' },
            h(SectionHeading, {
              no: '04', title: L('RESULTS & REPORT', 'RESULTS & REPORT'),
              subtitle: L('综合排行榜、维度差异、失败案例、人工一致性，以及 CSV / JSON / Markdown 报告。', 'Leaderboard, dimension comparison, failures, human agreement, and CSV / JSON / Markdown reports.'),
              right: run ? h('div', { className: 'ee-flex' },
                h(Badge, { tone: run.status === 'completed' ? 'success' : run.status === 'completed_with_errors' ? 'warn' : 'neutral' }, statusLabel(run.status, L)),
                mockMode ? h(Badge, { tone: 'mock' }, 'MOCK') : null
              ) : null
            }),
            h(Dashboard, {
              L, run, analytics, analyticsFilter, setAnalyticsFilter, groups, runs, loadRun, exportRun, onOpenCase, loadingAnalytics
            })
          ),

          h('section', { className: 'ee-section' },
            h(SectionHeading, {
              no: '05', title: L('HUMAN REVIEW', 'HUMAN REVIEW'),
              subtitle: L('匿名 A/B/C 盲评、逐项 0/1/2、文字评价；保存后可揭盲对照 Judge。', 'Blind A/B/C scoring, 0/1/2 per criterion, comments; reveal after saving to compare with Judge.'),
              right: run && run.human_reviews ? h(Badge, { tone: 'brand' }, `${run.human_reviews.length} ${L('份人工评分', 'reviews')}`) : null
            }),
            h(HumanReview, { L, run, showToast, onSaved: () => { refreshHistory(); if (run) loadRun(run.id); setAnalyticsNonce((n) => n + 1); } })
          )
        ),
        toast ? h('div', { className: `ee-toast ${toast.tone || ''}`, role: 'status' },
          h('span', null, toast.text),
          h('span', { className: 'ee-toast-close', onClick: () => setToast(null), role: 'button', 'aria-label': 'Dismiss' }, '✕')
        ) : null,
        responseModal ? h(ResponseModal, { L, data: responseModal, onClose: () => setResponseModal(null) }) : null
      );
    }

    function HumanReview(props) {
      const { L, run, showToast, onSaved } = props;
      const [reviewer, setReviewer] = useState(() => {
        try { return localStorage.getItem('edueval-reviewer') || ''; } catch { return ''; }
      });
      const [caseId, setCaseId] = useState(run && run.cases[0] ? run.cases[0].id : '');
      const [blind, setBlind] = useState(null);
      const [alias, setAlias] = useState('A');
      const [drafts, setDrafts] = useState({});
      const [loading, setLoading] = useState(false);
      const [submitting, setSubmitting] = useState(false);
      const [reveal, setReveal] = useState(null);
      const [error, setError] = useState('');

      useEffect(() => {
        if (!run) return;
        const id = run.cases.some((c) => c.id === caseId) ? caseId : (run.cases[0] && run.cases[0].id);
        if (id !== caseId) setCaseId(id);
      }, [run && run.id]);

      useEffect(() => {
        if (!run || !caseId) return;
        let cancelled = false;
        setLoading(true);
        setError('');
        setReveal(null);
        api(`blind?run_id=${encodeURIComponent(run.id)}&case_id=${encodeURIComponent(caseId)}`).then((data) => {
          if (cancelled) return;
          const b = data.blind;
          setBlind(b);
          const nextDrafts = {};
          for (const c of b.candidates) {
            if (c.status !== 'success') continue;
            const old = drafts[c.alias] || {};
            const scores = { ...(old.scores || {}) };
            const evidence = { ...(old.evidence || {}) };
            for (const r of b.rubric) {
              if (scores[r.criterion_id] === undefined) scores[r.criterion_id] = null;
              if (evidence[r.criterion_id] === undefined) evidence[r.criterion_id] = '';
            }
            nextDrafts[c.alias] = { scores, evidence, comments: old.comments || '', critical: old.critical || [] };
          }
          setDrafts(nextDrafts);
          const first = b.candidates.find((c) => c.status === 'success');
          setAlias(first ? first.alias : 'A');
        }).catch((err) => setError(err.message)).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
      }, [run && run.id, caseId]);

      if (!run) {
        return h('div', { className: 'ee-card' }, h(EmptyState, { icon: '👁', title: L('运行一次评测后可进行人工盲评', 'Run an evaluation before blind review'), children: L('匿名映射由 Host 生成；评审前不会返回模型身份。', 'Anonymous mapping is generated on the Host; model identity is never returned before reveal.') }));
      }
      const caseData = blind || { query: run.cases.find((c) => c.id === caseId)?.query, rubric: run.cases.find((c) => c.id === caseId)?.rubric || [], critical_errors: [], candidates: [] };
      const current = caseData.candidates.find((c) => c.alias === alias);
      const draft = drafts[alias] || { scores: {}, evidence: {}, comments: '', critical: [] };
      const scoredCount = caseData.rubric.filter((r) => draft.scores[r.criterion_id] !== null && draft.scores[r.criterion_id] !== undefined).length;
      const total = caseData.rubric.reduce((sum, r) => sum + (Number(draft.scores[r.criterion_id]) || 0) * Number(r.weight) / 2, 0);
      const patchDraft = (patch) => setDrafts({ ...drafts, [alias]: { ...draft, ...patch } });
      const setScore = (id, score) => patchDraft({ scores: { ...draft.scores, [id]: score } });
      const setEvidence = (id, value) => patchDraft({ evidence: { ...draft.evidence, [id]: value } });
      const save = async () => {
        if (!reviewer.trim()) { showToast(L('请填写评审人 ID', 'Enter a reviewer ID'), 'error'); return; }
        if (scoredCount !== caseData.rubric.length) { showToast(L('请完成全部维度评分', 'Score every criterion first'), 'error'); return; }
        setSubmitting(true);
        setError('');
        try {
          await api('blind/review', {
            method: 'POST',
            body: {
              runId: run.id, caseId, reviewerId: reviewer.trim(), alias,
              criteria: caseData.rubric.map((r) => ({ criterion_id: r.criterion_id, score: draft.scores[r.criterion_id], evidence: draft.evidence[r.criterion_id] || '' })),
              comments: draft.comments, criticalErrorsFound: draft.critical
            }
          });
          try { localStorage.setItem('edueval-reviewer', reviewer.trim()); } catch {}
          const refreshed = await api(`blind?run_id=${encodeURIComponent(run.id)}&case_id=${encodeURIComponent(caseId)}`);
          setBlind(refreshed.blind);
          showToast(L(`已保存 ${alias} 的评分（${fmtScore(total)} / 100）`, `Saved review for ${alias} (${fmtScore(total)} / 100)`), 'success');
          if (onSaved) onSaved();
        } catch (err) {
          setError(err.message);
          showToast(err.message, 'error');
        } finally {
          setSubmitting(false);
        }
      };
      const doReveal = async () => {
        try {
          const data = await api('blind/reveal', { method: 'POST', body: { runId: run.id, caseId, reviewerId: reviewer.trim() } });
          setReveal(data.reveal);
        } catch (err) { setError(err.message); showToast(err.message, 'error'); }
      };
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('人工盲评 · Human Review', 'Blind Human Review'))),
          h('div', { className: 'ee-toolbar' },
            h('input', { className: 'ee-input', style: { width: '160px' }, value: reviewer, placeholder: L('评审人 ID', 'Reviewer ID'), onChange: (e) => setReviewer(e.target.value) }),
            h('select', { className: 'ee-select', style: { width: 'auto', maxWidth: '250px' }, value: caseId, onChange: (e) => setCaseId(e.target.value) },
              run.cases.map((c) => h('option', { key: c.id, value: c.id }, `${c.id} · ${c.topic || ''}`))
            )
          )
        ),
        h('div', { className: 'ee-card-body' },
          error ? h('div', { className: 'ee-error-banner' }, error) : null,
          loading ? h('div', { className: 'ee-empty' }, h('div', { className: 'ee-spinner' }), L('正在加载匿名候选…', 'Loading anonymized candidates…')) :
          h('div', { className: 'ee-human-grid' },
            h('div', null,
              h('div', { className: 'ee-blind-tabs' },
                caseData.candidates.map((c) => h('button', {
                  type: 'button', key: c.alias, disabled: c.status !== 'success',
                  className: cx('ee-blind-tab', alias === c.alias && 'active'),
                  onClick: () => setAlias(c.alias)
                }, c.alias))
              ),
              h('div', { className: 'ee-answer' },
                current && current.status === 'success' ? h('pre', null, current.text) : h('div', null, L('该匿名候选没有成功回答。', 'This anonymous candidate has no successful response.'))
              ),
              h('div', { className: 'ee-mt-12' },
                h(Field, { label: L('文字评价（可选）', 'Comments (optional)') },
                  h('textarea', { className: 'ee-textarea', value: draft.comments, onChange: (e) => patchDraft({ comments: e.target.value }), placeholder: L('记录整体判断、证据或评委备注…', 'Overall judgment, evidence, or notes…') })
                )
              ),
              caseData.critical_errors && caseData.critical_errors.length ? h('div', { className: 'ee-mt-12' },
                h('div', { className: 'ee-field-label' }, L('Critical Errors', 'Critical Errors')),
                h('div', { className: 'ee-flex', style: { marginTop: '5px' } }, caseData.critical_errors.map((e) => h('label', { key: e, className: 'ee-toggle-row', style: { border: '1px solid var(--dsw-alias-border-l2,#e7eaf0)', borderRadius: '7px', padding: '5px 7px' } },
                  h('input', { type: 'checkbox', checked: (draft.critical || []).includes(e), onChange: (ev) => {
                    const set = new Set(draft.critical || []);
                    if (ev.target.checked) set.add(e); else set.delete(e);
                    patchDraft({ critical: [...set] });
                  } }),
                  h('span', { className: 'ee-toggle-text' }, h('b', { style: { fontWeight: 500, fontSize: '10.5px' } }, e))
                )))
              ) : null
            ),
            h('div', null,
              h('div', { className: 'ee-flex', style: { justifyContent: 'space-between', marginBottom: '4px' } },
                h('b', null, `${L('匿名候选', 'Candidate')} ${alias}`),
                h(Badge, { tone: scoredCount === caseData.rubric.length ? 'success' : 'warn' }, `${scoredCount} / ${caseData.rubric.length}`)
              ),
              caseData.rubric.map((r, i) => h('div', { className: 'ee-score-row', key: r.criterion_id },
                h('div', { className: 'ee-score-row-name' },
                  `${String(i + 1).padStart(2, '0')} ${r.name}`,
                  h('span', { className: 'ee-chip', style: { marginLeft: '6px' } }, `${r.weight}%`)
                ),
                h('div', { className: 'ee-score-btns' }, [0, 1, 2].map((s) => h('button', {
                  type: 'button', key: s, className: cx('ee-score-btn', draft.scores[r.criterion_id] !== null && draft.scores[r.criterion_id] !== undefined && Number(draft.scores[r.criterion_id]) === s && 'active'), 'data-score': s,
                  onClick: () => setScore(r.criterion_id, s)
                }, s)))
              )),
              h('div', { className: 'ee-flex', style: { justifyContent: 'space-between', marginTop: '10px', paddingTop: '9px', borderTop: '1px solid var(--dsw-alias-border-l2,#e7eaf0)' } },
                h('span', null, L('人工总分', 'Human total')),
                h('span', { className: `ee-score-pill ee-score-${scoreBand(total)}` }, fmtScore(total), h('small', null, '/ 100'))
              ),
              h('div', { className: 'ee-flex', style: { justifyContent: 'flex-end', marginTop: '9px' } },
                h(Btn, { variant: 'brand', onClick: save, disabled: submitting || !current || current.status !== 'success' }, submitting ? L('保存中…', 'Saving…') : L('保存人工评分', 'Save review')),
                h(Btn, { variant: 'ghost', onClick: doReveal, disabled: !(blind && blind.existing_reviews && blind.existing_reviews.length) }, L('揭盲', 'Reveal'))
              ),
              reveal ? h('div', { className: 'ee-mt-12' },
                h('div', { className: 'ee-field-label', style: { marginBottom: '5px' } }, L('揭盲结果', 'Revealed mapping')),
                h('div', { className: 'ee-table-wrap' }, h('table', { className: 'ee-table', style: { minWidth: '340px' } },
                  h('thead', null, h('tr', null, h('th', null, 'A/B/C'), h('th', null, L('模型', 'Model')), h('th', null, 'Judge'))),
                  h('tbody', null, reveal.entries.map((e) => h('tr', { key: e.alias },
                    h('td', null, h('b', null, e.alias)),
                    h('td', null, `${e.model_label}`),
                    h('td', null, fmtScore(e.judge_total))
                  )))
                ))
              ) : null
            )
          )
        )
      );
    }

    function Dashboard(props) {
      const {
        L, run, analytics, analyticsFilter, setAnalyticsFilter, groups, runs, loadRun, exportRun, onOpenCase, loadingAnalytics
      } = props;
      if (!run) {
        return h('div', { className: 'ee-card' }, h(EmptyState, { icon: '▤', title: L('运行一次评测后查看结果', 'Run an evaluation to see results'), children: L('排行榜、维度对比、失败案例、人工一致性都会在这里汇总。', 'Leaderboard, dimensions, failures, and human agreement will appear here.') }));
      }
      const mock = run.mock || run.mode === 'mock';
      return h('div', { className: 'ee-dashboard' },
        mock ? h('div', { className: 'ee-warn-banner', style: { marginBottom: '12px' } }, h('span', null, '⚠'), h('span', null, L('本次为 MOCK 运行，所有分数都是确定性占位值，不是真实模型评测结果。', 'This is a MOCK run. All scores are deterministic placeholders, not real model evaluation results.'))) : null,
        h('div', { className: 'ee-grid-2', style: { gridTemplateColumns: 'minmax(0, 1.55fr) minmax(280px, .75fr)' } },
          h('div', { className: 'ee-card' },
            h('div', { className: 'ee-card-head' },
              h('div', null, h('h3', null, L('03 Results · 综合看板', '03 Results · Dashboard'))),
              h('div', { className: 'ee-toolbar' },
                h(Btn, { size: 'sm', onClick: () => exportRun('csv'), disabled: loadingAnalytics }, 'CSV'),
                h(Btn, { size: 'sm', onClick: () => exportRun('json'), disabled: loadingAnalytics }, 'JSON'),
                h(Btn, { size: 'sm', onClick: () => exportRun('markdown'), disabled: loadingAnalytics }, 'Markdown')
              )
            ),
            h('div', { className: 'ee-card-body' },
              analytics ? h('div', null,
                h('div', { className: 'ee-summary-grid' },
                  h('div', { className: 'ee-stat' }, h('div', { className: 'ee-stat-label' }, L('共同样本', 'Common sample')), h('div', { className: 'ee-stat-value' }, `${analytics.common_case_count}`)),
                  h('div', { className: 'ee-stat' }, h('div', { className: 'ee-stat-label' }, L('已完成评分', 'Successful judgments')), h('div', { className: 'ee-stat-value' }, `${analytics.judged_total}`)),
                  h('div', { className: 'ee-stat' }, h('div', { className: 'ee-stat-label' }, L('Judge 失败', 'Judge failures')), h('div', { className: 'ee-stat-value', style: { color: analytics.judge_failed_total ? 'var(--dsw-alias-state-error-primary,#dc2626)' : undefined } }, `${analytics.judge_failed_total}`)),
                  h('div', { className: 'ee-stat' }, h('div', { className: 'ee-stat-label' }, L('Critical Errors', 'Critical errors')), h('div', { className: 'ee-stat-value', style: { color: analytics.critical_error_total ? 'var(--dsw-alias-state-error-primary,#dc2626)' : undefined } }, `${analytics.critical_error_total}`))
                ),
                h('div', { className: 'ee-flex', style: { marginBottom: '10px' } },
                  h('span', { className: 'ee-field-label' }, L('分组筛选', 'Group filter')),
                  ['stage', 'subject', 'difficulty', 'task_type'].map((key) => h('select', {
                    key, className: 'ee-select', style: { width: 'auto' }, value: analyticsFilter[key] || '',
                    onChange: (e) => setAnalyticsFilter({ ...analyticsFilter, [key]: e.target.value })
                  },
                    h('option', { value: '' }, key === 'stage' ? L('全部学段', 'All stages') : key === 'subject' ? L('全部学科', 'All subjects') : key === 'difficulty' ? L('全部难度', 'All difficulties') : L('全部任务类型', 'All types')),
                    (groups[key === 'task_type' ? 'task_types' : key === 'stage' ? 'stages' : key === 'subject' ? 'subjects' : 'difficulties'] || []).map((v) => h('option', { key: v, value: v }, v === 'lesson_plan' ? L('教案生成', 'Lesson plan') : v === 'slide_outline' ? L('课件大纲', 'Slide outline') : v))
                  )),
                  (analyticsFilter.stage || analyticsFilter.subject || analyticsFilter.difficulty || analyticsFilter.task_type)
                    ? h(Btn, { size: 'sm', variant: 'ghost', onClick: () => setAnalyticsFilter({ stage: '', subject: '', difficulty: '', task_type: '' }) }, L('清除筛选', 'Clear'))
                    : null
                )
              ) : h(EmptyState, { title: L('暂无看板数据', 'No dashboard data') }),
              h('div', { className: 'ee-mt-12' }, h(Leaderboard, { L, analytics, run }))
            )
          ),
          h('div', null,
            h(HistoryCard, { L, runs, run, loadRun }),
            h('div', { className: 'ee-mt-12' }, h(HumanStats, { L, analytics }))
          )
        ),
        h('div', { className: 'ee-grid-equal ee-mt-12' },
          h('div', { className: 'ee-card' }, h('div', { className: 'ee-card-head' }, h('h3', null, L('能力维度', 'Dimensions'))), h('div', { className: 'ee-card-body' }, h(DimensionChart, { L, analytics, run }))),
          h('div', { className: 'ee-card' }, h('div', { className: 'ee-card-head' }, h('h3', null, L('低分与失败', 'Low scores and failures'))), h('div', { className: 'ee-card-body' },
            h('div', { className: 'ee-kv' }, h('span', null, L('最低分题目', 'Lowest cases')), h('b', null, `${analytics && analytics.lowest_cases.length ? analytics.lowest_cases[0].case_id : '—'}`)),
            analytics && analytics.lowest_cases.length ? h('div', { style: { margin: '8px 0' } }, analytics.lowest_cases.map((c) => h('button', {
              type: 'button', key: c.case_id, className: 'ee-history-row', onClick: () => onOpenCase(c.case_id)
            }, h('span', { className: 'ee-history-main' }, h('b', null, c.case_id), h('span', null, c.topic || '')), h(Badge, { tone: scoreBand(c.average) }, fmtScore(c.average))))) : h('div', null, L('暂无数据', 'No data')),
            h('div', { className: 'ee-mt-12' }, h(FailurePanel, { L, analytics, onOpenCase }))
          ))
        )
      );
    }
    function RunBar(props) {
      const {
        L, selectedCount, selectedModelCount, config, run, busy, onRun, onEvaluate, onCancel, onResume, onRetry,
        mockMode, setMockMode
      } = props;
      const active = run && ACTIVE_STATUS.has(run.status);
      const hasRun = Boolean(run);
      const genOnly = run && run.workflow === 'generation' && run.status === 'completed';
      const interrupted = run && ['interrupted', 'cancelled', 'failed', 'completed_with_errors'].includes(run.status);
      const progress = run && run.progress ? run.progress.overall_percent : 0;
      return h('div', { className: 'ee-runbar' },
        h('div', { className: 'ee-runbar-main' },
          h('div', { className: 'ee-flex' },
            h('b', null, L('Run Generation / Run Evaluation', 'Run Generation / Run Evaluation')),
            mockMode ? h(Badge, { tone: 'mock' }, 'MOCK') : h(Badge, { tone: 'neutral' }, L('真实 API', 'Live API'))
          ),
          active ? h('div', { style: { marginTop: '7px', width: 'min(460px, 100%)' } }, h(ProgressBar, { value: progress, label: L('总进度', 'Overall progress') })) : null
        ),
        h('div', { className: 'ee-runbar-actions' },
          h(Btn, { variant: 'ghost', size: 'sm', onClick: () => setMockMode(!mockMode) }, mockMode ? L('关闭 Mock', 'Disable mock') : L('Mock 模式', 'Mock mode')),
          active ? h(Btn, { variant: 'danger', size: 'sm', onClick: onCancel, disabled: busy }, L('取消任务', 'Cancel run')) : null,
          interrupted ? h(Btn, { size: 'sm', onClick: onResume, disabled: busy }, L('继续缺失任务', 'Resume missing')) : null,
          interrupted ? h(Btn, { size: 'sm', variant: 'ghost', onClick: onRetry, disabled: busy }, L('重试失败任务', 'Retry failed')) : null,
          h(Btn, { variant: 'secondary', onClick: () => onRun('generation'), disabled: busy || active || selectedCount === 0 || selectedModelCount === 0 }, L('仅运行生成', 'Run generation')),
          genOnly ? h(Btn, { variant: 'brand', onClick: onEvaluate, disabled: busy || selectedCount === 0 }, L('运行 Judge', 'Run Judge')) : null,
          h(Btn, { variant: 'primary', onClick: () => onRun('full'), disabled: busy || active || selectedCount === 0 || selectedModelCount === 0 }, hasRun && !genOnly ? L('运行新的完整评测', 'Run new full evaluation') : L('运行完整评测', 'Run full evaluation'))
        )
      );
    }
    function ModelConfig(props) {
      const {
        L, config, presets, updateProvider, applyPreset, removeProvider, addProvider, toggleModel, saveConfig, saveConfigBusy,
        keys, keyDraft, setKeyDraft, saveKey, clearKey, testProvider, remember, setRemember, mockMode, setMockMode
      } = props;
      const keyByRef = new Map((keys || []).map((k) => [k.ref, k]));
      const options = (presets && presets.length) ? presets : FALLBACK_PRESETS;
      const builtInOptions = options.filter((item) => item.id !== 'custom');
      const customOptions = options.filter((item) => item.id === 'custom');
      return h('div', { className: 'ee-card' },
        h('div', { className: 'ee-card-head' },
          h('div', null, h('h3', null, L('Model Configuration', 'Model Configuration'))),
          h('div', { className: 'ee-toolbar' },
            h(Btn, { size: 'sm', variant: 'ghost', onClick: addProvider }, L('+ 添加测试模型', '+ Test model')),
            h(Btn, { size: 'sm', onClick: saveConfig, disabled: saveConfigBusy }, saveConfigBusy ? L('保存中…', 'Saving…') : L('保存配置', 'Save config'))
          )
        ),
        h('div', { className: 'ee-card-body' },
          h('div', { className: 'ee-provider-catalog' },
            h('span', { className: 'ee-field-label' }, L('内置模型提供方', 'Built-in providers')),
            builtInOptions.map((item) => h('span', { key: item.id, className: 'ee-mini-tag' }, item.label))
          ),
          h('div', { className: 'ee-flex', style: { marginBottom: '10px' } },
            h(Toggle, { checked: mockMode, onChange: setMockMode, label: L('Mock 模式', 'Mock mode') })
          ),
          mockMode ? h('div', { className: 'ee-warn-banner', style: { marginBottom: '10px' } },
            h('span', null, '⚠'),
            h('span', null, L('Mock 模式已开启。界面、导出和报告都会标记 MOCK；请勿对外宣称这是真实评测。', 'Mock mode is ON. UI, exports, and reports are labeled MOCK; do not present them as real evaluation.'))
          ) : null,
          h('div', { className: 'ee-provider-list' }, config.providers.map((p, index) => {
            const selected = config.selectedModelIds.includes(p.id);
            const preset = options.find((item) => item.id === p.preset) || options.find((item) => item.id === 'custom');
            const modelOptions = [...new Set([...(preset && preset.models ? preset.models : []), p.model].filter(Boolean))];
            const datalistId = `edueval-model-options-${index}-${p.id}`;
            const slotTitle = L(`测试模型 ${index + 1}`, `Test model ${index + 1}`);
            return h('div', { key: p.id, className: cx('ee-provider', selected && 'selected') },
              h('div', { className: 'ee-provider-head' },
                h('input', { className: 'ee-case-check', type: 'checkbox', checked: selected, onChange: () => toggleModel(p.id) }),
                h('div', { className: 'ee-provider-title' },
                  h('b', null, slotTitle)
                ),
                h(Badge, { tone: selected ? 'brand' : 'neutral' }, selected ? L('参与评测', 'Selected') : L('未选择', 'Off')),
                config.providers.length > 1 ? h(IconBtn, { label: L('删除测试模型', 'Remove test model'), onClick: () => removeProvider(p.id) }, '✕') : null
              ),
              h('div', { className: 'ee-provider-grid ee-provider-select-grid' },
                h(Field, { label: L('Provider', 'Provider') },
                  h('select', { className: 'ee-select', value: (preset && preset.id) || 'custom', onChange: (e) => applyPreset(p.id, e.target.value) },
                    h('optgroup', { label: L('内置模型提供方', 'Built-in providers') },
                      builtInOptions.map((item) => h('option', { key: item.id, value: item.id }, item.label))
                    ),
                    customOptions.length ? h('optgroup', { label: L('其他', 'Other') },
                      customOptions.map((item) => h('option', { key: item.id, value: item.id }, item.label))
                    ) : null
                  )
                ),
                h(Field, { label: 'Model ID' },
                  h(React.Fragment, null,
                    h('input', {
                      className: 'ee-input', value: p.model, list: datalistId,
                      onChange: (e) => updateProvider(p.id, { model: e.target.value })
                    }),
                    h('datalist', { id: datalistId }, modelOptions.map((model) => h('option', { key: model, value: model })))
                  )
                ),
                h(Field, { label: 'Base URL' }, h('input', { className: 'ee-input', value: p.baseUrl, onChange: (e) => updateProvider(p.id, { baseUrl: e.target.value }) })),
                h(Field, { label: L('API Key 引用', 'API Key reference') }, h('input', { className: 'ee-input', value: p.apiKeyRef, onChange: (e) => updateProvider(p.id, { apiKeyRef: e.target.value }) }))
              ),
              h(KeyControl, {
                provider: p, keyInfo: keyByRef.get(p.apiKeyRef), L, remember, setRemember,
                draft: keyDraft[p.apiKeyRef] || '', onDraft: (v) => setKeyDraft({ ...keyDraft, [p.apiKeyRef]: v }),
                onSave: () => saveKey(p.apiKeyRef),
                onClear: () => clearKey(p.apiKeyRef),
                onTest: () => testProvider('model', p.id),
                busy: false
              }),
              h('details', { className: 'ee-advanced' },
                h('summary', null, L('推理参数与超时', 'Inference parameters and timeout')),
                h('div', { className: 'ee-advanced-grid' },
                  h(Field, { label: 'Temperature' }, h('input', { className: 'ee-input', type: 'number', step: '0.1', min: '0', max: '2', value: p.temperature, onChange: (e) => updateProvider(p.id, { temperature: Number(e.target.value) }) })),
                  h(Field, { label: L('最大输出 Token', 'Max output tokens') },
                    h('input', { className: 'ee-input', type: 'number', step: '1', min: '0', value: p.maxTokens ?? 0, onChange: (e) => updateProvider(p.id, { maxTokens: Math.max(0, Math.round(Number(e.target.value) || 0)) }) })
                  ),
                  h(Field, { label: 'Timeout (ms)' }, h('input', { className: 'ee-input', type: 'number', step: '1000', min: '1000', max: '600000', value: p.timeoutMs, onChange: (e) => updateProvider(p.id, { timeoutMs: Number(e.target.value) }) }))
                )
              )
            );
          }))
        )
      );
    }

    const name = 'dsh-plugin-edueval';
    const inject = ['slots', 'locale'];

    function apply(ctx) {
      const disposeLocale = ctx.locale.register(NS, { zh, en });
      ctx.effect(() => disposeLocale, 'edueval: locale dictionaries');
      const t = ctx.locale.bind(NS);
      const disposeStyle = installStyle();
      ctx.effect(() => disposeStyle, 'edueval: stylesheet');
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: 'edueval',
        locale: NS,
        inject: () => ({ locale: ctx.locale, t })
      }, EduEvalPage));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'edueval',
        order: 1,
        label: () => t('nav'),
        locale: NS
      }, (owner = {}) => h(EduEvalIcon, { size: owner.size || 18, active: owner.active === true })));
    }

    return { name, inject, apply };
  }
});

