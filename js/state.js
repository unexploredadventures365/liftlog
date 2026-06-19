// LiftLog — State Management
// Constants, app state, saveState/loadState

const STORAGE_KEY='liftlog_v1';
let state={
  exercises:[],
  workoutHistory:[],weightLog:[],expanded:{},timerSecs:0,timerRunning:false,
  selectedExercise:0,streak:0,lastSaved:null,
  calProfile:{wt:75,gender:'male',age:28,fit:'intermediate'},
  activeProgram:null,
  exerciseDate:null,
  exerciseMemory:{},
  foodLog:{},
  customFoods:[],
  stepLog:{},
  stepGoal:8000
};
let calYear=new Date().getFullYear(),calMonth=new Date().getMonth();
let selectedDate=null; // null = today
let currentView='week';

// PERSISTENCE
function saveState(){
  try{
    const s={
      exercises:state.exercises,
      exerciseDate:state.exerciseDate,
      workoutHistory:state.workoutHistory,
      weightLog:state.weightLog,
      streak:state.streak,
      lastSaved:new Date().toISOString(),
      calProfile:state.calProfile,
      activeProgram:state.activeProgram,
      exerciseMemory:state.exerciseMemory||{},
      foodLog:state.foodLog||{},
      customFoods:state.customFoods||[],
      stepLog:state.stepLog||{},
      stepGoal:state.stepGoal||8000,
      frequentFoods:state.frequentFoods||{},
      mealTemplates:state.mealTemplates||[],
      sessionRotation:state.sessionRotation||{},
      dietPlans:state.dietPlans||[],
      activeDietPlan:state.activeDietPlan||null
    };
    localStorage.setItem(STORAGE_KEY,JSON.stringify(s));
    state.lastSaved=s.lastSaved;
    document.getElementById('save-status').textContent='✓ Saved';
    updateDataPage();
  }catch(e){document.getElementById('save-status').textContent='⚠ Error';}
}

function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return;
    const s=JSON.parse(raw);
    state.workoutHistory=s.workoutHistory||[];
    // Backfill IDs on any legacy entries that predate the ID system
    state.workoutHistory.forEach(w=>{ if(!w.id) w.id=_genId(); });
    // Normalise all dates to YYYY-MM-DD (fix any timezone suffix from old syncs)
    state.workoutHistory.forEach(w=>{ w.date=(w.date||'').slice(0,10); });
    // Always keep history in date order
    state.workoutHistory.sort((a,b)=>a.date.localeCompare(b.date));
    state.weightLog=s.weightLog||[];
    state.streak=s.streak||0;
    state.lastSaved=s.lastSaved||null;
    if(s.calProfile) state.calProfile=s.calProfile;
    if(s.activeProgram) state.activeProgram=s.activeProgram;
    if(s.exerciseMemory) state.exerciseMemory=s.exerciseMemory;
    if(s.foodLog) state.foodLog=s.foodLog;
    if(s.stepLog) state.stepLog=s.stepLog;
    if(s.stepGoal) state.stepGoal=s.stepGoal;
    if(s.frequentFoods) state.frequentFoods=s.frequentFoods;
    if(s.mealTemplates) state.mealTemplates=s.mealTemplates;
    if(s.sessionRotation) state.sessionRotation=s.sessionRotation;
    if(s.dietPlans) state.dietPlans=s.dietPlans;
    if(s.activeDietPlan) state.activeDietPlan=s.activeDietPlan;
    if(s.customFoods&&s.customFoods.length){
      state.customFoods=s.customFoods;
      // Re-inject into FOOD_DB (avoid duplicates)
      s.customFoods.forEach(f=>{
        if(!FOOD_DB.find(x=>x.name===f.name)) FOOD_DB.push(f);
      });
    }
    if(s.exercises&&s.exercises.length){
      const savedDate=s.exerciseDate||null;
      const today=todayStr();
      if(savedDate===today){
        // Only restore if it's actually today's session
        state.exercises=s.exercises;
        state.exerciseDate=today;
      } else {
        // Different day — start fresh, don't pull old workout in
        state.exercises=[];
        state.exerciseDate=today;
      }
    }
  }catch(e){ console.warn('loadState error:',e); }
}
function exportData(){
  const d=JSON.stringify({version:1,exportDate:new Date().toISOString(),exercises:state.exercises,workoutHistory:state.workoutHistory,weightLog:state.weightLog,streak:state.streak},null,2);
  const b=new Blob([d],{type:'application/json'}),url=URL.createObjectURL(b),a=document.createElement('a');
  a.href=url; a.download='liftlog-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(url); toast('Backup exported!');
}
function importData(e){
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader(); r.onload=ev=>{
    try{const d=JSON.parse(ev.target.result);
      if(confirm('Replace ALL current data?')){state.workoutHistory=d.workoutHistory||[];state.weightLog=d.weightLog||[];state.streak=d.streak||0;if(d.exercises)state.exercises=d.exercises;saveState();renderAll();toast('Imported! Syncing to cloud…');}
    }catch(err){toast('Invalid file');}
  }; r.readAsText(f); e.target.value='';
}
function clearAllData(){
  if(!confirm('Delete ALL data? Cannot be undone.')) return;
  localStorage.removeItem(STORAGE_KEY); state.workoutHistory=[];state.weightLog=[];state.streak=0;
  state.exercises=[{name:'Bench Press',muscle:'Chest',sets:[{w:80,r:8,done:false}]}];
  renderAll(); toast('All data cleared');
}

