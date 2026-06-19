// LiftLog — Workout Module
// Calorie engine, exercise library, RPE, plate calc, 1RM, records, heatmap, reports, programs, quick add, memory, steps

// ─── CALORIE ENGINE ──────────────────────────────────────────────────────────
// MET values for weight training intensity levels
const MET_TABLE={
  light:3.5, moderate:5.0, vigorous:6.0, heavy:8.0
};
// Per-exercise intensity map (muscle group based)
const EX_INTENSITY={
  'bench press':'heavy','squat':'heavy','deadlift':'heavy','overhead press':'heavy',
  'pull up':'heavy','chin up':'heavy','barbell row':'heavy','leg press':'heavy',
  'shoulder press':'heavy','military press':'heavy',
  'bicep curl':'moderate','tricep':'moderate','lateral raise':'light',
  'cable':'moderate','machine':'moderate','pushdown':'moderate',
  'leg curl':'moderate','leg extension':'moderate','calf':'light',
  'plank':'light','crunch':'light','ab':'light','cardio':'vigorous','run':'vigorous'
};

function getExIntensity(name){
  const n=name.toLowerCase();
  for(const [k,v] of Object.entries(EX_INTENSITY)){if(n.includes(k))return v;}
  return 'moderate';
}

function calcSetCalories(exName, weightKg, reps, bodyWeightKg, met, kcalPerRep){
  const r=Math.max(1,reps);

  // If user specified kcal per rep — use it directly (most accurate)
  if(kcalPerRep && kcalPerRep>0){
    return Math.max(1, Math.round(kcalPerRep * r));
  }

  const intensity=getExIntensity(exName);
  const metVal=met||MET_TABLE[intensity];
  const bw=Math.max(40,bodyWeightKg);

  // Time under tension: reps × ~4s per rep
  const setDurationHrs=(r*4)/3600;

  // Load factor: weight independently scales kcal
  const effectiveLoad=weightKg>0 ? weightKg : bw*0.6;
  const loadFactor=Math.min(2.5, 1+(effectiveLoad/bw)*0.5);

  const fitMult=state.calProfile.fit==='beginner'?1.1:state.calProfile.fit==='advanced'?0.88:1.0;

  // Base kcal from MET × bodyWeight × duration × loadFactor
  const base=metVal * bw * setDurationHrs * loadFactor * fitMult;

  // Extra weight bonus
  const weightBonus=effectiveLoad * r * 0.015;

  return Math.max(1, Math.round(base + weightBonus));
}

function calcWorkoutCalories(exercises){
  const bw=state.calProfile.wt||75;
  let total=0;
  exercises.forEach(ex=>{
    // ex.met is stored when exercise added from library; fallback to intensity lookup
    ex.sets.forEach(s=>{total+=calcSetCalories(ex.name,s.w,s.r,bw,ex.met);});
  });
  return total;
}

function calcLiveCalories(){
  const bw=state.calProfile.wt||75;
  let total=0;
  state.exercises.forEach(ex=>{
    ex.sets.filter(s=>s.done).forEach(s=>{
      // Use entered weight; if 0 (bodyweight move) treat as 0 external load — engine handles it
      total+=calcSetCalories(ex.name, s.w, Math.max(1,s.r), bw, ex.met);
    });
  });
  // add timer-based base metabolic burn (~4 kcal/min at gym)
  total+=Math.round((state.timerSecs/60)*4);
  return total;
}

// PROGRESS PAGE ───────────────────────────────────────────────────────────────
let progChart=null;
let progSelectedExercise=null;  // exercise name string
let progSelectedMuscle='All';
let progRange='all';            // 'all' | 7 | 30 | 90
let progSearchQuery='';

function renderProgress(){
  // Build full exercise list from history + today
  const exMap={};  // name → {muscle, sessions, bestWeight, bestDate, lastDate}
  state.workoutHistory.forEach(w=>{
    w.exercises.forEach(ex=>{
      const key=ex.name;
      const best=Math.max(0,...(ex.sets||[]).map(s=>s.w||0));
      if(!exMap[key]){exMap[key]={name:key,muscle:ex.muscle||'Other',sessions:0,bestWeight:0,bestDate:'',lastDate:''};}
      exMap[key].sessions++;
      exMap[key].lastDate=exMap[key].lastDate>w.date?exMap[key].lastDate:w.date;
      if(best>exMap[key].bestWeight){exMap[key].bestWeight=best;exMap[key].bestDate=w.date;}
    });
  });
  // Also add today's exercises
  state.exercises.forEach(ex=>{
    if(!exMap[ex.name]) exMap[ex.name]={name:ex.name,muscle:ex.muscle||'Other',sessions:0,bestWeight:0,bestDate:'',lastDate:todayStr()};
  });

  const allExercises=Object.values(exMap).sort((a,b)=>b.sessions-a.sessions||a.name.localeCompare(b.name));

  // Muscle chips
  const muscles=['All',...[...new Set(allExercises.map(e=>e.muscle))].sort()];
  const chipWrap=document.getElementById('prog-muscle-chips');
  chipWrap.innerHTML=muscles.map(m=>
    `<div class="prog-muscle-chip${m===progSelectedMuscle?' active':''}" onclick="setProgMuscle('${m}')">${m}</div>`
  ).join('');

  renderProgExList(allExercises);
}

