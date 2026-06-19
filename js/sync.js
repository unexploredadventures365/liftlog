// LiftLog — Supabase Sync
// Auth, cloud sync, dirty tracking

// ─── SUPABASE INTEGRATION ────────────────────────────────────────────────────
// ⚙️  CONFIGURE: Replace with your Supabase project values
// Get these from: Supabase Dashboard → Settings → API
const SUPABASE_URL = 'https://epdkqvzywhjrmmfiknrq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zl6E61v3Ojz2FhWWeMEIAA_ta1WSm3C';

const _sb = (SUPABASE_URL !== 'YOUR_SUPABASE_URL')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

let _sbUser = null;           // current logged-in user
let _offlineMode = false;     // true = skip all Supabase calls
let _lastSyncTime = null;
let _syncPending = false;
let _syncDebounceTimer = null;

// ── Auth functions ────────────────────────────────────────────────────────────
function setAuthTab(tab){
  document.getElementById('auth-form-login').style.display = tab==='login'?'block':'none';
  document.getElementById('auth-form-signup').style.display = tab==='signup'?'block':'none';
  document.getElementById('auth-tab-login').style.background = tab==='login'?'var(--red)':'transparent';
  document.getElementById('auth-tab-login').style.color = tab==='login'?'#fff':'var(--text2)';
  document.getElementById('auth-tab-signup').style.background = tab==='signup'?'var(--red)':'transparent';
  document.getElementById('auth-tab-signup').style.color = tab==='signup'?'#fff':'var(--text2)';
  document.getElementById('auth-msg').textContent = '';
}

function showAuthError(msg){
  const el = document.getElementById('auth-msg');
  el.textContent = msg;
  el.style.color = 'var(--red)';
}
function showAuthInfo(msg){
  const el = document.getElementById('auth-msg');
  el.textContent = msg;
  el.style.color = '#22c55e';
}

async function authLogin(){
  if(!_sb){showAuthError('Supabase not configured yet. See README.');return;}
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-password').value;
  if(!email||!pass){showAuthError('Enter email and password');return;}
  const btn = document.getElementById('auth-login-btn');
  btn.textContent = 'Signing in…'; btn.disabled = true;
  const {error} = await _sb.auth.signInWithPassword({email, password:pass});
  btn.textContent = 'Sign In →'; btn.disabled = false;
  if(error) showAuthError(error.message);
}

async function authSignup(){
  if(!_sb){showAuthError('Supabase not configured yet. See README.');return;}
  const name  = document.getElementById('auth-name').value.trim();
  const email = document.getElementById('auth-email-signup').value.trim();
  const pass  = document.getElementById('auth-password-signup').value;
  if(!name||!email||!pass){showAuthError('Fill in all fields');return;}
  if(pass.length<6){showAuthError('Password must be at least 6 characters');return;}
  const btn = document.getElementById('auth-signup-btn');
  btn.textContent = 'Creating…'; btn.disabled = true;
  const {error} = await _sb.auth.signUp({
    email, password:pass,
    options:{data:{full_name:name}}
  });
  btn.textContent = 'Create Account →'; btn.disabled = false;
  if(error) showAuthError(error.message);
  else showAuthInfo('✓ Account created! Check your email to confirm, then sign in.');
}

// Auth form navigation
function showLoginForm(){
  document.getElementById('auth-form-login').style.display='block';
  document.getElementById('auth-form-otp').style.display='none';
  document.getElementById('auth-form-forgot').style.display='none';
  document.getElementById('auth-msg').textContent='';
}
function showOtpForm(){
  document.getElementById('auth-form-login').style.display='none';
  document.getElementById('auth-form-otp').style.display='block';
  document.getElementById('auth-form-forgot').style.display='none';
  // Pre-fill email if already typed
  const email=document.getElementById('auth-email').value.trim();
  if(email) document.getElementById('otp-email').value=email;
  document.getElementById('auth-msg').textContent='';
}
function showForgotPassword(){
  document.getElementById('auth-form-login').style.display='none';
  document.getElementById('auth-form-otp').style.display='none';
  document.getElementById('auth-form-forgot').style.display='block';
  // Pre-fill email if already typed
  const email=document.getElementById('auth-email').value.trim();
  if(email) document.getElementById('forgot-email').value=email;
  document.getElementById('auth-msg').textContent='';
}