// TIMER
let timerInterval=null;
function toggleTimer(){
  if(state.timerRunning){
    clearInterval(timerInterval);state.timerRunning=false;
    document.getElementById('timer-btn').textContent='▶ Start';
  } else {
    timerInterval=setInterval(()=>{
      state.timerSecs++;
      updateTimerDisplay();
      // refresh live kcal counter every 30s (not every second to avoid flicker)
      if(state.timerSecs%30===0) document.getElementById('wk-kcal').textContent=calcLiveCalories();
    },1000);
    state.timerRunning=true;
    document.getElementById('timer-btn').textContent='⏸ Pause';
  }
}
function resetTimer(){
  clearInterval(timerInterval);state.timerRunning=false;state.timerSecs=0;
  document.getElementById('timer-btn').textContent='▶ Start';
  updateTimerDisplay();
  document.getElementById('wk-kcal').textContent='0';
}
function updateTimerDisplay(){const m=Math.floor(state.timerSecs/60),s=state.timerSecs%60;document.getElementById('wk-time').textContent=m+':'+(s<10?'0':'')+s;}

// VIEW TOGGLE
function setView(v){
  currentView=v;
  document.getElementById('week-view').style.display=v==='week'?'block':'none';
  document.getElementById('calendar-view').style.display=v==='calendar'?'block':'none';
  document.getElementById('vbtn-week').classList.toggle('active',v==='week');
  document.getElementById('vbtn-calendar').classList.toggle('active',v==='calendar');
  if(v==='calendar') renderCalendar(); else renderDayBar();
}

function todayStr(){return new Date().toISOString().slice(0,10);}
function fmtDate(ds){const d=new Date(ds+'T12:00:00');return d.toLocaleDateString('default',{weekday:'short',month:'short',day:'numeric'});}

// DAY SELECTION
function selectDate(ds){
  const t=todayStr();
  selectedDate=(ds===t)?null:ds;
  renderWorkoutPage();
  if(currentView==='calendar') renderCalendar();
}

// DAY BAR
function renderDayBar(){
  const bar=document.getElementById('day-bar'); bar.innerHTML='';
  const days=['M','T','W','T','F','S','S'],today=new Date(),dow=(today.getDay()+6)%7;
  const wdates=new Set(state.workoutHistory.map(w=>(w.date||'').slice(0,10))),todayS=todayStr();
  for(let i=0;i<7;i++){
    const d=new Date(today); d.setDate(today.getDate()-dow+i);
    const ds=d.toISOString().slice(0,10);
    const isToday=i===dow,done=wdates.has(ds);
    const isSel=selectedDate===ds||(selectedDate===null&&isToday);
    const div=document.createElement('div');
    div.className='day'+(done?' done':'')+(isToday?' today':'')+(isSel?' selected':'');
    div.innerHTML=`<div class="day-lbl">${days[i]}</div><div class="day-num">${d.getDate()}</div><div class="day-dot"></div>`;
    div.onclick=()=>selectDate(ds); bar.appendChild(div);
  }
}

// CALENDAR
function renderCalendar(){
  const todayS=todayStr(),wdates=new Set(state.workoutHistory.map(w=>(w.date||'').slice(0,10)));
  document.getElementById('cal-month-label').textContent=new Date(calYear,calMonth,1).toLocaleString('default',{month:'long',year:'numeric'});
  const grid=document.getElementById('cal-grid'); grid.innerHTML='';
  ['M','T','W','T','F','S','S'].forEach(d=>{const e=document.createElement('div');e.className='cal-dow';e.textContent=d;grid.appendChild(e);});
  const first=new Date(calYear,calMonth,1),startDow=(first.getDay()+6)%7,dim=new Date(calYear,calMonth+1,0).getDate(),prevDim=new Date(calYear,calMonth,0).getDate();
  for(let i=0;i<startDow;i++){const e=document.createElement('div');e.className='cal-day other-month';e.textContent=prevDim-startDow+1+i;grid.appendChild(e);}
  for(let d=1;d<=dim;d++){
    const ds=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const e=document.createElement('div');
    let cls='cal-day';
    if(wdates.has(ds)) cls+=' has-workout';
    if(ds===todayS) cls+=' today';
    if(ds===selectedDate||(selectedDate===null&&ds===todayS)) cls+=' selected';
    e.className=cls; e.textContent=d; e.onclick=()=>selectDate(ds); grid.appendChild(e);
  }
  const rem=(startDow+dim)%7; if(rem){for(let i=1;i<=7-rem;i++){const e=document.createElement('div');e.className='cal-day other-month';e.textContent=i;grid.appendChild(e);}}
}
function calPrev(){calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCalendar();}
function calNext(){calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCalendar();}

// WORKOUT PAGE ORCHESTRATOR
function renderWorkoutPage(){
  if(currentView==='week') renderDayBar();
  else if(currentView==='calendar') renderCalendar();
  const todayS=todayStr(),isToday=selectedDate===null||selectedDate===todayS;
  const detail=document.getElementById('day-detail-panel'),todaySec=document.getElementById('today-workout-section');
  const addBtn=document.getElementById('add-ex-btn');
  if(isToday){
    detail.innerHTML=''; todaySec.style.display='block'; addBtn.style.display='';
    renderExercises();
  } else {
    todaySec.style.display='none'; addBtn.style.display='none';
    renderDayDetail(selectedDate,detail);
  }
}
function renderWorkout(){renderWorkoutPage();}

