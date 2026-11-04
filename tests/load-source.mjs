import { build } from 'esbuild';
import Module from 'node:module';
import path from 'node:path';

// Bundle local TS only; use the installed React/Zustand singleton in every test.
export async function loadSource(entry, source) {
  const result = await build({
    ...(source ? { stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx', sourcefile: entry } } : { entryPoints: [entry] }),
    bundle: true, write: false, platform: 'node', format: 'cjs',
    packages: 'external', logLevel: 'silent', jsx: 'automatic',
    define: { 'import.meta.env': JSON.stringify({ PROD: false }) },
  });
  const filename = path.resolve('tests', 'compiled.cjs');
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(result.outputFiles[0].text, filename);
  return loaded.exports;
}

export function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}
