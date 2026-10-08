import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createSimulation, HOME, POSES } from '../src/simulation.js';
const sim=await createSimulation(async file=>new Uint8Array(await fs.readFile(new URL('../public/model/'+file,import.meta.url))));
const {model,data}=sim;
assert.equal(model.nq,6);assert.equal(model.nu,6);
function run(seconds){for(let i=0;i<seconds/model.opt.timestep;i++){sim.step();assert.ok(Array.from(data.qpos).every(Number.isFinite),'Finite joint state');}}
run(3);
assert.ok(Math.max(...Array.from(data.qpos,(q,i)=>Math.abs(q-HOME[i])))<.08,'Home held under gravity');
const before=sim.tcp();
POSES.reach.forEach((v,i)=>sim.setTarget(i,v));run(7);
assert.ok(Math.max(...Array.from(data.qpos,(q,i)=>Math.abs(q-POSES.reach[i])))<.08,'Motors track reach pose');
assert.ok(Math.hypot(...sim.tcp().map((v,i)=>v-before[i]))>.1,'Tool moves at least 10 cm');
sim.setTarget(2,999);assert.equal(sim.target[2],sim.limits[2][1]);
sim.setTarget(2,NaN);assert.ok(sim.target.every(Number.isFinite));
sim.reset();assert.ok(Math.max(...Array.from(data.qpos,(q,i)=>Math.abs(q-HOME[i])))<.00001,'Reset restores pose');
for(let i=0;i<10000;i++){const t=i*model.opt.timestep;sim.setTarget(0,HOME[0]+.65*Math.sin(t*.5));sim.setTarget(1,HOME[1]+.23*Math.sin(t*.7));sim.setTarget(2,HOME[2]+.3*Math.sin(t*.7+.5));sim.setTarget(3,HOME[3]-.2*Math.sin(t*.7));sim.setTarget(5,.45*Math.sin(t*.6));sim.step();assert.ok(Array.from(data.qpos).every(Number.isFinite));}
console.log('PASS: real WASM engine; 6 motors; gravity hold; target tracking; TCP displacement; limits; reset; 20-second trajectory.');
data.delete();model.delete();
