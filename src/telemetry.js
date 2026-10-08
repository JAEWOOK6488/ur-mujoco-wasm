const COLORS=['#67c7ef','#f5ac61','#91d782','#ee829f','#b6a0f5','#e6d86c'];
const METRICS=[['position','위치','°',1],['velocity','속도','°/s',1],['torque','토크','N·m',.1]];
const WINDOW=20, PERIOD=.02;
export function createTelemetry(container){
  let samples=[],lastSample=-Infinity,lastDraw=-Infinity,selected=0;
  container.innerHTML=`<div class="telemetry-heading"><h2>실시간 관절 그래프</h2><span id="telemetry-arm">왼팔</span></div><p class="chart-help">최근 20초 · 시뮬레이션 시간 · 실제 관절값</p><div class="chart-legend">${COLORS.map((c,i)=>`<span style="--joint-color:${c}">J${i+1}</span>`).join('')}</div>${METRICS.map(([key,title,unit])=>`<figure class="joint-chart"><figcaption>${title}<span>${unit}</span></figcaption><canvas id="chart-${key}" role="img" aria-label="${title}: 선택한 팔의 6축 시간 그래프"></canvas><div class="chart-values" id="values-${key}"></div></figure>`).join('')}<p class="chart-help">토크는 모터가 관절에 가하는 시뮬레이션 토크입니다. 전류(A)는 모터 상수·감속비 정보가 없어 표시하지 않습니다.</p>`;
  const charts=METRICS.map(([key,title,unit,minSpan])=>({key,title,unit,minSpan,canvas:container.querySelector('#chart-'+key),values:container.querySelector('#values-'+key)}));
  for(const chart of charts)chart.values.innerHTML=COLORS.map((c,i)=>`<span style="color:${c}" title="J${i+1}">—</span>`).join('');
  function draw(){
    container.querySelector('#telemetry-arm').textContent=selected===0?'왼팔':'오른팔';
    const end=samples.at(-1)?.time??0,start=Math.max(0,end-WINDOW),right=Math.max(1,end);
    for(const {key,title,unit,minSpan,canvas,values} of charts){
      const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
      if(!width||!height)continue;
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
      const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      let low=Infinity,high=-Infinity;
      for(const s of samples)for(const v of s.arms[selected][key]){low=Math.min(low,v);high=Math.max(high,v);}
      if(!Number.isFinite(low)){low=-minSpan;high=minSpan;}
      const mid=(low+high)/2,span=Math.max(high-low,minSpan)*1.2;low=mid-span/2;high=mid+span/2;
      const left=47,top=10,w=width-left-10,h=height-top-24;
      const x=t=>left+(t-start)/(right-start)*w,y=v=>top+(high-v)/(high-low)*h;
      ctx.font='10px monospace';ctx.lineWidth=1;
      for(let i=0;i<3;i++){
        const v=low+(high-low)*i/2,py=y(v);ctx.strokeStyle='#35404b';ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(left+w,py);ctx.stroke();ctx.fillStyle='#a8b6c4';ctx.textAlign='right';ctx.fillText(v.toFixed(Math.abs(v)>=100?0:1),left-5,py+3);
      }
      ctx.textAlign='center';
      for(let i=0;i<3;i++){const t=start+(right-start)*i/2;ctx.textAlign=i===0?'left':i===2?'right':'center';ctx.fillText(t.toFixed(1)+'s',x(t),height-5);}
      ctx.save();ctx.beginPath();ctx.rect(left,top,w,h);ctx.clip();
      COLORS.forEach((color,j)=>{ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.beginPath();samples.forEach((s,i)=>{const px=x(s.time),py=y(s.arms[selected][key][j]);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.stroke();});ctx.restore();
      const latest=samples.at(-1)?.arms[selected][key];
      Array.from(values.children).forEach((el,j)=>el.textContent=latest?latest[j].toFixed(1):'—');
      canvas.setAttribute('aria-label',`${selected===0?'왼팔':'오른팔'} ${title}, J1~J6: ${latest?.map(v=>v.toFixed(1)).join(', ')??'데이터 없음'} ${unit}`);
    }
  }
  const resize=new ResizeObserver(draw);resize.observe(container);
  function sample(read){
    // Sample on physics time; pause never duplicates data and both arms retain history.
    if(read.time-lastSample<PERIOD-1e-9)return;
    lastSample=read.time;samples.push(read);
    while(samples.length&&samples[0].time<read.time-WINDOW)samples.shift();
  }
  return {
    sample,
    render(now,arm){if(arm!==selected||now-lastDraw>=100){selected=arm;lastDraw=now;draw();}},
    reset(read){samples=[];lastSample=-Infinity;sample(read);draw();},
    snapshot:()=>({count:samples.length,arm:selected,firstTime:samples[0]?.time,last:samples.at(-1)})
  };
}
