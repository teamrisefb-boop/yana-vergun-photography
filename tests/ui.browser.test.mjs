import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.SITE_URL || 'http://127.0.0.1:4173/';
const output = process.env.SITE_URL ? 'test-results/published' : 'test-results/ui';
await mkdir(output,{recursive:true});

const chrome = { launch: options => chromium.launch({ ...options, channel: 'chrome' }) };
for (const [name, engine] of Object.entries({ chrome, chromium, webkit })) {
  test(`${name}: responsive UI, anchors, accessible gallery and progressive enhancement`, async t => {
    const browser=await engine.launch({headless:true});
    t.after(()=>browser.close());
    async function open(width=390, options={}) {
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',...options});
      t.after(()=>context.close());
      // No UI test can submit a real booking, even on the published site.
      await context.route('https://yana-vergun-booking.yana-vergun-photography.workers.dev/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'}));
      const page=await context.newPage();
      page.setDefaultTimeout(12000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      return {page,context,errors};
    }
    for (const width of [360,390,430,768,1366,1440]) {
      await t.test(`width ${width}: no overflow; direct/reload/click/history form anchors`,async()=>{
        const {page,errors}=await open(width);
        await page.goto(base+'#form',{waitUntil:'load'});
        await page.waitForFunction(()=>document.querySelector('#form').noValidate);
        async function position() {
          return page.evaluate(()=>({form:document.querySelector('#form').getBoundingClientRect().top,header:document.querySelector('#header').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth+1}));
        }
        let p=await position();assert.ok(p.form>=p.header+8,JSON.stringify(p));assert.ok(!p.overflow);
        assert.ok(await page.locator('#bookingTitle').isVisible());
        await page.reload({waitUntil:'load'});p=await position();assert.ok(p.form>=p.header+8,JSON.stringify(p));
        await page.goto(base+'#top',{waitUntil:'load'});
        if(width<=1100){await page.locator('#burger').click();assert.equal(await page.locator('#mobileMenu').evaluate(e=>e.open),true);await page.locator('#mobileMenu a[href="#form"]').click();}
        else await page.locator('header a[href="#form"]').click();
        await page.waitForFunction(()=>location.hash==='#form');
        p=await position();assert.ok(p.form>=p.header+8,JSON.stringify(p));
        await page.goBack();await page.waitForFunction(()=>location.hash==='#top');
        await page.goForward();await page.waitForFunction(()=>location.hash==='#form');
        p=await position();assert.ok(p.form>=p.header+8,JSON.stringify(p));
        assert.equal(await page.locator('label[for="bookingPhone"]').textContent(),'Телефон');
        await page.locator('[data-lang="en"]').click();assert.equal(await page.locator('#bookingTitle').textContent(),'Booking request');
        assert.equal(await page.locator('#burger').getAttribute('aria-label'),'Open menu');
        assert.equal(await page.locator('.fact .v').first().textContent(),'Lviv');
        await page.locator('[data-lang="uk"]').click();
        await page.locator('#form').screenshot({path:`${output}/${name}-form-${width}.png`});
        await page.goto(base,{waitUntil:'load'});
        await page.locator('.hero-media .ph__img').evaluate(e=>e.decode());
        await page.screenshot({path:`${output}/${name}-hero-${width}.png`});
        assert.deepEqual(errors,[]);
      });
    }
    await t.test('lightbox: lazy full images, keyboard, focus return, zoom and background lock',async()=>{
      const {page}=await open(390);
      const requests=[];page.on('request',r=>requests.push(r.url()));
      await page.goto(base,{waitUntil:'load'});
      assert.ok(!requests.some(u=>/-2400\./.test(u)));
      const card=page.locator('.pf-item').first();
      await card.click();await page.waitForFunction(()=>document.querySelector('#lightbox').open);
      await page.waitForFunction(()=>document.querySelector('#lightboxImage').naturalWidth>0);
      await page.locator('#lightboxImage').evaluate(e=>e.decode());
      await page.screenshot({path:`${output}/${name}-gallery-390.png`});
      assert.ok(await page.locator('body').evaluate(e=>e.classList.contains('has-dialog')));
      assert.equal(await page.locator('#lightboxImage').getAttribute('alt'),await card.locator('img').getAttribute('alt'));
      const src=await page.locator('#lightboxImage').getAttribute('src');
      await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#lightboxImage').getAttribute('src'),src);
      await page.locator('#galleryZoom').click();assert.equal(await page.locator('#galleryZoom').getAttribute('aria-pressed'),'true');
      for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('#lightbox').contains(document.activeElement)));}
      await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#lightbox').open&&!document.body.classList.contains('has-dialog'));
      assert.ok(await card.evaluate(e=>document.activeElement===e));
      assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-dialog')),false);
      await page.locator('#burger').click();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#burger').getAttribute('aria-expanded')==='false');
      await page.locator('[data-privacy]').first().click();assert.ok(await page.locator('#privacy').evaluate(e=>e.open));
      assert.match(await page.locator('#privacy').textContent(),/Cloudflare Worker/);await page.keyboard.press('Escape');
    });
    await t.test('no JavaScript and unavailable CDN: content/photos remain visible',async()=>{
      for(const javaScriptEnabled of [false,true]){
        const {page,context}=await open(390,{javaScriptEnabled});
        await context.route(/https:\/\/(cdnjs|cdn\.jsdelivr|fonts\.)/,r=>r.abort());
        await page.goto(base,{waitUntil:'load'});
        assert.ok(await page.locator('h1').isVisible());
        assert.equal(await page.locator('.hero .reveal').first().evaluate(e=>getComputedStyle(e).opacity),'1');
        const img=page.locator('.hero-media img.ph__img');await img.scrollIntoViewIfNeeded();assert.ok(await img.evaluate(e=>e.naturalWidth>0));
        assert.equal(await page.locator('[href="#"]').count(),0);
        assert.equal(await page.locator('[href^="tel:"]').count(),0);
        assert.equal(await page.locator('#testiStack').count(),0);
      }
    });
    await t.test('image failure keeps reserved layout and provides an accessible description',async()=>{
      const {page,context}=await open();
      await context.route('**/optimized/hero-main-*',r=>r.abort());
      await page.goto(base,{waitUntil:'load'});
      await page.waitForFunction(()=>document.querySelector('.hero-media .ph').classList.contains('is-error'));
      assert.ok(await page.locator('.hero-media').evaluate(e=>e.getBoundingClientRect().height>300));
      assert.match(await page.locator('.hero-media .ph').getAttribute('data-image-error'),/недоступне/);
    });
    await t.test('delayed photos never block first content or shift the direct form anchor',async()=>{
      const {page,context}=await open();
      let release;const gate=new Promise(resolve=>{release=resolve;});
      await context.route('**/optimized/*',async r=>{await gate;await r.continue();});
      await page.goto(base+'#form',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#form').noValidate);
      assert.ok(await page.locator('#bookingTitle').isVisible());
      const before=await page.locator('#form').evaluate(e=>e.getBoundingClientRect().top);
      release();await page.waitForLoadState('load');
      const after=await page.locator('#form').evaluate(e=>e.getBoundingClientRect().top);
      assert.ok(Math.abs(before-after)<=2,`${before} -> ${after}`);
    });
    await t.test('late enhancement script never moves the fixed header or hero',async()=>{
      const {page,context}=await open();
      await page.addInitScript(()=>{
        window.testCLS=0;
        if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.testCLS+=e.value;})).observe({type:'layout-shift',buffered:true});
      });
      await context.route('**/site.js*',async r=>{await new Promise(resolve=>setTimeout(resolve,700));await r.continue();});
      await page.goto(base,{waitUntil:'load'});
      assert.ok(await page.evaluate(()=>window.testCLS<.01));
    });
  });
}
