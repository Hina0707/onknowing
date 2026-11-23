import { copyFile, cp, mkdir } from 'node:fs/promises';

async function copyAssets(packageName, folder, files, directories) {
  const source = new URL('../node_modules/' + packageName + '/', import.meta.url);
  const output = new URL('../dist/vendor/' + folder + '/', import.meta.url);
  await mkdir(output, { recursive: true });
  await Promise.all([
    ...files.map(([from, to]) => copyFile(new URL(from, source), new URL(to, output))),
    ...directories.map(([from, to]) => cp(new URL(from, source), new URL(to, output), { recursive: true }))
  ]);
}

await Promise.all([
  copyAssets('katex', 'katex', [
    ['dist/katex.mjs', 'katex.mjs'], ['dist/katex-swap.min.css', 'katex.css'], ['LICENSE', 'LICENSE']
  ], [['dist/fonts/', 'fonts/']]),
  copyAssets('pdfjs-dist', 'pdfjs', [
    ['build/pdf.min.mjs', 'pdf.min.mjs'], ['build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'], ['LICENSE', 'LICENSE']
  ], ['cmaps/', 'iccs/', 'standard_fonts/', 'wasm/'].map(name => [name, name]))
]);
