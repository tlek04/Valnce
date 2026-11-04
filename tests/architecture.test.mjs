import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('runtime modules remain acyclic and the Worker has no UI/state dependencies', async () => {
  for (const entry of ['src/main.tsx', 'src/worker.ts']) {
    const { metafile } = await build({
      entryPoints: [entry], bundle: true, write: false, metafile: true,
      packages: 'external', platform: 'browser', format: 'esm',
      logLevel: 'silent', outfile: 'bundle.js',
    });
    const visited = new Set();
    function visit(name, stack = []) {
      assert.ok(!stack.includes(name), `Circular dependency: ${[...stack, name].join(' -> ')}`);
      if (visited.has(name)) return;
      for (const dependency of metafile.inputs[name]?.imports ?? []) {
        if (!dependency.external) visit(dependency.path, [...stack, name]);
      }
      visited.add(name);
    }
    for (const name of Object.keys(metafile.inputs)) visit(name);
    if (entry.endsWith('worker.ts')) {
      assert.ok(![...visited].some((name) => /src\/(components|pages|hooks|store)\//.test(name)));
    }
    for (const [name, module] of Object.entries(metafile.inputs)) {
      if (!/src\/utils\/(balance|placement|teamRules|relations|rating|player|matchStats)\.ts$/.test(name)) continue;
      assert.ok(module.imports.every((item) =>
        !/src\/(components|pages|hooks|store|server)\//.test(item.path) &&
        !/^(react|zustand)(\/|$)/.test(item.path)), `Domain depends on application state: ${name}`);
    }
  }
});