// ── PAST DAY EDITING STATE ────────────────────────────────────────────────────
let pastEditDate=null;
let pastEditExercises=[];
let pastEditExpanded={};
let pastEditIdx=-1;   // index of existing workout being edited (-1 = new)

function renderDayDetail(ds, container){
  const workouts=state.workoutHistory.map((w,i)=>({...w,_idx:i})).filter(w=>w.date===ds);

  // If currently editing this date, show editor
  if(pastEditDate===ds){
    renderPastEditor(ds, container);
    return;
  }

  container.innerHTML='';

  // Header bar with date + "Log Workout" button
  const bar=document.createElement('div');
  bar.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:8px';
  bar.innerHTML=`
    <div style="font-family:var(--font-cond);font-weight:700;font-size:18px;text-transform:uppercase">${fmtDate(ds)}</div>
    <button class="btn-sm" style="background:var(--red);color:#fff;border-color:var(--red);font-weight:700"
      onclick="startPastEdit('${ds}')">+ Log Workout</button>
  `;
  container.appendChild(bar);

  if(!workouts.length){
    const empty=document.createElement('div');
    empty.className='card';
    empty.style.cssText='text-align:center;padding:24px 14px';
    empty.innerHTML=`<div style="font-size:32px;margin-bottom:8px">📭</div>
      <div style="font-size:14px;font-weight:600;color:var(--text2)">Rest day</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">Tap "+ Log Workout" to add a missed session</div>`;
    container.appendChild(empty);
    return;
  }

  workouts.forEach(w=>{
    const mins=Math.floor((w.duration||0)/60);
    const kcal=w.totalKcal||calcWorkoutCalories(w.exercises);
    const div=document.createElement('div'); div.className='day-detail';
    div.innerHTML=`
      <div class="day-detail-hdr">
        <div>
          <div class="day-detail-date">${fmtDate(ds)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">
            ${w.exercises.length} exercises &middot; ${w.totalVolume||0}kg
            ${mins?'&middot; '+mins+'min':''}
            &middot; <span style="color:var(--red);font-weight:700">🔥 ${kcal} kcal</span>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm" onclick="editPastWorkout('${w.id||w._idx}')">Edit</button>
          <button class="btn-sm" onclick="shareWorkout('${w.id||w._idx}')" title="Share with community" style="background:rgba(99,102,241,.15);color:#6366f1;border-color:rgba(99,102,241,.3)">🌍 Share</button>
          <button class="btn-sm btn-danger" onclick="deleteWorkout('${w.id||w._idx}')">Delete</button>
        </div>
      </div>
      ${w.exercises.map(ex=>{
        const chips=ex.sets.map((s,j)=>'<span class="detail-set-chip">Set '+(j+1)+': '+s.w+'kg × '+s.r+'</span>').join('');
        return '<div class="detail-ex"><div class="detail-ex-name">'+ex.name+'</div>'+chips+'</div>';
      }).join('')}
    `;
    container.appendChild(div);
  });
}

function startPastEdit(ds){
  pastEditDate=ds;
  pastEditExercises=[];
  pastEditExpanded={};
  pastEditIdx=-1;   // new workout, nothing to replace
  const detail=document.getElementById('day-detail-panel');
  renderPastEditor(ds, detail);
}


function renderPastEditor(ds, container){
  container.innerHTML='';

  // Header
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';
  hdr.innerHTML=`
    <div>
      <div style="font-family:var(--font-cond);font-weight:700;font-size:18px;text-transform:uppercase">📝 ${fmtDate(ds)}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">Logging missed workout</div>
    </div>
    <button class="btn-sm btn-danger" onclick="cancelPastEdit()">Cancel</button>
  `;
  container.appendChild(hdr);

  // Quick-add bar for past date
  const qa=document.createElement('div');
  qa.className='quick-add-wrap';
  qa.innerHTML=`
    <div style="display:flex;gap:6px;align-items:flex-start">
      <textarea class="inp" id="past-quick-inp" placeholder="Paste exercises:&#10;Iso lateral rowing 7.5,12 17.5,12 30,12&#10;Back row 30,12 40,8 50,6&#10;T bar 10,12 20,8 30,6" style="flex:1;font-size:13px;resize:vertical;min-height:80px;line-height:1.4" autocomplete="off"></textarea>
      <button class="lib-custom-btn" onclick="quickAddParse('past-quick-inp','past-quick-preview',true)" style="padding:9px 14px;align-self:flex-start">Add</button>
    </div>
    <div id="past-quick-preview" style="font-size:11px;color:var(--text3);margin-top:4px;min-height:14px"></div>
  `;
  container.appendChild(qa);

  // Exercise cards
  const exWrap=document.createElement('div');
  exWrap.id='past-ex-container';
  container.appendChild(exWrap);
  renderPastExercises();

  // Library button
  const libBtn=document.createElement('button');
  libBtn.className='btn-outline';
  libBtn.style.cssText='width:100%;margin-bottom:10px';
  libBtn.textContent='+ Add Exercise';
  libBtn.onclick=()=>openLibraryForPast();
  container.appendChild(libBtn);

  // Save button
  const saveBtn=document.createElement('button');
  saveBtn.className='btn-primary';
  saveBtn.textContent=`Save Workout for ${fmtDate(ds)} ✓`;
  saveBtn.onclick=()=>savePastWorkout(ds);
  container.appendChild(saveBtn);
}

