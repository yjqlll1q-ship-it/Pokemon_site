/* 最小 CDP 客户端：零依赖，复用本机 Chrome/Edge 做端到端测试。
   来源：本地技能 local-chrome-cdp-e2e 的 templates/cdp-lib.js，按需拷贝复用。
   用法：
     const { launch, sleep } = require('./cdp-lib.cjs');
     const b = await launch({ port: 9333, url: 'http://127.0.0.1:3000/' });
     console.log(await b.ev('document.title'));
     b.close();
*/
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const cands = [
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of cands) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch (e) {}
  }
  throw new Error('未找到本机 Chrome / Edge');
}

const getJSON = (url) =>
  new Promise((res, rej) => {
    http
      .get(url, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try {
            res(JSON.parse(d));
          } catch (e) {
            rej(e);
          }
        });
      })
      .on('error', rej);
  });

async function launch(opt) {
  opt = opt || {};
  const port = opt.port || 9333;
  const url = opt.url || 'about:blank';
  const size = opt.windowSize || '1180,760';
  const waitMs = opt.waitMs || 20000;
  const exe = opt.exe || findBrowser();
  const userDir = path.join(os.tmpdir(), 'cdp-' + Date.now());

  const proc = spawn(
    exe,
    [
      '--headless=new',
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + userDir,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=' + size,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let wsUrl = null;
  for (let t = 0; t < waitMs; t += 400) {
    await sleep(400);
    try {
      const v = await getJSON('http://127.0.0.1:' + port + '/json/version');
      if (v.webSocketDebuggerUrl) {
        wsUrl = v.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }
  if (!wsUrl) {
    proc.kill();
    throw new Error('浏览器调试端口未就绪');
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let id = 0;
  const waiting = new Map();
  const consoleErrors = [];
  ws.onmessage = (evt) => {
    const m = JSON.parse(evt.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      consoleErrors.push('exception: ' + (d.exception?.description || d.text));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push('console.error: ' + (m.params.args || []).map((a) => a.value || a.description || '').join(' '));
    }
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)(m);
      waiting.delete(m.id);
    }
  };
  const send = (method, params, sessionId) =>
    new Promise((res) => {
      const mid = ++id;
      waiting.set(mid, res);
      ws.send(JSON.stringify({ id: mid, method, params: params || {}, sessionId }));
    });

  let targetId = null;
  for (let t = 0; t < waitMs; t += 300) {
    const list = await getJSON('http://127.0.0.1:' + port + '/json/list');
    const t0 = list.find((x) => x.type === 'page');
    if (t0) {
      targetId = t0.id;
      break;
    }
    await sleep(300);
  }
  if (!targetId) {
    ws.close();
    proc.kill();
    throw new Error('未找到页面 target');
  }

  const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
  const S = (method, params) => send(method, params, sessionId);

  await S('Page.enable', {});
  await S('Runtime.enable', {});
  if (url && url !== 'about:blank') {
    await S('Page.navigate', { url });
    for (let t = 0; t < 60; t++) {
      const st = await S('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (st.result && st.result.result && st.result.result.value === 'complete') break;
      await sleep(300);
    }
    await sleep(600);
  }

  async function ev(expr) {
    const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : undefined;
  }

  /** 先把元素滚进视口再点，避免"元素在折叠线以下点不到" */
  async function click(sel) {
    const b = await ev(
      `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;
        e.scrollIntoView({block:'center',inline:'center'});
        const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`,
    );
    if (!b) throw new Error('找不到元素 ' + sel);
    await sleep(260);
    await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(60);
    await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(220);
  }

  async function pressKey(key, code, vk) {
    await S('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await S('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(250);
  }

  async function setViewport(width, height) {
    await S('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await sleep(650);
  }

  async function screenshot(outPath) {
    const r = await S('Page.captureScreenshot', { format: 'png' });
    if (r.result && r.result.data) {
      fs.writeFileSync(outPath, Buffer.from(r.result.data, 'base64'));
      return true;
    }
    return false;
  }

  return {
    ev,
    click,
    pressKey,
    setViewport,
    screenshot,
    send: S,
    consoleErrors,
    close: () => {
      try {
        ws.close();
      } catch (e) {}
      try {
        proc.kill();
      } catch (e) {}
    },
    proc,
  };
}

module.exports = { launch, sleep, findBrowser };
