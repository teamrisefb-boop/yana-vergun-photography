import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';

const [url = 'http://127.0.0.1:4173/', label = 'after'] = process.argv.slice(2);
const port = await new Promise(resolve => { const s=createServer(); s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));}); });
const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`] });
try {
  const result = await lighthouse(url, {
    port, output: ['json', 'html'], onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: 'mobile', throttlingMethod: 'simulate', disableStorageReset: false,
    screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 1, disabled: false },
    saveAssets: true,
  });
  await mkdir('test-results/performance', { recursive: true });
  await writeFile(`test-results/performance/${label}.json`, result.report[0]);
  await writeFile(`test-results/performance/${label}.html`, result.report[1]);
  if (result.artifacts.Trace) await writeFile(`test-results/performance/${label}-defaultPass.trace.json`, JSON.stringify(result.artifacts.Trace));
  const lhr = result.lhr;
  const metrics = Object.fromEntries(['first-contentful-paint','largest-contentful-paint','cumulative-layout-shift','total-blocking-time','speed-index','total-byte-weight'].map(key => [key, lhr.audits[key]?.numericValue]));
  console.log(JSON.stringify({ label, lighthouseVersion:lhr.lighthouseVersion, fetchTime:lhr.fetchTime, categories:Object.fromEntries(Object.entries(lhr.categories).map(([k,v])=>[k,v.score])), metrics, warnings:lhr.runWarnings }, null, 2));
} finally { await browser.close(); }