// OTP sign in — sends 6-digit code, user types it in-app (works inside Telegram)
let _otpEmailSent='';
async function sendOtp(){
  if(!_sb){showAuthError('Supabase not configured yet.');return;}
  const email=document.getElementById('otp-email').value.trim();
  const codeSection=document.getElementById('otp-code-section');
  const btn=document.getElementById('otp-send-btn');

  // If code section is visible, verify the code
  if(codeSection.style.display!=='none'){
    const token=document.getElementById('otp-code').value.trim();
    if(!token||token.length<6){showAuthError('Enter the 6-digit code');return;}
    btn.textContent='Verifying…'; btn.disabled=true;
    const {error}=await _sb.auth.verifyOtp({email:_otpEmailSent, token, type:'email'});
    btn.textContent='Verify Code →'; btn.disabled=false;
    if(error) showAuthError(error.message);
    return;
  }

  // Send the OTP code
  if(!email){showAuthError('Enter your email first');return;}
  btn.textContent='Sending…'; btn.disabled=true;
  const {error}=await _sb.auth.signInWithOtp({
    email,
    options:{shouldCreateUser:false}
  });
  btn.textContent='Send Code →'; btn.disabled=false;
  if(error){
    // If user doesn't exist, show helpful message
    if(error.message.includes('not found')||error.message.includes('not exist')){
      showAuthError('No account found. Please sign up first.');
    } else {
      showAuthError(error.message);
    }
    return;
  }
  _otpEmailSent=email;
  // Show code input
  codeSection.style.display='block';
  btn.textContent='Verify Code →';
  showAuthInfo('✓ Code sent to '+email+' — check your inbox');
}

// Forgot password — sends reset link
async function authForgotPassword(){
  if(!_sb){showAuthError('Supabase not configured yet.');return;}
  const email=document.getElementById('forgot-email').value.trim();
  if(!email){showAuthError('Enter your email');return;}
  const btn=document.getElementById('forgot-btn');
  btn.textContent='Sending…'; btn.disabled=true;
  const {error}=await _sb.auth.resetPasswordForEmail(email,{
    redirectTo:'https://liftlog-mu.vercel.app'
  });
  btn.textContent='Send Reset Link →'; btn.disabled=false;
  if(error) showAuthError(error.message);
  else showAuthInfo('✓ Reset link sent! Check your email.');
}

async function authMagicLink(){
  // Redirect to OTP form instead — magic links don't work inside Telegram
  showOtpForm();
}

async function authLogout(){
  // Close menu immediately
  document.getElementById('user-menu').style.display = 'none';
  
  try{
    if(_sb) await _sb.auth.signOut();
  } catch(e){
    console.warn('signOut error:',e);
  }

  // Reset state regardless of signOut success
  _sbUser = null;
  _offlineMode = false;
  _syncPending = false;
  clearTimeout(_syncDebounceTimer);

  // Clear localStorage so next login starts fresh from cloud
  localStorage.removeItem('liftlog_v1');

  // Update UI
  document.getElementById('user-avatar-btn').style.display = 'none';
  document.getElementById('sync-dot').style.display = 'none';
  document.getElementById('save-status').textContent = '✓ Saved';

  // Show auth screen on top
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('auth-screen').style.zIndex = '9999';

  // Reset auth form to login tab
  setAuthTab('login');
  document.getElementById('auth-msg').textContent = '';

  toast('Signed out successfully');
}

function useOfflineMode(){
  _offlineMode = true;
  document.getElementById('auth-screen').style.display = 'none';
  loadState(); renderAll(); initTelegram();
  toast('Running offline — data saved on this device only');
}

