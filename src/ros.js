export function connectROS(sim,onConnect){
  if(new URLSearchParams(location.search).get('ros')!=='1')return {step(){},send(){}};
  const label=document.createElement('p');label.className='panel-help';document.querySelector('aside').prepend(label);
  label.textContent='ROS 2 연결 중…';
  const ws=new WebSocket(`ws://${location.host}/ros`);let goals=[null,null],last=0,connected=false;
  function hold(a){const arm=sim.arms[a];arm.qadr.slice(0,6).forEach((q,j)=>sim.setTarget(arm.actuators[j],sim.data.qpos[q]));goals[a]=null;}
  ws.onopen=()=>{connected=true;label.textContent='ROS 2 연결됨 · 궤적 명령 대기';onConnect();};
  ws.onclose=()=>{connected=false;[0,1].forEach(hold);label.textContent='ROS 2 연결 끊김 · 브리지 실행 후 새로고침';};
  ws.onerror=()=>{label.textContent='ROS 2 연결 실패 · 로컬 브리지를 확인하세요';};
  ws.onmessage=event=>{
    const m=JSON.parse(event.data);
    if(m.type==='cancel'){if(goals[m.arm]?.id===m.id)hold(m.arm);return;}
    if(m.type!=='trajectory')return;
    onConnect();const arm=sim.arms[m.arm];
    goals[m.arm]={id:m.id,start:sim.data.time,elapsed:0,points:[{t:0,q:arm.qadr.slice(0,6).map(q=>sim.data.qpos[q])},...m.points],desired:[]};
    label.textContent='ROS 2 연결됨 · '+(m.arm===0?'왼팔':'오른팔')+' 명령 수신';
  };
  return {
    step(){goals.forEach((g,a)=>{if(!g)return;g.elapsed=sim.data.time-g.start;let next=g.points.findIndex(p=>p.t>g.elapsed);if(next<0)g.desired=g.points.at(-1).q;else{const p=g.points[Math.max(0,next-1)],q=g.points[next],f=q.t===p.t?1:Math.max(0,Math.min(1,(g.elapsed-p.t)/(q.t-p.t)));g.desired=p.q.map((v,j)=>v+(q.q[j]-v)*f);}g.desired.forEach((v,j)=>sim.setTarget(sim.arms[a].actuators[j],v));});},
    send(now){if(!connected||now-last<50||ws.bufferedAmount>65536)return;last=now;const t=sim.telemetry();ws.send(JSON.stringify({type:'state',time:t.time,arms:t.arms.map(a=>({position:a.position.map(v=>v*Math.PI/180),velocity:a.velocity.map(v=>v*Math.PI/180),torque:a.torque})),goals:goals.map(g=>g?{id:g.id,elapsed:g.elapsed,desired:g.desired}:null)}));}
  };
}