function renderPastExercises(){
  const c=document.getElementById('past-ex-container'); if(!c) return;
  c.innerHTML='';
  const bw=state.calProfile.wt||75;
  pastEditExercises.forEach((ex,i)=>{
    const vol=ex.sets.reduce((a,s)=>a+s.w*s.r,0);
    const kcal=ex.sets.reduce((a,s)=>a+calcSetCalories(ex.name,s.w,Math.max(1,s.r),bw,ex.met),0);
    const div=document.createElement('div'); div.className='ex-card';
    div.innerHTML=`
      <div class="ex-header" onclick="togglePastEx(${i})">
        <div style="flex:1;min-width:0">
          <div class="ex-name">${ex.name}<span class="kcal-badge">🔥 ${kcal} kcal</span></div>
          <div class="ex-meta">${ex.muscle?ex.muscle+' · ':''}${ex.sets.length} sets${vol?' · '+vol+'kg':''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button onclick="event.stopPropagation();deletePastExercise(${i})"
            style="background:none;border:none;font-size:20px;color:var(--text3);cursor:pointer;padding:2px 4px">&times;</button>
          <div class="ex-chevron${pastEditExpanded[i]?' open':''}">&#9662;</div>
        </div>
      </div>
      ${pastEditExpanded[i]?buildPastSetsHTML(ex,i):''}
    `;
    c.appendChild(div);
    if(pastEditExpanded[i]) bindPastSetInputs(ex,i);
  });
}

function buildPastSetsHTML(ex,i){
  return `<table class="sets-table">
    <thead><tr>
      <th style="text-align:left;width:44px">Set</th>
      <th>kg</th><th>Reps</th><th></th>
    </tr></thead>
    <tbody id="past-tbody-${i}"></tbody>
  </table>
  <div class="add-set-row">
    <button class="add-set-btn" onclick="addPastSet(${i})">+ Add set</button>
  </div>`;
}

function bindPastSetInputs(ex,i){
  const tbody=document.getElementById('past-tbody-'+i); if(!tbody) return;
  ex.sets.forEach((s,j)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td class="set-num" style="font-size:11px">Set ${j+1}</td>
      <td><input class="set-inp" type="number" value="${s.w||''}" step="2.5" inputmode="decimal"
        oninput="pastEditExercises[${i}].sets[${j}].w=parseFloat(this.value)||0"
        onblur="renderPastExercises()"></td>
      <td><input class="set-inp" type="number" value="${s.r||''}" step="1" inputmode="numeric"
        oninput="pastEditExercises[${i}].sets[${j}].r=parseInt(this.value)||0"
        onblur="renderPastExercises()"></td>
      <td><button onclick="deletePastSet(${i},${j})"
        style="width:28px;height:28px;border-radius:6px;border:none;background:var(--red-bg);color:var(--red-dark);font-size:15px;font-weight:700;cursor:pointer">×</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function togglePastEx(i){pastEditExpanded[i]=!pastEditExpanded[i];renderPastExercises();}
function deletePastExercise(i){pastEditExercises.splice(i,1);renderPastExercises();}
function addPastSet(i){
  const last=pastEditExercises[i].sets.slice(-1)[0];
  pastEditExercises[i].sets.push({w:last?last.w:0,r:last?last.r:10,done:true});
  renderPastExercises();
}
function deletePastSet(i,j){
  if(pastEditExercises[i].sets.length<=1){toast('Need at least 1 set');return;}
  pastEditExercises[i].sets.splice(j,1);
  renderPastExercises();
}


let _pastLibMode=false;
function openLibraryForPast(){
  _pastLibMode=true;
  openLibrary();
}

function cancelPastEdit(){
  pastEditDate=null; pastEditExercises=[]; pastEditExpanded={}; pastEditIdx=-1;
  _pastLibMode=false;
  renderDayDetail(selectedDate, document.getElementById('day-detail-panel'));
}

function _genId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

function editPastWorkout(wid){
  const idx=state.workoutHistory.findIndex(w=>w.id===wid);
  if(idx<0){toast('Workout not found');return;}
  const w=state.workoutHistory[idx];
  pastEditDate=w.date;
  pastEditIdx=idx;
  pastEditExercises=w.exercises.map(ex=>({...ex,sets:ex.sets.map(s=>({...s,done:true}))}));
  pastEditExpanded={};
  pastEditExercises.forEach((_,i)=>pastEditExpanded[i]=true);
  const detail=document.getElementById('day-detail-panel');
  renderPastEditor(w.date, detail);
}

function deleteWorkout(wid){
  if(!confirm('Delete this workout? Cannot be undone.')) return;
  state.workoutHistory=state.workoutHistory.filter(w=>w.id!==wid);
  // Track deleted ID so Supabase can remove it too
  if(!state._deletedWorkouts) state._deletedWorkouts=[];
  state._deletedWorkouts.push(wid);
  recalcStreak();
  saveState({profile:true, deletedWorkout:wid});
  renderWorkoutPage(); toast('Workout deleted');
}

function savePastWorkout(ds){
  if(!pastEditExercises.length){toast('Add at least one exercise');return;}
  const totalVolume=pastEditExercises.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+(s.w||0)*(s.r||0),0),0);
  const totalKcal=calcWorkoutCalories(pastEditExercises);
  const existingId=(pastEditIdx>=0&&state.workoutHistory[pastEditIdx])?state.workoutHistory[pastEditIdx].id:null;
  const entry={
    id: existingId||_genId(),
    date:ds, duration:0,
    exercises:pastEditExercises.map(ex=>({...ex,sets:ex.sets.map(s=>({w:s.w||0,r:s.r||0}))})),
    totalVolume, totalKcal
  };
  if(pastEditIdx>=0 && pastEditIdx<state.workoutHistory.length){
    state.workoutHistory[pastEditIdx]=entry;
  } else {
    state.workoutHistory.push(entry);
  }
  state.workoutHistory.sort((a,b)=>a.date.localeCompare(b.date));
  learnFromWorkout(entry.exercises);
  recalcStreak();
  saveState({profile:true, workout:entry.id, memory:true});
  pastEditDate=null; pastEditExercises=[]; pastEditExpanded={}; pastEditIdx=-1;
  _pastLibMode=false;
  renderWorkoutPage();
  toast(`Workout saved for ${fmtDate(ds)}! 💪`);
}