function toggleUserMenu(){
  const m = document.getElementById('user-menu');
  const isOpen = m.style.display === 'block';
  m.style.display = isOpen ? 'none' : 'block';
  if(!isOpen){
    const t = _lastSyncTime ? 'Last sync: '+_lastSyncTime.toLocaleTimeString() : 'Not synced yet';
    document.getElementById('user-menu-sync-time').textContent = t;
    // Delay so this click doesn't immediately trigger closeOutside
    setTimeout(()=>{
      document.addEventListener('click', closeUserMenuOutside, {once:true, capture:true});
    }, 100);
  }
}
function closeUserMenuOutside(e){
  const m=document.getElementById('user-menu');
  if(m && !m.contains(e.target)){
    m.style.display = 'none';
  }
}

// ── Dirty tracking — only sync what changed ───────────────────────────────────
const _dirty = {
  profile: false,
  activeSession: false,
  exerciseMemory: false,
  workouts: new Set(),      // workout IDs to upsert
  deletedWorkouts: new Set(), // workout IDs to delete from Supabase
  weightLog: false,
  foodDates: new Set(),
  stepDates: new Set(),
  customFoods: false
};

function markDirty(type, key){
  if(type==='workout')        _dirty.workouts.add(key);
  else if(type==='deletedWorkout') _dirty.deletedWorkouts.add(key);
  else if(type==='food')      _dirty.foodDates.add(key);
  else if(type==='step')      _dirty.stepDates.add(key);
  else _dirty[type]=true;
}

function clearDirty(){
  _dirty.profile=false; _dirty.activeSession=false;
  _dirty.exerciseMemory=false; _dirty.weightLog=false; _dirty.customFoods=false;
  _dirty.workouts.clear(); _dirty.deletedWorkouts.clear();
  _dirty.foodDates.clear(); _dirty.stepDates.clear();
}

// ── Sync: push only dirty data → Supabase ────────────────────────────────────
async function syncToSupabase(){
  if(!_sb || !_sbUser || _offlineMode) return;
  setSyncDot('syncing');
  try{
    const uid = _sbUser.id;
    const p = [];

    // Profile (streak, calProfile, stepGoal)
    if(_dirty.profile){
      p.push(_sb.from('profiles').upsert({
        id: uid,
        cal_profile: state.calProfile,
        step_goal: state.stepGoal||8000,
        streak: state.streak,
        last_saved: new Date().toISOString()
      }));
    }

    // Active session — always sync (small, fast, important)
    if(_dirty.activeSession){
      p.push(_sb.from('active_session').upsert({
        user_id: uid,
        exercises: state.exercises,
        exercise_date: state.exerciseDate||todayStr()
      }));
    }

    // Exercise memory
    if(_dirty.exerciseMemory){
      p.push(_sb.from('exercise_memory').upsert({
        user_id: uid,
        memory: state.exerciseMemory||{}
      }));
    }

    // Delete removed workouts from Supabase
    if(_dirty.deletedWorkouts.size>0){
      for(const wid of _dirty.deletedWorkouts){
        p.push(_sb.from('workouts').delete().eq('id',wid).eq('user_id',uid));
      }
    }

    // Only changed workouts (upsert)
    if(_dirty.workouts.size>0){
      const changedWorkouts=[...state.workoutHistory]
        .filter(w=>_dirty.workouts.has(w.id))
        .map(w=>({
          id:w.id, user_id:uid, date:w.date,
          exercises:w.exercises,
          total_volume:w.totalVolume||0,
          total_kcal:w.totalKcal||0,
          duration:w.duration||0
        }));
      if(changedWorkouts.length)
        p.push(_sb.from('workouts').upsert(changedWorkouts));
    }

    // Weight log (only if changed)
    if(_dirty.weightLog){
      const wl=(state.weightLog||[]).map(e=>({
        user_id:uid, date:e.date, weight_kg:e.kg, note:e.note||''
      }));
      if(wl.length) p.push(_sb.from('weight_log').upsert(wl,{onConflict:'user_id,date'}));
    }

    // Only changed food dates
    if(_dirty.foodDates.size>0){
      const fl=state.foodLog||{};
      const foodRows=[..._dirty.foodDates]
        .filter(date=>fl[date])
        .map(date=>({
          user_id:uid, date,
          meals:fl[date].meals||{},
          water_ml:fl[date].water||0
        }));
      if(foodRows.length)
        p.push(_sb.from('food_log').upsert(foodRows,{onConflict:'user_id,date'}));
    }

    // Only changed step dates
    if(_dirty.stepDates.size>0){
      const sl=state.stepLog||{};
      const stepRows=[..._dirty.stepDates]
        .filter(date=>sl[date]>0)
        .map(date=>({user_id:uid, date, steps:sl[date]}));
      if(stepRows.length)
        p.push(_sb.from('step_log').upsert(stepRows,{onConflict:'user_id,date'}));
    }

    // Custom foods (only if changed)
    if(_dirty.customFoods){
      const cf=(state.customFoods||[]).map(f=>({user_id:uid, food_data:f}));
      if(cf.length)
        p.push(_sb.from('custom_foods').upsert(cf,{onConflict:'user_id,(food_data->>\'name\')'}));
    }

    if(p.length===0 && _dirty.workouts.size===0 && _dirty.deletedWorkouts.size===0){
      // Nothing dirty — skip
      setSyncDot('ok');
      return;
    }

    await Promise.all(p);
    clearDirty();
    _lastSyncTime = new Date();
    setSyncDot('ok');
    document.getElementById('save-status').textContent='☁ Synced';
  } catch(e){
    console.warn('Sync error:',e);
    setSyncDot('error');
    document.getElementById('save-status').textContent='✓ Local';
  }
}

