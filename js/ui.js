// LiftLog — UI & Init
// Telegram integration, app initialisation

// ─── TELEGRAM MINI APP INTEGRATION ───────────────────────────────────────────
const tg=window.Telegram?.WebApp;

function initTelegram(){
  if(!tg) return; // Running as regular web app — all features still work

  // Tell Telegram the app is ready
  tg.ready();

  // Expand to full available height
  tg.expand();

  // Sync Telegram theme colors with our CSS variables
  function applyTgTheme(){
    const tp=tg.themeParams||{};
    const root=document.documentElement;
    // Only sync background and text colors from Telegram theme
    // Never override --red (LiftLog brand color)
    if(tp.bg_color) root.style.setProperty('--bg',tp.bg_color);
    if(tp.secondary_bg_color) root.style.setProperty('--surface',tp.secondary_bg_color);
    if(tp.text_color) root.style.setProperty('--text',tp.text_color);
    if(tp.hint_color) root.style.setProperty('--text3',tp.hint_color);
    // Always keep LiftLog's brand red regardless of Telegram theme
    root.style.setProperty('--red','#E24B4A');
  }
  applyTgTheme();
  tg.onEvent('themeChanged',applyTgTheme);

  // Greet user by Telegram name on first open
  const user=tg.initDataUnsafe?.user;
  if(user?.first_name && !localStorage.getItem('tg_greeted')){
    localStorage.setItem('tg_greeted','1');
    setTimeout(()=>toast('Welcome, '+user.first_name+'! 💪'),800);
  }

  // Back button — show when not on workout page, close/go back when tapped
  tg.BackButton.onClick(()=>{
    const active=document.querySelector('.page.active');
    if(active&&active.id!=='page-workout'){
      showPage('workout');
      tg.BackButton.hide();
    } else {
      tg.close();
    }
  });

  // Show/hide back button based on page
  const origShowPage=showPage;
  window.showPage=function(name){
    origShowPage(name);
    if(name==='workout') tg.BackButton.hide();
    else tg.BackButton.show();
  };

  // Haptic feedback on key interactions
  window._haptic=function(type='light'){
    tg.HapticFeedback?.impactOccurred(type);
  };

  // Prevent Telegram swipe-to-close on scroll
  tg.disableVerticalSwipes?.();

  // Safe area padding for notch/home indicator
  const safeBottom=(tg.safeAreaInset?.bottom||0)+'px';
  document.documentElement.style.setProperty('--safe-bottom', safeBottom);
  document.querySelector('.bottom-nav-spacer')?.style.setProperty('padding-bottom',safeBottom);
}

// ─── INIT
// TOAST
let toastTimer;
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500);}

// INIT
const PAGE_LABELS={workout:'Workout',programs:'Plans',progress:'Progress',records:'Records',report:'Report',calories:'Calories',weight:'Weight',bodyage:'Body Age',data:'Data',food:'Food & Water'};

function toggleDrawer(){
  const drawer=document.getElementById('drawer');
  const overlay=document.getElementById('drawer-overlay');
  const btn=document.getElementById('burger-btn');
  const open=drawer.classList.contains('open');
  drawer.classList.toggle('open',!open);
  overlay.classList.toggle('open',!open);
  btn.classList.toggle('open',!open);
}
function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('open');
  document.getElementById('burger-btn').classList.remove('open');
}

function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.drawer-item').forEach(b=>b.classList.remove('active'));
  const navEl=document.getElementById('nav-'+name);
  if(navEl) navEl.classList.add('active');
  const lbl=document.getElementById('current-page-label');
  if(lbl) lbl.textContent=PAGE_LABELS[name]||name;
  closeDrawer();
  if(name==='progress') renderProgress();
  if(name==='weight') renderWeightPage();
  if(name==='data') updateDataPage();
  if(name==='calories') renderCaloriesPage();
  if(name==='records') renderRecordsPage();
  if(name==='report') showReport(reportPeriod);
  if(name==='programs') renderProgramsPage();
  if(name==='bodyage') renderCaloriesPage(); // pre-fill profile fields
  if(name==='food'){foodDate=todayStr();renderFoodPage();}
  // Stop step counter if navigating away from home
  if(name!=='workout' && _stepListening) stopStepCounter();
}

function renderAll(){
  document.getElementById('streak-count').textContent=state.streak;
  loadCustomExercisesIntoDB();
  renderWorkoutPage();
  renderWeightPage();
  updateDataPage();
  foodDate=todayStr();
  // Show weekly coverage if there's workout history
  if((state.workoutHistory||[]).length>0) setTimeout(renderWeeklyCoverage,100);
}
