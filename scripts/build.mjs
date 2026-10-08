import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('public/vendor', {recursive:true});
await build({entryPoints:['src/main.js'],bundle:true,format:'esm',external:['module','node:*'],minify:true,outfile:'public/app.js'});
await copyFile('node_modules/three/LICENSE','public/vendor/three-LICENSE');
await copyFile('node_modules/@mujoco/mujoco/mujoco.wasm','public/mujoco.wasm');
await copyFile('licenses/mujoco-APACHE.txt','public/vendor/mujoco-LICENSE');
console.log('Built public/app.js + official MuJoCo WASM.');