function renderProgExList(allExercises){
  if(!allExercises){
    // Rebuild from scratch
    renderProgress(); return;
  }
  const q=progSearchQuery.toLowerCase();
  let filtered=allExercises.filter(e=>{
    if(progSelectedMuscle!=='All'&&e.muscle!==progSelectedMuscle) return false;
    if(q&&!e.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const list=document.getElementById('prog-ex-list');
  if(!filtered.length){
    list.innerHTML='<div style="text-align:center;padding:30px;color:var(--text3);font-size:13px">No exercises found</div>';
    return;
  }

  // Group by muscle if showing All
  let html='';
  if(progSelectedMuscle==='All'&&!q){
    const byMuscle={};
    filtered.forEach(e=>{(byMuscle[e.muscle]||(byMuscle[e.muscle]=[])).push(e);});
    Object.entries(byMuscle).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([muscle,exs])=>{
      html+=`<div class="prog-section-hdr">${muscle}</div>`;
      html+=exs.map(e=>progExItemHTML(e)).join('');
    });
  } else {
    html=filtered.map(e=>progExItemHTML(e)).join('');
  }
  list.innerHTML=html;
}

function progExItemHTML(e){
  const isSelected=e.name===progSelectedExercise;
  const gainStr=e.sessions>1?`${e.sessions} sessions`:`${e.sessions} session`;
  return `<div class="prog-ex-item${isSelected?' selected':''}" onclick="selectProgExercise('${e.name.replace(/'/g,"\\'")}')">
    <div style="flex:1;min-width:0">
      <div class="prog-ex-name">${e.name}</div>
      <div class="prog-ex-meta">${e.muscle} · ${gainStr}${e.lastDate?' · Last: '+e.lastDate.slice(5):''}</div>
    </div>
    ${e.bestWeight>0?`<div style="text-align:right;flex-shrink:0;margin-left:10px">
      <div class="prog-ex-pr">${e.bestWeight}kg</div>
      <div class="prog-ex-pr-lbl">Best</div>
    </div>`:''}
  </div>`;
}

function setProgMuscle(m){
  progSelectedMuscle=m;
  document.querySelectorAll('.prog-muscle-chip').forEach(c=>{
    c.classList.toggle('active',c.textContent===m);
  });
  renderProgExList(null);
}

function filterProgress(){
  progSearchQuery=document.getElementById('prog-search').value;
  renderProgExList(null);
}

function selectProgExercise(name){
  progSelectedExercise=name;
  document.getElementById('prog-detail').style.display='block';
  // Scroll detail into view
  document.getElementById('prog-detail').scrollIntoView({behavior:'smooth',block:'start'});
  renderProgExList(null);
  renderProgressDetail();
}

function closeProgDetail(){
  progSelectedExercise=null;
  document.getElementById('prog-detail').style.display='none';
  renderProgExList(null);
}

function setProgRange(r){
  progRange=r;
  ['all',7,30,90].forEach(v=>{
    const b=document.getElementById('prog-range-'+v);
    if(b){b.style.background=v===r?'var(--red)':'';b.style.color=v===r?'#fff':'';b.style.borderColor=v===r?'var(--red)':'';}
  });
  renderProgressDetail();
}

function renderProgressDetail(){
  const name=progSelectedExercise; if(!name) return;
  document.getElementById('prog-title').textContent=name;

  // Filter by range
  const cutoff=progRange==='all'?'0000-00-00':
    new Date(Date.now()-progRange*86400000).toISOString().slice(0,10);
  const metric=document.getElementById('prog-metric')?.value||'max';

  const pts=state.workoutHistory
    .filter(w=>w.date>=cutoff&&w.exercises.some(e=>e.name===name))
    .map(w=>{
      const ex=w.exercises.find(e=>e.name===name);
      const sets=ex.sets||[];
      return{
        date:w.date,
        max:sets.length?Math.max(0,...sets.map(s=>s.w||0)):0,
        vol:sets.reduce((a,s)=>a+(s.w||0)*(s.r||0),0),
        reps:sets.length?Math.max(0,...sets.map(s=>s.r||0)):0,
        sets
      };
    });

  const empty=document.getElementById('prog-empty');
  const canvas=document.getElementById('prog-chart');
  if(!pts.length){
    canvas.style.display='none'; empty.style.display='block';
    ['prog-best','prog-sessions','prog-pr','prog-gain'].forEach(id=>{
      document.getElementById(id).textContent=id==='prog-sessions'?'0':'—';
    });
    return;
  }
  canvas.style.display='block'; empty.style.display='none';

  const yVals=pts.map(p=>p[metric]);
  const best=Math.max(...yVals);
  const first=yVals[0], last=yVals[yVals.length-1];
  const gain=first>0?Math.round((last-first)/first*100):0;
  const yLabel={max:'kg',vol:'kg vol',reps:'reps'}[metric];

  document.getElementById('prog-best').textContent=`Best: ${best}${yLabel}`;
  document.getElementById('prog-sessions').textContent=pts.length;
  document.getElementById('prog-pr').textContent=Math.max(...pts.map(p=>p.max))+'kg';
  document.getElementById('prog-gain').textContent=(gain>=0?'+':'')+gain+'%';

  if(progChart) progChart.destroy();
  const tc='rgba(128,128,128,0.5)',gc='rgba(128,128,128,0.12)';
  progChart=new Chart(document.getElementById('prog-chart').getContext('2d'),{
    type:'line',
    data:{
      labels:pts.map(p=>p.date.slice(5)),
      datasets:[{
        label:yLabel,data:yVals,
        borderColor:'#E24B4A',backgroundColor:'rgba(226,75,74,0.08)',
        pointBackgroundColor:'#E24B4A',pointRadius:4,pointHoverRadius:7,
        borderWidth:2.5,fill:true,tension:0.3
      }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+yLabel}}},
      scales:{
        x:{grid:{color:gc},ticks:{color:tc,font:{size:10},maxTicksLimit:8}},
        y:{grid:{color:gc},ticks:{color:tc,font:{size:10},callback:v=>v+yLabel},beginAtZero:false}
      }
    }
  });

  // Session log — compact, show all sets
  const hl=document.getElementById('prog-history-list');
  hl.innerHTML=`<div class="section-title" style="margin-top:4px">Session History</div>`;
  [...pts].reverse().forEach(p=>{
    const d=document.createElement('div');
    d.style.cssText='padding:10px 0;border-top:1px solid var(--border)';
    const chips=p.sets.map((s,j)=>'<span style="padding:3px 8px;border-radius:6px;background:var(--surface2);font-size:11px;font-weight:600;color:var(--text2)">Set '+(j+1)+': '+s.w+'kg×'+s.r+'</span>').join('');
    d.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
        <div style="font-size:13px;font-weight:700;color:var(--text)">${p.date}</div>
        <div style="font-size:12px;color:var(--red);font-weight:700">${p.max}kg max · ${p.vol}kg vol</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${chips}</div>`;
    hl.appendChild(d);
  });
}

// WEIGHT
let wtChart=null;
function logWeight(){
  const kg=parseFloat(document.getElementById('w-kg').value),date=document.getElementById('w-date').value,note=document.getElementById('w-note').value.trim();
  if(!kg||!date)return toast('Enter weight and date');
  state.weightLog.push({date,kg,note}); state.weightLog.sort((a,b)=>a.date.localeCompare(b.date));
  document.getElementById('w-kg').value=''; document.getElementById('w-note').value='';
  saveState({weight:true}); renderWeightPage(); toast('Weight logged!');
}
function renderWeightPage(){
  document.getElementById('w-date').valueAsDate=new Date();
  const log=state.weightLog,empty=document.getElementById('wt-empty'),canvas=document.getElementById('wt-chart');
  if(!log.length){canvas.style.display='none';empty.style.display='block';document.getElementById('wt-history').innerHTML='';return;}
  canvas.style.display='block';empty.style.display='none';
  const cur=log[log.length-1].kg,start=log[0].kg,diff=(cur-start).toFixed(1);
  document.getElementById('wt-stats').textContent=cur+'kg &middot; '+(diff>0?'+':'')+diff+'kg total';
  if(wtChart)wtChart.destroy();
  const tc='rgba(128,128,128,0.5)',gc='rgba(128,128,128,0.12)';
  wtChart=new Chart(document.getElementById('wt-chart').getContext('2d'),{type:'line',data:{labels:log.map(e=>e.date.slice(5)),datasets:[{label:'kg',data:log.map(e=>e.kg),borderColor:'#185FA5',backgroundColor:'rgba(24,95,165,0.07)',pointBackgroundColor:'#185FA5',pointRadius:4,pointHoverRadius:6,borderWidth:2.5,fill:true,tension:0.35}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{color:gc},ticks:{color:tc,font:{size:11}}},y:{grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>v+'kg'},beginAtZero:false}}}});
  const hist=document.getElementById('wt-history'); hist.innerHTML='';
  [...log].reverse().slice(0,10).forEach((e,i,arr)=>{
    const prev=arr[i+1],delta=prev?(e.kg-prev.kg).toFixed(1):null;
    const d=document.createElement('div'); d.className='w-row';
    d.innerHTML=`<div><div class="w-date">${e.date}</div>${e.note?`<div style="font-size:11px;color:var(--text3)">${e.note}</div>`:''}</div><div class="w-val">${e.kg} kg</div>${delta!==null?`<div class="delta ${parseFloat(delta)>0?'delta-up':'delta-down'}">${parseFloat(delta)>0?'+':''}${delta}kg</div>`:'<div></div>'}`;
    hist.appendChild(d);
  });
}

// BODY AGE
function calcBodyAge(){
  const age=parseInt(document.getElementById('ba-age').value)||0,gender=document.getElementById('ba-gender').value;
  const wt=parseFloat(document.getElementById('ba-wt').value)||0,ht=parseFloat(document.getElementById('ba-ht').value)||0;
  const bf=parseFloat(document.getElementById('ba-bf').value)||0,rhr=parseInt(document.getElementById('ba-rhr').value)||70;
  const act=parseInt(document.getElementById('ba-act').value)||2,sleep=parseFloat(document.getElementById('ba-sleep').value)||7;
  const smoke=parseInt(document.getElementById('ba-smoke').value)||0,water=parseFloat(document.getElementById('ba-water').value)||2;
  if(!age||!wt||!ht)return toast('Fill in Age, Weight and Height');
  const bmi=wt/((ht/100)**2),idealBf=gender==='male'?18:25;
  let score=50;
  score+=(idealBf-Math.abs(bf-idealBf))*0.5;
  score+=(100-Math.abs(rhr-55))*0.18;
  score+=act*3.5; score+=(sleep>=7&&sleep<=9?10:sleep>=6?5:0);
  score+=Math.min(water,3)*2; score-=smoke*14;
  score-=bmi>25?(bmi-25)*1.8:(bmi<18.5?(18.5-bmi)*1.8:0);
  const norm=Math.max(0,Math.min(100,score)),ageDelta=Math.round((norm-55)/5);
  const bodyAge=Math.max(16,age-ageDelta),physAge=Math.max(15,age-Math.round(ageDelta*0.6)+(act>=4?-2:act<=1?3:0)),diff=age-bodyAge;
  const tips=[];
  if(bf>(gender==='male'?20:28))tips.push('Reduce body fat through consistent cardio and nutrition');
  if(rhr>70)tips.push('Improve cardiovascular fitness — try zone 2 cardio 3x per week');
  if(sleep<7)tips.push('Aim for 7–9 hours of sleep; that\'s when your body repairs itself');
  if(water<2.5)tips.push('Drink at least 2.5L of water daily for optimal metabolism');
  if(smoke)tips.push('Quitting smoking has the single biggest positive impact on body age');
  if(act<=2)tips.push('Increase to 4+ sessions/week to dramatically improve body age');
  if(bmi>27)tips.push('Bringing BMI towards 22–24 improves almost every health marker');
  const tipsHtml=tips.length
    ? '<div class="section-title">How to Improve</div>'+tips.map(t=>'<div style="padding:8px 0;border-top:1px solid var(--border);font-size:13px;color:var(--text2);line-height:1.5">• '+t+'</div>').join('')
    : '<div style="text-align:center;color:var(--green);font-weight:600;padding:8px 0">Excellent health profile! Keep it up.</div>';
  document.getElementById('ba-result').innerHTML=`<div class="card"><div class="result-box"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--text2);margin-bottom:6px">Your Body Age</div><div class="big-num" style="color:${diff>0?'var(--green)':diff===0?'var(--text)':'var(--red)'}">${bodyAge}</div><div style="font-size:14px;font-weight:600;margin-top:8px;color:${diff>0?'var(--green)':diff<0?'var(--red)':'var(--text2)'}">${diff>0?'🔥 '+diff+' years YOUNGER than your real age':diff===0?'Equal to your real age':'⚠ '+Math.abs(diff)+' years older than your real age'}</div></div><div class="age-grid"><div class="age-box neutral"><div class="age-num">${age}</div><div class="age-lbl">Real Age</div></div><div class="age-box ${physAge<=age?'good':''}"><div class="age-num">${physAge}</div><div class="age-lbl">Physical Age</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px"><div class="stat"><div class="stat-val" style="font-size:20px">${bmi.toFixed(1)}</div><div class="stat-lbl">BMI</div></div><div class="stat"><div class="stat-val" style="font-size:20px">${bf}%</div><div class="stat-lbl">Body Fat</div></div><div class="stat"><div class="stat-val" style="font-size:20px">${rhr}</div><div class="stat-lbl">Resting HR</div></div><div class="stat"><div class="stat-val" style="font-size:20px">${Math.round(norm)}</div><div class="stat-lbl">Health Score</div></div></div>${tipsHtml}</div>`;
}

// DATA PAGE
function updateDataPage(){
  try{const b=new Blob([localStorage.getItem(STORAGE_KEY)||'']).size;document.getElementById('storage-used').textContent=(b/1024).toFixed(1)+' KB used';}catch(e){}
  if(state.lastSaved)document.getElementById('last-saved').textContent=new Date(state.lastSaved).toLocaleString();
  const hl=document.getElementById('workout-history-list'); if(!hl)return;
  hl.innerHTML='';
  if(!state.workoutHistory.length){hl.innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px 0">No workouts saved yet</div>';return;}
  state.workoutHistory.slice().reverse().slice(0,20).forEach((w)=>{
    const mins=Math.floor((w.duration||0)/60),div=document.createElement('div'); div.className='w-row';
    const kcal=w.totalKcal||calcWorkoutCalories(w.exercises)+Math.round((w.duration||0)/60*4);
    div.innerHTML=`<div style="flex:1"><div style="font-size:14px;font-weight:600;color:var(--text)">${w.date}</div><div style="font-size:12px;color:var(--text3)">${w.exercises.map(e=>e.name).join(', ')}</div></div><div style="text-align:right;margin-right:10px"><div style="font-size:13px;font-weight:700;color:var(--text)">${w.totalVolume||0}kg &middot; <span style="color:var(--red)">🔥${kcal}</span></div><div style="font-size:11px;color:var(--text3)">${mins?mins+'min':''}</div></div><button class="btn-sm btn-danger" onclick="deleteWorkout('${w.id}')">Delete</button>`;
    hl.appendChild(div);
  });
}

// CALORIES PAGE
let calChart=null, calRangeDays=30;
function setCalRange(days){
  calRangeDays=days;
  [7,14,30].forEach(d=>{ const b=document.getElementById('cal-range-'+d); if(b){b.style.background=d===days?'var(--red)':'var(--surface2)';b.style.color=d===days?'#fff':'var(--text2)';b.style.borderColor=d===days?'var(--red)':'var(--border)';}});
  renderCaloriesPage();
}

function saveCalProfile(){
  const wt=parseFloat(document.getElementById('cp-wt').value)||75;
  const ht=parseFloat(document.getElementById('cp-ht').value)||170;
  const gender=document.getElementById('cp-gender').value;
  const age=parseInt(document.getElementById('cp-age').value)||28;
  const fit=document.getElementById('cp-fit').value;
  const waterGoalInput=parseFloat(document.getElementById('cp-water-goal').value);
  const waterGoal=waterGoalInput>0?Math.round(waterGoalInput*1000):Math.round(wt*35/100)*100;
  state.calProfile={wt,ht,gender,age,fit,waterGoal};
  saveState({profile:true});
  renderCaloriesPage();
  // Refresh food page nutrition targets if visible
  if(homeMode==='food') renderHomeFoodPanel();
  renderFoodPage();
  toast('Profile saved! Nutrition targets updated ✓');
}

function renderCaloriesPage(){
  const p=state.calProfile||{};
  document.getElementById('cp-wt').value=p.wt||'';
  document.getElementById('cp-ht').value=p.ht||'';
  document.getElementById('cp-gender').value=p.gender||'male';
  document.getElementById('cp-age').value=p.age||'';
  document.getElementById('cp-fit').value=p.fit||'intermediate';
  // Show water goal in L if set
  const wg=document.getElementById('cp-water-goal');
  if(p.waterGoal) wg.value=(p.waterGoal/1000).toFixed(1); else wg.value='';

  // Live targets preview
  const rda=getRDA();
  const prev=document.getElementById('cp-targets-preview');
  if(prev) prev.innerHTML=[
    {label:'Calories',val:rda.kcal,unit:'kcal',color:'var(--red)'},
    {label:'Protein',val:rda.protein,unit:'g',color:'#185FA5'},
    {label:'Carbs',val:rda.carbs,unit:'g',color:'#f97316'},
    {label:'Fat',val:rda.fat,unit:'g',color:'#eab308'},
    {label:'Water',val:(rda.water/1000).toFixed(1),unit:'L',color:'#185FA5'},
    {label:'Fibre',val:rda.fibre,unit:'g',color:'#22c55e'},
  ].map(t=>'<div style="text-align:center;background:var(--surface2);border-radius:8px;padding:6px 2px">'+
    '<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3)">'+t.label+'</div>'+
    '<div style="font-family:var(--font-cond);font-weight:900;font-size:16px;color:'+t.color+'">'+t.val+t.unit+'</div>'+
    '</div>').join('');

  const todayS=todayStr();
  // Aggregate calories per date
  const calByDate={};
  state.workoutHistory.forEach(w=>{
    const kcal=w.totalKcal||calcWorkoutCalories(w.exercises)+Math.round((w.duration||0)/60*4);
    calByDate[w.date]=(calByDate[w.date]||0)+kcal;
  });

  // today
  document.getElementById('cal-today').textContent=(calByDate[todayS]||0);
  // this week
  let weekKcal=0;
  for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().slice(0,10);weekKcal+=(calByDate[ds]||0);}
  document.getElementById('cal-week').textContent=weekKcal;
  // avg per session
  const sessions=state.workoutHistory.length;
  const totalKcalAll=Object.values(calByDate).reduce((a,b)=>a+b,0);
  document.getElementById('cal-avg').textContent=sessions?Math.round(totalKcalAll/sessions):'—';

  // chart - last N days
  const labels=[], data=[];
  for(let i=calRangeDays-1;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const ds=d.toISOString().slice(0,10);
    labels.push(ds.slice(5));
    data.push(calByDate[ds]||0);
  }
  const hasData=data.some(v=>v>0);
  document.getElementById('cal-chart').style.display=hasData?'block':'none';
  document.getElementById('cal-chart-empty').style.display=hasData?'none':'block';
  if(hasData){
    if(calChart)calChart.destroy();
    const tc='rgba(128,128,128,0.5)',gc='rgba(128,128,128,0.12)';
    calChart=new Chart(document.getElementById('cal-chart').getContext('2d'),{
      type:'bar',
      data:{labels,datasets:[{
        label:'kcal',data,
        backgroundColor:data.map(v=>v>0?'rgba(226,75,74,0.75)':'rgba(128,128,128,0.1)'),
        borderColor:data.map(v=>v>0?'#E24B4A':'transparent'),
        borderWidth:1,borderRadius:4
      }]},
      options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+' kcal'}}},
        scales:{x:{grid:{display:false},ticks:{color:tc,font:{size:10},maxTicksLimit:8}},
          y:{grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>v+''},beginAtZero:true}}}
    });
  }

  // history list
  const histEl=document.getElementById('cal-history-list'); histEl.innerHTML='';
  const maxKcal=Math.max(...Object.values(calByDate),1);
  const recentDates=Object.keys(calByDate).sort().reverse().slice(0,14);
  if(!recentDates.length){histEl.innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px 0">No workouts saved yet</div>';} 
  else {
    recentDates.forEach(ds=>{
      const kcal=calByDate[ds];
      const pct=Math.round(kcal/maxKcal*100);
      const d=document.createElement('div'); d.className='cal-row';
      d.innerHTML=`
        <div style="min-width:70px;font-size:12px;color:var(--text3)">${ds}</div>
        <div class="cal-bar-wrap"><div class="cal-bar-fill" style="width:${pct}%"></div></div>
        <div style="min-width:70px;text-align:right;font-family:var(--font-cond);font-weight:700;font-size:16px;color:var(--text)">${kcal} <span style="font-size:11px;font-weight:500;color:var(--text3)">kcal</span></div>
      `;
      histEl.appendChild(d);
    });
  }

  // exercise reference
  const refEl=document.getElementById('cal-reference-list'); refEl.innerHTML='';
  const bw=state.calProfile.wt||75;
  const refs=[
    {name:'Bench Press',w:80,r:8},{name:'Squat',w:100,r:8},{name:'Deadlift',w:120,r:5},
    {name:'Overhead Press',w:60,r:8},{name:'Bicep Curl',w:20,r:12},{name:'Tricep Pushdown',w:30,r:12},
    {name:'Pull Up',w:0,r:8},{name:'Lateral Raise',w:15,r:15}
  ];
  refs.forEach(r=>{
    const kcal=calcSetCalories(r.name,r.w||bw*0.3,r.r,bw);
    const d=document.createElement('div'); d.className='cal-row';
    d.innerHTML=`<div style="font-size:13px;font-weight:600;color:var(--text);flex:1">${r.name}</div><div style="font-size:12px;color:var(--text3);margin-right:10px">${r.w?r.w+'kg × ':'Bodyweight × '}${r.r} reps</div><div style="font-family:var(--font-cond);font-weight:700;font-size:15px;color:var(--red)">${kcal} kcal</div>`;
    refEl.appendChild(d);
  });
}

// NAV


// ─── EXERCISE LIBRARY ────────────────────────────────────────────────────────
// Comprehensive exercise database bucketed by muscle group
// GIFs fetched live from ExerciseDB public API; calorie MET per set built-in

// Session rotation tracking — which session (A or B) each muscle was last trained
// Stored in state.sessionRotation = {Chest: 'A', Biceps: 'B', ...}
function getNextSession(muscle) {
  const last = getLastSession(muscle);
  // If never trained or been 7+ days: start at A
  const daysSinceLast = getDaysSinceLastTrained(muscle);
  if(!last || daysSinceLast >= 7) return 'A';
  return last === 'A' ? 'B' : 'A';
}
function getDaysSinceLastTrained(muscle) {
  const today = todayStr();
  let lastDate = null;
  for(let i = state.workoutHistory.length - 1; i >= 0; i--) {
    const w = state.workoutHistory[i];
    if(w.exercises.some(e => e.muscle === muscle)) {
      lastDate = w.date;
      break;
    }
  }
  if(!lastDate) return 999;
  return Math.floor((new Date(today) - new Date(lastDate)) / 86400000);
}
function recordSessionDone(muscle, session) {
  if(!state.sessionRotation) state.sessionRotation = {};
  state.sessionRotation[muscle] = session;
}

// Guided split recommendation engine
function getGuidedSplitRecommendation() {
  const history = state.workoutHistory || [];
  const today = todayStr();
  const todayDate = new Date(today);

  // ── Week boundaries (Monday to Sunday) ─────────────────────────────────────
  const dow = (todayDate.getDay() + 6) % 7; // 0=Mon, 1=Tue... 6=Sun
  const weekStart = new Date(todayDate);
  weekStart.setDate(todayDate.getDate() - dow);
  const weekStartStr = weekStart.toISOString().slice(0,10);

  // ── What splits have been done THIS week already? ───────────────────────────
  const thisWeekWorkouts = history.filter(w => w.date >= weekStartStr);
  const splitsThisWeek = new Set();
  const musclesThisWeek = new Set();

  thisWeekWorkouts.forEach(w => {
    w.exercises.forEach(e => musclesThisWeek.add(e.muscle));
    // Match to a split
    for(const [split, muscles] of Object.entries(SPLIT_DAYS)){
      const overlap = muscles.filter(m => w.exercises.some(e => e.muscle === m)).length;
      if(overlap >= 2) splitsThisWeek.add(split);
    }
  });

  // ── Last workout (for sequential PPL rotation) ──────────────────────────────
  let lastSplit = null;
  let lastWorkoutDate = null;
  if(history.length > 0) {
    const lastW = history[history.length - 1];
    lastWorkoutDate = lastW.date;
    const lastMs = new Set(lastW.exercises.map(e => e.muscle));
    for(const [split, muscles] of Object.entries(SPLIT_DAYS)){
      const overlap = muscles.filter(m => lastMs.has(m)).length;
      if(overlap >= 2){ lastSplit = split; break; }
    }
  }

  // ── Days since last workout ─────────────────────────────────────────────────
  const daysSinceLastWorkout = lastWorkoutDate
    ? Math.floor((todayDate - new Date(lastWorkoutDate)) / 86400000)
    : 999;

  // ── PPL cycle order ─────────────────────────────────────────────────────────
  const pplCycle = ['Push','Pull','Legs'];

  // Find next in PPL cycle that hasn't been done this week yet
  let recommended = 'Push';

  if(lastSplit){
    // Get next in PPL rotation
    const lastIdx = pplCycle.indexOf(lastSplit);
    if(lastIdx >= 0){
      // Try next, then next+1, then wrap around
      for(let i = 1; i <= pplCycle.length; i++){
        const candidate = pplCycle[(lastIdx + i) % pplCycle.length];
        if(!splitsThisWeek.has(candidate)){
          recommended = candidate;
          break;
        }
      }
      // If all 3 done this week, start fresh next cycle
      if(pplCycle.every(s => splitsThisWeek.has(s))){
        recommended = pplCycle[(pplCycle.indexOf(lastSplit) + 1) % pplCycle.length];
      }
    } else {
      // Was Upper/Lower — check what's not done this week
      recommended = !splitsThisWeek.has('Upper') ? 'Upper' :
                    !splitsThisWeek.has('Lower') ? 'Lower' : 'Push';
    }
  } else {
    // No history at all — recommend Push to start
    recommended = 'Push';
  }

  // ── Rest day logic — if worked out yesterday, suggest rest ─────────────────
  const suggestRest = daysSinceLastWorkout === 0; // trained today already

  // ── Overdue muscles (not hit in 5+ days) ───────────────────────────────────
  const overdueMuscles = [];
  const majorMuscles = ['Chest','Back','Shoulders','Biceps','Triceps','Legs'];
  majorMuscles.forEach(m => {
    if(getDaysSinceLastTrained(m) >= 5) overdueMuscles.push(m);
  });

  // ── Week summary ────────────────────────────────────────────────────────────
  const daysTrainedThisWeek = [...new Set(thisWeekWorkouts.map(w=>w.date))].length;

  return {
    recommended,
    lastSplit,
    splitsThisWeek: [...splitsThisWeek],
    overdueMuscles,
    suggestRest,
    daysTrainedThisWeek,
    weekStartStr
  };
}
const MUSCLE_EMOJIS={Chest:'🏋️',Back:'💪',Shoulders:'🔝',Biceps:'💪',Triceps:'🔩',Legs:'🦵',Glutes:'🍑',Hamstrings:'🦵',Calves:'🦶',Abs:'⚡',Cardio:'🏃',Forearms:'✊'};
let libSelectedMuscle='All', libSearchQuery='';

// ── INLINE SVG EXERCISE ILLUSTRATIONS ────────────────────────────────────────
// Each returns an SVG string (64×64) showing the movement
const getExSvg = (()=>{
  const C='#E24B4A', S='#2c2c2a', W='#fff', BG='transparent';
  // shared body-part helpers
  const head=(cx,cy,r=7)=>`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${S}"/>`;
  const body=(x1,y1,x2,y2,sw=3)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${S}" stroke-width="${sw}" stroke-linecap="round"/>`;
  const arm=(x1,y1,x2,y2,col=S)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
  const bar=(x,y,w=28,col=C)=>`<rect x="${x}" y="${y}" width="${w}" height="5" rx="2.5" fill="${col}"/>`;
  const dumbbell=(cx,cy,ang=0)=>{
    const r=`rotate(${ang},${cx},${cy})`;
    return `<g transform="${r}"><rect x="${cx-10}" y="${cy-2}" width="20" height="4" rx="2" fill="${C}"/><rect x="${cx-14}" y="${cy-4}" width="6" height="8" rx="2" fill="${C}"/><rect x="${cx+8}" y="${cy-4}" width="6" height="8" rx="2" fill="${C}"/></g>`;
  };
  const floor=(y=58)=>`<line x1="4" y1="${y}" x2="60" y2="${y}" stroke="${S}" stroke-width="1.5" stroke-opacity="0.2"/>`;

  function anim(id,dur,vals,attr='transform'){
    return `<animateTransform attributeName="${attr}" type="rotate" values="${vals}" dur="${dur}s" repeatCount="indefinite"/>`;
  }

  // Map exercise name keywords → SVG
  const svgs = {
    // ── CHEST ──
    'bench press': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(56)}
      <!-- bench -->
      <rect x="10" y="40" width="44" height="6" rx="3" fill="${C}" opacity=".25"/>
      <rect x="12" y="46" width="4" height="10" rx="2" fill="${C}" opacity=".25"/>
      <rect x="48" y="46" width="4" height="10" rx="2" fill="${C}" opacity=".25"/>
      <!-- person lying -->
      ${head(32,36,6)}
      ${body(32,42,32,54,3)}
      <!-- barbell up -->
      <g id="bp-bar">
        ${bar(12,22,40)}
        <rect x="10" y="19" width="6" height="11" rx="3" fill="${C}"/>
        <rect x="48" y="19" width="6" height="11" rx="3" fill="${C}"/>
        <!-- arms -->
        ${arm(32,42,20,26)}
        ${arm(32,42,44,26)}
        <animateTransform attributeName="transform" type="translate" values="0,0;0,6;0,0" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'push-up': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(52)}
      <g>
        ${head(12,30,6)}
        <!-- torso -->
        <line x1="12" y1="36" x2="48" y2="44" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
        <!-- arms up pos -->
        <line x1="20" y1="38" x2="20" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="36" y1="41" x2="36" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <!-- legs -->
        <line x1="48" y1="44" x2="52" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,0;0,-8;0,0" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'chest fly': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(56)}
      <rect x="10" y="40" width="44" height="6" rx="3" fill="${C}" opacity=".25"/>
      ${head(32,35,6)}
      ${body(32,41,32,54,3)}
      <g>
        <line x1="32" y1="44" x2="10" y2="38" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="9" cy="37" r="4" fill="${C}"/>
        <line x1="32" y1="44" x2="54" y2="38" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="55" cy="37" r="4" fill="${C}"/>
        <animateTransform attributeName="transform" type="translate" values="0,0;0,-8;0,0" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'dip': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <!-- parallel bars -->
      <line x1="14" y1="22" x2="14" y2="56" stroke="${S}" stroke-width="3" stroke-opacity=".3" stroke-linecap="round"/>
      <line x1="50" y1="22" x2="50" y2="56" stroke="${S}" stroke-width="3" stroke-opacity=".3" stroke-linecap="round"/>
      <line x1="8" y1="22" x2="20" y2="22" stroke="${S}" stroke-width="3" stroke-opacity=".3" stroke-linecap="round"/>
      <line x1="44" y1="22" x2="56" y2="22" stroke="${S}" stroke-width="3" stroke-opacity=".3" stroke-linecap="round"/>
      <g>
        ${head(32,16,6)}
        ${body(32,22,32,38,3)}
        <line x1="32" y1="25" x2="14" y2="22" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="25" x2="50" y2="22" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="38" x2="28" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="38" x2="36" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,0;0,10;0,0" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    // ── BACK ──
    'deadlift': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(56)}
      ${bar(10,50,44)}
      <rect x="8" y="44" width="8" height="14" rx="4" fill="${C}"/>
      <rect x="48" y="44" width="8" height="14" rx="4" fill="${C}"/>
      <g>
        ${head(32,10,6)}
        <!-- hinge -->
        <line x1="32" y1="16" x2="32" y2="34" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
        <line x1="32" y1="34" x2="24" y2="50" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
        <line x1="32" y1="34" x2="40" y2="50" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
        <line x1="32" y1="22" x2="18" y2="32"/>
        <line x1="32" y1="22" x2="46" y2="32" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,10;0,0;0,10" dur="2.5s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'pull-up': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <!-- bar -->
      <rect x="4" y="8" width="56" height="5" rx="2.5" fill="${C}"/>
      <rect x="4" y="4" width="4" height="12" rx="2" fill="${S}" opacity=".3"/>
      <rect x="56" y="4" width="4" height="12" rx="2" fill="${S}" opacity=".3"/>
      <g>
        ${head(32,22,6)}
        ${body(32,28,32,44,3)}
        <line x1="32" y1="30" x2="16" y2="13" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="30" x2="48" y2="13" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="44" x2="28" y2="56" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="44" x2="36" y2="56" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,0;0,-8;0,0" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'row': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(52)}
      <g>
        ${head(14,28,6)}
        <line x1="14" y1="34" x2="48" y2="40" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
        <line x1="14" y1="34" x2="10" y2="44" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="48" y1="40" x2="52" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="30" y1="37" x2="22" y2="30" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${dumbbell(52,33,-20)}
        <animateTransform attributeName="transform" type="translate" values="0,0;-8,0;0,0" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'lat pulldown': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="56" height="5" rx="2.5" fill="${C}" opacity=".4"/>
      <!-- cable lines -->
      <line x1="32" y1="9" x2="32" y2="18" stroke="${C}" stroke-width="1.5" stroke-dasharray="2,2"/>
      ${bar(14,18,36)}
      <g>
        ${head(32,28,6)}
        ${body(32,34,32,50,3)}
        <line x1="32" y1="34" x2="14" y2="23" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="34" x2="50" y2="23" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="50" x2="26" y2="58" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="50" x2="38" y2="58" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,-4;0,4;0,-4" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    // ── SHOULDERS ──
    'overhead press': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      <g>
        ${head(32,12,6)}
        ${body(32,18,32,38,3)}
        <line x1="32" y1="38" x2="24" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="38" x2="40" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <!-- arms holding bar -->
        <line x1="32" y1="22" x2="14" y2="28" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="22" x2="50" y2="28" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${bar(10,26,44)}
        <rect x="8" y="22" width="6" height="12" rx="3" fill="${C}"/>
        <rect x="50" y="22" width="6" height="12" rx="3" fill="${C}"/>
        <animateTransform attributeName="transform" type="translate" values="0,8;0,0;0,8" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'lateral raise': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      ${head(32,12,6)}
      ${body(32,18,32,40,3)}
      <line x1="32" y1="40" x2="24" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="32" y1="40" x2="40" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <g>
        <line x1="32" y1="26" x2="10" y2="30" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="8" cy="30" r="5" fill="${C}"/>
        <line x1="32" y1="26" x2="54" y2="30" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="56" cy="30" r="5" fill="${C}"/>
        <animateTransform attributeName="transform" type="translate" values="0,6;0,0;0,6" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    // ── BICEPS ──
    'curl': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      ${head(32,10,6)}
      ${body(32,16,32,38,3)}
      <line x1="32" y1="38" x2="24" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="32" y1="38" x2="40" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <g>
        <line x1="20" y1="28" x2="14" y2="38" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${dumbbell(14,38,0)}
        <line x1="44" y1="28" x2="50" y2="38" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${dumbbell(50,38,0)}
        <animateTransform attributeName="transform" type="translate" values="0,6;0,0;0,6" dur="1.8s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    // ── TRICEPS ──
    'pushdown': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect x="28" y="4" width="8" height="16" rx="3" fill="${C}" opacity=".3"/>
      <line x1="32" y1="20" x2="24" y2="30" stroke="${C}" stroke-width="1.5" stroke-dasharray="2,2"/>
      <line x1="32" y1="20" x2="40" y2="30" stroke="${C}" stroke-width="1.5" stroke-dasharray="2,2"/>
      ${floor(58)}
      ${head(32,12,6)}
      ${body(32,18,32,40,3)}
      <line x1="32" y1="40" x2="24" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="32" y1="40" x2="40" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <g>
        <line x1="22" y1="24" x2="18" y2="40" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="42" y1="24" x2="46" y2="40" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${bar(14,38,16,C)}
        <animateTransform attributeName="transform" type="translate" values="0,-6;0,0;0,-6" dur="1.8s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'skull crusher': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(56)}
      <rect x="10" y="40" width="44" height="5" rx="2.5" fill="${C}" opacity=".2"/>
      ${head(32,36,6)}
      ${body(32,42,32,54,3)}
      <g>
        <line x1="26" y1="42" x2="18" y2="28" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="38" y1="42" x2="46" y2="28" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${bar(14,24,36)}
        <rect x="12" y="20" width="6" height="10" rx="3" fill="${C}"/>
        <rect x="46" y="20" width="6" height="10" rx="3" fill="${C}"/>
        <animateTransform attributeName="transform" type="translate" values="0,0;0,8;0,0" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    // ── LEGS ──
    'squat': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      <g>
        ${head(32,10,6)}
        <!-- torso -->
        <line x1="32" y1="16" x2="32" y2="34" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
        <!-- arms on bar -->
        <line x1="32" y1="20" x2="14" y2="22" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="20" x2="50" y2="22" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${bar(10,20,44)}
        <rect x="8" y="16" width="6" height="10" rx="3" fill="${C}"/>
        <rect x="50" y="16" width="6" height="10" rx="3" fill="${C}"/>
        <!-- legs bent -->
        <line x1="32" y1="34" x2="20" y2="46" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="20" y1="46" x2="18" y2="58" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="34" x2="44" y2="46" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="44" y1="46" x2="46" y2="58" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,10;0,0;0,10" dur="2.5s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'leg press': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <!-- machine seat -->
      <rect x="6" y="38" width="28" height="8" rx="3" fill="${C}" opacity=".2"/>
      <rect x="6" y="46" width="8" height="12" rx="3" fill="${S}" opacity=".15"/>
      <!-- platform -->
      <rect x="40" y="10" width="20" height="5" rx="2.5" fill="${C}" opacity=".4"/>
      ${head(18,30,6)}
      <line x1="18" y1="36" x2="18" y2="46" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
      <g>
        <line x1="18" y1="40" x2="40" y2="28" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="40" y1="28" x2="52" y2="15" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="18" y1="40" x2="44" y2="32" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="44" y1="32" x2="54" y2="18" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="6,0;0,0;6,0" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'lunge': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      <g>
        ${head(28,10,6)}
        ${body(28,16,28,34,3)}
        <line x1="28" y1="26" x2="18" y2="30" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${dumbbell(14,30,0)}
        <line x1="28" y1="26" x2="38" y2="30" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${dumbbell(42,30,0)}
        <!-- front leg -->
        <line x1="28" y1="34" x2="16" y2="48" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="16" y1="48" x2="12" y2="58" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <!-- back leg -->
        <line x1="28" y1="34" x2="44" y2="44" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="44" y1="44" x2="50" y2="58" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,4;0,0;0,4" dur="2.5s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'hip thrust': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      <!-- bench -->
      <rect x="4" y="32" width="22" height="8" rx="3" fill="${C}" opacity=".25"/>
      <g>
        ${head(14,26,6)}
        <!-- torso horizontal -->
        <line x1="18" y1="32" x2="44" y2="38" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
        ${bar(28,34,24,C)}
        <!-- legs -->
        <line x1="44" y1="38" x2="48" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="48" y1="52" x2="52" y2="58" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="44" y1="38" x2="42" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="42" y1="52" x2="44" y2="58" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,6;0,0;0,6" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    // ── ABS ──
    'crunch': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(56)}
      <g>
        <!-- legs bent on floor -->
        <line x1="32" y1="44" x2="18" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="18" y1="52" x2="14" y2="56" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="44" x2="46" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="46" y1="52" x2="50" y2="56" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <!-- torso crunch -->
        <line x1="32" y1="44" x2="32" y2="30" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
        ${head(32,24,6)}
        <!-- arms -->
        <line x1="32" y1="34" x2="24" y2="30" stroke="${S}" stroke-width="2" stroke-linecap="round"/>
        <line x1="32" y1="34" x2="40" y2="30" stroke="${S}" stroke-width="2" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,10;0,0;0,10" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'plank': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(54)}
      <!-- static plank -->
      ${head(10,32,6)}
      <line x1="10" y1="38" x2="52" y2="44" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
      <line x1="16" y1="40" x2="16" y2="54" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="32" y1="42" x2="32" y2="54" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="52" y1="44" x2="56" y2="54" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="48" y1="44" x2="50" y2="54" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <!-- pulse glow -->
      <circle cx="32" cy="42" r="4" fill="${C}" opacity="0">
        <animate attributeName="opacity" values="0;0.4;0" dur="2s" repeatCount="indefinite"/>
        <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite"/>
      </circle>
    </svg>`,

    'leg raise': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      <g>
        ${head(32,10,6)}
        ${body(32,16,32,36,3)}
        <line x1="32" y1="28" x2="22" y2="32" stroke="${S}" stroke-width="2" stroke-linecap="round"/>
        <line x1="32" y1="28" x2="42" y2="32" stroke="${S}" stroke-width="2" stroke-linecap="round"/>
        <line x1="32" y1="36" x2="24" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="36" x2="40" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="rotate" values="0,32,36;-30,32,36;0,32,36" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'mountain climber': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(56)}
      ${head(12,24,6)}
      <line x1="12" y1="30" x2="48" y2="38" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
      <line x1="16" y1="32" x2="16" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="48" y1="38" x2="52" y2="52" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <g>
        <line x1="30" y1="35" x2="22" y2="46" stroke="${C}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,0;10,-2;0,0" dur="1s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    // ── CALVES ──
    'calf raise': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      <g>
        ${head(32,8,6)}
        ${body(32,14,32,36,3)}
        <line x1="32" y1="28" x2="22" y2="32" stroke="${S}" stroke-width="2" stroke-linecap="round"/>
        <line x1="32" y1="28" x2="42" y2="32" stroke="${S}" stroke-width="2" stroke-linecap="round"/>
        <line x1="32" y1="36" x2="26" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="26" y1="50" x2="24" y2="56" stroke="${S}" stroke-width="2" stroke-linecap="round"/>
        <line x1="32" y1="36" x2="38" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="38" y1="50" x2="40" y2="56" stroke="${S}" stroke-width="2" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,4;0,0;0,4" dur="1.5s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    // ── CARDIO ──
    'run': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(56)}
      <g>
        ${head(36,10,6)}
        <line x1="36" y1="16" x2="32" y2="34" stroke="${S}" stroke-width="3" stroke-linecap="round"/>
        <!-- arm swing -->
        <line x1="34" y1="22" x2="22" y2="28" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="34" y1="22" x2="46" y2="30" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <!-- legs running -->
        <line x1="32" y1="34" x2="20" y2="44" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="20" y1="44" x2="16" y2="56" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="34" x2="46" y2="42" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="46" y1="42" x2="50" y2="54" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="-4,0;4,0;-4,0" dur="0.6s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'burpee': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      <g>
        ${head(32,8,6)}
        ${body(32,14,32,30,3)}
        <line x1="32" y1="20" x2="20" y2="26" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="20" x2="44" y2="26" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="30" x2="24" y2="44" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="30" x2="40" y2="44" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,0;0,28;0,0" dur="2s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'jump rope': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      <g>
        ${head(32,8,6)}
        ${body(32,14,32,34,3)}
        <line x1="32" y1="26" x2="20" y2="30" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="26" x2="44" y2="30" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="34" x2="24" y2="46" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="34" x2="40" y2="46" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <!-- rope arc -->
        <path d="M18,30 Q32,58 46,30" fill="none" stroke="${C}" stroke-width="2" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="0,0;0,-6;0,0" dur="0.5s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    // ── FOREARMS ──
    'wrist curl': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      ${head(32,10,6)}
      ${body(32,16,32,38,3)}
      <line x1="32" y1="38" x2="24" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="32" y1="38" x2="40" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
      <g>
        <line x1="20" y1="28" x2="12" y2="42" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${dumbbell(12,42,0)}
        <line x1="44" y1="28" x2="52" y2="42" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${dumbbell(52,42,0)}
        <animateTransform attributeName="transform" type="rotate" values="0,32,42;15,32,42;0,32,42" dur="1.5s" repeatCount="indefinite"/>
      </g>
    </svg>`,

    'farmer': ()=>`<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      ${floor(58)}
      <g>
        ${head(32,10,6)}
        ${body(32,16,32,36,3)}
        <line x1="32" y1="26" x2="20" y2="30" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${dumbbell(12,38,-80)}
        <line x1="32" y1="26" x2="44" y2="30" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        ${dumbbell(52,38,80)}
        <line x1="32" y1="36" x2="24" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="32" y1="36" x2="40" y2="50" stroke="${S}" stroke-width="2.5" stroke-linecap="round"/>
        <animateTransform attributeName="transform" type="translate" values="-3,0;3,0;-3,0" dur="0.8s" repeatCount="indefinite"/>
      </g>
    </svg>`,
  };

  // Fallback generic icons per muscle group
  const muscleDefaults = {
    'Chest':     svgs['bench press'],
    'Back':      svgs['deadlift'],
    'Shoulders': svgs['overhead press'],
    'Biceps':    svgs['curl'],
    'Triceps':   svgs['pushdown'],
    'Legs':      svgs['squat'],
    'Glutes':    svgs['hip thrust'],
    'Hamstrings':svgs['deadlift'],
    'Calves':    svgs['calf raise'],
    'Abs':       svgs['crunch'],
    'Cardio':    svgs['run'],
    'Forearms':  svgs['wrist curl'],
  };

  return function(exName, muscle){
    const n = exName.toLowerCase();
    for(const [key, fn] of Object.entries(svgs)){
      if(n.includes(key)) return fn();
    }
    // muscle-group fallback
    const fallback = muscleDefaults[muscle];
    if(fallback) return fallback();
    // ultimate fallback: generic figure
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="14" r="7" fill="#2c2c2a"/>
      <line x1="32" y1="21" x2="32" y2="44" stroke="#2c2c2a" stroke-width="3" stroke-linecap="round"/>
      <line x1="32" y1="30" x2="18" y2="38" stroke="#2c2c2a" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="32" y1="30" x2="46" y2="38" stroke="#2c2c2a" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="32" y1="44" x2="24" y2="58" stroke="#2c2c2a" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="32" y1="44" x2="40" y2="58" stroke="#2c2c2a" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;
  };
})();

