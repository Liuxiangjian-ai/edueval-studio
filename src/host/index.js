import { registerApi } from './api.js';
import { EduEvalEngine, PLUGIN_VERSION } from './runner.js';

export const name = 'dsh-plugin-edueval';
export const version = PLUGIN_VERSION;
export const inject = ['connection'];

/**
 * EduEval Studio Host entry.
 *
 * The Host owns every model request, rubric-validation decision, score,
 * persistence write, and blind-review mapping. The browser only receives
 * display-safe state and callbacks through the authenticated Connection Fetch
 * routes under /api/edueval.
 */
export function apply(ctx) {
  const engine = new EduEvalEngine(ctx);
  ctx.effect(() => () => engine.dispose(), 'edueval: engine lifetime');
  const disposers = registerApi(ctx, engine);
  ctx.effect(
    () => () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          // Route disposal is best-effort during plugin unload.
        }
      }
    },
    'edueval: api routes',
  );
  ctx.inject(['credentials'], (scoped) => {
    engine.credentials = scoped.credentials;
    return () => {
      engine.credentials = null;
    };
  });
  ctx.logger?.info?.('EduEval Studio loaded (v%s)', PLUGIN_VERSION);
}

export default { name, inject, apply, version: PLUGIN_VERSION };
