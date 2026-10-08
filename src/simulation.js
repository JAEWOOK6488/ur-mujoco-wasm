import loadMujoco from '@mujoco/mujoco';
export const HOME = [-Math.PI/2,-Math.PI/2,Math.PI/2,-Math.PI/2,-Math.PI/2,0];
export const JOINTS = ['Shoulder pan','Shoulder lift','Elbow','Wrist 1','Wrist 2','Wrist 3'];
export const ARMS = ['left','right'];
export const POSES = {home:HOME, reach:[-1.57,-1.05,1.05,-1.57,-1.57,0], folded:[-1.57,-1.9,2.25,-1.9,-1.57,0]};
export async function createSimulation(read, progress=()=>{}) {
  progress('MuJoCo WASM 로딩…');
  const mj = await loadMujoco();
  mj.FS.mkdir('/working');mj.FS.mkdir('/working/assets');
  const assets=JSON.parse(new TextDecoder().decode(await read('assets.json')));
  const files=['bimanual.xml','scene.xml',...assets.map(n=>'assets/'+n)];
  let completed=0,next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<files.length){const file=files[next++];mj.FS.writeFile('/working/'+file,await read(file));progress(`양팔 모델 로딩 · ${++completed}/${files.length}`);}
  }));
  const model=mj.MjModel.mj_loadXML('/working/scene.xml');
  if(!model)throw new Error('양팔 모델을 읽지 못했습니다.');
  const data=new mj.MjData(model);
  const names=new Uint8Array(model.names),decoder=new TextDecoder();
  function named(addresses,name){return Array.from(addresses).findIndex(start=>{let end=start;while(names[end])end++;return decoder.decode(names.subarray(start,end))===name;});}
  const arms=ARMS.map(side=>{
    const actuators=['shoulder_pan','shoulder_lift','elbow','wrist_1','wrist_2','wrist_3','grip'].map(n=>named(model.name_actuatoradr,side+'_'+n));
    const qadr=actuators.map(a=>model.jnt_qposadr[model.actuator_trnid[2*a]]);
    const dofadr=actuators.map(a=>model.jnt_dofadr[model.actuator_trnid[2*a]]);
    return {side,actuators,qadr,dofadr,site:named(model.name_siteadr,side+'_tcp')};
  });
  const target=Array.from(model.key_ctrl.slice(0,model.nu));
  const limits=target.map((_,i)=>[model.actuator_ctrlrange[i*2],model.actuator_ctrlrange[i*2+1]]);
  function setTarget(i,value){if(!Number.isInteger(i)||!limits[i]||!Number.isFinite(value))return;target[i]=Math.max(limits[i][0],Math.min(limits[i][1],value));}
  function reset(){mj.mj_resetDataKeyframe(model,data,0);target.splice(0,target.length,...Array.from(data.ctrl));mj.mj_forward(model,data);}
  function step(){
    for(const arm of arms)arm.actuators.forEach((a,j)=>{const max=(j===6?.04:.8)*model.opt.timestep;data.ctrl[a]+=Math.max(-max,Math.min(max,target[a]-data.ctrl[a]));});
    mj.mj_step(model,data);
  }
  function clearBodyForce(body){data.xfrc_applied.fill(0,body*6,body*6+6);}
  function applyBodyForce(body,force,point){
    if(body<=0||body>=model.nbody||![...force,...point].every(Number.isFinite))return;
    const r=point.map((v,i)=>v-data.xipos[body*3+i]);
    data.xfrc_applied.set([...force,r[1]*force[2]-r[2]*force[1],r[2]*force[0]-r[0]*force[2],r[0]*force[1]-r[1]*force[0]],body*6);
  }
  function telemetry(){return {time:data.time,arms:arms.map(arm=>({
    position:arm.qadr.slice(0,6).map(q=>data.qpos[q]*180/Math.PI),
    velocity:arm.dofadr.slice(0,6).map(d=>data.qvel[d]*180/Math.PI),
    torque:arm.dofadr.slice(0,6).map(d=>data.qfrc_actuator[d])
  }))};}
  function tcp(arm=0){const start=arms[arm].site*3;return Array.from(data.site_xpos.slice(start,start+3));}
  function pose(name,selection=[0,1]){for(const a of selection)POSES[name].forEach((v,j)=>setTarget(arms[a].actuators[j],v));}
  function animate(t){arms.forEach((arm,a)=>{const direction=a===0?1:-1;[HOME[0]+direction*.22*Math.sin(t*.5),HOME[1]+.15*Math.sin(t*.7),HOME[2]+.18*Math.sin(t*.7+.5),HOME[3]-.12*Math.sin(t*.7),HOME[4],.25*Math.sin(t*.6)].forEach((v,j)=>setTarget(arm.actuators[j],v));setTarget(arm.actuators[6],.0175*(1+Math.sin(t)));});}
  reset();
  return {mj,model,data,arms,target,limits,setTarget,reset,step,tcp,pose,animate,telemetry,applyBodyForce,clearBodyForce};
}