function openLibrary(){
  document.getElementById('lib-modal').style.display='flex';
  document.body.style.overflow='hidden';
  renderMuscleChips();
  renderLibraryList();
}
function closeLibrary(){
  document.getElementById('lib-modal').style.display='none';
  document.body.style.overflow='';
  if(!pastEditDate) _pastLibMode=false;
}
function closeLibraryOnBg(e){if(e.target===document.getElementById('lib-modal'))closeLibrary();}

function renderMuscleChips(){
  const c=document.getElementById('lib-muscle-chips'); c.innerHTML='';
  const muscles=['All',...Object.keys(EXERCISE_DB)];
  muscles.forEach(m=>{
    const chip=document.createElement('div');
    chip.className='muscle-chip'+(m===libSelectedMuscle?' active':'');
    chip.textContent=(MUSCLE_EMOJIS[m]||'')+(m==='All'?'All':' '+m);
    chip.onclick=()=>{libSelectedMuscle=m;renderMuscleChips();renderLibraryList();};
    c.appendChild(chip);
  });
}

function filterLibrary(){
  libSearchQuery=document.getElementById('lib-search-inp').value.toLowerCase();
  renderLibraryList();
}

function calcLibKcal(met, bw){
  // kcal for 3 sets of ~10 reps @ typical duration 45sec/set
  const setDurHrs=0.75/60; // 45 seconds
  return Math.round(met * bw * setDurHrs * 3);
}

// ── Exercise library helper functions ────────────────────────────────────────

function toggleLibExpand(id){
  const el=document.getElementById(id);
  const arrow=document.getElementById(id+'-arrow');
  if(!el) return;
  const open=el.style.display==='block';
  el.style.display=open?'none':'block';
  if(arrow) arrow.textContent=open?'▼':'▲';
}

function getSecondaryMuscles(name, primaryMuscle){
  const n=name.toLowerCase();
  const map={
    'bench press':'Triceps, Front Delts, Serratus','incline':'Triceps, Front Delts',
    'decline':'Triceps, Lower Chest','fly':'Front Delts','dip':'Triceps, Lower Chest',
    'squat':'Hamstrings, Glutes, Core, Calves','deadlift':'Glutes, Hamstrings, Core, Traps, Forearms',
    'romanian':'Glutes, Core, Calves','row':'Biceps, Rear Delts, Core',
    'pull-up':'Biceps, Rear Delts, Core','chin-up':'Biceps, Core','lat pulldown':'Biceps, Rear Delts',
    'overhead press':'Triceps, Traps, Core','arnold':'Front Delts, Traps',
    'lateral raise':'Upper Traps','curl':'Brachialis, Forearms','hammer':'Brachialis, Brachioradialis',
    'pushdown':'Lateral Head, Medial Head','skull':'Long Head, Medial Head',
    'lunge':'Glutes, Hamstrings, Calves, Core','bulgarian':'Glutes, Hamstrings, Core',
    'hip thrust':'Hamstrings, Lower Back','plank':'Glutes, Shoulders, Hip Flexors',
    'crunch':'Hip Flexors','leg raise':'Hip Flexors','face pull':'Rotator Cuff, Mid Traps',
  };
  for(const [key,val] of Object.entries(map)){
    if(n.includes(key)) return val;
  }
  const generic={'Chest':'Triceps, Front Delts','Back':'Biceps, Rear Delts','Shoulders':'Traps, Triceps',
    'Biceps':'Brachialis, Forearms','Triceps':'Chest, Shoulders','Legs':'Glutes, Core',
    'Glutes':'Hamstrings, Lower Back','Hamstrings':'Glutes, Calves','Abs':'Hip Flexors, Obliques',
    'Calves':'Achilles, Tibialis','Forearms':'Grip, Biceps'};
  return generic[primaryMuscle]||'';
}

function getHowTo(name, muscle, tip){
  const n=name.toLowerCase();
  const steps={
    'barbell bench press':'1. Lie on bench, feet flat. 2. Grip slightly wider than shoulders. 3. Lower bar to lower chest. 4. Press up explosively.',
    'barbell squat':'1. Bar on upper traps. 2. Feet shoulder-width, toes out. 3. Break hips and knees together. 4. Below parallel. 5. Drive through heels.',
    'romanian deadlift':'1. Hinge at hips, soft knee. 2. Bar down shins. 3. Feel hamstring stretch. 4. Drive hips forward. 5. Squeeze glutes at top.',
    'pull-up':'1. Dead hang, shoulder-width. 2. Depress shoulders. 3. Pull elbows to hips. 4. Chin over bar. 5. Lower fully.',
    'barbell row':'1. Hinge torso near parallel. 2. Pull to lower chest. 3. Lead with elbows. 4. Pause at top. 5. Lower controlled.',
    'overhead press':'1. Bar at collarbone. 2. Press straight up. 3. Head shifts back slightly. 4. Lock out overhead.',
    'lateral raise':'1. Slight forward lean. 2. Raise to shoulder height. 3. Lead with elbows. 4. Pause briefly. 5. Lower slowly 3 sec.',
    'barbell curl':'1. Full hang at bottom. 2. Curl keeping elbows pinned. 3. Squeeze at top. 4. Control the negative.',
    'hammer curl':'1. Neutral grip thumbs up. 2. Curl without rotating wrist. 3. Squeeze brachialis at top. 4. Lower fully.',
    'tricep pushdown':'1. Elbows pinned to sides. 2. Push to full extension. 3. Pause at bottom. 4. Slow return to 90 degrees.',
    'skull crusher':'1. Lie on bench, bar above forehead. 2. Lower by bending elbows only. 3. Press back up.',
    'hip thrust':'1. Shoulders on bench, bar on hips. 2. Chin tucked. 3. Drive hips up. 4. Squeeze glutes 2 seconds. 5. Lower until hips near floor.',
    'plank':'1. Forearms on floor. 2. Body in straight line. 3. Brace core. 4. Squeeze glutes. 5. Breathe normally.',
    'face pull':'1. Cable at forehead height. 2. Pull rope toward face. 3. Thumbs behind, elbows high. 4. Pause at full retraction.',
  };
  for(const [key,val] of Object.entries(steps)){
    if(n.includes(key.split(' ')[0]) && n.includes(key.split(' ').pop())) return val;
    if(n===key) return val;
  }
  return tip||'Focus on controlled movement through full range of motion.';
}

function getMuscleAnatSvg(head, muscle){
  const R='#E24B4A', G='#9ca3af', S='#6b7280';
  const regions={
    'Chest':     [{x:22,y:22,w:24,h:18,rx:4}],
    'Back':      [{x:20,y:18,w:28,h:22,rx:4}],
    'Shoulders': [{x:13,y:16,w:10,h:10,rx:5},{x:45,y:16,w:10,h:10,rx:5}],
    'Biceps':    [{x:10,y:27,w:8,h:15,rx:4},{x:50,y:27,w:8,h:15,rx:4}],
    'Triceps':   [{x:10,y:27,w:8,h:15,rx:4},{x:50,y:27,w:8,h:15,rx:4}],
    'Legs':      [{x:21,y:51,w:12,h:20,rx:4},{x:35,y:51,w:12,h:20,rx:4}],
    'Glutes':    [{x:21,y:47,w:12,h:14,rx:4},{x:35,y:47,w:12,h:14,rx:4}],
    'Hamstrings':[{x:21,y:53,w:12,h:16,rx:4},{x:35,y:53,w:12,h:16,rx:4}],
    'Calves':    [{x:23,y:71,w:9,h:11,rx:4},{x:36,y:71,w:9,h:11,rx:4}],
    'Abs':       [{x:24,y:40,w:20,h:18,rx:4}],
    'Cardio':    [{x:16,y:16,w:36,h:50,rx:6}],
    'Forearms':  [{x:8,y:42,w:8,h:12,rx:4},{x:52,y:42,w:8,h:12,rx:4}],
  };
  const rects=(regions[muscle]||[{x:24,y:30,w:20,h:20,rx:4}]);
  const highlights=rects.map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${r.rx||4}" fill="${R}" opacity="0.9"/>`).join('');
  return `<svg width="68" height="80" viewBox="0 0 68 80" xmlns="http://www.w3.org/2000/svg">
    <circle cx="34" cy="10" r="7" fill="${S}" opacity="0.5"/>
    <rect x="31" y="16" width="6" height="5" rx="2" fill="${S}" opacity="0.4"/>
    <rect x="22" y="20" width="24" height="30" rx="5" fill="${G}" opacity="0.3"/>
    <rect x="11" y="22" width="8" height="26" rx="4" fill="${G}" opacity="0.3"/>
    <rect x="49" y="22" width="8" height="26" rx="4" fill="${G}" opacity="0.3"/>
    <rect x="22" y="50" width="11" height="26" rx="4" fill="${G}" opacity="0.3"/>
    <rect x="35" y="50" width="11" height="26" rx="4" fill="${G}" opacity="0.3"/>
    ${highlights}
  </svg>`;
}