// ── Sync: pull Supabase → local state ────────────────────────────────────────
async function syncFromSupabase(){
  if(!_sb || !_sbUser) return;
  setSyncDot('syncing');

  // Snapshot local state BEFORE pulling — so we can merge, not overwrite
  const localSnapshot = {
    workoutIds: new Set((state.workoutHistory||[]).map(w=>w.id)),
    localWorkouts: [...(state.workoutHistory||[])],
    localExercises: state.exercises ? JSON.parse(JSON.stringify(state.exercises)) : [],
    exerciseDate: state.exerciseDate,
    localFoodLog: state.foodLog ? JSON.parse(JSON.stringify(state.foodLog)) : {},
    localStepLog: state.stepLog ? JSON.parse(JSON.stringify(state.stepLog)) : {},
    localWeightLog: [...(state.weightLog||[])],
  };

  try{
    const uid = _sbUser.id;

    // ── Profile ───────────────────────────────────────────────────────────────
    const {data:prof} = await _sb.from('profiles').select('*').eq('id',uid).single();
    if(prof){
      if(prof.cal_profile) state.calProfile = prof.cal_profile;
      if(prof.step_goal)   state.stepGoal   = prof.step_goal;
      if(prof.streak)      state.streak     = Math.max(state.streak||0, prof.streak||0);
    }

    // ── Workouts — MERGE by ID, never overwrite ───────────────────────────────
    const {data:wkts} = await _sb.from('workouts').select('*').eq('user_id',uid).order('date',{ascending:true});
    if(wkts && wkts.length){
      // Build map of cloud workouts by ID
      const cloudById = {};
      wkts.forEach(w=>{
        cloudById[w.id] = {
          id:w.id,
          date:(w.date||'').slice(0,10),
          exercises:w.exercises||[],
          totalVolume:w.total_volume||0,
          totalKcal:w.total_kcal||0,
          duration:w.duration||0
        };
      });
      // Build map of local workouts by ID — normalise dates
      const localById = {};
      localSnapshot.localWorkouts.forEach(w=>{
        localById[w.id] = {...w, date:(w.date||'').slice(0,10)};
      });

      // Merge: union of cloud + local, local wins on conflict (local is newer)
      const merged = {};
      // Start with cloud data
      Object.values(cloudById).forEach(w=>{ merged[w.id]=w; });
      // Local overwrites cloud (local changes take priority)
      Object.values(localById).forEach(w=>{ merged[w.id]=w; });

      state.workoutHistory = Object.values(merged)
        .sort((a,b)=>a.date.localeCompare(b.date));
    }

    // ── Active session — only pull if local session is empty ──────────────────
    const {data:sess} = await _sb.from('active_session').select('*').eq('user_id',uid).single();
    if(sess && sess.exercises && sess.exercises.length){
      const savedDate = (sess.exercise_date||'').slice(0,10);
      const today = todayStr();
      if(savedDate === today){
        // Only use cloud session if local session is empty
        const localHasExercises = (localSnapshot.localExercises||[]).length > 0;
        if(!localHasExercises){
          state.exercises = sess.exercises;
          state.exerciseDate = today;
        }
        // If local has exercises — keep local (user was mid-workout)
      }
    }

    // ── Weight log — merge by date, local wins ────────────────────────────────
    const {data:wl} = await _sb.from('weight_log').select('*').eq('user_id',uid).order('date');
    if(wl && wl.length){
      const localByDate = {};
      localSnapshot.localWeightLog.forEach(e=>{ localByDate[e.date]=e; });
      const cloudEntries = wl.map(e=>({
        date:(e.date||'').slice(0,10),
        kg:parseFloat(e.weight_kg),
        note:e.note||''
      }));
      // Merge: cloud fills gaps, local wins on same date
      const merged = {};
      cloudEntries.forEach(e=>{ merged[e.date]=e; });
      Object.values(localByDate).forEach(e=>{ merged[e.date]=e; }); // local wins
      state.weightLog = Object.values(merged).sort((a,b)=>a.date.localeCompare(b.date));
    }

    // ── Food log — merge by date, local wins for today ────────────────────────
    const {data:fl} = await _sb.from('food_log').select('*').eq('user_id',uid);
    if(fl){
      const today = todayStr();
      const merged = {};
      // Start with cloud
      fl.forEach(r=>{
        const d=(r.date||'').slice(0,10);
        if(d) merged[d] = {meals:r.meals||{}, water:r.water_ml||0};
      });
      // Local wins for all dates that exist locally
      Object.entries(localSnapshot.localFoodLog).forEach(([date, log])=>{
        merged[date] = log; // local always wins
      });
      state.foodLog = merged;
    }

    // ── Step log — merge by date, local wins ──────────────────────────────────
    const {data:sl} = await _sb.from('step_log').select('*').eq('user_id',uid);
    if(sl){
      const merged = {...localSnapshot.localStepLog}; // start with local
      sl.forEach(r=>{
        const d=(r.date||'').slice(0,10);
        if(d && !merged[d]) merged[d] = r.steps||0; // cloud fills gaps only
      });
      state.stepLog = merged;
    }

    // ── Exercise memory — merge keys, keep higher count ───────────────────────
    const {data:em} = await _sb.from('exercise_memory').select('*').eq('user_id',uid).single();
    if(em && em.memory){
      const local = state.exerciseMemory||{};
      const cloud = em.memory;
      const merged = {...cloud};
      Object.entries(local).forEach(([k,v])=>{
        if(!merged[k]) merged[k]=v;
        else merged[k].count = Math.max(merged[k].count||0, v.count||0);
      });
      state.exerciseMemory = merged;
    }

    // ── Custom foods — union, no duplicates ───────────────────────────────────
    const {data:cfd} = await _sb.from('custom_foods').select('*').eq('user_id',uid);
    if(cfd && cfd.length){
      const existing = new Set((state.customFoods||[]).map(f=>f.name));
      cfd.forEach(r=>{
        if(!existing.has(r.food_data?.name)){
          state.customFoods = state.customFoods||[];
          state.customFoods.push(r.food_data);
          existing.add(r.food_data?.name);
        }
        if(!FOOD_DB.find(x=>x.name===r.food_data?.name)) FOOD_DB.push(r.food_data);
      });
    }

    // Save merged state to localStorage
    _origSaveState();
    loadCustomExercisesIntoDB();
    _lastSyncTime = new Date();
    setSyncDot('ok');
    document.getElementById('save-status').textContent='☁ Synced';
  } catch(e){
    console.warn('Fetch error:',e);
    setSyncDot('error');
    loadState(); // fall back to localStorage only
  }
}

