import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createSimulation, HOME, POSES } from '../src/simulation.js';
const sim=await createSimulation(async file=>new Uint8Array(await fs.readFile(new URL('../public/model/'+file,import.meta.url))));
const {model,data,arms}=sim;
assert.equal(model.nq,23);assert.equal(model.nu,14);
assert.ok(arms.every(a=>a.site>=0&&a.actuators.every(i=>i>=0)));
function run(seconds){for(let i=0;i<seconds/model.opt.timestep;i++){sim.step();assert.ok(Array.from(data.qpos).every(Number.isFinite),'Finite joint state');}}
function error(arm,pose){return Math.max(...arms[arm].qadr.slice(0,6).map((q,j)=>Math.abs(data.qpos[q]-pose[j])));}
run(3);
for(let a=0;a<2;a++)assert.ok(error(a,HOME)<.08,'Both arms hold under gravity');
const before=sim.tcp(0),right=sim.tcp(1);
sim.pose('reach',[0]);run(7);
assert.ok(error(0,POSES.reach)<.08,'Left tracks reach');
assert.ok(Math.hypot(...sim.tcp(0).map((v,i)=>v-before[i]))>.1,'Left TCP moves');
assert.ok(Math.hypot(...sim.tcp(1).map((v,i)=>v-right[i]))<.005,'Right stays independent');
sim.pose('reach',[1]);run(7);assert.ok(error(1,POSES.reach)<.08,'Right tracks reach');
for(const a of arms)sim.setTarget(a.actuators[6],0);
run(2);
for(const a of arms){assert.ok(Math.abs(data.qpos[a.qadr[6]])<.002,'Gripper closes');assert.ok(Math.abs(data.qpos[a.qadr[6]+1]-data.qpos[a.qadr[6]])<.001,'Fingers coupled');}
sim.setTarget(2,999);assert.equal(sim.target[2],sim.limits[2][1]);sim.setTarget(2,NaN);assert.ok(sim.target.every(Number.isFinite));
sim.reset();for(let a=0;a<2;a++)assert.ok(error(a,HOME)<.00001,'Reset restores both arms');
for(let i=0;i<10000;i++){sim.animate(i*model.opt.timestep);sim.step();assert.ok(Array.from(data.qpos).every(Number.isFinite));}
// Free object should rest on the table, not fall through the rendered work surface.
assert.ok(Math.abs(data.qpos[18]-.435)<.003,'Physical block rests on table');
console.log('PASS: real WASM; two independent 6-axis arms; two coupled grippers; gravity hold; pose tracking; limits; reset; 20-second dual trajectory; table contact.');
const telemetry=sim.telemetry();
for(let a=0;a<2;a++)for(let j=0;j<6;j++){
  const t=telemetry.arms[a],arm=arms[a],act=arm.actuators[j];
  assert.ok(Math.abs(t.position[j]-data.qpos[arm.qadr[j]]*180/Math.PI)<1e-9);
  assert.ok(Math.abs(t.velocity[j]-data.qvel[arm.dofadr[j]]*180/Math.PI)<1e-9);
  assert.ok(Math.abs(t.torque[j]-data.actuator_force[act]*model.actuator_gear[act*6])<1e-9,'Joint torque matches transmitted actuator force');
}
console.log('PASS: both arms telemetry units and joint torque mapping.');
data.delete();model.delete();