function renderLibraryList(){
  const list=document.getElementById('lib-list');
  list.innerHTML='';
  const bw=state.calProfile.wt||75;
  const muscles=libSelectedMuscle==='All'?Object.keys(EXERCISE_DB):[libSelectedMuscle];

  let totalShown=0;
  muscles.forEach(muscle=>{
    const exercises=EXERCISE_DB[muscle].filter(ex=>
      !libSearchQuery || ex.name.toLowerCase().includes(libSearchQuery) || muscle.toLowerCase().includes(libSearchQuery)
    );
    if(!exercises.length) return;

    if(libSelectedMuscle==='All'){
      const hdr=document.createElement('div');
      hdr.className='muscle-section-hdr';
      const micons={Chest:'🏋️',Back:'🔙',Shoulders:'🔺',Biceps:'💪',Triceps:'🔩',Legs:'🦵',Glutes:'🍑',Hamstrings:'🦵',Calves:'🦶',Abs:'⚡',Cardio:'🏃',Forearms:'✊'};
      hdr.textContent=(micons[muscle]||'•')+' '+muscle.toUpperCase();
      list.appendChild(hdr);
    }

    exercises.forEach(ex=>{
      const kcal=calcLibKcal(ex.met,bw);
      const item=document.createElement('div');
      item.className='lib-item';
      item.style.cssText='flex-direction:column;align-items:stretch;padding:0;overflow:hidden;border-radius:12px';
      const alreadyAdded=state.exercises.some(e=>e.name.toUpperCase()===ex.name.toUpperCase());

      const lastSess=getLastSession(ex.name);
      const lastSetsStr=lastSess?lastSess.sets.slice(0,2).map(s=>s.w+'×'+s.r).join(', ')+(lastSess.sets.length>2?'…':''):'';
      const lastLine=lastSess
        ?`<span style="color:var(--text3);font-size:11px">Last ${lastSess.date.slice(5)}: ${lastSetsStr}</span>`
        :`<span style="color:var(--text3);font-size:11px">No history yet</span>`;

      // Muscle anatomy SVG
      const anatSvg = getMuscleAnatSvg(ex.head||'', muscle);
      const customBadge = ex._custom?'<span style="font-size:9px;background:var(--red);color:#fff;padding:2px 5px;border-radius:4px;font-weight:700;margin-left:5px">MINE</span>':'';
      const commBadge = ex._community?`<span style="font-size:9px;background:rgba(99,102,241,.15);color:#6366f1;padding:2px 5px;border-radius:4px;font-weight:700;margin-left:5px">🌍 ${ex._contributor||''}</span>`:'';
      const sessBadge = ex.session?`<span style="font-size:9px;background:var(--surface2);color:var(--text3);padding:2px 5px;border-radius:4px;font-weight:600;margin-left:5px">Session ${ex.session}</span>`:'';

      const exId = 'lib-ex-'+ex.name.replace(/[^a-z0-9]/gi,'_');

      item.innerHTML=`
        <!-- Top row: anatomy + info + add -->
        <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 12px 8px">
          <!-- Anatomy figure -->
          <div style="width:68px;height:80px;flex-shrink:0;border-radius:10px;background:var(--surface2);overflow:hidden;display:flex;align-items:center;justify-content:center">
            ${anatSvg}
          </div>
          <!-- Info -->
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--font-cond);font-weight:700;font-size:15px;text-transform:uppercase;color:var(--text);line-height:1.2">${ex.name}${customBadge}${commBadge}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:3px">${muscle}${ex.equip?' · '+ex.equip:''}${sessBadge}</div>
            ${ex.head?`<div style="font-size:11px;color:#6366f1;font-weight:600;margin-top:2px">${ex.head}</div>`:''}
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
              <span style="font-size:12px;font-weight:700;color:var(--red)">🔥 ~${kcal} kcal/3 sets</span>
              ${lastLine}
            </div>
          </div>
          <!-- Add button -->
          <button class="lib-add-btn" onclick="addFromLibrary('${ex.name.replace(/'/g,"\\'")}','${muscle}',${ex.met})"
            style="${alreadyAdded?'background:#22c55e;border-color:#22c55e':''};flex-shrink:0;margin-top:2px">
            ${alreadyAdded?'✓':'+'}
          </button>
        </div>

        <!-- Expand button -->
        <button onclick="toggleLibExpand('${exId}')" style="width:100%;background:none;border:none;border-top:1px solid var(--border);padding:6px 12px;font-size:11px;color:var(--text3);cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center">
          <span>How to do it · Primary & secondary muscles</span>
          <span id="${exId}-arrow">▼</span>
        </button>

        <!-- Expandable detail panel -->
        <div id="${exId}" style="display:none;padding:10px 12px 12px;background:var(--surface2);border-top:1px solid var(--border)">
          ${ex.head?`<div style="margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:3px">Muscles targeted</div>
            <div style="font-size:12px;color:var(--text2)"><span style="color:var(--red);font-weight:700">Primary:</span> ${muscle}${ex.head?' ('+ex.head+')':''}</div>
            ${getSecondaryMuscles(ex.name,muscle)?`<div style="font-size:12px;color:var(--text2);margin-top:2px"><span style="font-weight:700;color:var(--text3)">Secondary:</span> ${getSecondaryMuscles(ex.name,muscle)}</div>`:''}
          </div>`:''}
          ${ex.tip?`<div style="margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:3px">How to do it</div>
            <div style="font-size:12px;color:var(--text2);line-height:1.5">${getHowTo(ex.name,muscle,ex.tip)}</div>
          </div>`:''}
          ${ex.tip?`<div style="background:rgba(226,75,74,.08);border-left:3px solid var(--red);padding:6px 10px;border-radius:0 8px 8px 0">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--red);margin-bottom:2px">Key cue</div>
            <div style="font-size:12px;color:var(--text2)">${ex.tip}</div>
          </div>`:''}
        </div>
      `;
      list.appendChild(item);
      totalShown++;
    });
  });

  if(totalShown===0){
    list.innerHTML='<div class="lib-loading">No exercises found</div>';
  }
}

function addFromLibrary(name, muscle, met){
  if(_pastLibMode){
    const already=pastEditExercises.findIndex(e=>e.name.toUpperCase()===name.toUpperCase());
    if(already>=0){toast(name+' already added');closeLibrary();return;}
    const last=getLastSession(name.toUpperCase());
    const sets=last&&last.sets.length
      ? last.sets.map(s=>({w:s.w,r:s.r,done:true}))
      : [{w:0,r:10,done:true},{w:0,r:10,done:true},{w:0,r:10,done:true}];
    pastEditExercises.push({name:name.toUpperCase(),muscle,met,sets});
    pastEditExpanded[pastEditExercises.length-1]=true;
    learnExercise(name.toUpperCase(),muscle,met);
    closeLibrary();
    renderPastExercises();
    toast(last?`Added ${name} — last session loaded!`:'Added '+name);
    return;
  }
  const existing=state.exercises.findIndex(e=>e.name.toUpperCase()===name.toUpperCase());
  if(existing>=0){toast(name+' already in workout');return;}

  // Learn immediately so it's in memory/progress from now on
  learnExercise(name.toUpperCase(),muscle,met);

  // Pre-fill with last session weights so you know what to beat
  const last=getLastSession(name.toUpperCase());
  const sets=last&&last.sets.length
    ? last.sets.map(s=>({w:s.w,r:s.r,done:false}))
    : [{w:0,r:10,done:false},{w:0,r:10,done:false},{w:0,r:10,done:false}];

  state.exercises.push({name:name.toUpperCase(),muscle,met,sets});
  state.expanded[state.exercises.length-1]=true;
  renderLibraryList();
  renderExercises();
  autoSave();
  toast(last?`Added ${name} — last session loaded!`:'Added '+name+' to workout!');
}

// Auto-save today's exercises on every change (debounced 800ms)
let _autoSaveTimer=null;
function autoSave(){
  state.exerciseDate=todayStr();
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer=setTimeout(()=>{
    saveState({activeSession:true}); // only sync active session
  }, 800);
}
let restInterval=null, restSecs=0, restTotal=90;
function startRestTimer(secs=90){
  clearInterval(restInterval);
  restSecs=secs; restTotal=secs;
  const overlay=document.getElementById('rest-overlay');
  overlay.classList.remove('hidden');
  updateRestDisplay();
  restInterval=setInterval(()=>{
    restSecs--;
    updateRestDisplay();
    if(restSecs<=0){clearInterval(restInterval);overlay.classList.add('hidden');try{navigator.vibrate&&navigator.vibrate([200,100,200]);}catch(e){}}
  },1000);
}
function updateRestDisplay(){
  document.getElementById('rest-num').textContent=restSecs;
  const circ=113; const offset=circ*(1-restSecs/restTotal);
  document.getElementById('rest-ring-arc').style.strokeDashoffset=offset;
}
function skipRest(){clearInterval(restInterval);document.getElementById('rest-overlay').classList.add('hidden');}

// Override toggleSet to auto-start rest timer
function toggleSet(i,j){
  window._haptic?.(state.exercises[i].sets[j].done?'light':'medium');
  const wasUndone=!state.exercises[i].sets[j].done;
  state.exercises[i].sets[j].done=!state.exercises[i].sets[j].done;
  renderExercises();
  document.getElementById('wk-kcal').textContent=calcLiveCalories();
  if(wasUndone) startRestTimer(90);
  autoSave();
}

// ─── RPE ────────────────────────────────────────────────────────────────────
function cycleRPE(i,j){
  const s=state.exercises[i].sets[j];
  s.rpe=((s.rpe||0)%10)+1;
  renderExercises();
  autoSave();
}

// ─── SUPERSET ────────────────────────────────────────────────────────────────
function toggleSuperset(i){
  const labels=['A','B','C'];
  const ex=state.exercises[i];
  const cur=ex.superset;
  if(!cur){ex.superset=labels[0];}
  else if(cur==='A'){ex.superset='B';}
  else if(cur==='B'){ex.superset='C';}
  else{delete ex.superset;}
  renderExercises();
  autoSave();
}

// ─── COPY LAST WORKOUT ───────────────────────────────────────────────────────
function copyLastWorkout(){
  if(!state.workoutHistory.length){toast('No previous workouts to copy');return;}
  if(!confirm('Replace today\'s exercises with last workout?')) return;
  const last=state.workoutHistory[state.workoutHistory.length-1];
  state.exercises=last.exercises.map(ex=>({
    ...ex,
    sets:ex.sets.map(s=>({w:s.w,r:s.r,done:false}))
  }));
  state.expanded={};
  renderExercises();
  autoSave();
  toast('Last workout loaded!');
}

// ─── PLATE CALCULATOR ────────────────────────────────────────────────────────
function showPlateCalc(i){
  const ex=state.exercises[i];
  const maxW=Math.max(...ex.sets.map(s=>s.w||0));
  document.getElementById('plate-target').value=maxW||100;
  calcPlates();
  document.getElementById('plate-modal').style.display='flex';
}
function calcPlates(){
  const target=parseFloat(document.getElementById('plate-target').value)||0;
  const bar=parseFloat(document.getElementById('plate-bar').value)||20;
  const available=[25,20,15,10,5,2.5,1.25];
  const colors={25:'#1d4ed8',20:'#dc2626',15:'#facc15',10:'#16a34a',5:'#fff',2.5:'#9ca3af',1.25:'#d97706'};
  let remaining=(target-bar)/2;
  if(remaining<0){document.getElementById('plate-result').innerHTML='<div style="color:var(--red);font-size:13px">Target less than bar weight</div>';return;}
  const plates=[];
  available.forEach(p=>{while(remaining>=p-0.001){plates.push(p);remaining-=p;}});
  if(Math.abs(remaining)>0.1){
    const closest=target-(remaining*2);
    document.getElementById('plate-result').innerHTML=`<div style="font-size:12px;color:var(--text3);margin-bottom:8px">Exact not possible — closest: <b>${closest}kg</b></div>${renderPlates(plates,colors)}`;
  } else {
    document.getElementById('plate-result').innerHTML=`<div style="font-size:12px;color:var(--text3);margin-bottom:8px">Each side of the bar:</div>${renderPlates(plates,colors)}`;
  }
}
function renderPlates(plates,colors){
  if(!plates.length) return '<div style="font-size:13px;color:var(--text3)">Bar only — no plates needed</div>';
  const html=plates.map(p=>{
    const c=colors[p]||'#888';
    const textCol=['#facc15','#fff'].includes(c)?'#1a1a18':'#fff';
    return `<div class="plate-chip" style="background:${c};color:${textCol};box-shadow:0 2px 4px rgba(0,0,0,.2)">${p}</div>`;
  }).join('');
  return `<div class="plates-row">${html}</div>`;
}

// ─── 1RM CALCULATOR ──────────────────────────────────────────────────────────
// Strength standards (kg) by exercise, [untrained,beginner,novice,intermediate,advanced,elite]
const STRENGTH_STANDARDS={
  bench:{m:[20,60,80,100,130,160],f:[10,30,45,60,80,100],label:'Bench Press'},
  squat:{m:[30,80,110,140,180,220],f:[15,45,65,85,115,145],label:'Squat'},
  deadlift:{m:[40,100,130,170,215,260],f:[20,55,80,105,140,175],label:'Deadlift'},
  ohp:{m:[10,35,50,65,85,105],f:[5,20,30,40,55,70],label:'Overhead Press'},
  row:{m:[25,60,80,100,130,160],f:[10,35,50,65,85,105],label:'Barbell Row'},
};
const STD_LABELS=['Untrained','Beginner','Novice','Intermediate','Advanced','Elite'];
function calc1RM(){
  const w=parseFloat(document.getElementById('orm-weight').value)||0;
  const r=parseInt(document.getElementById('orm-reps').value)||0;
  const ex=document.getElementById('orm-ex').value;
  if(!w||!r){document.getElementById('orm-result').innerHTML='';return;}
  const orm=Math.round(w*(1+r/30));
  const gender=state.calProfile.gender||'male';
  const stds=STRENGTH_STANDARDS[ex][gender==='male'?'m':'f'];
  let level=0; stds.forEach((s,i)=>{if(orm>=s)level=i;});
  const pct=stds[5]>0?Math.min(100,Math.round(orm/stds[5]*100)):0;
  const nextStd=stds[Math.min(level+1,5)];
  const toNext=nextStd-orm;
  document.getElementById('orm-result').innerHTML=`
    <div style="text-align:center;padding:12px 0">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3)">Estimated 1RM</div>
      <div style="font-family:var(--font-cond);font-weight:900;font-size:52px;color:var(--red);line-height:1">${orm}<span style="font-size:20px">kg</span></div>
      <div style="display:inline-block;padding:4px 12px;border-radius:20px;background:var(--red-bg);color:var(--red-dark);font-weight:700;font-size:13px;margin-top:4px">${STD_LABELS[level]}</div>
    </div>
    <div class="strength-label"><span>0</span><span>${stds[5]}kg Elite</span></div>
    <div class="strength-bar"><div class="strength-fill" style="width:${pct}%"></div></div>
    <div style="font-size:12px;color:var(--text3);text-align:center">${level<5?`${toNext}kg to reach ${STD_LABELS[level+1]}`:'You\'re Elite! 🏆'}</div>
  `;
}
function renderStrengthStandards(){
  const bw=state.calProfile.wt||75;
  const gender=state.calProfile.gender||'male';
  let html='';
  Object.entries(STRENGTH_STANDARDS).forEach(([key,std])=>{
    // Find best from history
    const best=state.workoutHistory.reduce((mx,w)=>{
      const ex=w.exercises.find(e=>e.name.toLowerCase().includes(key==='ohp'?'overhead':key==='row'?'row':key));
      if(!ex) return mx;
      const m=Math.max(...ex.sets.map(s=>s.w||0));
      return Math.max(mx,m);
    },0);
    const stds=std[gender==='male'?'m':'f'];
    let level=0; stds.forEach((s,i)=>{if(best>=s)level=i;});
    const pct=stds[5]>0?Math.min(100,Math.round(best/stds[5]*100)):0;
    html+=`<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div style="font-size:13px;font-weight:700;color:var(--text)">${std.label}</div>
        <div style="font-size:12px;color:var(--text2)">${best?best+'kg':'No data'} · <span style="color:var(--red)">${STD_LABELS[level]}</span></div>
      </div>
      <div class="strength-bar"><div class="strength-fill" style="width:${pct}%"></div></div>
    </div>`;
  });
  document.getElementById('strength-standards').innerHTML=html||'<div style="color:var(--text3);font-size:13px">Save workouts to see your strength levels</div>';
}

// ─── HALL OF FAME / PR PAGE ───────────────────────────────────────────────────
function renderRecordsPage(){
  renderStrengthStandards();
  renderHeatmap();

  // Collect all PRs
  const prs={};
  state.workoutHistory.forEach(w=>{
    w.exercises.forEach(ex=>{
      const best=Math.max(...ex.sets.map(s=>s.w||0));
      if(!prs[ex.name]||best>prs[ex.name].weight){
        prs[ex.name]={weight:best,date:w.date,reps:ex.sets.find(s=>s.w===best)?.r||0,muscle:ex.muscle||''};
      }
    });
  });
  const sorted=Object.entries(prs).sort((a,b)=>b[1].weight-a[1].weight);

  // Stats
  const thisMonth=new Date().toISOString().slice(0,7);
  const weekAgo=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  document.getElementById('rec-total-prs').textContent=sorted.length;
  document.getElementById('rec-this-month').textContent=sorted.filter(([,v])=>v.date.startsWith(thisMonth)).length;
  document.getElementById('rec-best-week').textContent=sorted.filter(([,v])=>v.date>=weekAgo).length;

  // PR list
  const medals=['🥇','🥈','🥉'];
  const medalCls=['pr-gold','pr-silver','pr-bronze'];
  const list=document.getElementById('pr-list');
  if(!sorted.length){list.innerHTML='<div class="card" style="text-align:center;padding:30px;color:var(--text3)">Save workouts to start building your Hall of Fame!</div>';return;}
  list.innerHTML=sorted.map(([name,pr],idx)=>`
    <div class="pr-row">
      <div class="pr-medal ${medalCls[idx]||''}">${medals[idx]||'🏅'}</div>
      <div>
        <div class="pr-name">${name}</div>
        <div class="pr-detail">${pr.muscle} · ${pr.date} · ${pr.reps} reps</div>
      </div>
      <div class="pr-val">${pr.weight}kg</div>
    </div>
  `).join('');
}

// ─── MUSCLE HEATMAP ───────────────────────────────────────────────────────────
function renderHeatmap(){
  const weekAgo=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  const counts={};
  state.workoutHistory.filter(w=>w.date>=weekAgo).forEach(w=>{
    w.exercises.forEach(ex=>{const m=ex.muscle||'';counts[m]=(counts[m]||0)+ex.sets.length;});
  });
  const max=Math.max(1,...Object.values(counts));
  const heat=m=>{const v=counts[m]||0;const pct=v/max;
    if(pct===0) return '#e5e5e5';
    if(pct<0.25) return '#fecaca';
    if(pct<0.5) return '#f87171';
    if(pct<0.75) return '#ef4444';
    return '#dc2626';
  };
  // SVG body figure with colored muscle regions
  const svg=`<svg viewBox="0 0 120 280" xmlns="http://www.w3.org/2000/svg" style="width:100%">
    <!-- Head -->
    <circle cx="60" cy="22" r="18" fill="#d1d5db" stroke="#9ca3af" stroke-width="1"/>
    <!-- Neck -->
    <rect x="54" y="38" width="12" height="10" rx="4" fill="#d1d5db"/>
    <!-- Chest -->
    <ellipse cx="45" cy="68" rx="14" ry="16" fill="${heat('Chest')}" stroke="white" stroke-width="1" opacity=".9"/>
    <ellipse cx="75" cy="68" rx="14" ry="16" fill="${heat('Chest')}" stroke="white" stroke-width="1" opacity=".9"/>
    <!-- Shoulders -->
    <ellipse cx="28" cy="56" rx="12" ry="10" fill="${heat('Shoulders')}" stroke="white" stroke-width="1" opacity=".9"/>
    <ellipse cx="92" cy="56" rx="12" ry="10" fill="${heat('Shoulders')}" stroke="white" stroke-width="1" opacity=".9"/>
    <!-- Abs -->
    <rect x="48" y="84" width="10" height="9" rx="3" fill="${heat('Abs')}" stroke="white" stroke-width="1" opacity=".9"/>
    <rect x="62" y="84" width="10" height="9" rx="3" fill="${heat('Abs')}" stroke="white" stroke-width="1" opacity=".9"/>
    <rect x="48" y="96" width="10" height="9" rx="3" fill="${heat('Abs')}" stroke="white" stroke-width="1" opacity=".9"/>
    <rect x="62" y="96" width="10" height="9" rx="3" fill="${heat('Abs')}" stroke="white" stroke-width="1" opacity=".9"/>
    <rect x="48" y="108" width="10" height="9" rx="3" fill="${heat('Abs')}" stroke="white" stroke-width="1" opacity=".9"/>
    <rect x="62" y="108" width="10" height="9" rx="3" fill="${heat('Abs')}" stroke="white" stroke-width="1" opacity=".9"/>
    <!-- Upper Arms (Biceps/Triceps) -->
    <rect x="12" y="62" width="14" height="38" rx="7" fill="${heat('Biceps')}" stroke="white" stroke-width="1" opacity=".9"/>
    <rect x="94" y="62" width="14" height="38" rx="7" fill="${heat('Biceps')}" stroke="white" stroke-width="1" opacity=".9"/>
    <!-- Forearms -->
    <rect x="10" y="104" width="12" height="30" rx="6" fill="${heat('Forearms')}" stroke="white" stroke-width="1" opacity=".9"/>
    <rect x="98" y="104" width="12" height="30" rx="6" fill="${heat('Forearms')}" stroke="white" stroke-width="1" opacity=".9"/>
    <!-- Glutes -->
    <ellipse cx="48" cy="148" rx="14" ry="14" fill="${heat('Glutes')}" stroke="white" stroke-width="1" opacity=".9"/>
    <ellipse cx="72" cy="148" rx="14" ry="14" fill="${heat('Glutes')}" stroke="white" stroke-width="1" opacity=".9"/>
    <!-- Quads -->
    <rect x="38" y="160" width="20" height="50" rx="10" fill="${heat('Legs')}" stroke="white" stroke-width="1" opacity=".9"/>
    <rect x="62" y="160" width="20" height="50" rx="10" fill="${heat('Legs')}" stroke="white" stroke-width="1" opacity=".9"/>
    <!-- Hamstrings overlay -->
    <rect x="40" y="162" width="16" height="46" rx="8" fill="${heat('Hamstrings')}" opacity=".4"/>
    <rect x="64" y="162" width="16" height="46" rx="8" fill="${heat('Hamstrings')}" opacity=".4"/>
    <!-- Calves -->
    <rect x="40" y="214" width="16" height="38" rx="8" fill="${heat('Calves')}" stroke="white" stroke-width="1" opacity=".9"/>
    <rect x="64" y="214" width="16" height="38" rx="8" fill="${heat('Calves')}" stroke="white" stroke-width="1" opacity=".9"/>
    <!-- Back label (text only, shown on side) -->
  </svg>`;

  document.getElementById('heatmap-svg').innerHTML=svg;

  const muscles=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  const legend=muscles.length?muscles.slice(0,6).map(m=>`
    <div class="heatmap-legend-item">
      <div class="heatmap-swatch" style="background:${heat(m)}"></div>
      <span>${m}: ${counts[m]} sets</span>
    </div>`).join(''):'<div style="color:var(--text3)">Train this week to see heatmap</div>';
  document.getElementById('heatmap-legend').innerHTML=legend;
}