function recalcStreak(){
  if(!state.workoutHistory.length){state.streak=0;document.getElementById('streak-count').textContent='0';return;}
  const sorted=[...new Set(state.workoutHistory.map(w=>w.date))].sort().reverse();
  const todayS=todayStr(); let streak=0,prev=null;
  for(let i=0;i<sorted.length;i++){
    if(i===0){const diff=(new Date(todayS)-new Date(sorted[0]))/86400000;if(diff>1)break;streak=1;prev=sorted[0];}
    else{const diff=(new Date(prev)-new Date(sorted[i]))/86400000;if(diff<=1){streak++;prev=sorted[i];}else break;}
  }
  state.streak=streak; document.getElementById('streak-count').textContent=streak;
}

// EXERCISES (today)
function renderExercises(){
  const c=document.getElementById('ex-container'); c.innerHTML='';
  let td=0,ts=0,tv=0;
  const bw=state.calProfile.wt||75;

  // Show/hide the smart suggest bar and AI refine bar
  const ssBar = document.getElementById('smart-suggest-bar');
  const aiBar = document.getElementById('ai-refine-bar');
  if(ssBar) ssBar.style.display = state.exercises.length===0 ? 'block' : 'none';
  if(aiBar) aiBar.style.display = state.exercises.length===0 ? 'none' : 'block';

  // Empty state
  if(!state.exercises.length){
    c.innerHTML=`
      <div style="text-align:center;padding:32px 20px;color:var(--text3)">
        <div style="font-size:48px;margin-bottom:12px">🏋️</div>
        <div style="font-family:var(--font-cond);font-weight:900;font-size:20px;color:var(--text2);margin-bottom:6px">Start your workout</div>
        <div style="font-size:13px;line-height:1.5;margin-bottom:20px">Tap <b>💪 What am I training today?</b><br>or tap <b>+ Exercise</b> to add manually</div>
      </div>`;
    document.getElementById('wk-sets').textContent='0/0';
    document.getElementById('wk-vol').textContent='0';
    document.getElementById('wk-kcal').textContent='0';
    return;
  }

  // Split exercises into DONE and IN PROGRESS
  const doneExercises = [];
  const activeExercises = [];
  state.exercises.forEach((ex, i) => {
    const allDone = ex.sets.length > 0 && ex.sets.every(s => s.done);
    if(allDone) doneExercises.push({ex, i});
    else activeExercises.push({ex, i});
  });

  // Group active exercises by muscle
  const muscleGroups = {};
  activeExercises.forEach(({ex, i}) => {
    const m = ex.muscle || 'Other';
    if(!muscleGroups[m]) muscleGroups[m] = [];
    muscleGroups[m].push({ex, i});
  });
  state.exercises.forEach((ex,i)=>{
    const done=ex.sets.filter(s=>s.done).length; td+=done; ts+=ex.sets.length;
    const vol=ex.sets.filter(s=>s.done).reduce((a,s)=>a+s.w*s.r,0); tv+=vol;
  });

  // Recalculate from all exercises for accuracy
  td=0; ts=0; tv=0;
  state.exercises.forEach(ex=>{
    td+=ex.sets.filter(s=>s.done).length;
    ts+=ex.sets.length;
    tv+=ex.sets.filter(s=>s.done).reduce((a,s)=>a+s.w*s.r,0);
  });

  // ── DONE section (exercises with all sets completed) ────────────────────
  if(doneExercises.length > 0){
    const doneHeader = document.createElement('div');
    doneHeader.style.cssText='font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#22c55e;padding:4px 2px 6px;display:flex;align-items:center;gap:6px';
    doneHeader.innerHTML=`<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block"></span> Completed (${doneExercises.length})`;
    c.appendChild(doneHeader);

    doneExercises.forEach(({ex, i}) => {
      const vol=ex.sets.reduce((a,s)=>a+s.w*s.r,0);
      const doneKcal=ex.sets.reduce((a,s)=>a+calcSetCalories(ex.name,s.w,Math.max(1,s.r),bw,ex.met,ex.kcalPerRep||0),0);
      const div=document.createElement('div');
      div.className='ex-card';
      div.style.cssText='border-left:3px solid #22c55e;opacity:0.85';
      div.innerHTML=`
        <div class="ex-header" onclick="toggleEx(${i})">
          <div style="flex:1;min-width:0">
            <div class="ex-name">✓ ${ex.name}<span class="kcal-badge">🔥 ${doneKcal} kcal</span></div>
            <div class="ex-meta">${ex.muscle?ex.muscle+' · ':''}${ex.sets.length} sets · ${vol>0?vol+'kg':''}  <span style="color:#22c55e;font-weight:700">All done!</span></div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <button onclick="event.stopPropagation();deleteExercise(${i})" style="background:var(--red-bg,rgba(226,75,74,.1));border:none;border-radius:8px;padding:4px 8px;cursor:pointer;color:var(--red);font-size:11px;font-weight:700">🗑️</button>
            <div class="ex-chevron${state.expanded[i]?' open':''}">&#9662;</div>
          </div>
        </div>
        ${state.expanded[i]?buildSetsHTML(ex,i):''}
      `;
      c.appendChild(div);
      if(state.expanded[i]) bindSetInputs(ex,i);
    });

    // Divider
    if(activeExercises.length > 0){
      const divider = document.createElement('div');
      divider.style.cssText='height:1px;background:var(--border);margin:8px 0 12px';
      c.appendChild(divider);
    }
  }

  // ── ACTIVE section — grouped by muscle ──────────────────────────────────
  for(const [muscle, items] of Object.entries(muscleGroups)){
    // Muscle group header
    const header = document.createElement('div');
    header.style.cssText='font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--red);padding:4px 2px 6px;margin-top:4px';
    header.textContent = muscle;
    c.appendChild(header);

    items.forEach(({ex, i}) => {
      const done=ex.sets.filter(s=>s.done).length;
      const vol=ex.sets.filter(s=>s.done).reduce((a,s)=>a+s.w*s.r,0);
      const best=getBestForEx(ex.name);
      const isPR=ex.sets.some(s=>s.done&&s.w>best);
      const lastSess=getLastSession(ex.name);
      const lastSetsStr=lastSess?lastSess.sets.slice(0,3).map(s=>s.w+'×'+s.r).join(', ')+(lastSess.sets.length>3?'…':''):'';
      const lastLine=lastSess?` <span style="font-size:11px;color:var(--text3)">· Last ${lastSess.date.slice(5)}: ${lastSetsStr}</span>`:`<span style="font-size:11px;color:var(--text3)"> · No history yet</span>`;
      const doneKcal=ex.sets.filter(s=>s.done).reduce((a,s)=>a+calcSetCalories(ex.name,s.w,Math.max(1,s.r),bw,ex.met,ex.kcalPerRep||0),0);
      const estKcal=ex.sets.reduce((a,s)=>a+calcSetCalories(ex.name,s.w,Math.max(1,s.r),bw,ex.met,ex.kcalPerRep||0),0);
      const kcalDisplay=done>0?`🔥 ${doneKcal} kcal`:`🔥 ~${estKcal} kcal est.`;
      const ssLabel=ex.superset?`<span class="superset-badge ss-${ex.superset}">SS-${ex.superset}</span>`:'';
      const tipLine=ex.tip?`<div style="font-size:10px;color:var(--text3);margin-top:2px;font-style:italic">💡 ${ex.tip}</div>`:'';

      const div=document.createElement('div');
      div.className='ex-card'+(ex.superset?' is-superset':'');
      div.innerHTML=`
        <div class="ex-header" onclick="toggleEx(${i})">
          <div style="flex:1;min-width:0">
            <div class="ex-name">${ex.name}${isPR?'<span class="pr-badge">NEW PR!</span>':''}${ssLabel}<span class="kcal-badge">${kcalDisplay}</span></div>
            <div class="ex-meta">${done}/${ex.sets.length} sets${vol?' · '+vol+'kg':''}${lastLine}</div>
            ${tipLine}
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <button onclick="event.stopPropagation();showPlateCalc(${i})" title="Plate calculator" style="background:none;border:none;font-size:16px;cursor:pointer;padding:2px;opacity:.5">🏋️</button>
            <button onclick="event.stopPropagation();toggleSuperset(${i})" title="Superset" style="background:none;border:none;font-size:14px;cursor:pointer;padding:2px;opacity:.5">🔗</button>
            <button onclick="event.stopPropagation();deleteExercise(${i})" style="background:var(--red-bg,rgba(226,75,74,.1));border:none;border-radius:8px;padding:4px 8px;cursor:pointer;color:var(--red);font-size:11px;font-weight:700">🗑️</button>
            <div class="ex-chevron${state.expanded[i]?' open':''}">&#9662;</div>
          </div>
        </div>
        ${state.expanded[i]?buildSetsHTML(ex,i):''}
      `;
      c.appendChild(div);
      if(state.expanded[i]) bindSetInputs(ex,i);
    });
  }
  // Stats: show done/total sets, done volume, live kcal (done sets + timer base)
  const totalEstKcal=state.exercises.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+calcSetCalories(ex.name,s.w,Math.max(1,s.r),bw,ex.met),0),0);
  const liveKcal=calcLiveCalories();
  document.getElementById('wk-sets').textContent=td+'/'+ts;
  document.getElementById('wk-vol').textContent=tv>0?tv:(state.exercises.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+s.w*s.r,0),0));
  document.getElementById('wk-kcal').textContent=td>0?liveKcal:totalEstKcal;
}

