import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const url=process.argv[2] || 'http://127.0.0.1:4173/';
const output=process.env.PERF_OUTPUT || 'test-results/performance';
const device=process.env.PERF_DEVICE==='desktop'?'desktop':'mobile';
const viewport=device==='desktop'?{width:1440,height:900}:{width:390,height:844};
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:device==='mobile',hasTouch:device==='mobile'});
  await context.route('https://yana-vergun-booking.yana-vergun-photography.workers.dev/**',r=>r.abort());
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1600000/8,uploadThroughput:750000/8});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.addInitScript(()=>{
    window.uiMetrics={cls:0,lcp:0,longTasks:[],frames:[],scrollStart:0};
    new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.uiMetrics.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
    new PerformanceObserver(list=>{for(const e of list.getEntries())window.uiMetrics.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
    new PerformanceObserver(list=>{for(const e of list.getEntries())window.uiMetrics.longTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
  });
  await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,loading,disabled-by-default-devtools.timeline.frame',transferMode:'ReturnAsStream'});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('intro-pending'));
  await page.waitForTimeout(1700);
  await page.locator('.hero-media .ph__img').evaluate(e=>e.decode());
  await page.screenshot({path:`${output}/slow-${device}-first-screen.png`});
  await page.evaluate(()=>{
    window.uiMetrics.scrollStart=performance.now();
    let last=performance.now();
    function frame(t){window.uiMetrics.frames.push(t-last);last=t;if(!window.uiMetrics.done)requestAnimationFrame(frame);}
    requestAnimationFrame(frame);
  });
  for(const direction of [1,-1]){
    for(let n=0;n<14;n++){
      await page.mouse.wheel(0, direction*900);
      await new Promise(resolve=>setTimeout(resolve,80));
    }
  }
  await page.evaluate(()=>{window.uiMetrics.done=true;});
  const observed=await page.evaluate(()=>({...window.uiMetrics,runtime:{intro:document.documentElement.dataset.intro,motion:document.documentElement.dataset.motion}}));
  const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
  await cdp.send('Tracing.end');
  const {stream}=await complete;let trace='';
  for(;;){const data=await cdp.send('IO.read',{handle:stream});trace+=data.data;if(data.eof)break;}
  await cdp.send('IO.close',{handle:stream});
  await writeFile(`${output}/${device}-scroll.trace.json`,trace);
  const frames=observed.frames.slice(1);
  const sorted=[...frames].sort((a,b)=>a-b);
  const report={conditions:{viewport:`${viewport.width}x${viewport.height}`,network:'1.6 Mbps down / 0.75 Mbps up / 150 ms latency',cpuSlowdown:4,cache:'disabled',browser:browser.version()},runtime:observed.runtime,lcpMs:observed.lcp,cls:observed.cls,scroll:{sampledFrames:frames.length,p95FrameGapMs:sorted[Math.floor(sorted.length*.95)],maxFrameGapMs:Math.max(...frames),gapsOver50ms:frames.filter(x=>x>50).length,longTasks:observed.longTasks.filter(x=>x.start>=observed.scrollStart)}};
  await writeFile(`${output}/${device}-scroll.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally{await browser.close();}