// ─── WEEKLY REPORT ────────────────────────────────────────────────────────────
let reportPeriod='this';
function showReport(period){
  reportPeriod=period;
  ['this','last','month'].forEach(p=>{
    const b=document.getElementById(`rep-btn-${p}`);
    b.style.background=p===period?'var(--red)':'';
    b.style.color=p===period?'#fff':'';
    b.style.borderColor=p===period?'var(--red)':'';
  });
  renderReport();
}
function getReportDates(period){
  const now=new Date();
  const dow=now.getDay()||7;
  if(period==='this'){
    const start=new Date(now); start.setDate(now.getDate()-dow+1); start.setHours(0,0,0,0);
    const end=new Date(now); end.setDate(start.getDate()+6);
    return{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
  } else if(period==='last'){
    const start=new Date(now); start.setDate(now.getDate()-dow-6); start.setHours(0,0,0,0);
    const end=new Date(now); end.setDate(start.getDate()+6);
    return{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
  } else {
    const start=new Date(now.getFullYear(),now.getMonth(),1);
    const end=new Date(now.getFullYear(),now.getMonth()+1,0);
    return{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
  }
}
function renderReport(){
  const {start,end}=getReportDates(reportPeriod);
  const workouts=state.workoutHistory.filter(w=>w.date>=start&&w.date<=end);
  const bw=state.calProfile.wt||75;
  const totalVol=workouts.reduce((a,w)=>a+(w.totalVolume||0),0);
  const totalKcal=workouts.reduce((a,w)=>a+(w.totalKcal||0),0);
  const totalSets=workouts.reduce((a,w)=>a+w.exercises.reduce((b,e)=>b+e.sets.length,0),0);
  const days=reportPeriod==='month'?30:7;
  const freq=workouts.length;
  // Grade based on frequency vs target (4/week = A)
  const target=reportPeriod==='month'?16:4;
  const score=Math.min(freq/target,1);
  const grade=score>=0.9?'A':score>=0.75?'B':score>=0.55?'C':score>=0.35?'D':'F';
  const gradeColor={A:'#16a34a',B:'#22c55e',C:'#eab308',D:'#f97316',F:'#dc2626'}[grade];

  // Muscle breakdown
  const muscleSets={};
  workouts.forEach(w=>w.exercises.forEach(ex=>{
    const m=ex.muscle||'Other';
    muscleSets[m]=(muscleSets[m]||0)+ex.sets.length;
  }));
  const topMuscle=Object.entries(muscleSets).sort((a,b)=>b[1]-a[1])[0];

  // PRs this period
  const prsThisPeriod=[];
  const prevBest={};
  state.workoutHistory.filter(w=>w.date<start).forEach(w=>{
    w.exercises.forEach(ex=>{
      const b=Math.max(...ex.sets.map(s=>s.w||0));
      if(!prevBest[ex.name]||b>prevBest[ex.name]) prevBest[ex.name]=b;
    });
  });
  workouts.forEach(w=>{
    w.exercises.forEach(ex=>{
      const b=Math.max(...ex.sets.map(s=>s.w||0));
      if(b>0&&(!prevBest[ex.name]||b>prevBest[ex.name])) prsThisPeriod.push({name:ex.name,weight:b});
    });
  });

  const periodLabel=reportPeriod==='this'?'This Week':reportPeriod==='last'?'Last Week':'This Month';
  document.getElementById('report-content').innerHTML=`
    <div class="card" style="text-align:center;padding:20px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:6px">${periodLabel} Grade</div>
      <div class="report-grade" style="color:${gradeColor}">${grade}</div>
      <div style="font-size:13px;color:var(--text2);margin-top:8px">${freq} workout${freq!==1?'s':''} · ${days===7?'Target: 4/week':'Target: 16/month'}</div>
    </div>
    <div class="card">
      <div class="report-row"><span style="color:var(--text2)">Workouts</span><strong>${freq}</strong></div>
      <div class="report-row"><span style="color:var(--text2)">Total Volume</span><strong>${totalVol.toLocaleString()} kg</strong></div>
      <div class="report-row"><span style="color:var(--text2)">Total Sets</span><strong>${totalSets}</strong></div>
      <div class="report-row"><span style="color:var(--text2)">Calories Burned</span><strong>🔥 ${totalKcal.toLocaleString()} kcal</strong></div>
      <div class="report-row"><span style="color:var(--text2)">Top Muscle Group</span><strong>${topMuscle?topMuscle[0]+' ('+topMuscle[1]+' sets)':'—'}</strong></div>
      <div class="report-row"><span style="color:var(--text2)">PRs Set</span><strong>${prsThisPeriod.length>0?'🏆 '+prsThisPeriod.length:'None'}</strong></div>
    </div>
    ${prsThisPeriod.length?'<div class="section-title">PRs This Period</div><div class="card">'+prsThisPeriod.map(p=>'<div class="report-row"><span style="color:var(--text2)">'+p.name+'</span><strong style="color:var(--red)">'+p.weight+'kg 🏆</strong></div>').join('')+'</div>':''}
    ${!workouts.length?'<div class="card" style="text-align:center;padding:30px;color:var(--text3)">No workouts logged this period yet!</div>':''}
  `;
}

// ─── PROGRAMS / PLANS ────────────────────────────────────────────────────────
const PROGRAMS=[
  {id:'ppl',name:'Push Pull Legs',desc:'Classic 6-day split. Push (chest/shoulders/triceps), Pull (back/biceps), Legs, repeat.',tags:['Hypertrophy','6 days/week','Intermediate'],days:[
    {label:'Push A',exercises:[{name:'Barbell Bench Press',muscle:'Chest',met:8,sets:[{w:80,r:8},{w:85,r:6},{w:90,r:4}]},{name:'Overhead Press (Barbell)',muscle:'Shoulders',met:7.5,sets:[{w:55,r:8},{w:60,r:6},{w:65,r:5}]},{name:'Incline Dumbbell Press',muscle:'Chest',met:7,sets:[{w:30,r:10},{w:32.5,r:8},{w:35,r:6}]},{name:'Lateral Raise',muscle:'Shoulders',met:4,sets:[{w:12,r:15},{w:14,r:12},{w:16,r:10}]},{name:'Tricep Pushdown',muscle:'Triceps',met:4.5,sets:[{w:30,r:12},{w:35,r:10},{w:40,r:8}]}]},
    {label:'Pull A',exercises:[{name:'Deadlift',muscle:'Back',met:9,sets:[{w:120,r:5},{w:130,r:3},{w:140,r:2}]},{name:'Pull-Up',muscle:'Back',met:8,sets:[{w:0,r:8},{w:0,r:6},{w:0,r:5}]},{name:'Seated Cable Row',muscle:'Back',met:6,sets:[{w:60,r:12},{w:65,r:10},{w:70,r:8}]},{name:'Barbell Curl',muscle:'Biceps',met:4.5,sets:[{w:35,r:12},{w:40,r:10},{w:42.5,r:8}]},{name:'Face Pull',muscle:'Back',met:4.5,sets:[{w:25,r:15},{w:27.5,r:12},{w:30,r:10}]}]},
    {label:'Legs A',exercises:[{name:'Barbell Squat',muscle:'Legs',met:9,sets:[{w:100,r:8},{w:110,r:6},{w:120,r:4}]},{name:'Romanian Deadlift',muscle:'Hamstrings',met:8,sets:[{w:80,r:10},{w:85,r:8},{w:90,r:6}]},{name:'Leg Press',muscle:'Legs',met:7.5,sets:[{w:160,r:12},{w:180,r:10},{w:200,r:8}]},{name:'Leg Curl',muscle:'Hamstrings',met:5,sets:[{w:40,r:12},{w:45,r:10},{w:50,r:8}]},{name:'Standing Calf Raise',muscle:'Calves',met:4,sets:[{w:60,r:15},{w:70,r:12},{w:80,r:10}]}]},
  ]},
  {id:'fivex5',name:'StrongLifts 5×5',desc:'Three full-body sessions per week. Adds weight every session. Best for strength.',tags:['Strength','3 days/week','Beginner'],days:[
    {label:'Workout A',exercises:[{name:'Barbell Squat',muscle:'Legs',met:9,sets:[{w:60,r:5},{w:60,r:5},{w:60,r:5},{w:60,r:5},{w:60,r:5}]},{name:'Barbell Bench Press',muscle:'Chest',met:8,sets:[{w:60,r:5},{w:60,r:5},{w:60,r:5},{w:60,r:5},{w:60,r:5}]},{name:'Barbell Row',muscle:'Back',met:8,sets:[{w:60,r:5},{w:60,r:5},{w:60,r:5},{w:60,r:5},{w:60,r:5}]}]},
    {label:'Workout B',exercises:[{name:'Barbell Squat',muscle:'Legs',met:9,sets:[{w:60,r:5},{w:60,r:5},{w:60,r:5},{w:60,r:5},{w:60,r:5}]},{name:'Overhead Press (Barbell)',muscle:'Shoulders',met:7.5,sets:[{w:40,r:5},{w:40,r:5},{w:40,r:5},{w:40,r:5},{w:40,r:5}]},{name:'Deadlift',muscle:'Back',met:9,sets:[{w:80,r:5}]}]},
  ]},
  {id:'upper_lower',name:'Upper / Lower Split',desc:'4-day split alternating upper and lower body. Great balance of frequency and volume.',tags:['Hypertrophy','4 days/week','Intermediate'],days:[
    {label:'Upper A',exercises:[{name:'Barbell Bench Press',muscle:'Chest',met:8,sets:[{w:80,r:8},{w:85,r:6},{w:90,r:5},{w:90,r:5}]},{name:'Barbell Row',muscle:'Back',met:8,sets:[{w:80,r:8},{w:85,r:6},{w:90,r:5},{w:90,r:5}]},{name:'Overhead Press (Barbell)',muscle:'Shoulders',met:7.5,sets:[{w:50,r:10},{w:55,r:8},{w:60,r:6}]},{name:'Pull-Up',muscle:'Back',met:8,sets:[{w:0,r:8},{w:0,r:6},{w:0,r:6}]},{name:'Dumbbell Curl',muscle:'Biceps',met:4.5,sets:[{w:14,r:12},{w:16,r:10},{w:18,r:8}]},{name:'Skull Crusher',muscle:'Triceps',met:5,sets:[{w:30,r:12},{w:35,r:10},{w:40,r:8}]}]},
    {label:'Lower A',exercises:[{name:'Barbell Squat',muscle:'Legs',met:9,sets:[{w:100,r:8},{w:110,r:6},{w:120,r:5},{w:120,r:5}]},{name:'Romanian Deadlift',muscle:'Hamstrings',met:8,sets:[{w:80,r:10},{w:85,r:8},{w:90,r:6}]},{name:'Bulgarian Split Squat',muscle:'Legs',met:8,sets:[{w:20,r:10},{w:24,r:8},{w:28,r:6}]},{name:'Leg Curl',muscle:'Hamstrings',met:5,sets:[{w:40,r:12},{w:45,r:10},{w:50,r:8}]},{name:'Standing Calf Raise',muscle:'Calves',met:4,sets:[{w:60,r:15},{w:70,r:12},{w:80,r:10}]}]},
  ]},
  {id:'full_body',name:'Full Body 3×/week',desc:'Train everything every session. Best for beginners and maintaining muscle.',tags:['General','3 days/week','Beginner'],days:[
    {label:'Session',exercises:[{name:'Barbell Squat',muscle:'Legs',met:9,sets:[{w:60,r:8},{w:65,r:6},{w:70,r:5}]},{name:'Barbell Bench Press',muscle:'Chest',met:8,sets:[{w:60,r:8},{w:65,r:6},{w:70,r:5}]},{name:'Deadlift',muscle:'Back',met:9,sets:[{w:80,r:5},{w:90,r:4},{w:100,r:3}]},{name:'Overhead Press (Barbell)',muscle:'Shoulders',met:7.5,sets:[{w:40,r:8},{w:45,r:6},{w:50,r:5}]},{name:'Pull-Up',muscle:'Back',met:8,sets:[{w:0,r:6},{w:0,r:5},{w:0,r:5}]},{name:'Plank',muscle:'Abs',met:4,sets:[{w:0,r:60},{w:0,r:60}]}]},
  ]},
];

function renderProgramsPage(){
  const active=state.activeProgram;
  const activeProg=active?PROGRAMS.find(p=>p.id===active.id):null;

  // Active program card
  const activeCard=document.getElementById('active-program-card');
  if(activeProg&&active){
    const day=activeProg.days[active.dayIndex%activeProg.days.length];
    activeCard.innerHTML=`<div class="card" style="border-color:var(--red);background:var(--red-bg)">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--red-dark);margin-bottom:4px">Active Program</div>
          <div class="prog-title" style="color:var(--red-dark)">${activeProg.name}</div>
          <div class="prog-sub">Next: <b>${day.label}</b> · Day ${active.dayIndex+1} of program</div>
        </div>
        <button class="btn-sm btn-danger" onclick="clearProgram()">Stop</button>
      </div>
      <button class="btn-primary" style="margin-top:10px" onclick="loadProgramDay()">Load ${day.label} →</button>
    </div>`;
  } else {
    activeCard.innerHTML='<div style="font-size:13px;color:var(--text3);margin-bottom:4px">No active program. Pick one below.</div>';
  }

  // Programs list
  const list=document.getElementById('programs-list');
  list.innerHTML=PROGRAMS.map(p=>{
    const isActive=active&&active.id===p.id;
    const tags=p.tags.map(t=>'<span class="prog-tag">'+t+'</span>').join('');
    const days=p.days.map(d=>'<span class="day-chip">'+d.label+'</span>').join('');
    return `<div class="prog-card ${isActive?'active-prog':''}" onclick="selectProgram('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div class="prog-title">${p.name}</div>
        ${isActive?'<span style="font-size:18px">✓</span>':''}
      </div>
      <div class="prog-sub">${p.desc}</div>
      <div style="margin-top:6px">${tags}</div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap">${days}</div>
    </div>`;
  }).join('');
}
function selectProgram(id){
  if(state.activeProgram&&state.activeProgram.id===id){clearProgram();return;}
  state.activeProgram={id,dayIndex:0};
  saveState({profile:true}); renderProgramsPage();
  toast('Program started! Go to Workout to load today\'s session.');
}
function clearProgram(){state.activeProgram=null;saveState({profile:true});renderProgramsPage();toast('Program stopped');}
function loadProgramDay(){
  if(!state.activeProgram) return;
  const prog=PROGRAMS.find(p=>p.id===state.activeProgram.id);
  if(!prog) return;
  const day=prog.days[state.activeProgram.dayIndex%prog.days.length];
  if(!confirm(`Load "${day.label}" and replace today's exercises?`)) return;
  state.exercises=day.exercises.map(ex=>({...ex,sets:ex.sets.map(s=>({...s,done:false}))}));
  state.expanded={0:true};
  state.activeProgram.dayIndex++;
  saveState({activeSession:true}); renderExercises();
  showPage('workout');
  toast('Loaded: '+day.label);
}

// ─── QUICK ADD PARSER ────────────────────────────────────────────────────────
// Handles single or multi-line blocks:
//   "Bench press 80,8 90,6"
//   "date: 18 mar\nBench 80,8\nSquat 100,5"
//   Multi-exercise block (no date = adds to TODAY):
//   "Iso lateral rowing 7.5,12 17.5,12 30,12
//    Back row 30,12 40,8 50,6
//    T bar 10,12 20,8 30,6"
function quickAddParse(inputId, previewId, isPast){
  const inp=document.getElementById(inputId||'quick-add-inp');
  const raw=inp.value.trim(); if(!raw) return;

  // Detect date prefix on first line only
  let targetDate=null;
  let workText=raw;
  const firstLine=raw.split('\n')[0].trim();
  const dateLineMatch=firstLine.match(/^date\s*[:\-]?\s*(.+)$/i);
  if(dateLineMatch){
    targetDate=parseNaturalDate(dateLineMatch[1].trim());
    workText=raw.split('\n').slice(1).join('\n').trim();
  }

  // Parse each line as one exercise
  const lines=workText.split('\n').map(l=>l.trim()).filter(Boolean);
  const parsed=[];

  lines.forEach(line=>{
    const pairs=[...line.matchAll(/(\d+(?:\.\d+)?)\s*[,x×]\s*(\d+)/g)];
    if(!pairs.length) return;
    const firstNumIdx=line.search(/\d/);
    const rawName=firstNumIdx>0 ? line.slice(0,firstNumIdx).replace(/[\s,\-:]+$/,'').trim() : 'Exercise';
    const name=rawName||'Exercise';

    // 1. Check exercise memory first
    const recalled=recallExercise(name);
    let muscle=recalled?recalled.muscle:guessMuscle(name);
    let met=recalled?recalled.met:guessMet(name);

    // 2. If still unknown, try fuzzy match against known exercises
    if(muscle==='Other'&&!recalled){
      const closest=findClosestExercise(name);
      if(closest){
        const knownEntry=recallExercise(closest)||getExDbEntry(closest);
        if(knownEntry){muscle=knownEntry.muscle;met=knownEntry.met||met;}
      }
    }

    const sets=pairs.map(m=>({w:parseFloat(m[1]),r:parseInt(m[2]),done:!!targetDate}));
    parsed.push({name:name.toUpperCase(),muscle,met,sets});
  });

  if(!parsed.length){
    document.getElementById(previewId||'quick-add-preview').textContent='⚠ Could not parse. Try: "Bench press 80,8 90,6"';
    return;
  }

  const preview=parsed.map(p=>p.name+': '+p.sets.map(s=>s.w+'×'+s.r).join(' ')).join(' | ');
  document.getElementById(previewId||'quick-add-preview').textContent='✓ '+preview;

  // Clear input immediately so user can keep adding
  inp.value='';

  // Route through muscle queue resolver (asks about unknowns, then dispatches)
  _muscleQueue=parsed;
  resolveMuscleQueue(resolvedExercises=>{
    dispatchParsed(resolvedExercises, targetDate, previewId, isPast);
  });
}

function dispatchParsed(parsed, targetDate, previewId, isPast){
  // Learn all confirmed exercises
  learnFromWorkout(parsed);

  const saveDate=targetDate||todayStr();
  const isToday=saveDate===todayStr();

  if(isPast){
    parsed.forEach(ex=>{
      const existing=pastEditExercises.findIndex(e=>e.name===ex.name);
      if(existing>=0) pastEditExercises[existing].sets.push(...ex.sets);
      else pastEditExercises.push(ex);
    });
    pastEditExpanded=Object.fromEntries(pastEditExercises.map((_,i)=>[i,true]));
    document.getElementById(previewId||'past-quick-preview').textContent='';
    renderPastExercises();
    toast(`Added ${parsed.length} exercise${parsed.length>1?'s':''}!`);
    return;
  }

  if(!isToday){
    const totalVolume=parsed.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+s.w*s.r,0),0);
    const totalKcal=calcWorkoutCalories(parsed);
    const existing=state.workoutHistory.find(w=>w.date===saveDate);
    if(existing){
      parsed.forEach(ex=>{
        const match=existing.exercises.findIndex(e=>e.name===ex.name);
        if(match>=0) existing.exercises[match].sets.push(...ex.sets);
        else existing.exercises.push(ex);
      });
      existing.totalVolume=(existing.totalVolume||0)+totalVolume;
      existing.totalKcal=(existing.totalKcal||0)+totalKcal;
    } else {
      state.workoutHistory.push({id:_genId(),date:saveDate,duration:0,exercises:parsed,totalVolume,totalKcal});
    }
    state.workoutHistory.sort((a,b)=>a.date.localeCompare(b.date));
    const savedId=existing?existing.id:state.workoutHistory.find(w=>w.date===saveDate)?.id;
    recalcStreak(); saveState({profile:true, workout:savedId}); renderWorkoutPage();
    document.getElementById(previewId||'quick-add-preview').textContent='';
    toast(`Saved ${parsed.length} exercise${parsed.length>1?'s':''} for ${saveDate}!`);
  } else {
    // Add to today's in-progress session
    parsed.forEach(ex=>{
      const existing=state.exercises.findIndex(e=>e.name===ex.name);
      if(existing>=0){
        state.exercises[existing].sets.push(...ex.sets.map(s=>({...s,done:false})));
      } else {
        // If no weights typed, pre-fill from last session
        const hasWeights=ex.sets.some(s=>s.w>0);
        if(!hasWeights){
          const last=getLastSession(ex.name);
          if(last&&last.sets.length) ex.sets=last.sets.map(s=>({w:s.w,r:s.r,done:false}));
        }
        state.exercises.push({...ex,sets:ex.sets.map(s=>({...s,done:false}))});
      }
      state.expanded[state.exercises.length-1]=true;
    });
    renderExercises(); autoSave();
    document.getElementById(previewId||'quick-add-preview').textContent='';
    toast(`Added ${parsed.length} exercise${parsed.length>1?'s':''}!`);
  }
} // end dispatchParsed

function parseNaturalDate(str){
  str=str.trim().toLowerCase();
  if(str==='today') return todayStr();
  if(str==='yesterday'){const d=new Date();d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);}
  const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
    january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
  // "18 mar" or "mar 18"
  const m1=str.match(/(\d{1,2})\s+(\w+)/);
  const m2=str.match(/(\w+)\s+(\d{1,2})/);
  const iso=str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return str.slice(0,10);
  const day=m1?parseInt(m1[1]):(m2?parseInt(m2[2]):null);
  const monStr=m1?m1[2]:(m2?m2[1]:null);
  if(day&&monStr&&months[monStr]){
    const yr=new Date().getFullYear();
    return `${yr}-${String(months[monStr]).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return todayStr();
}

function guessMuscle(name){
  const key=name.toUpperCase().trim();
  // 1. Check exercise memory first (user-confirmed)
  const mem=getExMemory();
  if(mem[key]&&mem[key].muscle&&mem[key].muscle!=='Other') return mem[key].muscle;

  // 2. Check EXERCISE_DB by name
  for(const [muscle,list] of Object.entries(EXERCISE_DB)){
    if(list.some(e=>e.name.toUpperCase()===key)) return muscle;
  }

  // 3. Fuzzy closest match in memory
  const closest=findClosestExercise(name);
  if(closest&&mem[closest]&&mem[closest].muscle&&mem[closest].muscle!=='Other') return mem[closest].muscle;

  // 4. Keyword pattern matching — comprehensive
  const n=name.toLowerCase();
  if(/chest|bench|press.*chest|pec|fly|flye|push.*up|dip.*chest|decline|incline.*press/.test(n)) return 'Chest';
  if(/iso.*lat|iso lateral|seated.*row|cable.*row|t.?bar|tbar|lat.*pull|pull.*down|pull.*up|chin.*up|dead.*lift|deadlift|back.*row|row.*back|bent.*row|pendlay|barbell.*row|one.*arm.*row|single.*arm.*row|rope.*pull|face.*pull|good.*morning|hyperextension|reverse.*fly.*back|rack.*pull|snatch|clean/.test(n)) return 'Back';
  if(/shoulder|delt|lateral.*raise|front.*raise|upright.*row|arnold|shrug|overhead.*press|ohp|military|raise.*lateral|press.*shoulder/.test(n)) return 'Shoulders';
  if(/bicep|curl|hammer.*curl|preacher|concentration|incline.*curl|spider.*curl/.test(n)) return 'Biceps';
  if(/tricep|pushdown|skull.*crush|close.*grip|overhead.*ext|dip.*tricep|kickback|rope.*push/.test(n)) return 'Triceps';
  if(/squat|leg.*press|lunge|split.*squat|bulgarian|hack.*squat|leg.*ext|step.*up|goblet|pistol|box.*squat|front.*squat/.test(n)) return 'Legs';
  if(/glute|hip.*thrust|donkey|bridge|kickback|cable.*kick/.test(n)) return 'Glutes';
  if(/hamstring|rdl|romanian|nordic|leg.*curl|stiff.*leg/.test(n)) return 'Hamstrings';
  if(/calf|calves|calf.*raise|donkey.*calf|seated.*calf/.test(n)) return 'Calves';
  if(/ab|crunch|plank|situp|sit.*up|leg.*raise|russian.*twist|cable.*crunch|hanging.*knee|dragon.*flag|mountain.*climb|oblique|core/.test(n)) return 'Abs';
  if(/cardio|run|treadmill|bike|cycling|elliptical|row.*machine|jump.*rope|burpee|stair|hiit|sprint/.test(n)) return 'Cardio';
  if(/forearm|wrist|grip|farmer|dead.*hang/.test(n)) return 'Forearms';
  if(/rope.*to.*eye|eye.*level|face.*pull|band|stretch|mobility/.test(n)) return 'Shoulders'; // rope-to-eye = rear delt / shoulder
  return 'Other';
}

// ─── EXERCISE MEMORY STORE ───────────────────────────────────────────────────
// Persists learned muscle groups and MET values for every exercise ever used
// key: uppercase exercise name → {muscle, met, count}
function getExMemory(){ return state.exerciseMemory||(state.exerciseMemory={}); }

// Inject a custom exercise into EXERCISE_DB so it shows in the library
function injectIntoExerciseDB(name, muscle, met){
  const validMuscle=EXERCISE_DB[muscle]?muscle:'Other';
  // Don't add if already in DB (case-insensitive)
  const exists=Object.values(EXERCISE_DB).some(list=>
    list.some(e=>e.name.toUpperCase()===name.toUpperCase())
  );
  if(exists) return;
  if(!EXERCISE_DB[validMuscle]) EXERCISE_DB[validMuscle]=[];
  EXERCISE_DB[validMuscle].push({
    name:name,
    equip:'Any',
    met:met||5,
    _custom:true
  });
}

// On app load, restore all previously learned exercises into EXERCISE_DB
// so they show up in the library even after page refresh
function loadCustomExercisesIntoDB(){
  const mem=getExMemory();
  Object.entries(mem).forEach(([name,data])=>{
    if(data.muscle) injectIntoExerciseDB(name, data.muscle, data.met);
  });
  // Also scan workout history for any exercises not in memory
  (state.workoutHistory||[]).forEach(w=>{
    w.exercises.forEach(ex=>{
      if(ex.muscle && ex.muscle!=='Other'){
        injectIntoExerciseDB(ex.name, ex.muscle, ex.met||5);
      }
    });
  });
}

function learnExercise(name, muscle, met){
  const mem=getExMemory();
  const key=name.toUpperCase().trim();
  if(!mem[key]) mem[key]={muscle,met,count:0};
  mem[key].muscle=muscle;
  mem[key].met=met||mem[key].met;
  mem[key].count=(mem[key].count||0)+1;
}

function recallExercise(name){
  const mem=getExMemory();
  return mem[name.toUpperCase().trim()]||null;
}

// Levenshtein distance for fuzzy matching
function levenshtein(a,b){
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

// Find closest known exercise name (from memory + EXERCISE_DB)
function findClosestExercise(rawName){
  const n=rawName.toUpperCase().trim();
  const mem=getExMemory();
  // Build candidate list: memory keys + all EXERCISE_DB names
  const candidates=[...Object.keys(mem)];
  Object.values(EXERCISE_DB).forEach(list=>list.forEach(ex=>{ if(!candidates.includes(ex.name.toUpperCase())) candidates.push(ex.name.toUpperCase()); }));
  if(!candidates.length) return null;
  let best=null,bestDist=Infinity;
  candidates.forEach(c=>{
    // Also try word-overlap scoring
    const dist=levenshtein(n,c);
    const shorter=Math.min(n.length,c.length);
    // Only suggest if distance is reasonable relative to name length
    if(dist<bestDist && dist<=Math.max(4, Math.floor(shorter*0.45))){
      bestDist=dist; best=c;
    }
  });
  return best&&best!==n?best:null;
}

// Get last session data for an exercise (most recent history entry)
function getLastSession(name){
  const key=name.toUpperCase().trim();
  // Search history newest first
  for(let i=state.workoutHistory.length-1;i>=0;i--){
    const ex=state.workoutHistory[i].exercises.find(e=>e.name.toUpperCase()===key);
    if(ex&&ex.sets&&ex.sets.length) return {date:state.workoutHistory[i].date, sets:ex.sets};
  }
  return null;
}

// Queue of parsed exercises waiting for muscle group confirmation
let _muscleQueue=[], _muscleQueueCallback=null, _muscleQueueIdx=0;

function resolveMuscleQueue(callback){
  // Find exercises with unknown muscle and not in memory
  const unknown=_muscleQueue.filter(ex=>{
    const recalled=recallExercise(ex.name);
    if(recalled){ex.muscle=recalled.muscle;ex.met=recalled.met;return false;}
    return ex.muscle==='Other'||!ex.muscle;
  });
  if(!unknown.length){callback(_muscleQueue);return;}
  _muscleQueueCallback=callback;
  _muscleQueueIdx=0;
  showMusclePrompt(unknown[0]);
}

function showMusclePrompt(ex){
  const modal=document.getElementById('muscle-prompt-modal');
  document.getElementById('mp-ex-name').textContent=ex.name;
  // Show fuzzy suggestion if available
  const suggestion=findClosestExercise(ex.name);
  const sugDiv=document.getElementById('mp-suggestion');
  if(suggestion&&suggestion!==ex.name){
    sugDiv.style.display='block';
    document.getElementById('mp-suggest-name').textContent=suggestion;
    const known=recallExercise(suggestion)||getExDbEntry(suggestion);
    document.getElementById('mp-suggest-detail').textContent=known?`(${known.muscle})`:'';
  } else {
    sugDiv.style.display='none';
  }
  modal.style.display='flex';
}

function getExDbEntry(name){
  const key=name.toUpperCase();
  for(const [muscle,list] of Object.entries(EXERCISE_DB)){
    const found=list.find(e=>e.name.toUpperCase()===key);
    if(found) return {muscle,met:found.met};
  }
  return null;
}

function acceptMusclePrompt(){
  const muscle=document.getElementById('mp-muscle-select').value;
  const unknown=_muscleQueue.filter(ex=>ex.muscle==='Other'||!ex.muscle);
  const ex=unknown[_muscleQueueIdx];
  if(ex){
    ex.muscle=muscle;
    ex.met=guessMet(muscle);
    learnExercise(ex.name,muscle,ex.met);
  }
  nextMusclePrompt();
}

function useSuggestion(){
  const suggestion=document.getElementById('mp-suggest-name').textContent;
  const unknown=_muscleQueue.filter(ex=>ex.muscle==='Other'||!ex.muscle);
  const ex=unknown[_muscleQueueIdx];
  if(ex&&suggestion){
    const known=recallExercise(suggestion)||getExDbEntry(suggestion);
    ex.name=suggestion;
    if(known){ex.muscle=known.muscle;ex.met=known.met;}
    learnExercise(ex.name,ex.muscle,ex.met);
  }
  nextMusclePrompt();
}

function nextMusclePrompt(){
  document.getElementById('muscle-prompt-modal').style.display='none';
  _muscleQueueIdx++;
  const unknown=_muscleQueue.filter(ex=>ex.muscle==='Other'||!ex.muscle);
  if(_muscleQueueIdx<unknown.length){
    showMusclePrompt(unknown[_muscleQueueIdx]);
  } else {
    if(_muscleQueueCallback) _muscleQueueCallback(_muscleQueue);
    _muscleQueue=[]; _muscleQueueCallback=null; _muscleQueueIdx=0;
  }
}

// Learn from every workout save
function learnFromWorkout(exercises){
  exercises.forEach(ex=>{
    if(ex.muscle&&ex.muscle!=='Other') learnExercise(ex.name,ex.muscle,ex.met);
  });
}

function guessMet(nameOrMuscle){
  const muscle=guessMuscle(nameOrMuscle)||nameOrMuscle;
  const metDefaults={Chest:7.5,Back:8,Shoulders:7,Biceps:4.5,Triceps:4.5,Legs:8.5,Glutes:6.5,Hamstrings:7,Calves:4,Abs:4.5,Cardio:9,Other:5};
  return metDefaults[muscle]||5;
}

// Show preview as user types
document.addEventListener('DOMContentLoaded',()=>{
  const inp=document.getElementById('quick-add-inp');
  if(inp) inp.addEventListener('input',()=>{
    const v=inp.value.trim();
    const prev=document.getElementById('quick-add-preview');
    if(!v){prev.textContent='';return;}
    const lines=v.split('\n').filter(l=>l.trim()&&l.match(/\d+[,x×]\d/));
    const pairs=[...v.matchAll(/(\d+(?:\.\d+)?)\s*[,x×]\s*(\d+)/g)];
    if(lines.length>0) prev.textContent=
      `${lines.length} exercise${lines.length>1?'s':''}, ${pairs.length} sets detected — press Add`;
    else prev.textContent='';
  });
  // Show note when public checkbox ticked
  const cfPublic=document.getElementById('cf-public');
  if(cfPublic) cfPublic.addEventListener('change',()=>{
    const note=document.getElementById('cf-public-note');
    if(note) note.style.display=cfPublic.checked?'block':'none';
  });
});

// ─── STEP COUNTER ─────────────────────────────────────────────────────────────

// Step data stored in state.stepLog: { 'YYYY-MM-DD': count }
// Step goal stored in state.stepGoal
const STEP_GOALS=[5000,8000,10000,12000,15000];
const STEP_LENGTH_M=0.78; // avg stride length metres
const STEP_KCAL_PER_STEP=0.04; // ~40 kcal per 1000 steps for 75kg person

let _stepListening=false;
let _stepMotionHandler=null;
let _stepLastMag=0;
let _stepPeak=false;
let _stepThreshold=12;    // acceleration magnitude threshold m/s²
let _stepCooldown=0;      // timestamp of last detected step (debounce)
let _stepSessionCount=0;  // steps counted in current live session

function getStepLog(){
  if(!state.stepLog) state.stepLog={};
  return state.stepLog;
}
function getTodaySteps(){
  return getStepLog()[todayStr()]||0;
}
function setTodaySteps(n){
  getStepLog()[todayStr()]=Math.max(0,n);
  saveState({step:todayStr()});
}
function getStepGoal(){
  return state.stepGoal||8000;
}

// ── Accelerometer step detection ─────────────────────────────────────────────
function startStepCounter(){
  if(_stepListening){toast('Already counting!');return;}

  // iOS requires explicit permission request
  if(typeof DeviceMotionEvent!=='undefined' && typeof DeviceMotionEvent.requestPermission==='function'){
    DeviceMotionEvent.requestPermission().then(result=>{
      if(result==='granted'){
        _attachStepListener();
      } else {
        toast('Motion permission denied — use manual sync');
        document.getElementById('step-sensor-info').textContent='Permission denied. Use the manual sync option below to enter steps from Google Fit or Apple Health.';
      }
    }).catch(()=>{
      toast('Could not request motion permission');
    });
  } else if(typeof DeviceMotionEvent!=='undefined'){
    _attachStepListener();
  } else {
    document.getElementById('step-sensor-status').textContent='● Not supported';
    document.getElementById('step-sensor-info').textContent='Your browser does not support motion sensors. Use manual sync below.';
    toast('Motion sensor not supported — use manual sync');
  }
}

function _attachStepListener(){
  _stepListening=true;
  _stepSessionCount=0;
  document.getElementById('step-sensor-status').textContent='● Counting';
  document.getElementById('step-sensor-status').style.background='rgba(226,75,74,0.15)';
  document.getElementById('step-sensor-status').style.color='var(--red)';
  document.getElementById('step-sensor-info').textContent='Counting steps… keep your phone in your pocket or hand while walking.';
  document.getElementById('step-start-btn').textContent='⏸ Counting…';
  document.getElementById('step-start-btn').style.opacity='0.6';

  _stepMotionHandler=function(event){
    const acc=event.accelerationIncludingGravity||event.acceleration;
    if(!acc) return;
    const x=acc.x||0, y=acc.y||0, z=acc.z||0;
    const mag=Math.sqrt(x*x+y*y+z*z);

    // Peak detection: look for rising then falling magnitude above threshold
    const now=Date.now();
    if(mag>_stepThreshold && !_stepPeak && (now-_stepCooldown)>300){
      _stepPeak=true;
    } else if(mag<_stepThreshold-2 && _stepPeak){
      _stepPeak=false;
      _stepCooldown=now;
      _stepSessionCount++;
      // Update today's count
      const current=getTodaySteps();
      setTodaySteps(current+1);
      renderStepsPanel();
    }
    _stepLastMag=mag;
  };
  window.addEventListener('devicemotion',_stepMotionHandler);
  toast('Step counting started!');
}

function stopStepCounter(){
  if(!_stepListening) return;
  _stepListening=false;
  if(_stepMotionHandler){
    window.removeEventListener('devicemotion',_stepMotionHandler);
    _stepMotionHandler=null;
  }
  document.getElementById('step-sensor-status').textContent='● Stopped';
  document.getElementById('step-sensor-status').style.background='var(--surface2)';
  document.getElementById('step-sensor-status').style.color='var(--text3)';
  document.getElementById('step-sensor-info').textContent='Stopped. '+_stepSessionCount+' steps counted this session.';
  document.getElementById('step-start-btn').textContent='▶ Start Counting';
  document.getElementById('step-start-btn').style.opacity='1';
  toast('Stopped. '+_stepSessionCount+' steps this session.');
}

function resetTodaySteps(){
  if(!confirm('Reset today\'s step count to 0?')) return;
  setTodaySteps(0);
  _stepSessionCount=0;
  renderStepsPanel();
  toast('Step count reset');
}

function setSyncTab(tab){
  document.getElementById('sync-tab-android').classList.toggle('active',tab==='android');
  document.getElementById('sync-tab-ios').classList.toggle('active',tab==='ios');
  document.getElementById('sync-instructions-android').style.display=tab==='android'?'block':'none';
  document.getElementById('sync-instructions-ios').style.display=tab==='ios'?'block':'none';
}

function syncManualSteps(){
  const val=parseInt(document.getElementById('step-manual-input').value)||0;
  if(!val||val<0){toast('Enter a valid step count');return;}
  setTodaySteps(val);
  document.getElementById('step-manual-input').value='';
  renderStepsPanel();
  toast('Synced '+val.toLocaleString()+' steps from health app ✓');
}

function setStepGoal(n){
  if(!n||n<100){toast('Enter a valid goal (e.g. 8000)');return;}
  state.stepGoal=n;
  saveState({profile:true});
  renderStepsPanel();
  toast('Goal set to '+n.toLocaleString()+' steps');
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderStepsPanel(){
  const steps=getTodaySteps();
  const goal=getStepGoal();
  const pct=Math.min(100,Math.round(steps/goal*100));
  const km=(steps*STEP_LENGTH_M/1000).toFixed(2);
  const kcal=Math.round(steps*STEP_KCAL_PER_STEP);
  const activeMins=Math.round(steps/100); // rough: ~100 steps/min walking

  // Main display
  const countEl=document.getElementById('step-count-display');
  const goalEl=document.getElementById('step-goal-display');
  const kmEl=document.getElementById('step-km-display');
  const kcalEl=document.getElementById('step-kcal-display');
  const minsEl=document.getElementById('step-mins-display');
  const pctEl=document.getElementById('step-ring-pct');
  if(countEl) countEl.textContent=steps.toLocaleString();
  if(goalEl) goalEl.textContent=goal.toLocaleString();
  if(kmEl) kmEl.textContent=km;
  if(kcalEl) kcalEl.textContent=kcal;
  if(minsEl) minsEl.textContent=activeMins;
  if(pctEl) pctEl.textContent=pct+'%';

  // Ring animation: dashoffset = 264 * (1 - pct/100)
  const arc=document.getElementById('step-ring-arc');
  if(arc) arc.setAttribute('stroke-dashoffset', 264*(1-pct/100));
  // Turn ring green when goal hit
  if(arc) arc.setAttribute('stroke', pct>=100?'#22c55e':'var(--red)');

  // Goal chips
  const chipsEl=document.getElementById('step-goal-chips');
  if(chipsEl) chipsEl.innerHTML=STEP_GOALS.map(g=>
    '<span class="step-goal-chip'+(g===goal?' active':'')+'" onclick="setStepGoal('+g+')">'+
    (g>=1000?(g/1000)+'k':g)+'</span>'
  ).join('');

  // 7-day history bars
  const histEl=document.getElementById('step-history-bars');
  if(!histEl) return;
  const log=getStepLog();
  const days=[];
  for(let i=6;i>=0;i--){
    const d=new Date(Date.now()-i*86400000);
    const ds=d.toISOString().slice(0,10);
    const dayLabel=['S','M','T','W','T','F','S'][d.getDay()];
    days.push({ds,label:dayLabel,steps:log[ds]||0});
  }
  const maxSteps=Math.max(goal,...days.map(d=>d.steps),1);
  histEl.innerHTML=days.map(d=>{
    const barPct=Math.min(100,Math.round(d.steps/maxSteps*100));
    const isToday=d.ds===todayStr();
    const hitGoal=d.steps>=goal;
    const color=hitGoal?'#22c55e':'var(--red)';
    const stepsLabel=d.steps>=1000?(d.steps/1000).toFixed(1)+'k':d.steps||'—';
    return '<div class="step-bar-row">'+
      '<div class="step-bar-day" style="'+(isToday?'color:var(--red);font-weight:900':'')+'">'+(isToday?'●':d.label)+'</div>'+
      '<div class="step-bar-track">'+
        '<div class="step-bar-fill" style="width:'+barPct+'%;background:'+color+'"></div>'+
        (d.steps>=goal?'<span style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:9px;color:#fff;font-weight:700">GOAL ✓</span>':'')
      +'</div>'+
      '<div class="step-bar-val">'+stepsLabel+'</div>'+
    '</div>';
  }).join('');
}
let homeMode='workout';
function setHomeMode(mode){
  homeMode=mode;
  document.getElementById('home-workout-panel').style.display=mode==='workout'?'block':'none';
  document.getElementById('home-food-panel').style.display=mode==='food'?'block':'none';
  document.getElementById('home-steps-panel').style.display=mode==='steps'?'block':'none';
  document.getElementById('home-btn-workout').classList.toggle('active',mode==='workout');
  document.getElementById('home-btn-food').classList.toggle('active',mode==='food');
  document.getElementById('home-btn-steps').classList.toggle('active',mode==='steps');
  if(mode==='food'){ foodDate=todayStr(); renderHomeFoodPanel(); }
  if(mode==='steps') renderStepsPanel();
}

function renderHomeFoodPanel(){
  renderDietPlanBanner();
  const log=getFoodLog();
  // Date label
  const isToday=foodDate===todayStr();
  const isYest=foodDate===new Date(Date.now()-86400000).toISOString().slice(0,10);
  const dl=document.getElementById('home-food-date-label');
  if(dl) dl.textContent=isToday?'Today':isYest?'Yesterday':foodDate;
  // Water
  renderHomeWater(log);
  // Macros
  const tot=getDayTotals(log);
  const kcalEl=document.getElementById('home-food-kcal');
  if(kcalEl) kcalEl.textContent=Math.round(tot.kcal)+' kcal';
  renderHomeMacroBars(tot);
  // Meal log
  renderHomeMealLog(log);
}

function renderHomeWater(log){
  const rda=getRDA();
  const goalMl=rda.water||2000;
  const cupMl=250;
  const totalCups=Math.round(goalMl/cupMl);
  const filledCups=Math.min(totalCups,Math.round((log.water||0)/cupMl));
  const pct=Math.min(100,Math.round((log.water||0)/goalMl*100));
  const disp=document.getElementById('home-water-display');
  if(disp) disp.innerHTML=`<span style="color:${pct>=100?'#22c55e':'#185FA5'}">${((log.water||0)/1000).toFixed(1)}L</span><span style="color:var(--text3);font-size:13px"> / ${(goalMl/1000).toFixed(1)}L</span>`;
  const wrap=document.getElementById('home-water-glasses'); if(!wrap) return;
  wrap.innerHTML='';
  for(let i=0;i<totalCups;i++){
    const g=document.createElement('div');
    g.className='water-glass'+(i<filledCups?' filled':'');
    g.textContent=i<filledCups?'💧':'○';
    g.onclick=()=>{log.water=Math.max(0,(i+1)*cupMl);if(i<filledCups)log.water=i*cupMl;saveState({food:foodDate});renderHomeFoodPanel();renderFoodPage();};
    wrap.appendChild(g);
  }
}

function renderHomeMacroBars(tot){
  const el=document.getElementById('home-macro-bars'); if(!el) return;
  const rda=getRDA();
  const log=getFoodLog();
  const waterMl=log.water||0;
  const macros=[
    {key:'kcal',   label:'Calories',unit:'kcal',color:'#E24B4A',target:rda.kcal},
    {key:'protein',label:'Protein', unit:'g',   color:'#185FA5',target:rda.protein},
    {key:'carbs',  label:'Carbs',   unit:'g',   color:'#f97316',target:rda.carbs},
    {key:'fat',    label:'Fat',     unit:'g',   color:'#eab308',target:rda.fat},
    {key:'fibre',  label:'Fibre',   unit:'g',   color:'#22c55e',target:rda.fibre},
  ];
  const macroHTML=macros.map(m=>{
    const val=m.key==='kcal'?Math.round(tot[m.key]||0):((tot[m.key]||0).toFixed(1));
    const pct=Math.min(100,Math.round((parseFloat(val)||0)/m.target*100));
    const over=parseFloat(val)>m.target;
    return '<div class="macro-bar-row">'+
      '<div class="macro-bar-label"><span>'+m.label+'</span>'+
      '<span style="color:'+(over?'#dc2626':m.color)+'">'+val+m.unit+
      '<span style="color:var(--text3);font-weight:400"> / '+m.target+m.unit+'</span></span></div>'+
      '<div class="macro-bar-track"><div class="macro-bar-fill" style="width:'+pct+'%;background:'+(over?'#dc2626':m.color)+'"></div></div>'+
    '</div>';
  }).join('');
  const waterPct=Math.min(100,Math.round(waterMl/rda.water*100));
  const wc=waterPct>=100?'#22c55e':'#185FA5';
  const waterHTML='<div class="macro-bar-row">'+
    '<div class="macro-bar-label"><span>💧 Water</span>'+
    '<span style="color:'+wc+'">'+(waterMl/1000).toFixed(1)+'L'+
    '<span style="color:var(--text3);font-weight:400"> / '+(rda.water/1000).toFixed(1)+'L</span></span></div>'+
    '<div class="macro-bar-track"><div class="macro-bar-fill" style="width:'+waterPct+'%;background:'+wc+'"></div></div>'+
  '</div>';
  el.innerHTML=macroHTML+waterHTML;
}

function renderHomeMealLog(log){
  const meals=['breakfast','lunch','dinner','snack'];
  const mealLabels={breakfast:'🌅 Breakfast',lunch:'☀️ Lunch',dinner:'🌙 Dinner',snack:'🍎 Snacks'};
  const wrap=document.getElementById('home-meal-log'); if(!wrap) return;
  wrap.innerHTML='';
  meals.forEach(meal=>{
    const items=(log.meals||{})[meal]||[];
    if(!items.length) return;
    const kcal=items.reduce((a,e)=>a+(e.kcal||0)*(e.grams/100),0);
    const sec=document.createElement('div'); sec.className='meal-section';
    sec.innerHTML=`<div class="meal-section-hdr"><span>${mealLabels[meal]}</span><span style="color:var(--red)">${Math.round(kcal)} kcal</span></div>`;
    items.forEach((e,idx)=>{
      const row=document.createElement('div'); row.className='logged-food-row';
      const ek=Math.round((e.kcal||0)*e.grams/100);
      const ep=((e.protein||0)*e.grams/100).toFixed(1);
      row.innerHTML=`<div style="flex:1">
        <div class="logged-food-name">${e.name}</div>
        <div class="logged-food-detail">${e.grams}g · ${ek} kcal · P:${ep}g · F:${((e.fibre||0)*e.grams/100).toFixed(1)}g fibre</div>
      </div>
      <button onclick="removeHomeFoodLog('${meal}',${idx})" style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:4px">×</button>`;
      sec.appendChild(row);
    });
    wrap.appendChild(sec);
  });
  if(!wrap.children.length) wrap.innerHTML='<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">Nothing logged yet — tap + Add Food</div>';
}