function buildSetsHTML(ex,i){
  return `<table class="sets-table">
    <thead><tr>
      <th style="text-align:left;width:44px">Set</th>
      <th>kg</th>
      <th>Reps</th>
      <th>RPE</th>
      <th>Done</th>
      <th style="width:32px"></th>
    </tr></thead>
    <tbody id="tbody-${i}"></tbody>
  </table>
  <div class="add-set-row"><button class="add-set-btn" onclick="addSet(${i})">+ Add set</button></div>`;
}

function bindSetInputs(ex,i){
  const tbody=document.getElementById('tbody-'+i); if(!tbody) return;
  const bw=state.calProfile.wt||75;
  ex.sets.forEach((s,j)=>{
    const kcal=calcSetCalories(ex.name,s.w,Math.max(1,s.r),bw,ex.met,ex.kcalPerRep||0);
    const rpe=s.rpe||0;
    const rpeColors=['','#22c55e','#22c55e','#84cc16','#84cc16','#eab308','#eab308','#f97316','#f97316','#ef4444','#dc2626'];
    const tr=document.createElement('tr');
    if(s.done){
      tr.style.cssText='background:rgba(34,197,94,0.08);border-radius:8px;transition:background .2s';
    }
    tr.id=`set-row-${i}-${j}`;
    tr.innerHTML=`
      <td class="set-num" style="font-size:11px;${s.done?'color:#22c55e;font-weight:700':''}">
        ${s.done?'✓':''}Set ${j+1}
        <div id="set-kcal-${i}-${j}" style="font-size:9px;color:${s.done?'#22c55e':'var(--red)'};font-weight:700;margin-top:1px">${kcal} kcal</div>
      </td>
      <td><input class="set-inp" type="number" value="${s.w}" step="2.5" inputmode="decimal" data-i="${i}" data-j="${j}" data-k="w" style="${s.done?'color:#22c55e;font-weight:700':''}" ></td>
      <td><input class="set-inp" type="number" value="${s.r}" step="1" inputmode="numeric" data-i="${i}" data-j="${j}" data-k="r" style="${s.done?'color:#22c55e;font-weight:700':''}" ></td>
      <td><button onclick="cycleRPE(${i},${j})" style="background:none;border:1.5px solid ${rpe?rpeColors[rpe]:'var(--border)'};color:${rpe?rpeColors[rpe]:'var(--text3)'};border-radius:8px;padding:2px 5px;font-size:11px;font-weight:700;cursor:pointer;min-width:28px">${rpe||'—'}</button></td>
      <td><button class="done-btn${s.done?' done':''}" onclick="toggleSet(${i},${j})">${s.done?'&#10003;':'&#9675;'}</button></td>
      <td><button onclick="deleteSet(${i},${j})" style="width:28px;height:28px;border-radius:6px;border:none;background:var(--red-bg);color:var(--red-dark);font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">×</button></td>
    `;
    tbody.appendChild(tr);
  });

  // Live update: on every keystroke recalculate kcal for that row
  tbody.querySelectorAll('.set-inp').forEach(inp=>{
    const update=e=>{
      const ii=+e.target.dataset.i, jj=+e.target.dataset.j, kk=e.target.dataset.k;
      const val=parseFloat(e.target.value)||0;
      state.exercises[ii].sets[jj][kk]=val;
      const bwNow=state.calProfile.wt||75;
      const set=state.exercises[ii].sets[jj];
      const exNow=state.exercises[ii];
      const newKcal=calcSetCalories(exNow.name,set.w,Math.max(1,set.r),bwNow,exNow.met,exNow.kcalPerRep||0);
      const kcalCell=document.getElementById(`set-kcal-${ii}-${jj}`);
      if(kcalCell) kcalCell.innerHTML=`${newKcal}<span style="font-size:9px;font-weight:500;color:var(--text3)"> kcal</span>`;
      document.getElementById('wk-kcal').textContent=calcLiveCalories();
      // Also update vol stat
      const totalVol=state.exercises.reduce((a,ex)=>a+ex.sets.filter(s=>s.done).reduce((b,s)=>b+s.w*s.r,0),0);
      const allVol=state.exercises.reduce((a,ex)=>a+ex.sets.reduce((b,s)=>b+s.w*s.r,0),0);
      document.getElementById('wk-vol').textContent=totalVol>0?totalVol:allVol;
      autoSave();
    };
    inp.addEventListener('input', update);
    inp.addEventListener('change', ()=>{renderExercises();});
  });
}

