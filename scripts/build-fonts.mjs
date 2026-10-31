import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('assets/fonts/',root),{recursive:true});
for (const subset of ['latin','cyrillic']) {
  for (const style of ['normal','italic']) {
    const file=`montserrat-${subset}-wght-${style}.woff2`;
    await copyFile(new URL(`node_modules/@fontsource-variable/montserrat/files/${file}`,root),new URL(`assets/fonts/${file}`,root));
  }
}
await copyFile(new URL('node_modules/@fontsource-variable/montserrat/LICENSE',root),new URL('assets/fonts/OFL.txt',root));
