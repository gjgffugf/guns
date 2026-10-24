const { chromium } = require('/usr/local/lib/node_modules/playwright');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const ROOT = process.env.BB_DIST || path.resolve(__dirname, '..', 'dist-debug');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };
const server = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(ROOT,p); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('404');return;}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res); });
(async()=>{
  await new Promise(r=>server.listen(0,r)); const port=server.address().port;
  const exe=['/usr/bin/google-chrome','/usr/local/bin/chromium'].find(f=>fs.existsSync(f));
  const browser=await chromium.launch({executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:720},hasTouch:true});
  page.on('pageerror',e=>console.log('  [pageerror]',String(e).slice(0,300)));
  page.on('console',m=>{ if(m.type()==='error') console.log('  [console.error]',m.text().slice(0,200)); });
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
  await page.waitForSelector('#menu:not(.hidden)',{timeout:20000});
  console.log('菜单已出现，点击单人模式…');
  await page.locator('#menu .mode').first().click();
  await page.waitForTimeout(6000);
  const st = await page.evaluate(()=>({
    hudHidden: document.querySelector('#hud')?.classList.contains('hidden'),
    loadingHidden: document.querySelector('#loading')?.classList.contains('hidden'),
    menuHidden: document.querySelector('#menu')?.classList.contains('hidden'),
    canvasVisible: (()=>{const c=document.querySelector('canvas#gl'); if(!c) return 'no-canvas'; const cs=getComputedStyle(c); return cs.display+'/'+c.width+'x'+c.height;})(),
    ctrlCount: document.querySelectorAll('#touch .ctrl').length,
    bodyIds: Array.from(document.querySelectorAll('#app > *')).map(e=>e.id||e.tagName),
  }));
  console.log('状态:', JSON.stringify(st,null,1));
  await page.screenshot({path:'/tmp/diag.png'});
  await browser.close(); server.close();
})().catch(e=>{console.error('异常',e.message); server.close(); process.exit(1);});