function toggleEx(i){state.expanded[i]=!state.expanded[i];renderExercises();}
function addSet(i){const l=state.exercises[i].sets[state.exercises[i].sets.length-1];state.exercises[i].sets.push({w:l?l.w:0,r:l?l.r:8,done:false});renderExercises();autoSave();}
function deleteSet(i,j){if(state.exercises[i].sets.length<=1)return toast('Need at least 1 set');state.exercises[i].sets.splice(j,1);renderExercises();autoSave();}
// Undo buffer for exercise removal
let _removedEx=null, _removedExIdx=-1, _removeUndoTimer=null;

function deleteExercise(i){
  const ex=state.exercises[i];
  _removedEx={...ex,sets:[...ex.sets]};
  _removedExIdx=i;
  state.exercises.splice(i,1);
  renderExercises();
  autoSave();
  clearTimeout(_removeUndoTimer);
  const el=document.getElementById('toast');
  el.innerHTML='Removed <b>'+ex.name+'</b> &nbsp;<button onclick="undoRemoveExercise()" style="background:#fff;color:#333;border:none;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700;cursor:pointer;margin-left:4px">Undo</button>';
  el.classList.add('show');
  _removeUndoTimer=setTimeout(()=>{el.classList.remove('show');el.innerHTML='';_removedEx=null;},4000);
}

