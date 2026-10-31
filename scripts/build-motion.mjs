import { copyFile, mkdir } from 'node:fs/promises';
const root = new URL('../',import.meta.url);
await mkdir(new URL('assets/vendor/',root),{recursive:true});
for(const file of ['gsap.min.js','ScrollTrigger.min.js']) {
  await copyFile(new URL(`node_modules/gsap/dist/${file}`,root),new URL(`assets/vendor/${file}`,root));
}
