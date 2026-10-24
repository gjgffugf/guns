/**
 * 检查 workflow YAML 是否有重复键。
 * GitHub Actions 遇到重复键会直接 "Startup failure"，工作流根本不跑。
 *   node tools/check-yaml.cjs [目录]
 */
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2] || path.resolve(__dirname, '..', '.github', 'workflows');
if (!fs.existsSync(dir)) { console.log('没有 workflow 目录，跳过'); process.exit(0); }

let bad = 0;

function check(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  /** 栈：每层记录缩进与该层已出现的键 */
  const stack = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed === '---') continue;

    const isItem = trimmed.startsWith('- ');
    const m = raw.match(/^(\s*)(?:- )?([A-Za-z_][\w.-]*)\s*:/);
    if (!m) continue;

    const base = m[1].length;
    const keyIndent = isItem ? base + 2 : base;
    const key = m[2];

    while (stack.length && stack[stack.length - 1].indent > keyIndent) stack.pop();
    const top = stack[stack.length - 1];

    if (!top || top.indent < keyIndent) {
      stack.push({ indent: keyIndent, keys: new Set([key]) });
      continue;
    }
    // 同层：列表项("- xxx")开启一个新元素，键可以重名；
    // 非列表项重名才是真重复
    if (isItem) {
      stack[stack.length - 1] = { indent: keyIndent, keys: new Set([key]) };
      continue;
    }
    if (top.keys.has(key)) {
      console.error(`  ERR ${path.basename(file)}:${i + 1}  重复的键 "${key}"`);
      bad++;
    } else {
      top.keys.add(key);
    }
  }
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
for (const f of files) check(path.join(dir, f));

if (bad > 0) {
  console.error(`\n重复键检查失败：${bad} 处`);
  process.exit(1);
}
console.log(`YAML 重复键检查通过：${files.length} 个文件`);