function undoRemoveExercise(){
  if(!_removedEx) return;
  clearTimeout(_removeUndoTimer);
  state.exercises.splice(_removedExIdx,0,_removedEx);
  _removedEx=null;
  renderExercises();
  autoSave();
  toast('Restored ✓');
}

function addCustomExercise(){
  const nameEl=document.getElementById('custom-ex-name');
  const muscleEl=document.getElementById('custom-ex-muscle');
  const kcalEl=document.getElementById('custom-ex-kcal');
  const name=nameEl.value.trim();
  if(!name){nameEl.focus();nameEl.style.borderColor='var(--red)';return;}
  nameEl.style.borderColor='';
  const muscle=muscleEl.value;
  const metDefaults={Chest:7,Back:7,Shoulders:6,Biceps:4.5,Triceps:4.5,Legs:8,Glutes:6,Hamstrings:6,Calves:4,Abs:4.5,Cardio:9,Forearms:3.5,Other:5};
  const met=metDefaults[muscle]||5;
  // kcal per rep — stored on the exercise for use in calorie calc
  const kcalPerRep=kcalEl?parseFloat(kcalEl.value)||0:0;

  const already=state.exercises.some(e=>e.name.toUpperCase()===name.toUpperCase());
  if(already){toast(name+' already in workout');return;}

  // Learn immediately so it shows in progress + memory
  learnExercise(name.toUpperCase(), muscle, met);

  // Inject into EXERCISE_DB so it shows in the library permanently
  injectIntoExerciseDB(name.toUpperCase(), muscle, met);

  // Pre-fill sets from last session if available
  const last=getLastSession(name.toUpperCase());
  const sets=last && last.sets.length
    ? last.sets.map(s=>({w:s.w,r:s.r,done:false}))
    : [{w:0,r:10,done:false},{w:0,r:10,done:false},{w:0,r:10,done:false}];

  state.exercises.push({name:name.toUpperCase(),muscle,met,kcalPerRep,sets});
  state.expanded[state.exercises.length-1]=true;
  nameEl.value='';
  if(kcalEl) kcalEl.value='';
  renderExercises();
  autoSave();
  closeLibrary();
  const msg=last?`Added ${name} — last session loaded!`:`Added ${name}!`;
  toast(msg);
}
function addExercise(){
  const name=prompt('Exercise name:'); if(!name||!name.trim())return;
  const muscle=prompt('Muscle group (optional):')||'';
  state.exercises.push({name:name.trim().toUpperCase(),muscle:muscle.trim(),sets:[{w:0,r:8,done:false},{w:0,r:8,done:false},{w:0,r:8,done:false}]});
  state.expanded[state.exercises.length-1]=true; renderExercises();
}

function saveWorkout(){
  window._haptic?.('medium');
  const today=todayStr(),td=state.exercises.reduce((a,e)=>a+e.sets.filter(s=>s.done).length,0);
  if(td===0)return toast('Complete at least one set first!');
  const doneExercises=state.exercises.map(ex=>({name:ex.name,muscle:ex.muscle,met:ex.met,sets:ex.sets.filter(s=>s.done).map(s=>({w:s.w,r:s.r}))})).filter(ex=>ex.sets.length>0);
  const totalKcal=calcWorkoutCalories(doneExercises)+Math.round(state.timerSecs/60*4);
  const entry={id:_genId(),date:today,duration:state.timerSecs,
    exercises:doneExercises,
    totalVolume:state.exercises.reduce((a,e)=>a+e.sets.filter(s=>s.done).reduce((b,s)=>b+s.w*s.r,0),0),
    totalKcal
  };
  // Add new entry — allow multiple sessions per day (morning + evening etc.)
  state.workoutHistory.push(entry);
  state.workoutHistory.sort((a,b)=>a.date.localeCompare(b.date));
  recalcStreak();
  learnFromWorkout(doneExercises);
  // Reset sets to undone but keep exercises for next session
  state.exercises.forEach(ex=>ex.sets.forEach(s=>s.done=false));
  // Reset selectedDate to today so the workout page shows today's section
  selectedDate=null;
  resetTimer();
  saveState({workout:entry.id, profile:true, memory:true, activeSession:true});
  // Clear active session in Supabase so yesterday's session doesn't bleed into tomorrow
  if(_sb && _sbUser){
    _sb.from('active_session').upsert({
      user_id:_sbUser.id,
      exercises:[],
      exercise_date:todayStr()
    }).catch(()=>{});
  }
  renderWorkoutPage();
  toast('Workout saved! 💪 '+totalKcal+' kcal burned');
}

function getBestForEx(name){let b=0;state.workoutHistory.forEach(w=>{const ex=w.exercises.find(e=>e.name===name);if(ex)ex.sets.forEach(s=>{if(s.w>b)b=s.w;});});return b;}