function removeHomeFoodLog(meal,idx){
  const log=getFoodLog();
  (log.meals[meal]||[]).splice(idx,1);
  saveState({food:foodDate});
  renderHomeFoodPanel();
  renderFoodPage();
}

// Indian Food Database — per 100g values from ICMR-NIN 2017
// {name, cat, kcal, protein, carbs, fat, fibre, ca, fe, vitC, vitA, zinc, potassium, b1, b2, b3}
// Units: kcal, g, g, g, g, mg, mg, mg, µg, mg, mg, mg, mg, mg
// ─── INGREDIENTS DATABASE (per 100g/ml) ──────────────────────────────────────
// For recipe builder — raw ingredients with precise nutritional values
// {name, cat, kcal, protein, carbs, fat, fibre, ca, fe, vitC, vitA, zinc, potassium, b1, b2, b3}

// ─── SMART WORKOUT GENERATOR ─────────────────────────────────────────────────

// SPLIT DEFINITIONS — exact muscle coverage requirements
const SPLIT_DAYS = {
  Push:  ['Chest','Shoulders','Triceps'],
  Pull:  ['Back','Biceps','Rear Delts'],
  Legs:  ['Legs','Hamstrings','Glutes','Calves'],
  Upper: ['Chest','Back','Shoulders','Biceps','Triceps'],
  Lower: ['Legs','Hamstrings','Glutes','Calves','Abs'],
  Core:  ['Abs','Cardio'],
};

