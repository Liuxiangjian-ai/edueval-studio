import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { loadBuiltinBenchmark } from '../src/host/benchmark.js';
import { normalizeConfig } from '../src/host/storage.js';
import { PROVIDER_PRESETS } from '../src/shared/schemas.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.name, 'dsh-plugin-edueval');
assert.equal(typeof pkg.dsh?.bundle?.patch, 'string');
assert.equal(pkg.dsh?.client?.platform, 'web');
assert.equal(pkg.exports['./client'], './client.js');
assert.ok(fs.existsSync(path.join(root, pkg.dsh.bundle.patch)), 'bundle patch exists');
assert.ok(fs.existsSync(path.join(root, pkg.exports['./icon'])), 'icon exists');

const patch = fs.readFileSync(path.join(root, pkg.dsh.bundle.patch), 'utf8');
assert.match(patch, /name:\s*dsh-plugin-edueval/);

const client = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
assert.match(client, /window\.__ModuleLoader__\.load\(/);
assert.match(client, /id:\s*'dsh-plugin-edueval'/);
assert.match(client, /function apply\(ctx\)/);
assert.match(client, /ctx\.slots\.register/);
assert.match(client, /sidebar\.panellist/);
assert.match(client, /name:\s*'main'/);

const benchmark = loadBuiltinBenchmark();
assert.equal(benchmark.cases.length, 10);
assert.equal(benchmark.cases.filter((c) => c.task_type === 'lesson_plan').length, 5);
assert.equal(benchmark.cases.filter((c) => c.task_type === 'slide_outline').length, 5);
for (const c of benchmark.cases) {
  assert.equal(c.rubric.length, 6);
  assert.equal(c.rubric.reduce((sum, r) => sum + r.weight, 0), 100);
}

const config = normalizeConfig({});
assert.ok(config.providers.length >= 3);
assert.equal(JSON.stringify(config).includes('apiKey"'), false);
assert.deepEqual(config.providers.map((p) => p.id), ['model-1', 'model-2', 'model-3']);
for (const id of ['glm', 'deepseek', 'qwen', 'kimi', 'openai']) {
  assert.ok(PROVIDER_PRESETS.some((preset) => preset.id === id), `missing provider preset ${id}`);
}
assert.ok(PROVIDER_PRESETS.find((preset) => preset.id === 'glm').baseUrl.includes('bigmodel.cn'));
assert.ok(PROVIDER_PRESETS.find((preset) => preset.id === 'kimi').baseUrl.includes('moonshot.cn'));

for (const locale of ['en', 'zh']) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'locale', `${locale}.json`), 'utf8'));
  assert.equal(data.meta.title, 'EduEval Studio');
  assert.ok(data.meta.description.length > 10);
}

const icon = fs.readFileSync(path.join(root, pkg.exports['./icon']), 'utf8');
assert.match(icon, /<svg[\s>]/);
assert.ok(icon.length > 300);

console.log('PASS manifest: dsh-plugin-edueval@' + pkg.version + ' with dsh.bundle + dsh.client');
console.log('PASS benchmark: 10 cases (5 lesson plans + 5 slide outlines), 6 criteria each, weights 100');
console.log('PASS client: native slot registration for main + sidebar.panellist');
console.log('PASS locale metadata and original SVG icon');
console.log('PASS config defaults: ' + config.providers.map((p) => p.label).join(', '));
