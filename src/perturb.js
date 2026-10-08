import * as THREE from 'three';
// World coordinates: MuJoCo Z-up <-> renderer Y-up.
const toMJ=v=>new THREE.Vector3(v.x,-v.z,v.y);
const toView=v=>new THREE.Vector3(v.x,v.z,-v.y);
export function createPerturbation(sim,scene,camera,canvas,orbit,bodies,isRunning){
  const {model,data}=sim;
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane();
  const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(),.1,0xffce52);arrow.visible=false;scene.add(arrow);
  const button=document.getElementById('force-mode'),label=document.getElementById('force-info');
  let mode=false,drag=null,lastForce=0;
  function rotation(body){const r=data.xmat.slice(body*9,body*9+9);return new THREE.Matrix3().set(...r);}
  function origin(body){return new THREE.Vector3(...data.xpos.slice(body*3,body*3+3));}
  function anchor(){return drag.local.clone().applyMatrix3(rotation(drag.body)).add(origin(drag.body));}
  function movable(b){while(b>0){if(model.body_jntnum[b]>0)return true;b=model.body_parentid[b];}return false;}
  function setRay(e){const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);}
  function stop(){if(drag){sim.clearBodyForce(drag.body);if(canvas.hasPointerCapture(drag.pointer))canvas.releasePointerCapture(drag.pointer);}drag=null;lastForce=0;arrow.visible=false;orbit.enabled=true;label.textContent=mode?'물체를 드래그하세요':'Ctrl + 드래그: 외력';canvas.style.cursor=mode?'crosshair':'';}
  button.onclick=()=>{stop();mode=!mode;button.setAttribute('aria-pressed',String(mode));button.classList.toggle('active',mode);label.textContent=mode?'물체를 드래그하세요':'Ctrl + 드래그: 외력';canvas.style.cursor=mode?'crosshair':'';};
  canvas.addEventListener('pointerdown',e=>{
    if(!(mode||e.ctrlKey)||e.button!==0)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(!isRunning()){label.textContent='시뮬레이션을 먼저 실행하세요';return;}
    scene.updateMatrixWorld(true);setRay(e);
    const hit=ray.intersectObjects(Object.values(bodies),true)[0];
    if(!hit||!movable(hit.object.bodyID)){label.textContent='블록 또는 로봇 링크를 선택하세요';return;}
    const body=hit.object.bodyID,point=toMJ(hit.point);
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),hit.point);
    drag={body,local:point.clone().sub(origin(body)).applyMatrix3(rotation(body).transpose()),target:point.clone(),previous:point.clone(),pointer:e.pointerId,ctrl:!mode};
    orbit.enabled=false;canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';
  },true);
  canvas.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();e.stopImmediatePropagation();setRay(e);const p=ray.ray.intersectPlane(plane,new THREE.Vector3());if(p)drag.target.copy(toMJ(p));},true);
  canvas.addEventListener('pointerup',e=>{if(drag&&e.pointerId===drag.pointer){e.stopImmediatePropagation();stop();}},true);
  canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',()=>{if(drag)stop();});
  window.addEventListener('blur',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('keyup',e=>{if(e.key==='Control'&&drag?.ctrl)stop();});
  return {
    stop,
    step(){if(!drag)return;const p=anchor(),light=model.body_mass[drag.body]<.1;const velocity=p.clone().sub(drag.previous).divideScalar(model.opt.timestep);drag.previous.copy(p);
      const force=drag.target.clone().sub(p).multiplyScalar(light?40:300).addScaledVector(velocity,light?-1.5:-12);force.clampLength(0,light?10:100);lastForce=force.length();sim.applyBodyForce(drag.body,force.toArray(),p.toArray());
    },
    render(){if(!drag)return;if(!isRunning()){stop();return;}const p=anchor(),force=new THREE.Vector3(...data.xfrc_applied.slice(drag.body*6,drag.body*6+3));arrow.position.copy(toView(p));arrow.visible=force.length()>1e-4;if(arrow.visible){arrow.setDirection(toView(force).normalize());arrow.setLength(Math.max(.025,Math.min(.7,force.length()*.025)),.035,.02);}label.textContent=`외력 ${lastForce.toFixed(1)} N · 놓으면 해제`;},
    snapshot:()=>({active:!!drag,body:drag?.body??null,force:lastForce})
  };
}