// Muscle coverage requirements per split
const SPLIT_REQUIREMENTS = {
  Push:  {Chest:2, Shoulders:2, Triceps:2},
  Pull:  {Back:3, Biceps:2, 'Rear Delts':1},
  Legs:  {Legs:2, Hamstrings:2, Glutes:1, Calves:1},
  Upper: {Chest:2, Back:2, Shoulders:1, Biceps:1, Triceps:1},
  Lower: {Legs:2, Hamstrings:2, Glutes:1, Calves:1, Abs:1},
  Core:  {Abs:3, Cardio:1},
};

// Sets/reps by type
const SETS_REPS = {
  compound: {sets:4, repsMin:6,  repsMax:10},
  isolation:{sets:3, repsMin:10, repsMax:15},
  cardio:   {sets:1, repsMin:10, repsMax:20},
};

// Anchor lifts — always repeat for progressive overload tracking
const ANCHOR_LIFTS = {
  Push: ['Barbell Bench Press','Overhead Press (Barbell)','Incline Barbell Press'],
  Pull: ['Deadlift','Barbell Row','Pull-Up'],
  Legs: ['Barbell Squat','Romanian Deadlift','Hip Thrust'],
  Upper:['Barbell Bench Press','Barbell Row','Overhead Press (Barbell)'],
  Lower:['Barbell Squat','Romanian Deadlift','Hip Thrust'],
  Core: ['Ab Rollout','Cable Crunch'],
};

// ── Fatigue tracking ────────────────────────────────────────────────────────
function getMuscleLastTrained(muscle) {
  const history = state.workoutHistory || [];
  for(let i = history.length-1; i >= 0; i--) {
    if(history[i].exercises.some(e =>
      e.muscle === muscle ||
      (EXERCISE_DB[muscle]||[]).some(db => db.name === e.name)
    )) return history[i].date;
  }
  return null;
}

function getMuscleHoursSinceTraining(muscle) {
  const lastDate = getMuscleLastTrained(muscle);
  if(!lastDate) return 999;
  const diffMs = new Date() - new Date(lastDate + 'T00:00:00');
  return diffMs / 3600000;
}

function isMuscleRecovered(muscle) {
  return getMuscleHoursSinceTraining(muscle) >= 48;
}

// ── Exercise history tracking (last 7 workouts) ────────────────────────────
function getRecentExerciseHistory(n = 7) {
  const history = state.workoutHistory || [];
  const recent = history.slice(-n);
  const usedBySession = {}; // exerciseName → [session indices it appeared in]
  recent.forEach((w, idx) => {
    w.exercises.forEach(e => {
      if(!usedBySession[e.name]) usedBySession[e.name] = [];
      usedBySession[e.name].push(idx);
    });
  });
  return { sessions: recent, usedBySession };
}

// ── Get last performance for progressive overload ──────────────────────────
function getLastPerformance(exName) {
  const history = state.workoutHistory || [];
  for(let i = history.length-1; i >= 0; i--) {
    const ex = history[i].exercises.find(e => e.name.toUpperCase() === exName.toUpperCase());
    if(ex && ex.sets && ex.sets.length > 0) {
      const lastSet = ex.sets[ex.sets.length-1];
      return { weight: lastSet.w||0, reps: lastSet.r||0, date: history[i].date };
    }
  }
  return null;
}

// ── Core workout generator ─────────────────────────────────────────────────
function generateWorkout(splitName) {
  const requirements = SPLIT_REQUIREMENTS[splitName] || {};
  const anchors = ANCHOR_LIFTS[splitName] || [];
  const { usedBySession } = getRecentExerciseHistory(7);
  const today = todayStr();
  const result = []; // final exercise list

  // Track how many exercises per muscle group we've added
  const muscleCount = {};

  // Helper: score an exercise for selection
  function scoreExercise(ex, muscle) {
    let score = 0;
    const name = ex.name;
    const lastUsedSessions = usedBySession[name] || [];
    const sessionCount = (state.exerciseMemory||{})[name.toUpperCase()]?.count || 0;

    // Familiarity score — 60% familiar preference
    if(sessionCount > 0) score += 20; // used before
    if(sessionCount > 3) score += 10; // well-practiced

    // Variety score — prefer not used in last 3 sessions
    const lastUsed = lastUsedSessions.length > 0 ? Math.max(...lastUsedSessions) : -99;
    const sessionsAgo = 6 - lastUsed; // 0 = used this session, 6 = used 7 sessions ago
    if(sessionsAgo >= 3) score += 25; // not recently used = good for variety
    else if(sessionsAgo < 2) score -= 20; // just used = deprioritize

    // Anchor lift bonus
    if(anchors.includes(name)) score += 30;

    // Compound priority
    if(ex.type === 'compound') score += 15;

    // Difficulty preference (match to user history)
    const avgSessions = Object.values(state.exerciseMemory||{}).reduce((a,v)=>a+(v.count||0),0) / Math.max(1, Object.keys(state.exerciseMemory||{}).length);
    if(avgSessions > 20 && ex.difficulty === 'advanced') score += 5;
    else if(avgSessions > 5 && ex.difficulty === 'intermediate') score += 5;
    else if(ex.difficulty === 'beginner') score += 3;

    // Add small random variation (40% new exercise rotation)
    score += Math.random() * 10;

    return score;
  }

  // Helper: build sets for an exercise with progressive overload
  function buildSets(ex) {
    const typeKey = ex.type || 'isolation';
    const config = SETS_REPS[typeKey] || SETS_REPS.isolation;
    const lastPerf = getLastPerformance(ex.name);

    let weight = 0;
    let reps = Math.round((config.repsMin + config.repsMax) / 2);

    if(lastPerf) {
      weight = lastPerf.weight;
      reps = lastPerf.reps;
      // Progressive overload: +2.5kg every 2 sessions or +1 rep
      const sessionCount = (state.exerciseMemory||{})[ex.name.toUpperCase()]?.count || 0;
      if(sessionCount > 0 && sessionCount % 2 === 0) {
        // Suggest weight increase
        weight = Math.round((weight + 2.5) * 2) / 2;
      } else if(reps < config.repsMax) {
        reps = Math.min(reps + 1, config.repsMax);
      }
    }

    const sets = [];
    for(let i = 0; i < config.sets; i++) {
      sets.push({ w: weight, r: reps, done: false });
    }
    return sets;
  }

  // Phase 1: Add anchor lifts first (always repeat for progressive overload)
  anchors.forEach(anchorName => {
    if(result.length >= 2) return; // max 2 anchors
    // Find which muscle group this anchor belongs to
    let anchorEx = null, anchorMuscle = null;
    for(const [m, exList] of Object.entries(EXERCISE_DB)) {
      const found = exList.find(e => e.name === anchorName);
      if(found && requirements[m]) {
        anchorEx = found;
        anchorMuscle = m;
        break;
      }
    }
    if(!anchorEx || !anchorMuscle) return;
    if((muscleCount[anchorMuscle]||0) >= (requirements[anchorMuscle]||0)) return;
    result.push({
      exercise: anchorEx, muscle: anchorMuscle,
      isAnchor: true, sets: buildSets(anchorEx)
    });
    muscleCount[anchorMuscle] = (muscleCount[anchorMuscle]||0) + 1;
  });

  // Phase 2: Fill remaining requirements per muscle
  for(const [muscle, needed] of Object.entries(requirements)) {
    const current = muscleCount[muscle] || 0;
    const remaining = needed - current;
    if(remaining <= 0) continue;

    // Resolve muscle name — Back may need Rear Delts for Pull day
    let dbKey = muscle;
    if(muscle === 'Rear Delts') dbKey = 'Shoulders';

    const available = (EXERCISE_DB[dbKey] || [])
      .filter(ex => {
        // For Rear Delts: only rear delt exercises
        if(muscle === 'Rear Delts') {
          return ex.head && ex.head.toLowerCase().includes('rear');
        }
        // Don't add same exercise twice
        return !result.some(r => r.exercise.name === ex.name);
      })
      .map(ex => ({ ex, score: scoreExercise(ex, muscle) }))
      .sort((a,b) => b.score - a.score);

    // Separate compounds and isolations
    const compounds = available.filter(e => e.ex.type === 'compound');
    const isolations = available.filter(e => e.ex.type !== 'compound');

    // Pick: first prefer compounds (up to needed), then isolation
    let picked = 0;
    for(const { ex } of [...compounds, ...isolations]) {
      if(picked >= remaining) break;
      if(result.some(r => r.exercise.name === ex.name)) continue;
      result.push({
        exercise: ex, muscle,
        isAnchor: false, sets: buildSets(ex)
      });
      muscleCount[muscle] = (muscleCount[muscle]||0) + 1;
      picked++;
    }
  }

  // Phase 3: Sort — compounds first, then by muscle group
  const muscleOrder = Object.keys(requirements);
  result.sort((a, b) => {
    // Anchors always first
    if(a.isAnchor && !b.isAnchor) return -1;
    if(!a.isAnchor && b.isAnchor) return 1;
    // Then by type: compounds before isolations
    if(a.exercise.type === 'compound' && b.exercise.type !== 'compound') return -1;
    if(a.exercise.type !== 'compound' && b.exercise.type === 'compound') return 1;
    // Then by muscle group order
    return muscleOrder.indexOf(a.muscle) - muscleOrder.indexOf(b.muscle);
  });

  return result;
}

// ── Modal state ─────────────────────────────────────────────────────────────
let _ssMode = 'guided';
let _ssSelected = new Set();
let _ssSuggestions = [];
let _ssSessionInfo = '';
let _currentSplitName = '';

function openSmartSuggest(){
  _ssSelected = new Set();
  _ssSuggestions = [];
  _ssMode = 'guided';
  _currentSplitName = '';
  document.getElementById('smart-suggest-modal').style.display='flex';
  showStep1();
  setSSMode('guided');
  const rec = getGuidedSplitRecommendation();
  const recDiv = document.getElementById('ss-guided-recommendation');
  if(recDiv){
    const muscles = SPLIT_DAYS[rec.recommended]||[];
    const req = SPLIT_REQUIREMENTS[rec.recommended]||{};
    const totalEx = Object.values(req).reduce((a,b)=>a+b,0);
    const overdueStr = rec.overdueMuscles.length
      ?`<div style="margin-top:5px;font-size:11px;color:#f97316">⚠ Overdue: ${rec.overdueMuscles.join(', ')}</div>`:'';
    const thisWeekStr = rec.splitsThisWeek.length
      ?`<div style="margin-top:4px;font-size:11px;color:var(--text3)">This week: ${rec.splitsThisWeek.map(s=>'✓ '+s).join(' · ')}</div>`
      :`<div style="margin-top:4px;font-size:11px;color:var(--text3)">Nothing trained yet this week (starts Monday)</div>`;
    const restStr = rec.suggestRest
      ?`<div style="margin-top:5px;font-size:11px;color:#22c55e">💤 Already trained today — rest is progress too</div>`:'';
    recDiv.innerHTML=`
      <div style="font-size:11px;color:var(--text3);margin-bottom:3px">Recommended today:</div>
      <div style="font-family:var(--font-cond);font-weight:900;font-size:22px;color:var(--red)">${rec.recommended.toUpperCase()} DAY</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">${muscles.join(' · ')}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">~${totalEx} exercises · 2 compounds first</div>
      ${rec.lastSplit?`<div style="font-size:11px;color:var(--text3);margin-top:3px">Last session: ${rec.lastSplit}</div>`:''}
      ${thisWeekStr}${overdueStr}${restStr}
      <button onclick="selectAndGenerateSplit('${rec.recommended}')" class="btn-primary" style="width:100%;margin-top:10px;font-size:14px;padding:10px">
        ✓ Generate ${rec.recommended} Day Workout
      </button>`;
  }
  const genBtn=document.getElementById('ss-generate-btn');
  if(genBtn){genBtn.disabled=false;genBtn.style.opacity='1';}
}

function closeSmartSuggest(){
  document.getElementById('smart-suggest-modal').style.display='none';
}
function showStep1(){
  document.getElementById('ss-step1').style.display='block';
  document.getElementById('ss-step2').style.display='none';
}