// ── Patch saveState to mark dirty + debounce sync ────────────────────────────
(function(){
  const _orig = saveState;
  saveState = function(dirtyHint){
    _orig();
    if(_sbUser && !_offlineMode){
      // Mark what changed based on hint passed by callers
      if(dirtyHint){
        if(dirtyHint.workout)        markDirty('workout', dirtyHint.workout);
        if(dirtyHint.deletedWorkout) markDirty('deletedWorkout', dirtyHint.deletedWorkout);
        if(dirtyHint.food)           markDirty('food', dirtyHint.food);
        if(dirtyHint.step)           markDirty('step', dirtyHint.step);
        if(dirtyHint.profile)        markDirty('profile');
        if(dirtyHint.weight)         markDirty('weightLog');
        if(dirtyHint.customFood)     markDirty('customFoods');
        if(dirtyHint.memory)         markDirty('exerciseMemory');
      } else {
        // No hint = mark everything dirty (full sync)
        _dirty.profile=true; _dirty.activeSession=true;
        _dirty.exerciseMemory=true; _dirty.weightLog=true; _dirty.customFoods=true;
        (state.workoutHistory||[]).forEach(w=>_dirty.workouts.add(w.id));
        Object.keys(state.foodLog||{}).forEach(d=>_dirty.foodDates.add(d));
        Object.keys(state.stepLog||{}).forEach(d=>_dirty.stepDates.add(d));
      }
      // Always mark active session dirty (fast, small)
      _dirty.activeSession=true;
      clearTimeout(_syncDebounceTimer);
      setSyncDot('pending'); // will show count immediately
      _syncDebounceTimer = setTimeout(syncToSupabase, 5000); // 5s debounce
    }
  };
})();

