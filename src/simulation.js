import loadMujoco from '@mujoco/mujoco';
export const HOME = [-Math.PI/2,-Math.PI/2,Math.PI/2,-Math.PI/2,-Math.PI/2,0];
export const JOINTS = ['Shoulder pan','Shoulder lift','Elbow','Wrist 1','Wrist 2','Wrist 3'];
export const POSES = {home:HOME, reach:[-0.65,-1.05,1.05,-1.57,-1.57,0], folded:[-1.57,-1.9,2.25,-1.9,-1.57,0]};
export async function createSimulation(read, progress=()=>{}) {
  progress('MuJoCo WASM 로딩…');
  const mj = await loadMujoco();
  mj.FS.mkdir('/working');
  mj.FS.mkdir('/working/assets');
  const assets=JSON.parse(new TextDecoder().decode(await read('assets.json')));
  const files=['ur5e.xml','scene.xml',...assets.map(n=>'assets/'+n)];
  let completed=0;
  // Bound concurrent requests, especially for mobile connections.
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<files.length){
      const file=files[next++];
      mj.FS.writeFile('/working/'+file,await read(file));
      progress(`UR5e 모델 로딩 · ${++completed}/${files.length}`);
    }
  }));
  const model=mj.MjModel.mj_loadXML('/working/scene.xml');
  if(!model) throw new Error('UR5e 모델을 읽지 못했습니다.');
  const data=new mj.MjData(model);
  const target=HOME.slice();
  const limits=JOINTS.map((_,i)=>[model.actuator_ctrlrange[i*2],model.actuator_ctrlrange[i*2+1]]);
  function setTarget(i,value){if(!Number.isFinite(value))return;target[i]=Math.max(limits[i][0],Math.min(limits[i][1],value));}
  function reset(){mj.mj_resetDataKeyframe(model,data,0); target.splice(0,6,...HOME);mj.mj_forward(model,data);}
  function step(){
    // Velocity-limit the command to avoid discontinuous servo targets.
    for(let i=0;i<6;i++)data.ctrl[i]+=Math.max(-0.8*model.opt.timestep,Math.min(0.8*model.opt.timestep,target[i]-data.ctrl[i]));
    mj.mj_step(model,data);
  }
  function tcp(){return Array.from(data.site_xpos.slice(0,3));}
  reset();
  return {mj,model,data,target,limits,setTarget,reset,step,tcp};
}
