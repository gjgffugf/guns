const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'build';

const baseOpts = {
  target: ts.ScriptTarget.ES2020,
  // 默认加载 DOM 库（本项目跑在浏览器 / WebView 里）。
  // 之前靠环境变量切换，一旦变量没传进去就会误报上百个
  // "Cannot find name 'HTMLElement'" —— 所以改成默认开启。
  // BB_FAST=1 时才排除，仅用于只想快速检查纯逻辑的场景。
  lib: process.env.BB_FAST
    ? ['lib.es2020.d.ts']
    : ['lib.es2020.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  strict: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noImplicitOverride: true,
  noFallthroughCasesInSwitch: true,
  skipLibCheck: true,
  types: [],
};

const opts = mode === 'check'
  ? { ...baseOpts, noEmit: true, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler }
  : { ...baseOpts, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, outDir: path.join(ROOT, 'build') };

function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (e.name.endsWith('.ts') || e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const files = [...collect(path.join(ROOT, 'src')), ...collect(path.join(ROOT, 'tests'))];
const program = ts.createProgram(files, opts);
const diags = ts.getPreEmitDiagnostics(program);

let errors = 0;
for (const d of diags) {
  if (d.category === ts.DiagnosticCategory.Error) {
    errors++;
    const lc = d.file ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0 };
    const where = d.file ? `${path.relative(ROOT, d.file.fileName)}:${lc.line + 1}` : '(global)';
    console.error(`  ERR ${where}  ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }
}

if (errors > 0) {
  console.error(`\n类型检查失败：${errors} 个错误`);
  process.exit(1);
}

if (mode === 'build') {
  const res = program.emit();
  const emitErr = res.diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (emitErr.length) {
    for (const d of emitErr) console.error('  EMIT', ts.flattenDiagnosticMessageText(d.messageText, ' '));
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, 'build', 'package.json'), '{ "type": "commonjs" }\n');
  console.log(`编译完成：${files.length} 个文件 -> build/`);
} else {
  console.log(`类型检查通过：${files.length} 个文件，0 错误`);
}