// ── Sync indicator dot ────────────────────────────────────────────────────────
function getSyncPendingCount(){
  return _dirty.workouts.size + _dirty.deletedWorkouts.size +
    _dirty.foodDates.size + _dirty.stepDates.size +
    (_dirty.profile?1:0) + (_dirty.activeSession?1:0) +
    (_dirty.weightLog?1:0) + (_dirty.customFoods?1:0) +
    (_dirty.exerciseMemory?1:0);
}

function setSyncDot(status, extra){
  const dot = document.getElementById('sync-dot');
  if(!dot) return;
  dot.style.display = 'block';
  const styles = {
    ok:      'background:#22c55e;color:#fff',
    syncing: 'background:#f97316;color:#fff',
    error:   'background:var(--red);color:#fff',
    pending: 'background:#eab308;color:#000'
  };
  dot.style.cssText = `display:inline-flex;align-items:center;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:700;cursor:default;flex-shrink:0;${styles[status]||styles.ok}`;
  const count = getSyncPendingCount();
  const labels = {
    ok:      '✓ Synced',
    syncing: '↑ Syncing…',
    error:   '⚠ Error',
    pending: count > 0 ? `↑ ${count} pending` : '↑ Pending'
  };
  dot.textContent = labels[status] || '✓ Synced';
  dot.title = {
    ok:'All data synced to cloud',
    syncing:'Uploading changes…',
    error:'Sync failed — data saved locally, will retry',
    pending:`${count} change${count!==1?'s':''} waiting to upload`
  }[status]||'';
}

async function syncNow(){
  document.getElementById('user-menu').style.display = 'none';
  toast('Syncing from cloud…');
  await syncFromSupabase();
  renderAll();
  renderWorkoutPage();
  // Re-render active page
  const activePage=document.querySelector('.page.active');
  if(activePage){
    const pageName=activePage.id.replace('page-','');
    if(pageName==='progress') renderProgress();
    if(pageName==='records') renderRecordsPage();
    if(pageName==='food') renderFoodPage();
    if(pageName==='weight') renderWeightPage();
  }
  toast('Synced ✓ All data up to date');
}

