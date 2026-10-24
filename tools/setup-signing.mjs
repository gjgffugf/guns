/**
 * 生成签名密钥并注入 Android 工程。
 *
 * 参数全部走环境变量（CI 里注入），不把密码写进仓库：
 *   BB_KS_STOREPASS  库密码
 *   BB_KS_ALIAS      别名
 *   BB_KS_KEYPASS    密钥密码
 *   BB_KS_VALIDITY   有效期（天）
 *
 * 用法：node tools/setup-signing.mjs [android目录]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ANDROID = process.argv[2] || 'android';
const APP = path.join(ANDROID, 'app');

const storepass = process.env.BB_KS_STOREPASS || 'xfangames';
const alias = process.env.BB_KS_ALIAS || 'xfan';
const keypass = process.env.BB_KS_KEYPASS || 'games2287681747';
const validity = process.env.BB_KS_VALIDITY || '36500';   // 100 年
const dname = process.env.BB_KS_DNAME || 'CN=BreakBind, OU=Game, O=XFan, L=GZ, ST=GX, C=CN';

if (!existsSync(APP)) {
  console.error(`找不到 ${APP}，请先执行 cap sync`);
  process.exit(1);
}

// ---- 1) 生成 keystore ----
const ks = path.join(APP, 'breakbind.keystore');
if (!existsSync(ks)) {
  execFileSync('keytool', [
    '-genkeypair', '-v',
    '-keystore', ks,
    '-alias', alias,
    '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', validity,
    '-storepass', storepass,
    '-keypass', keypass,
    '-dname', dname,
    '-storetype', 'JKS',
  ], { stdio: 'inherit' });
  console.log(`已生成 keystore: ${ks}（有效期 ${validity} 天）`);
} else {
  console.log('keystore 已存在，跳过生成');
}

// ---- 2) 校验别名与密码确实可用 ----
try {
  const out = execFileSync('keytool', [
    '-list', '-v', '-keystore', ks, '-alias', alias, '-storepass', storepass,
  ], { encoding: 'utf8' });
  if (!out.includes(alias)) throw new Error(`别名 ${alias} 不在 keystore 中`);
  console.log(`签名校验通过：alias=${alias}`);
} catch (e) {
  console.error('签名校验失败：', e.message);
  process.exit(1);
}

// ---- 3) 写 keystore.properties（绝对路径，gradle 不展开 ~）----
const props = [
  `storeFile=${path.resolve(ks).replace(/\\/g, '/')}`,
  `storePassword=${storepass}`,
  `keyAlias=${alias}`,
  `keyPassword=${keypass}`,
  '',
].join('\n');
writeFileSync(path.join(ANDROID, 'keystore.properties'), props);
console.log('已写入 android/keystore.properties');

// ---- 4) patch app/build.gradle：引入签名配置 ----
const gradle = path.join(APP, 'build.gradle');
let g = readFileSync(gradle, 'utf8');

if (!g.includes('bbSigning')) {
  // 4a) 在 android { 内插入 signingConfigs
  const propsBlock = `
    signingConfigs {
        bbSigning {
            def bbKsFile = rootProject.file('keystore.properties')
            def bbKs = new Properties()
            if (bbKsFile.exists()) {
                bbKs.load(new FileInputStream(bbKsFile))
            }
            storeFile bbKs['storeFile'] ? file(bbKs['storeFile']) : null
            storePassword bbKs['storePassword']
            keyAlias bbKs['keyAlias']
            keyPassword bbKs['keyPassword']
        }
    }
`;
  const at = g.search(/android\s*\{/);
  if (at < 0) {
    console.error('build.gradle 里找不到 android { 块');
    process.exit(1);
  }
  const brace = g.indexOf('{', at);
  g = g.slice(0, brace + 1) + propsBlock + g.slice(brace + 1);

  // 4b) release 块引用签名配置
  const rel = /([ \t]*)release\s*\{/;
  const m = g.match(rel);
  if (!m) {
    console.error('build.gradle 里找不到 release { 块');
    process.exit(1);
  }
  const indent = m[1];
  g = g.replace(rel, `${indent}release {\n${indent}    signingConfig signingConfigs.bbSigning`);

  writeFileSync(gradle, g);
  console.log('已注入签名配置到 app/build.gradle');
} else {
  console.log('build.gradle 已含签名配置，跳过');
}

// ---- 5) 自检：确认真的写进去了 ----
const finalG = readFileSync(gradle, 'utf8');
const okSig = finalG.includes('signingConfigs.bbSigning')
  && finalG.includes("keyAlias bbKs['keyAlias']");
if (!okSig) {
  console.error('自检失败：build.gradle 缺少签名配置');
  process.exit(1);
}
console.log('自检通过：release 构建将使用指定签名');

console.log('签名设置完成');