function setSSMode(mode){
  _ssMode=mode;
  document.getElementById('ss-guided-content').style.display=mode==='guided'?'block':'none';
  document.getElementById('ss-free-content').style.display=mode==='free'?'block':'none';
  const g=document.getElementById('ss-mode-guided');
  const f=document.getElementById('ss-mode-free');
  if(g){g.style.background=mode==='guided'?'var(--red)':'var(--surface2)';g.style.color=mode==='guided'?'#fff':'var(--text2)';g.style.borderColor=mode==='guided'?'var(--red)':'var(--border)';}
  if(f){f.style.background=mode==='free'?'var(--red)':'var(--surface2)';f.style.color=mode==='free'?'#fff':'var(--text2)';f.style.borderColor=mode==='free'?'var(--red)':'var(--border)';}
  if(mode==='free'){
    renderMuscleChipsSS();
    const genBtn=document.getElementById('ss-generate-btn');
    genBtn.disabled=_ssSelected.size===0;
    genBtn.style.opacity=_ssSelected.size>0?'1':'0.4';
  }
}

function renderMuscleChipsSS(){
  const MUSCLE_GROUPS_SS=['Chest','Back','Shoulders','Biceps','Triceps','Legs','Glutes','Hamstrings','Calves','Abs','Cardio','Forearms'];
  const MUSCLE_EMOJIS_SS={Chest:'🏋️',Back:'🔙',Shoulders:'🔺',Biceps:'💪',Triceps:'🔩',Legs:'🦵',Glutes:'🍑',Hamstrings:'🦿',Calves:'🦶',Abs:'⚡',Cardio:'🏃',Forearms:'✊'};
  const wrap=document.getElementById('ss-muscle-chips');
  if(!wrap) return;
  wrap.innerHTML=MUSCLE_GROUPS_SS.map(m=>`
    <button onclick="toggleMuscleChipSS('${m}')" id="ss-chip-${m}"
      style="padding:8px 14px;border-radius:20px;border:2px solid var(--border);background:var(--surface2);
             color:var(--text2);font-family:var(--font-cond);font-weight:700;font-size:14px;cursor:pointer;transition:all .15s">
      ${MUSCLE_EMOJIS_SS[m]||'•'} ${m}
    </button>`).join('');
}

function toggleMuscleChipSS(m){
  const btn=document.getElementById('ss-chip-'+m);
  if(_ssSelected.has(m)){
    _ssSelected.delete(m);
    if(btn){btn.style.background='var(--surface2)';btn.style.borderColor='var(--border)';btn.style.color='var(--text2)';}
  } else {
    _ssSelected.add(m);
    if(btn){btn.style.background='var(--red)';btn.style.borderColor='var(--red)';btn.style.color='#fff';}
  }
  const genBtn=document.getElementById('ss-generate-btn');
  genBtn.disabled=_ssSelected.size===0;
  genBtn.style.opacity=_ssSelected.size>0?'1':'0.4';
}

function selectGuidedSplit(splitName){
  // Highlight the selected button
  document.querySelectorAll('.ss-split-btn').forEach(b=>{
    const isThis=b.textContent.toLowerCase().includes(splitName.toLowerCase());
    b.style.background=isThis?'var(--red)':'var(--surface2)';
    b.style.color=isThis?'#fff':'var(--text2)';
    b.style.borderColor=isThis?'var(--red)':'var(--border)';
  });
  // Directly generate — no need for _ssSelected in guided mode
  selectAndGenerateSplit(splitName);
}

// Main entry: select split and generate immediately
function selectAndGenerateSplit(splitName){
  _currentSplitName=splitName;
  const generated=generateWorkout(splitName);
  _ssSuggestions=generated.map(g=>({
    exercise:g.exercise,
    muscle:g.muscle,
    isAnchor:g.isAnchor,
    sets:g.sets,
    selected:true,
    lastPerf:getLastPerformance(g.exercise.name)
  }));
  document.getElementById('ss-step1').style.display='none';
  document.getElementById('ss-step2').style.display='flex';
  const req=SPLIT_REQUIREMENTS[splitName]||{};
  const totalEx=_ssSuggestions.length;
  document.getElementById('ss-subtitle').textContent=
    splitName+' Day · '+totalEx+' exercises · Compounds first · Tap to deselect any';
  renderSuggestions();
}

// Free choice generate
function generateSuggestions(){
  if(_ssMode==='free'){
    if(_ssSelected.size===0){ toast('Select at least one muscle group'); return; }
    const muscles=[..._ssSelected];
    // Find closest named split
    let bestSplit=null, bestOverlap=0;
    for(const [split,splitMuscles] of Object.entries(SPLIT_DAYS)){
      const overlap=muscles.filter(m=>splitMuscles.includes(m)).length;
      if(overlap>bestOverlap){bestOverlap=overlap;bestSplit=split;}
    }
    if(bestSplit && bestOverlap>=2){
      selectAndGenerateSplit(bestSplit);
    } else {
      // Custom generate for the selected muscles
      _currentSplitName='Custom';
      const generated=[];
      muscles.forEach(muscle=>{
        const dbKey=muscle==='Rear Delts'?'Shoulders':muscle;
        const available=(EXERCISE_DB[dbKey]||[])
          .filter(ex=>muscle!=='Rear Delts'||ex.head?.toLowerCase().includes('rear'))
          .slice(0,3);
        available.forEach(ex=>generated.push({exercise:ex,muscle,isAnchor:false,
          sets:[{w:0,r:10,done:false},{w:0,r:10,done:false},{w:0,r:10,done:false}]}));
      });
      _ssSuggestions=generated.map(g=>({...g,selected:true,lastPerf:getLastPerformance(g.exercise.name)}));
      document.getElementById('ss-step1').style.display='none';
      document.getElementById('ss-step2').style.display='flex';
      document.getElementById('ss-subtitle').textContent='Custom · '+_ssSuggestions.length+' exercises';
      renderSuggestions();
    }
  } else {
    // Guided mode — should have been handled by selectGuidedSplit already
    toast('Pick a split day above');
  }
}

function renderSuggestions(){
  const list=document.getElementById('ss-exercise-list');
  if(!_ssSuggestions.length){
    list.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3)">No exercises found.</div>';
    return;
  }

  // Group by muscle for display
  const byMuscle={};
  _ssSuggestions.forEach((p,i)=>{
    if(!byMuscle[p.muscle]) byMuscle[p.muscle]=[];
    byMuscle[p.muscle].push({...p,idx:i});
  });

  let html='';
  for(const [muscle,items] of Object.entries(byMuscle)){
    html+=`<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--red);margin:10px 0 6px;padding-left:2px">${muscle}</div>`;
    items.forEach(p=>{
      const i=p.idx;
      const ex=p.exercise;
      const lastStr=p.lastPerf
        ?'Last '+p.lastPerf.date.slice(5)+' · '+p.lastPerf.weight+'kg × '+p.lastPerf.reps
        :'New exercise';
      const anchorBadge=p.isAnchor?'<span style="font-size:9px;background:#f97316;color:#fff;padding:2px 5px;border-radius:4px;font-weight:700;margin-left:4px">ANCHOR</span>':'';
      const typeBadge=ex.type==='compound'
        ?'<span style="font-size:9px;background:rgba(99,102,241,.15);color:#6366f1;padding:2px 5px;border-radius:4px;font-weight:700;margin-left:4px">COMPOUND</span>'
        :'<span style="font-size:9px;background:var(--surface2);color:var(--text3);padding:2px 5px;border-radius:4px;font-weight:600;margin-left:4px">ISOLATION</span>';
      const sets=p.sets||[];
      const setsStr=sets.length>0?sets.length+'×'+(sets[0].r||10)+' reps'+(sets[0].w>0?' @ '+sets[0].w+'kg':''):'3×10';
      const progressNote=p.lastPerf&&sets[0]?.w>p.lastPerf.weight
        ?'<span style="font-size:10px;color:#22c55e;margin-left:6px">↑ +2.5kg progression</span>':
        p.lastPerf&&sets[0]?.r>p.lastPerf.reps
        ?'<span style="font-size:10px;color:#22c55e;margin-left:6px">↑ +1 rep progression</span>':'';

      html+=`<div onclick="toggleSuggestion(${i})" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;margin-bottom:6px;border-radius:10px;cursor:pointer;transition:all .15s;background:${p.selected?'rgba(226,75,74,.08)':'var(--surface2)'};border:2px solid ${p.selected?'var(--red)':'transparent'}">
        <div style="width:24px;height:24px;border-radius:50%;flex-shrink:0;margin-top:2px;background:${p.selected?'var(--red)':'var(--surface)'};border:2px solid ${p.selected?'var(--red)':'var(--border)'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700">${p.selected?'✓':''}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px">${ex.name}${anchorBadge}${typeBadge}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${ex.head||''} · ${ex.equip||''} · ${ex.difficulty||''}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:3px;font-weight:600">${setsStr}${progressNote}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${lastStr}</div>
          ${ex.tip?`<div style="font-size:10px;color:var(--text3);margin-top:3px;font-style:italic">💡 ${ex.tip}</div>`:''}
        </div>
      </div>`;
    });
  }
  list.innerHTML=html;
  updateAddAllBtn();
}

function toggleSuggestion(i){
  _ssSuggestions[i].selected=!_ssSuggestions[i].selected;
  renderSuggestions();
}

function updateAddAllBtn(){
  const count=_ssSuggestions.filter(p=>p.selected).length;
  const btn=document.getElementById('ss-add-all-btn');
  if(!btn) return;
  btn.textContent=count>0?'Add '+count+' Exercise'+(count>1?'s':'')+' to Workout':'Select exercises above';
  btn.disabled=count===0;
  btn.style.opacity=count>0?'1':'0.5';
}

function addAllSuggested(){
  const toAdd=_ssSuggestions.filter(p=>p.selected);
  if(!toAdd.length){toast('Select at least one exercise');return;}

  // Record session rotation
  if(_currentSplitName){
    const muscles=[...new Set(toAdd.map(p=>p.muscle))];
    muscles.forEach(m=>{
      const session=toAdd.find(p=>p.muscle===m)?.exercise?.session||'A';
      recordSessionDone(m, session);
    });
  }

  // Sort: compounds first, then group by muscle
  const sorted=[...toAdd].sort((a,b)=>{
    if(a.exercise.type==='compound'&&b.exercise.type!=='compound') return -1;
    if(a.exercise.type!=='compound'&&b.exercise.type==='compound') return 1;
    return 0;
  });

  sorted.forEach(p=>{
    if(state.exercises.some(e=>e.name.toUpperCase()===p.exercise.name.toUpperCase())) return;
    state.exercises.push({
      name:p.exercise.name,muscle:p.muscle,
      met:p.exercise.met||5,
      sets:p.sets||[{w:0,r:10,done:false},{w:0,r:10,done:false},{w:0,r:10,done:false}],
      tip:p.exercise.tip||'',head:p.exercise.head||''
    });
    state.expanded[state.exercises.length-1]=true;
    learnExercise(p.exercise.name.toUpperCase(),p.muscle,p.exercise.met||5);
  });

  saveState({activeSession:true,memory:true});
  closeSmartSuggest();
  renderExercises();
  const bar=document.getElementById('smart-suggest-bar');
  if(bar) bar.style.display='none';
  setTimeout(renderWeeklyCoverage,300);
  toast('Added '+toAdd.length+' exercises → '+(_currentSplitName||'workout')+' day 💪');
}


// ── Weekly muscle coverage tracker ───────────────────────────────────────────
function renderWeeklyCoverage(){
  let el = document.getElementById('weekly-coverage-bar');
  if(!el){
    el = document.createElement('div');
    el.id = 'weekly-coverage-bar';
    el.style.cssText = 'padding:10px 16px;background:var(--surface2);border-radius:12px;margin:10px 0';
    const container = document.getElementById('ex-container');
    if(container && container.parentNode) container.parentNode.insertBefore(el, container);
    else return;
  }
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dow);
  const weekStartStr = weekStart.toISOString().slice(0,10);
  const majorMuscles = ['Chest','Back','Shoulders','Biceps','Triceps','Legs','Glutes','Abs'];
  const trainedThisWeek = {};
  const trainedDays = new Set();
  (state.workoutHistory||[]).filter(w=>w.date>=weekStartStr).forEach(w=>{
    trainedDays.add(w.date);
    w.exercises.forEach(e=>{
      const m=e.muscle||'';
      if(!trainedThisWeek[m]) trainedThisWeek[m]=0;
      trainedThisWeek[m]++;
    });
  });
  const dayLabels=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dayDots=dayLabels.map((label,i)=>{
    const d=new Date(weekStart); d.setDate(weekStart.getDate()+i);
    const ds=d.toISOString().slice(0,10);
    const isToday=ds===todayStr(), trained=trainedDays.has(ds);
    return `<div style="text-align:center;flex:1">
      <div style="width:8px;height:8px;border-radius:50%;margin:0 auto 2px;background:${trained?'var(--red)':'transparent'};border:1.5px solid ${trained?'var(--red)':isToday?'var(--text3)':'var(--border)'}"></div>
      <div style="font-size:9px;color:${isToday?'var(--red)':'var(--text3)'};font-weight:${isToday?'700':'400'}">${label}</div>
    </div>`;
  }).join('');
  const chips=majorMuscles.map(m=>{
    const count=trainedThisWeek[m]||0;
    const color=count>=2?'#22c55e':count===1?'#f97316':'var(--surface)';
    const border=count>=2?'#22c55e':count===1?'#f97316':'var(--border)';
    const tc=count>=2||count===1?'#fff':'var(--text3)';
    return `<span style="padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;background:${color};color:${tc};border:1px solid ${border}">${m} ${count>0?count+'×':'—'}</span>`;
  }).join('');
  el.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text3)">This Week (Mon–Sun)</div>
      <div style="font-size:10px;color:var(--text3)">${trainedDays.size} day${trainedDays.size!==1?'s':''} trained</div>
    </div>
    <div style="display:flex;gap:4px;margin-bottom:8px">${dayDots}</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">${chips}</div>`;
}

// ─── AI WORKOUT REFINEMENT ─────────────────────────────────────────────────────

// ── AI proxy helper ───────────────────────────────────────────────────────────
async function callAI(prompt, imageBase64=null, imageType=null){
  const body = { prompt };
  if(imageBase64){ body.imageBase64=imageBase64; body.imageType=imageType||'image/jpeg'; }
  
  const resp = await fetch('/api/ai',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });

  // Check if we got HTML back (means /api/ai route doesn't exist yet)
  const contentType = resp.headers.get('content-type')||'';
  if(!contentType.includes('application/json')){
    const html = await resp.text();
    if(html.includes('<!DOCTYPE') || html.includes('<html')){
      throw new Error('API route /api/ai not found. Upload api/ai.js to your GitHub repo and redeploy Vercel.');
    }
    throw new Error('Unexpected response: '+html.slice(0,100));
  }

  const data = await resp.json();
  if(data.error) throw new Error(data.error);
  return data.text||'';
}

async function openAIRefine(){
  // Build context from current session + last 2 weeks history
  const exercises = state.exercises||[];
  if(!exercises.length){ toast('Add exercises first, then let AI refine them'); return; }

  // Show refinement modal
  let modal = document.getElementById('ai-refine-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'ai-refine-modal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:flex';
    modal.onclick = e=>{ if(e.target===modal) modal.remove(); };
    modal.innerHTML=`
      <div class="modal-sheet" style="max-height:90vh;display:flex;flex-direction:column;overflow:hidden">
        <div class="modal-handle"></div>
        <div class="modal-header" style="flex-shrink:0">
          <div class="modal-title">🤖 AI Workout Coach</div>
          <button class="modal-close" onclick="document.getElementById('ai-refine-modal').remove()">×</button>
        </div>
        <div style="padding:14px 16px;flex-shrink:0;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Tell me about today:</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:4px">Time available</div>
              <select id="ai-time" class="inp" style="width:100%;font-size:13px">
                <option value="30">30 mins</option>
                <option value="45">45 mins</option>
                <option value="60" selected>60 mins</option>
                <option value="90">90 mins</option>
              </select>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:4px">Energy level</div>
              <select id="ai-energy" class="inp" style="width:100%;font-size:13px">
                <option value="low">Low — easy day</option>
                <option value="medium" selected>Medium — normal</option>
                <option value="high">High — push hard</option>
              </select>
            </div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:4px">Anything sore / injured? (optional)</div>
            <input id="ai-sore" class="inp" placeholder="e.g. left shoulder, lower back..." style="width:100%;font-size:13px">
          </div>
        </div>
        <button onclick="runAIRefine()" class="btn-primary" style="margin:12px 16px;font-size:15px;padding:13px" id="ai-refine-run-btn">
          🤖 Analyse & Improve My Workout →
        </button>
        <div id="ai-refine-result" style="overflow-y:auto;flex:1;padding:0 16px 16px"></div>
      </div>`;
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
  }
}

async function runAIRefine(){
  const btn = document.getElementById('ai-refine-run-btn');
  const resultDiv = document.getElementById('ai-refine-result');
  const time = document.getElementById('ai-time')?.value || '60';
  const energy = document.getElementById('ai-energy')?.value || 'medium';
  const sore = document.getElementById('ai-sore')?.value || '';

  btn.textContent = '🤖 Analysing your history…';
  btn.disabled = true;
  resultDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">Reviewing your workout history and building personalised advice…</div>';

  // Build history summary (last 14 days)
  const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate()-14);
  const recentHistory = (state.workoutHistory||[])
    .filter(w=>w.date>=twoWeeksAgo.toISOString().slice(0,10))
    .map(w=>`${w.date}: ${w.exercises.map(e=>e.name+'('+e.sets.length+'sets)').join(', ')}`)
    .join('\n');

  const currentSession = (state.exercises||[]).map(ex=>{
    const sets = ex.sets.map(s=>`${s.w}kg×${s.r}`).join(', ');
    return `${ex.name} (${ex.muscle||''}) — ${sets}`;
  }).join('\n');

  const profile = state.calProfile||{};
  const userContext = `Weight: ${profile.wt||75}kg, Fitness level: ${profile.fit||'intermediate'}`;

  const prompt = `You are an expert personal trainer and sports scientist. Analyse this workout and give specific, actionable advice.

USER PROFILE: ${userContext}
TODAY'S SESSION:
${currentSession}

RECENT HISTORY (last 14 days):
${recentHistory||'No recent history'}

TODAY'S CONDITIONS:
- Time available: ${time} minutes
- Energy level: ${energy}
- Sore/injured: ${sore||'Nothing mentioned'}

Give your response in this EXACT format (keep it concise, use emojis):

## Overall Assessment
[2-3 sentences on the session quality, volume, balance]

## What's Good ✅
[2-3 bullet points on what's well programmed]

## Suggested Tweaks 🔧
[3-5 specific changes — exercise swaps, set/rep adjustments, order changes]

## Progressive Overload Notes 📈
[Specific weights/reps to target for their key lifts based on history]

## Watch Out For ⚠️
[Form cues, fatigue warnings, injury risk based on sore areas]

Keep total response under 300 words. Be specific with numbers.`;

  try{
    const text = await callAI(prompt);

    // Render markdown-style response
    const rendered = text
      .replace(/## (.+)/g,'<div style="font-family:var(--font-cond);font-weight:900;font-size:16px;color:var(--red);margin:14px 0 6px">$1</div>')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/^- (.+)/gm,'<div style="display:flex;gap:8px;margin-bottom:6px"><span style="color:var(--red);flex-shrink:0">•</span><span style="font-size:13px;color:var(--text2)">$1</span></div>')
      .replace(/\n/g,'<br>');

    resultDiv.innerHTML=`
      <div style="background:var(--surface2);border-radius:12px;padding:14px;margin-top:4px;line-height:1.6">
        ${rendered}
      </div>
      <div style="font-size:10px;color:var(--text3);text-align:center;margin-top:10px">
        Powered by Claude AI · Based on your last 14 days of training
      </div>`;
  } catch(e){
    const isSetupError = e.message.includes('api/ai.js') || e.message.includes('not found');
    resultDiv.innerHTML=`
      <div style="padding:14px;font-size:13px;line-height:1.6">
        ${isSetupError ? `
          <div style="font-weight:700;color:var(--red);margin-bottom:8px">⚠ API route not set up yet</div>
          <div style="color:var(--text2);margin-bottom:10px">You need to upload <code>api/ai.js</code> to GitHub first:</div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;font-size:12px;color:var(--text2);line-height:1.8">
            1. Go to github.com/unexploredadventures365/liftlog<br>
            2. Click <b>Add file → Create new file</b><br>
            3. Type filename: <b>api/ai.js</b><br>
            4. Paste the contents of the api/ai.js file<br>
            5. Also upload <b>vercel.json</b><br>
            6. Also add <b>GEMINI_API_KEY</b> in Vercel Settings → Environment Variables<br>
            7. Vercel will redeploy automatically
          </div>
        ` : `<div style="color:var(--red)">Error: ${e.message}</div>`}
      </div>`;
    console.warn('AI refine error:', e);
  }
  btn.textContent='🤖 Analyse & Improve My Workout →';
  btn.disabled=false;
}