// ── Init: check auth state and boot app ───────────────────────────────────────
async function initSupabase(){
  if(!_sb){
    // Not configured — just run locally
    loadState(); renderAll(); initTelegram();
    return;
  }

  // Listen for auth state changes (fires on login, logout, token refresh)
  _sb.auth.onAuthStateChange(async (event, session)=>{
    if(event==='SIGNED_OUT'){
      _sbUser = null;
      document.getElementById('auth-screen').style.display = 'block';
      return;
    }
    if(session?.user){
      _sbUser = session.user;
      document.getElementById('auth-screen').style.display = 'none';

      // Update user avatar
      const name = session.user.user_metadata?.full_name || session.user.email.split('@')[0];
      const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const avatarBtn = document.getElementById('user-avatar-btn');
      avatarBtn.textContent = initials;
      avatarBtn.style.display = 'block';
      document.getElementById('sync-dot').style.display = 'block';
      document.getElementById('user-menu-name').textContent = name;
      document.getElementById('user-menu-email').textContent = session.user.email;

      // Only do full sync on SIGNED_IN or initial load, not on every token refresh
      if(event==='SIGNED_IN' || event==='INITIAL_SESSION'){
        // Show local data instantly
        loadState();
        renderAll();
        initTelegram();
        setSyncDot('syncing');
        document.getElementById('save-status').textContent='☁ Syncing…';

        // Pull from Supabase first
        await syncFromSupabase();

        // If Supabase had no workouts but we have local data → push everything up
        // This handles first-time sync for existing users
        const localHist=state.workoutHistory||[];
        if(localHist.length>0){
          try{
            const {data:existing}=await _sb.from('workouts')
              .select('id').eq('user_id',_sbUser.id).limit(1);
            const supabaseEmpty=!existing||existing.length===0;
            if(supabaseEmpty){
              // First time — push all local workouts to cloud
              setSyncDot('syncing');
              document.getElementById('save-status').textContent='☁ First sync…';
              const uid=_sbUser.id;
              // Batch in groups of 50
              for(let i=0;i<localHist.length;i+=50){
                const batch=localHist.slice(i,i+50).map(w=>({
                  id:w.id,user_id:uid,date:w.date,
                  exercises:w.exercises,
                  total_volume:w.totalVolume||0,
                  total_kcal:w.totalKcal||0,
                  duration:w.duration||0
                }));
                await _sb.from('workouts').upsert(batch);
              }
              toast('All '+localHist.length+' workouts uploaded to cloud ✓');
            }
          }catch(e){console.warn('First-sync upload error:',e);}
        }

        // Full re-render of everything with fresh cloud data
        renderAll();
        renderWorkoutPage();
        renderWeightPage();
        updateDataPage();
        renderCaloriesPage();
        // Re-render current active page
        const activePage=document.querySelector('.page.active');
        if(activePage){
          const pageName=activePage.id.replace('page-','');
          if(pageName==='progress') renderProgress();
          if(pageName==='records') renderRecordsPage();
          if(pageName==='report') showReport(reportPeriod);
          if(pageName==='food'){renderFoodPage();}
          if(pageName==='steps') renderStepsPanel();
        }
        setSyncDot('ok');
        document.getElementById('save-status').textContent='☁ Synced';
        toast('Welcome back, '+name.split(' ')[0]+'! ☁');
      }
    }
  });

  // Check existing session immediately
  const {data:{session}} = await _sb.auth.getSession();
  if(!session){
    // No session — show auth screen but render app underneath
    loadState(); renderAll(); initTelegram();
    document.getElementById('auth-screen').style.display = 'block';
  }
  // If session exists, onAuthStateChange fires with INITIAL_SESSION automatically
}

loadState();renderAll();initTelegram();initSupabase();
