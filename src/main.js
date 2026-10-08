import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSimulation, HOME, JOINTS, POSES } from './simulation.js';
import { buildScene, syncBodies } from './scene.js';
// Match the reference MuJoCo WASM viewer's linear display pipeline.
THREE.ColorManagement.enabled=false;
const $=id=>document.getElementById(id);
const radToDeg=180/Math.PI;
let running=true, demo=false, demoTime=0;
async function main(){
 const sim=await createSimulation(async file=>{
   const res=await fetch(new URL('model/'+file,document.baseURI));
   if(!res.ok)throw new Error(`${file}: HTTP ${res.status}`);
   return new Uint8Array(await res.arrayBuffer());
 },text=>$('loading').textContent=text);
 const {mj,model,data}=sim;
 const scene=new THREE.Scene();
 scene.background=new THREE.Color(.15,.25,.35);
 scene.fog=new THREE.Fog(scene.background,15,25.5);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
 renderer.toneMapping=THREE.NoToneMapping;
 $('canvas').appendChild(renderer.domElement);
 renderer.domElement.setAttribute('aria-label','마우스로 회전하고 확대할 수 있는 UR5e 로봇');
 const camera=new THREE.PerspectiveCamera(45,1,0.01,100);
 const orbit=new OrbitControls(camera,renderer.domElement);
 orbit.enableDamping=true;orbit.minDistance=.5;orbit.maxDistance=5;orbit.maxPolarAngle=Math.PI*.49;
 function resetCamera(){camera.position.set(1.35,1.1,1.65);orbit.target.set(0,.38,0);orbit.update();}
 resetCamera(); $('camera').onclick=resetCamera;
 scene.add(new THREE.AmbientLight(0xffffff,.1*Math.PI));
 const sun=new THREE.SpotLight(0xffffff,10*Math.PI);
 sun.position.set(0,3,3);sun.angle=1.11;sun.penumbra=.5;sun.distance=10000;sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.near=.1;sun.shadow.camera.far=100;sun.shadow.bias=-.00005;
 sun.target.position.set(0,.5,0);scene.add(sun.target);scene.add(sun);
 const modelLight=new THREE.DirectionalLight(0xffffff,1.8);
 modelLight.position.set(-1,3,1);scene.add(modelLight);
 const {bodies}=buildScene(mj,model,scene);
 const basisRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
 const axes=new THREE.AxesHelper(.16);axes.quaternion.copy(basisRotation);scene.add(axes);
 const toolAxes=new THREE.AxesHelper(.10);scene.add(toolAxes);
 const dot=new THREE.Mesh(new THREE.SphereGeometry(.009,16,12),new THREE.MeshBasicMaterial({color:0xdc8c43}));scene.add(dot);
 $('axes').onchange=()=>{axes.visible=toolAxes.visible=$('axes').checked;};
 const trailGeometry=new THREE.BufferGeometry();
 const trailBuffer=new THREE.Float32BufferAttribute(new Float32Array(350*3),3);
 trailGeometry.setAttribute("position",trailBuffer);trailGeometry.setDrawRange(0,0);
 const trail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0xd49b52,transparent:true,opacity:.65}));scene.add(trail);
 const points=[];let trailCounter=0;
 $('trail').onchange=()=>{trail.visible=$('trail').checked;};
 function clearTrail(){points.length=0;trailGeometry.setDrawRange(0,0);}
 const sliders=[],outputs=[],actuals=[];
 JOINTS.forEach((name,i)=>{
   const div=document.createElement('div');div.className='joint';
   const min=Math.ceil(sim.limits[i][0]*radToDeg),max=Math.floor(sim.limits[i][1]*radToDeg);
   div.innerHTML=`<div class="joint-head"><span class="index">0${i+1}</span><label for="joint-${i}">${name}</label><output id="target-${i}" for="joint-${i}"></output></div><input id="joint-${i}" type="range" min="${min}" max="${max}" step="1" value="${HOME[i]*radToDeg}" aria-label="${name} 목표 각도"><div class="joint-meta"><span>${min}°</span><span class="actual" id="actual-${i}"></span><span>${max}°</span></div>`;
   $('joints').appendChild(div);sliders.push($('joint-'+i));outputs.push($('target-'+i));actuals.push($('actual-'+i));
   sliders[i].oninput=()=>{setDemo(false);sim.setTarget(i,Number(sliders[i].value)/radToDeg);updateTargets();};
 });
 function updateTargets(){sim.target.forEach((v,i)=>{sliders[i].value=v*radToDeg;outputs[i].textContent=(v*radToDeg).toFixed(0)+'°';});}
 function setDemo(value){demo=value;$('demo').textContent=demo?'자동 동작 중':'자동 동작';$('demo').classList.toggle('active',demo);$('demo').setAttribute('aria-pressed',String(demo));}
 function setRunning(value){running=value;$('play').textContent=running?'일시정지':'계속 실행';$('play').setAttribute('aria-pressed',String(!running));$('status').textContent=running?'MuJoCo WASM · 실행 중':'MuJoCo WASM · 일시정지';}
 $('play').onclick=()=>setRunning(!running);
 $('demo').onclick=()=>{setDemo(!demo);if(demo){demoTime=0;setRunning(true);}};
 $('reset').onclick=()=>{sim.reset();setDemo(false);clearTrail();updateTargets();};
 document.querySelectorAll('[data-pose]').forEach(button=>button.onclick=()=>{setDemo(false);POSES[button.dataset.pose].forEach((v,i)=>sim.setTarget(i,v));updateTargets();});
 new ResizeObserver(()=>{
   const {width,height}=$('canvas').getBoundingClientRect();
   renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();
 }).observe($('canvas'));
 updateTargets();setRunning(true);$('controls').disabled=false;$('loading').hidden=true;
 let last=performance.now(),accumulator=0;
 function frame(now){
  try{
   const elapsed=Math.min((now-last)/1000,.05);last=now;
   if(running){
    accumulator+=elapsed;
    while(accumulator>=model.opt.timestep){
     if(demo){demoTime+=model.opt.timestep;const t=demoTime;sim.setTarget(0,HOME[0]+.65*Math.sin(t*.5));sim.setTarget(1,HOME[1]+.23*Math.sin(t*.7));sim.setTarget(2,HOME[2]+.3*Math.sin(t*.7+.5));sim.setTarget(3,HOME[3]-.2*Math.sin(t*.7));sim.setTarget(5,.45*Math.sin(t*.6));}
     sim.step();accumulator-=model.opt.timestep;
    }
   }else accumulator=0;
   if(!Number.isFinite(data.qpos[0]))throw new Error('시뮬레이션 상태가 유효하지 않습니다. 페이지를 새로고침해 주세요.');
   syncBodies(model,data,bodies);
   const [x,y,z]=sim.tcp();dot.position.set(x,z,-y);toolAxes.position.copy(dot.position);
   // site_xmat is row-major in the MuJoCo Z-up frame.
   const m=new THREE.Matrix4();const r=data.site_xmat;
   m.set(r[0],r[1],r[2],0,r[3],r[4],r[5],0,r[6],r[7],r[8],0,0,0,0,1);
   const q=new THREE.Quaternion().setFromRotationMatrix(m);
   toolAxes.quaternion.set(q.x,q.z,-q.y,q.w).multiply(basisRotation);
   if(running&&++trailCounter%4===0){points.push(dot.position.clone());if(points.length>350)points.shift();points.forEach((p,i)=>trailBuffer.setXYZ(i,p.x,p.y,p.z));trailBuffer.needsUpdate=true;trailGeometry.setDrawRange(0,points.length);trailGeometry.computeBoundingSphere();}
   ['x','y','z'].forEach((key,i)=>$(key).textContent=[x,y,z][i].toFixed(3));
   $('time').textContent=data.time.toFixed(2)+' s';
   actuals.forEach((el,i)=>el.textContent='실제 '+(data.qpos[i]*radToDeg).toFixed(1)+'°');
   if(demo)updateTargets();
   orbit.update();renderer.render(scene,camera);requestAnimationFrame(frame);
  }catch(error){showError(error);}
 }
 // Read-only diagnostics for reproducible browser checks.
 window.robotLab={snapshot:()=>({time:data.time,qpos:Array.from(data.qpos),target:sim.target.slice(),tcp:sim.tcp(),running,demo})};
 requestAnimationFrame(frame);
}
function showError(error){console.error(error);$('loading').hidden=false;$('loading').textContent='실행 오류: '+error.message;$('status').textContent='로드 또는 실행 실패';$('controls').disabled=true;}
main().catch(showError);
