// LiftLog — Food Module
// Recipe builder, diet plan, food tabs, quick combo, frequent foods, meal templates, AI meal guesser

// ─── RECIPE BUILDER ───────────────────────────────────────────────────────────
let _recipeIngredients=[]; // [{food, grams}]
let _recipeSearchQ='';

const ALL_RECIPE_FOODS=[...INGREDIENTS_DB]; // will also include FOOD_DB items

function openRecipeBuilder(){
  _recipeIngredients=[];
  _recipeSearchQ='';
  document.getElementById('recipe-name').value='';
  document.getElementById('recipe-search').value='';
  document.getElementById('recipe-modal').style.display='flex';
  document.body.style.overflow='hidden';
  filterRecipeSearch();
  renderRecipeIngredients();
  // Set meal based on time
  const h=new Date().getHours();
  const meal=h<11?'breakfast':h<15?'lunch':h<19?'dinner':'snack';
  document.getElementById('recipe-meal').value=meal;
}

function closeRecipeBuilder(){
  document.getElementById('recipe-modal').style.display='none';
  document.body.style.overflow='';
}

function filterRecipeSearch(){
  _recipeSearchQ=document.getElementById('recipe-search').value.toLowerCase().trim();
  const results=document.getElementById('recipe-search-results');
  if(!_recipeSearchQ){results.innerHTML='<div style="padding:10px 16px;font-size:12px;color:var(--text3)">Type to search ingredients…</div>';return;}

  const allFoods=[...INGREDIENTS_DB,...FOOD_DB.filter(f=>f.cat!=='Custom')];
  const matches=allFoods.filter(f=>f.name.toLowerCase().includes(_recipeSearchQ)).slice(0,12);

  if(!matches.length){results.innerHTML='<div style="padding:10px 16px;font-size:12px;color:var(--text3)">No match — add as custom food first</div>';return;}

  results.innerHTML=matches.map((f,i)=>{
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="addRecipeIngredient(\''+f.name.replace(/'/g,"\\'")+'\')" >'+
      '<div>'+
        '<div style="font-size:13px;font-weight:700;color:var(--text)">'+f.name+'</div>'+
        '<div style="font-size:11px;color:var(--text3)">'+f.kcal+' kcal · P:'+f.protein+'g · C:'+f.carbs+'g · F:'+f.fat+'g per 100g</div>'+
      '</div>'+
      '<span style="font-size:20px;color:var(--red);padding:0 4px">+</span>'+
    '</div>';
  }).join('');
}

function addRecipeIngredient(name){
  const food=[...INGREDIENTS_DB,...FOOD_DB].find(f=>f.name===name);
  if(!food) return;
  // Default amount based on type
  let defaultG=100;
  if(['Oils','Spices'].includes(food.cat)) defaultG=10;
  else if(food.cat==='Dairy'&&food.name.includes('Milk')) defaultG=200;
  else if(food.pieceG) defaultG=food.pieceG;

  _recipeIngredients.push({food, grams:defaultG, unit:'g'});
  document.getElementById('recipe-search').value='';
  _recipeSearchQ='';
  filterRecipeSearch();
  renderRecipeIngredients();
}

function removeRecipeIngredient(idx){
  _recipeIngredients.splice(idx,1);
  renderRecipeIngredients();
}

function updateRecipeGrams(idx, val, unit){
  const mult={g:1,ml:1,tsp:5,tbsp:15,cup:240,piece:1};
  let grams=parseFloat(val)||0;
  if(unit==='piece' && _recipeIngredients[idx].food.pieceG){
    grams=grams*_recipeIngredients[idx].food.pieceG;
  } else {
    grams=grams*(mult[unit]||1);
  }
  _recipeIngredients[idx].grams=grams;
  _recipeIngredients[idx].unit=unit;
  _recipeIngredients[idx].amount=parseFloat(val)||0;
  renderRecipeTotals();
}

function renderRecipeIngredients(){
  const list=document.getElementById('recipe-ingredients-list');
  if(!_recipeIngredients.length){
    list.innerHTML='<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">Search above to add ingredients</div>';
    document.getElementById('recipe-totals').style.display='none';
    return;
  }
  list.innerHTML=_recipeIngredients.map((item,idx)=>{
    const hasPiece=!!item.food.pieceG;
    const unitOpts=['g','ml','tsp','tbsp','cup',...(hasPiece?['piece']:[])];
    const defUnit=item.unit||'g';
    const defAmt=item.amount||(item.grams/(({g:1,ml:1,tsp:5,tbsp:15,cup:240})[defUnit]||1));
    return '<div style="display:flex;align-items:center;gap:6px;padding:7px 0;border-bottom:1px solid var(--border)">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+item.food.name+'</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+Math.round(item.food.kcal*item.grams/100)+' kcal · '+
          (item.food.protein*item.grams/100).toFixed(1)+'g P</div>'+
      '</div>'+
      '<input type="number" value="'+(item.amount||Math.round(item.grams))+'" min="0" inputmode="decimal" '+
        'style="width:60px;padding:5px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;text-align:center" '+
        'onchange="updateRecipeGrams('+idx+',this.value,document.getElementById(\'ru'+idx+'\').value)">'+
      '<select id="ru'+idx+'" style="padding:5px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px" '+
        'onchange="updateRecipeGrams('+idx+',this.previousElementSibling.value,this.value)">'+
        unitOpts.map(u=>'<option value="'+u+'"'+(u===defUnit?' selected':'')+'>'+u+'</option>').join('')+
      '</select>'+
      '<button onclick="removeRecipeIngredient('+idx+')" style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:2px 4px;flex-shrink:0">×</button>'+
    '</div>';
  }).join('');
  renderRecipeTotals();
}

function renderRecipeTotals(){
  const totals={kcal:0,protein:0,carbs:0,fat:0,fibre:0,ca:0,fe:0,vitC:0};
  _recipeIngredients.forEach(item=>{
    const s=item.grams/100;
    totals.kcal+=item.food.kcal*s;
    totals.protein+=item.food.protein*s;
    totals.carbs+=item.food.carbs*s;
    totals.fat+=item.food.fat*s;
    totals.fibre+=item.food.fibre*s;
    totals.ca+=item.food.ca*s;
    totals.fe+=item.food.fe*s;
    totals.vitC+=item.food.vitC*s;
  });
  const tot=document.getElementById('recipe-totals');
  if(!tot) return;
  tot.style.display='block';
  tot.innerHTML='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text3);margin-bottom:6px">Recipe Total</div>'+
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">'+
    [
      {label:'Calories',val:Math.round(totals.kcal),unit:'kcal',color:'var(--red)'},
      {label:'Protein',val:totals.protein.toFixed(1),unit:'g',color:'#185FA5'},
      {label:'Carbs',val:totals.carbs.toFixed(1),unit:'g',color:'#f97316'},
      {label:'Fat',val:totals.fat.toFixed(1),unit:'g',color:'#eab308'},
      {label:'Fibre',val:totals.fibre.toFixed(1),unit:'g',color:'#22c55e'},
      {label:'Calcium',val:Math.round(totals.ca),unit:'mg',color:'#7c3aed'},
      {label:'Iron',val:totals.fe.toFixed(1),unit:'mg',color:'#dc2626'},
      {label:'Vit C',val:Math.round(totals.vitC),unit:'mg',color:'#d97706'},
    ].map(t=>
      '<div style="text-align:center;background:var(--surface);border-radius:8px;padding:6px 2px">'+
        '<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:var(--text3)">'+t.label+'</div>'+
        '<div style="font-family:var(--font-cond);font-weight:900;font-size:15px;color:'+t.color+'">'+t.val+'</div>'+
        '<div style="font-size:9px;color:var(--text3)">'+t.unit+'</div>'+
      '</div>'
    ).join('')+'</div>';
}

function clearRecipe(){
  _recipeIngredients=[];
  document.getElementById('recipe-name').value='';
  document.getElementById('recipe-search').value='';
  filterRecipeSearch();
  renderRecipeIngredients();
}

function logRecipe(){
  if(!_recipeIngredients.length){toast('Add at least one ingredient');return;}
  const name=document.getElementById('recipe-name').value.trim()||'My Recipe';
  const meal=document.getElementById('recipe-meal').value;

  // Compute total nutrition for all ingredients
  const totals={kcal:0,protein:0,carbs:0,fat:0,fibre:0,ca:0,fe:0,vitC:0,vitA:0,zinc:0,potassium:0,b1:0,b2:0,b3:0};
  let totalGrams=0;
  _recipeIngredients.forEach(item=>{
    const s=item.grams/100;
    Object.keys(totals).forEach(k=>{totals[k]+=(item.food[k]||0)*s;});
    totalGrams+=item.grams;
  });

  // Create a "food" entry scaled per 100g of the whole recipe
  // Then log it as totalGrams grams of that food
  const recipeFood={
    name,
    cat:'Recipe',
    kcal:Math.round(totals.kcal/totalGrams*100),
    protein:parseFloat((totals.protein/totalGrams*100).toFixed(1)),
    carbs:parseFloat((totals.carbs/totalGrams*100).toFixed(1)),
    fat:parseFloat((totals.fat/totalGrams*100).toFixed(1)),
    fibre:parseFloat((totals.fibre/totalGrams*100).toFixed(1)),
    ca:Math.round(totals.ca/totalGrams*100),
    fe:parseFloat((totals.fe/totalGrams*100).toFixed(2)),
    vitC:Math.round(totals.vitC/totalGrams*100),
    vitA:Math.round(totals.vitA/totalGrams*100),
    zinc:parseFloat((totals.zinc/totalGrams*100).toFixed(2)),
    potassium:Math.round(totals.potassium/totalGrams*100),
    b1:parseFloat((totals.b1/totalGrams*100).toFixed(3)),
    b2:parseFloat((totals.b2/totalGrams*100).toFixed(3)),
    b3:parseFloat((totals.b3/totalGrams*100).toFixed(3)),
    _custom:true,_recipe:true,
    _ingredients:_recipeIngredients.map(i=>i.food.name+' '+Math.round(i.grams)+'g').join(', ')
  };

  // Save to custom foods for future use
  if(!state.customFoods) state.customFoods=[];
  if(!FOOD_DB.find(f=>f.name===name)){
    FOOD_DB.push(recipeFood);
    state.customFoods.push(recipeFood);
  }

  // Log it
  const log=getFoodLog();
  log.meals[meal].push({...recipeFood, grams:totalGrams, unit:'g', amount:totalGrams});
  state.foodLog[foodDate]=log;
  saveState({food:foodDate});
  closeRecipeBuilder();
  renderFoodPage();
  if(homeMode==='food') renderHomeFoodPanel();
  toast(name+' logged — '+Math.round(totals.kcal)+' kcal ✓');
}

// ─── FOOD DATABASE (per 100g) ─────────────────────────────────────────────────

// Daily RDA targets — protein is dynamic (1.5g × bodyweight kg)
function getRDA(){
  const p=state.calProfile||{};
  const bw=p.wt||75;
  const age=p.age||28;
  const gender=p.gender||'male';
  const fit=p.fit||'intermediate';
  // Mifflin-St Jeor BMR
  const bmr=gender==='male'
    ? 10*bw + 6.25*(p.ht||170) - 5*age + 5
    : 10*bw + 6.25*(p.ht||165) - 5*age - 161;
  const actMult={beginner:1.375, intermediate:1.55, advanced:1.725}[fit]||1.55;
  const kcal=Math.round(bmr*actMult);
  const protein=Math.round(bw*1.5);            // 1.5g/kg
  const fat=Math.round(kcal*0.25/9);           // 25% of kcal from fat
  const carbs=Math.round((kcal-protein*4-fat*9)/4); // remaining from carbs
  const waterMl=p.waterGoal||(Math.round(bw*35/100)*100); // 35ml/kg, rounded to 100ml
  return {
    kcal, protein, carbs, fat, fibre:30,
    water:waterMl,
    ca:gender==='female'?1200:1000,
    fe:gender==='female'?21:17,
    vitC:65, vitA:gender==='male'?900:700,
    zinc:gender==='male'?12:9,
    potassium:3500, b1:1.4, b2:1.6, b3:gender==='male'?18:14
  };
}
// Keep RDA as a getter so it always reflects current profile
const RDA=new Proxy({},{get:(_,k)=>getRDA()[k]});

// Food log state
let foodDate=todayStr();
let _fSelectedMeal='breakfast';
let _fSelectedFood=null;
let _fCatFilter='All';
let _fSearchQ='';

function foodDateShift(d){
  const dt=new Date(foodDate); dt.setDate(dt.getDate()+d);
  foodDate=dt.toISOString().slice(0,10);
  renderFoodPage();
  if(homeMode==='food') renderHomeFoodPanel();
}

function getFoodLog(){
  if(!state.foodLog) state.foodLog={};
  if(!state.foodLog[foodDate]) state.foodLog[foodDate]={meals:{breakfast:[],lunch:[],dinner:[],snack:[]},water:0};
  return state.foodLog[foodDate];
}

function getDayTotals(log){
  const meals=log.meals||{};
  const all=[...Object.values(meals)].flat();
  const tot={kcal:0,protein:0,carbs:0,fat:0,fibre:0,ca:0,fe:0,vitC:0,vitA:0,zinc:0,potassium:0,b1:0,b2:0,b3:0};
  all.forEach(e=>{
    const scale=e.grams/100;
    Object.keys(tot).forEach(k=>{tot[k]+=(e[k]||0)*scale;});
  });
  return tot;
}

function renderFoodPage(){
  renderDietPlanBanner();
  const log=getFoodLog();
  // Header date
  const dl=document.getElementById('food-date-label');
  const isToday=foodDate===todayStr();
  const isYest=foodDate===new Date(Date.now()-86400000).toISOString().slice(0,10);
  dl.textContent=isToday?'Today':isYest?'Yesterday':foodDate;

  // Water
  renderWater(log);

  // Totals
  const tot=getDayTotals(log);
  document.getElementById('food-total-kcal').textContent=Math.round(tot.kcal)+' kcal';
  const ptLabel=document.getElementById('food-protein-target-label');
  if(ptLabel) ptLabel.textContent=`Protein target: ${Math.round((state.calProfile.wt||75)*1.5)}g (1.5× BW)`;
  renderMacroBars(tot);
  renderMicroBars(tot);

  // Meal log
  renderMealLog(log);
}

function renderWater(log){
  const rda=getRDA();
  const goalMl=rda.water||2000;
  const cupMl=250;
  const totalCups=Math.round(goalMl/cupMl);
  const filledCups=Math.min(totalCups,Math.round((log.water||0)/cupMl));
  const pct=Math.min(100,Math.round((log.water||0)/goalMl*100));
  const disp=document.getElementById('water-display');
  if(disp) disp.innerHTML=`<span style="color:${pct>=100?'#22c55e':'#185FA5'}">${((log.water||0)/1000).toFixed(1)}L</span> <span style="color:var(--text3);font-size:14px">/ ${(goalMl/1000).toFixed(1)}L goal</span>`;
  const wrap=document.getElementById('water-glasses'); if(!wrap) return;
  wrap.innerHTML='';
  for(let i=0;i<totalCups;i++){
    const g=document.createElement('div');
    g.className='water-glass'+(i<filledCups?' filled':'');
    g.textContent=i<filledCups?'💧':'○';
    g.title=(i+1)*cupMl+'ml';
    g.onclick=()=>{log.water=Math.max(0,(i+1)*cupMl);if(i<filledCups)log.water=i*cupMl;saveState({food:foodDate});renderFoodPage();};
    wrap.appendChild(g);
  }
}

function addWater(ml){const log=getFoodLog();log.water=(log.water||0)+ml;saveState({food:foodDate});renderFoodPage();if(homeMode==='food')renderHomeFoodPanel();}
function resetWater(){const log=getFoodLog();log.water=0;saveState({food:foodDate});renderFoodPage();if(homeMode==='food')renderHomeFoodPanel();}

function renderMacroBars(tot){
  const rda=getRDA();
  const log=getFoodLog();
  const waterMl=log.water||0;
  const macros=[
    {key:'kcal',   label:'Calories', unit:'kcal',color:'#E24B4A', target:rda.kcal},
    {key:'protein',label:'Protein',  unit:'g',   color:'#185FA5', target:rda.protein},
    {key:'carbs',  label:'Carbs',    unit:'g',   color:'#f97316', target:rda.carbs},
    {key:'fat',    label:'Fat',      unit:'g',   color:'#eab308', target:rda.fat},
    {key:'fibre',  label:'Fibre',    unit:'g',   color:'#22c55e', target:rda.fibre},
  ];
  const macroHTML=macros.map(m=>{
    const val=m.key==='kcal'?Math.round(tot[m.key]||0):((tot[m.key]||0).toFixed(1));
    const pct=Math.min(100,Math.round((parseFloat(val)||0)/m.target*100));
    const over=parseFloat(val)>m.target;
    return '<div class="macro-bar-row">'+
      '<div class="macro-bar-label"><span style="font-size:12px">'+m.label+'</span>'+
      '<span style="color:'+(over?'#dc2626':m.color)+'">'+val+m.unit+
      ' <span style="color:var(--text3);font-weight:400">/ '+m.target+m.unit+'</span></span></div>'+
      '<div class="macro-bar-track"><div class="macro-bar-fill" style="width:'+pct+'%;background:'+(over?'#dc2626':m.color)+'"></div></div>'+
    '</div>';
  }).join('');
  // Water bar
  const waterPct=Math.min(100,Math.round(waterMl/rda.water*100));
  const waterColor=waterPct>=100?'#22c55e':'#185FA5';
  const waterHTML='<div class="macro-bar-row">'+
    '<div class="macro-bar-label"><span style="font-size:12px">💧 Water</span>'+
    '<span style="color:'+waterColor+'">'+(waterMl/1000).toFixed(1)+'L'+
    ' <span style="color:var(--text3);font-weight:400">/ '+(rda.water/1000).toFixed(1)+'L</span></span></div>'+
    '<div class="macro-bar-track"><div class="macro-bar-fill" style="width:'+waterPct+'%;background:'+waterColor+'"></div></div>'+
  '</div>';
  document.getElementById('food-macro-bars').innerHTML=macroHTML+waterHTML;
}

function renderMicroBars(tot){
  const micros=[
    {key:'ca',label:'Calcium',unit:'mg',color:'#7c3aed'},
    {key:'fe',label:'Iron',unit:'mg',color:'#dc2626'},
    {key:'vitC',label:'Vit C',unit:'mg',color:'#d97706'},
    {key:'vitA',label:'Vit A',unit:'µg',color:'#065f46'},
    {key:'zinc',label:'Zinc',unit:'mg',color:'#0891b2'},
    {key:'potassium',label:'Potassium',unit:'mg',color:'#be185d'},
    {key:'b1',label:'B1 Thiamine',unit:'mg',color:'#854d0e'},
    {key:'b2',label:'B2 Riboflavin',unit:'mg',color:'#166534'},
    {key:'b3',label:'B3 Niacin',unit:'mg',color:'#1e3a5f'},
  ];
  document.getElementById('food-micro-bars').innerHTML=micros.map(m=>{
    const pct=Math.min(100,Math.round((tot[m.key]||0)/RDA[m.key]*100));
    const val=(tot[m.key]||0).toFixed(1);
    return `<div class="micro-item">
      <div class="micro-label" style="display:flex;justify-content:space-between">
        <span>${m.label}</span><span style="color:${pct>=100?m.color:'var(--text3)'}">${val}${m.unit}</span>
      </div>
      <div class="micro-bar-track"><div class="micro-bar-fill" style="width:${pct}%;background:${m.color}"></div></div>
    </div>`;
  }).join('');
}

function renderMealLog(log){
  const meals=['breakfast','lunch','dinner','snack'];
  const mealLabels={breakfast:'🌅 Breakfast',lunch:'☀️ Lunch',dinner:'🌙 Dinner',snack:'🍎 Snacks'};
  const wrap=document.getElementById('food-meal-log'); wrap.innerHTML='';
  meals.forEach(meal=>{
    const items=log.meals[meal]||[];
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
      <button onclick="removeFoodLog('${meal}',${idx})" style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:4px">×</button>`;
      sec.appendChild(row);
    });
    wrap.appendChild(sec);
  });
  if(!wrap.children.length) wrap.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">No food logged yet — tap + Add Food</div>';
}

function removeFoodLog(meal,idx){
  const log=getFoodLog();
  (log.meals[meal]||[]).splice(idx,1);
  saveState({food:foodDate});
  renderFoodPage();
  if(homeMode==='food') renderHomeFoodPanel();
}

// FOOD SEARCH MODAL
function openFoodSearch(){
  document.getElementById('food-modal').style.display='flex';
  document.body.style.overflow='hidden';
  _fCatFilter='All'; _fSearchQ='';
  const inp=document.getElementById('food-search-inp');
  if(inp) inp.value='';
  renderFoodCategoryChips();
  renderFoodSearchList();
  // Auto-detect meal from time of day if not set
  const h=new Date().getHours();
  const meal=h<11?'breakfast':h<15?'lunch':h<19?'dinner':'snack';
  setFoodMeal(meal);
}
function closeFoodModal(){
  document.getElementById('food-modal').style.display='none';
  document.body.style.overflow='';
}
function setFoodMeal(meal){
  _fSelectedMeal=meal;
  document.querySelectorAll('.food-meal-btn').forEach(b=>b.classList.toggle('active',b.id==='fmeal-'+meal));
}
function renderFoodCategoryChips(){
  const allCats=[...new Set(FOOD_DB.map(f=>f.cat))].sort();
  // Custom always first, Community at end
  const cats=['All','Community',...allCats.filter(c=>c==='Custom'),...allCats.filter(c=>c!=='Custom'&&c!=='Community')];
  document.getElementById('food-cat-chips').innerHTML=cats.map(c=>{
    const label=c==='Custom'?'⭐ Mine':c==='Community'?'🌍 Community':c;
    return `<div class="food-cat-chip${c===_fCatFilter?' active':''}" onclick="setFoodCat('${c}')">${label}</div>`;
  }).join('');
}
function setFoodCat(cat){
  _fCatFilter=cat;
  document.querySelectorAll('.food-cat-chip').forEach(c=>{
    const label=c.textContent;
    const match=(cat==='Community'&&label==='🌍 Community')||(cat==='Custom'&&label==='⭐ Mine')||(label===cat);
    c.classList.toggle('active',match);
  });
  if(cat==='Community'){
    loadCommunityFoods().then(()=>renderFoodSearchList());
  } else {
    renderFoodSearchList();
  }
}
function filterFoodSearch(){
  _fSearchQ=document.getElementById('food-search-inp').value.toLowerCase();
  renderFoodSearchList();
}
function renderFoodSearchList(){
  const list=document.getElementById('food-search-list');
  if(!list) return;
  const foods=FOOD_DB.filter(f=>{
    if(_fCatFilter!=='All'&&f.cat!==_fCatFilter) return false;
    if(_fSearchQ&&!f.name.toLowerCase().includes(_fSearchQ)&&!f.cat.toLowerCase().includes(_fSearchQ)) return false;
    return true;
  });

  if(!foods.length){
    list.innerHTML='<div style="text-align:center;padding:30px;color:var(--text3);font-size:13px">No foods found — add it as custom below</div>';
    return;
  }

  // Group by category when showing All with no search
  let html='';
  if(_fCatFilter==='All'&&!_fSearchQ){
    const bycat={};
    foods.forEach(f=>(bycat[f.cat]||(bycat[f.cat]=[])).push(f));
    // Custom at top if any
    const order=['Custom',...Object.keys(bycat).filter(c=>c!=='Custom').sort()];
    order.forEach(cat=>{
      if(!bycat[cat]) return;
      html+=`<div class="food-section-hdr">${cat==='Custom'?'⭐ My Custom Foods':cat}</div>`;
      html+=bycat[cat].map(f=>foodItemHTML(f)).join('');
    });
  } else {
    html=foods.map(f=>foodItemHTML(f)).join('');
  }
  list.innerHTML=html;
}
function foodItemHTML(f){
  const isCustom=f._custom&&!f._community?'<span style="font-size:9px;background:var(--surface2);color:var(--text3);padding:2px 5px;border-radius:4px;font-weight:700;margin-left:4px">MINE</span>':'';
  const isCommunity=f._community?`<span style="font-size:9px;background:rgba(99,102,241,.15);color:#6366f1;padding:2px 5px;border-radius:4px;font-weight:700;margin-left:4px">🌍 ${f._contributor||'Community'}</span>`:'';
  return `<div class="food-item" onclick="openFoodQty('${f.name.replace(/'/g,"\\'")}')">
    <div style="flex:1;min-width:0">
      <div class="food-item-name">${f.name}${isCustom}${isCommunity}</div>
      <div class="food-item-meta">${f.cat} · P:${f.protein}g C:${f.carbs}g Fat:${f.fat}g Fibre:${f.fibre}g <span style="color:var(--text3)">per 100g</span></div>
    </div>
    <div class="food-item-kcal">${f.kcal}</div>
  </div>`;
}

// FOOD QUANTITY MODAL
let _fQtyFood=null;
function openFoodQty(name){
  _fQtyFood=FOOD_DB.find(f=>f.name===name);
  if(!_fQtyFood) return;
  document.getElementById('fqty-name').textContent=_fQtyFood.name;

  // Default to 'piece' with food-specific amount if available, else grams
  const hasPiece=!!_fQtyFood.pieceG;
  const amtEl=document.getElementById('fqty-amount');
  const unitEl=document.getElementById('fqty-unit');

  // Rebuild unit options with food-specific piece label
  const pieceLabel=_fQtyFood.pieceLabel||'piece';
  unitEl.innerHTML=`
    <option value="g">grams (g)</option>
    <option value="ml">ml</option>
    ${hasPiece?`<option value="piece">${pieceLabel}</option>`:'<option value="piece">piece (≈100g)</option>'}
    <option value="serving">serving (≈1 plate)</option>
    <option value="cup">cup (≈240g)</option>
    <option value="tbsp">tbsp (≈15g)</option>
    <option value="tsp">tsp (≈5g)</option>
  `;

  if(hasPiece){
    unitEl.value='piece';
    amtEl.value=1;
  } else {
    unitEl.value='g';
    amtEl.value=100;
  }

  renderFoodQtyNutrition();
  updateQtyPreview();
  document.getElementById('food-qty-modal').style.display='flex';
}
function renderFoodQtyNutrition(){
  const f=_fQtyFood;
  const items=[
    {label:'Calories',val:f.kcal,unit:'kcal',color:'var(--red)'},
    {label:'Protein',val:f.protein,unit:'g',color:'#185FA5'},
    {label:'Carbs',val:f.carbs,unit:'g',color:'#f97316'},
    {label:'Fat',val:f.fat,unit:'g',color:'#eab308'},
    {label:'Fibre',val:f.fibre,unit:'g',color:'#22c55e'},
    {label:'Calcium',val:f.ca,unit:'mg',color:'#7c3aed'},
    {label:'Iron',val:f.fe,unit:'mg',color:'#dc2626'},
    {label:'Vit C',val:f.vitC,unit:'mg',color:'#d97706'},
    {label:'Vit A',val:f.vitA,unit:'µg',color:'#065f46'},
  ];
  document.getElementById('fqty-nutrition').innerHTML=items.map(i=>
    `<div style="text-align:center;background:var(--surface2);border-radius:8px;padding:6px 4px">
      <div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase">${i.label}</div>
      <div style="font-family:var(--font-cond);font-weight:900;font-size:16px;color:${i.color}">${i.val}</div>
      <div style="font-size:9px;color:var(--text3)">${i.unit}/100g</div>
    </div>`
  ).join('');
}
function getUnitGrams(unit,amount,food){
  // If food has a specific piece weight, use that instead of generic 150g
  if(unit==='piece' && food && food.pieceG) return food.pieceG * amount;
  const mult={g:1,ml:1,serving:300,piece:100,cup:240,tbsp:15,tsp:5};
  return (mult[unit]||1)*amount;
}
function updateQtyPreview(){
  const f=_fQtyFood; if(!f) return;
  const amt=parseFloat(document.getElementById('fqty-amount').value)||1;
  const unit=document.getElementById('fqty-unit').value;
  const g=getUnitGrams(unit,amt,f);
  const scale=g/100;
  const kcal=Math.round(f.kcal*scale);
  const protein=(f.protein*scale).toFixed(1);
  const carbs=(f.carbs*scale).toFixed(1);
  const fat=(f.fat*scale).toFixed(1);
  document.getElementById('fqty-preview').innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px">
      <div style="text-align:center;background:var(--surface);border-radius:8px;padding:8px 4px">
        <div style="font-family:var(--font-cond);font-weight:900;font-size:20px;color:var(--red)">${kcal}</div>
        <div style="font-size:10px;color:var(--text3)">kcal</div>
      </div>
      <div style="text-align:center;background:var(--surface);border-radius:8px;padding:8px 4px">
        <div style="font-family:var(--font-cond);font-weight:900;font-size:20px;color:#185FA5">${protein}g</div>
        <div style="font-size:10px;color:var(--text3)">protein</div>
      </div>
      <div style="text-align:center;background:var(--surface);border-radius:8px;padding:8px 4px">
        <div style="font-family:var(--font-cond);font-weight:900;font-size:20px;color:#f97316">${carbs}g</div>
        <div style="font-size:10px;color:var(--text3)">carbs</div>
      </div>
      <div style="text-align:center;background:var(--surface);border-radius:8px;padding:8px 4px">
        <div style="font-family:var(--font-cond);font-weight:900;font-size:20px;color:#eab308">${fat}g</div>
        <div style="font-size:10px;color:var(--text3)">fat</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);text-align:center">
      Using <b style="color:var(--text)">${Math.round(g)}g</b> total &nbsp;·&nbsp; 
      per 100g: ${f.kcal} kcal, ${f.protein}g protein
    </div>`;
}

function confirmAddFood(){
  const f=_fQtyFood; if(!f) return;
  const amt=parseFloat(document.getElementById('fqty-amount').value)||1;
  const unit=document.getElementById('fqty-unit').value;
  const g=getUnitGrams(unit,amt,f);
  const log=getFoodLog();
  const entry={...f,grams:Math.round(g),unit,amount:amt};
  log.meals[_fSelectedMeal].push(entry);
  if(!state.foodLog) state.foodLog={};
  state.foodLog[foodDate]=log;
  saveState({food:foodDate});
  document.getElementById('food-qty-modal').style.display='none';
  renderFoodPage();
  if(homeMode==='food') renderHomeFoodPanel();
  toast(`Added ${f.name} to ${_fSelectedMeal}!`);
}
function toggleCustomForm(){
  const exp=document.getElementById('cf-expanded');
  const col=document.getElementById('cf-collapsed');
  const btn=document.getElementById('cf-toggle');
  if(!exp) return;
  const isExpanded=exp.style.display!=='none';
  exp.style.display=isExpanded?'none':'block';
  col.style.display=isExpanded?'flex':'none';
  btn.textContent=isExpanded?'▼ Expand':'▲ Collapse';
}

function addCustomFood(){
  const name=document.getElementById('cf-name').value.trim();
  const kcal=parseFloat(document.getElementById('cf-kcal').value)||0;
  const protein=parseFloat(document.getElementById('cf-protein')?.value)||0;
  const carbs=parseFloat(document.getElementById('cf-carbs')?.value)||0;
  const fat=parseFloat(document.getElementById('cf-fat')?.value)||0;
  const fibre=parseFloat(document.getElementById('cf-fibre')?.value)||0;
  const cat=document.getElementById('cf-cat')?.value||'Custom';
  const isPublic=document.getElementById('cf-public')?.checked||false;

  if(!name){toast('Enter a food name');return;}
  if(!kcal){toast('Enter calories per 100g');return;}
  if(FOOD_DB.find(f=>f.name.toLowerCase()===name.toLowerCase())){
    toast('Food already exists — search for it above');return;
  }

  const f={name,cat,kcal,protein,carbs,fat,fibre,
    ca:0,fe:0,vitC:0,vitA:0,zinc:0,potassium:0,b1:0,b2:0,b3:0,_custom:true};
  FOOD_DB.push(f);
  if(!state.customFoods) state.customFoods=[];
  state.customFoods.push(f);
  saveState({customFood:true});

  // If public — push to community_foods table
  if(isPublic && _sb && _sbUser){
    const displayName=document.getElementById('user-menu-name')?.textContent||'LiftLog User';
    _sb.from('community_foods').insert({
      user_id:_sbUser.id,
      display_name:displayName,
      food_data:f
    }).then(({error})=>{
      if(!error) toast('"'+name+'" shared with community! 🌍');
    });
  }

  // Clear all fields
  ['cf-name','cf-kcal','cf-protein','cf-carbs','cf-fat','cf-fibre'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const pfEl=document.getElementById('cf-public'); if(pfEl) pfEl.checked=false;
  // Collapse back to simple view
  const exp=document.getElementById('cf-expanded');
  const col=document.getElementById('cf-collapsed');
  const btn=document.getElementById('cf-toggle');
  if(exp) exp.style.display='none';
  if(col) col.style.display='flex';
  if(btn) btn.textContent='▼ Expand';

  renderFoodSearchList();
  renderFoodCategoryChips();
  openFoodQty(name);
  if(!isPublic) toast('"'+name+'" saved! '+kcal+' kcal · P:'+protein+'g C:'+carbs+'g Fat:'+fat+'g Fibre:'+fibre+'g');
}

// ─── DIET PLAN FEATURE ───────────────────────────────────────────────────────

function openDietPlanImport(){
  document.getElementById('diet-plan-modal').style.display='flex';
  document.getElementById('diet-plan-input').value='';
  document.getElementById('diet-plan-parse-preview').innerHTML='';
}
function closeDietPlanModal(){
  document.getElementById('diet-plan-modal').style.display='none';
}
function openDietPlanManager(){
  document.getElementById('diet-plan-manager-modal').style.display='flex';
  renderDietPlanManager();
}
function closeDietPlanManager(){
  document.getElementById('diet-plan-manager-modal').style.display='none';
}

function parseDietPlanText(text){
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  const plan={name:'My Diet Plan',days:14,rotation:[],startDate:todayStr()};
  let currentDay=null;
  lines.forEach(line=>{
    const lower=line.toLowerCase();
    if(lower.startsWith('plan:')){ plan.name=line.split(':').slice(1).join(':').trim(); return; }
    if(lower.startsWith('days:')){ plan.days=parseInt(line.split(':')[1])||14; return; }
    if(lower.match(/^day\s*\d+/)){
      const dayNum=parseInt(lower.match(/\d+/)[0]);
      currentDay={day:dayNum,breakfast:[],lunch:[],dinner:[],snack:[]};
      plan.rotation.push(currentDay); return;
    }
    if(currentDay&&lower.match(/^(breakfast|lunch|dinner|snack):/)){
      const [meal,...rest]=line.split(':');
      currentDay[meal.trim().toLowerCase()]=rest.join(':').split(',').map(f=>f.trim()).filter(Boolean);
    }
  });
  if(!plan.rotation.length){
    const day1={day:1,breakfast:[],lunch:[],dinner:[],snack:[]};
    lines.forEach(line=>{
      const lower=line.toLowerCase();
      if(lower.match(/^(breakfast|lunch|dinner|snack):/)){
        const [meal,...rest]=line.split(':');
        day1[meal.trim().toLowerCase()]=rest.join(':').split(',').map(f=>f.trim()).filter(Boolean);
      }
    });
    if(Object.values(day1).some(v=>Array.isArray(v)&&v.length)) plan.rotation.push(day1);
  }
  return plan;
}

function matchPlanFood(str){
  if(!str) return {name:str,matched:false,grams:100};
  const qtyMatch=str.match(/^(\d+(?:\.\d+)?)\s*(g|ml|cup|cups|piece|pieces|roti|idli|x)?\s+(.+)/i);
  let qty=1,grams=100,name=str;
  if(qtyMatch){
    qty=parseFloat(qtyMatch[1]);
    const unit=(qtyMatch[2]||'').toLowerCase();
    name=qtyMatch[3].trim();
    if(unit==='g'||unit==='ml') grams=qty;
  }
  const nameLower=name.toLowerCase();
  let best=null,bestScore=0;
  FOOD_DB.forEach(f=>{
    const fn=f.name.toLowerCase();
    let score=0;
    if(fn===nameLower) score=100;
    else if(fn.startsWith(nameLower)) score=80;
    else if(fn.includes(nameLower)) score=60;
    else { nameLower.split(' ').filter(w=>w.length>3).forEach(w=>{ if(fn.includes(w)) score+=20; }); }
    if(score>bestScore){bestScore=score;best=f;}
  });
  if(!best||bestScore<20) return {name:str,matched:false,grams:100};
  if(grams===100&&best.pieceG&&qty>1) grams=best.pieceG*qty;
  else if(grams===100&&qty>1) grams=qty*(best.pieceG||100);
  return {name:best.name,matched:true,grams,food:best,
    kcal:Math.round(best.kcal*grams/100),
    protein:parseFloat((best.protein*grams/100).toFixed(1))};
}

function parseDietPlan(){
  const text=document.getElementById('diet-plan-input').value.trim();
  if(!text){toast('Paste your diet plan first');return;}
  const plan=parseDietPlanText(text);
  if(!plan.rotation.length){
    document.getElementById('diet-plan-parse-preview').innerHTML=
      '<div style="color:var(--red);font-size:13px;padding:8px">Could not parse — check the format.</div>';
    return;
  }
  const day1=plan.rotation[0];
  const meals=['breakfast','lunch','dinner','snack'];
  let totalKcal=0;
  let html=`<div style="background:var(--surface2);border-radius:10px;padding:12px;margin-bottom:10px">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px">✓ <span style="color:var(--red)">${plan.name}</span> · ${plan.days} days · ${plan.rotation.length}-day rotation</div>`;
  meals.forEach(meal=>{
    const items=day1[meal]||[];
    if(!items.length) return;
    const matched=items.map(f=>matchPlanFood(f));
    const mealKcal=matched.reduce((a,m)=>a+(m.kcal||0),0);
    totalKcal+=mealKcal;
    html+=`<div style="margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:3px">${meal} · ~${mealKcal} kcal</div>
      ${matched.map(m=>`<div style="font-size:12px;padding:2px 0;color:${m.matched?'var(--text)':'var(--text3)'}">
        ${m.matched?'✓':'⚠'} ${m.name}${m.matched?' · '+m.grams+'g · '+m.kcal+' kcal':''}
      </div>`).join('')}
    </div>`;
  });
  html+=`<div style="font-size:14px;font-weight:700;color:var(--red);border-top:1px solid var(--border);padding-top:8px">~${totalKcal} kcal/day</div></div>
  <button class="btn-primary" onclick="activateDietPlan()" style="width:100%;font-size:15px;padding:13px">✓ Start Plan from Today</button>`;
  document.getElementById('diet-plan-parse-preview').innerHTML=html;
  window._parsedPlan=plan;
}

function activateDietPlan(){
  if(!window._parsedPlan){toast('Parse a plan first');return;}
  const plan=window._parsedPlan;
  plan.startDate=todayStr(); plan.active=true;
  if(!state.dietPlans) state.dietPlans=[];
  state.dietPlans.forEach(p=>p.active=false);
  state.dietPlans.push(plan);
  state.activeDietPlan=plan;
  saveState({profile:true});
  closeDietPlanModal();
  renderDietPlanBanner();
  renderFoodPage();
  toast('"'+plan.name+'" started! '+plan.days+' days 🥗');
}

function getDietPlanDay(){
  const plan=state.activeDietPlan;
  if(!plan||!plan.active) return null;
  const dayNum=Math.floor((new Date(todayStr())-new Date(plan.startDate))/86400000)+1;
  return (dayNum>=1&&dayNum<=plan.days)?dayNum:null;
}

function getTodaysPlanMeals(){
  const plan=state.activeDietPlan;
  if(!plan) return null;
  const dayNum=getDietPlanDay();
  if(!dayNum) return null;
  return plan.rotation[(dayNum-1)%plan.rotation.length];
}

function renderDietPlanBanner(){
  const plan=state.activeDietPlan;
  const banner=document.getElementById('diet-plan-banner');
  const importBtn=document.getElementById('diet-plan-import-btn');
  const homeBanner=document.getElementById('home-diet-plan-banner');
  const homeImportBtn=document.getElementById('home-diet-import-btn');
  const dayNum=getDietPlanDay();
  const hasActive=plan&&plan.active&&dayNum;

  if(banner){ banner.style.display=hasActive?'block':'none'; }
  if(importBtn){ importBtn.style.display=hasActive?'none':'block'; }
  if(homeBanner){ homeBanner.style.display=hasActive?'block':'none'; }
  if(homeImportBtn){ homeImportBtn.style.display=hasActive?'none':'block'; }
  if(!hasActive) return;

  const daysLeft=plan.days-dayNum+1;
  const statusText='Day '+dayNum+' of '+plan.days+' · '+daysLeft+' day'+(daysLeft!==1?'s':'')+' left';
  const todayMeals=getTodaysPlanMeals();
  const preview=todayMeals
    ?['breakfast','lunch','dinner','snack'].filter(m=>(todayMeals[m]||[]).length>0)
       .map(m=>todayMeals[m].slice(0,2).join(', ')).join(' · ')
    :'';

  ['diet-plan-name','home-diet-plan-name'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.textContent=plan.name;
  });
  ['diet-plan-status','home-diet-plan-status'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.textContent=statusText;
  });
  const prevEl=document.getElementById('diet-plan-preview');
  if(prevEl) prevEl.textContent=preview;
}

function logTodaysPlan(){
  const todayMeals=getTodaysPlanMeals();
  if(!todayMeals){toast('No plan for today');return;}
  const log=getFoodLog();
  let count=0,totalKcal=0;
  ['breakfast','lunch','dinner','snack'].forEach(meal=>{
    const items=todayMeals[meal]||[];
    if(!items.length) return;
    if(!log.meals[meal]) log.meals[meal]=[];
    items.forEach(str=>{
      const m=matchPlanFood(str);
      if(m.matched&&m.food){
        const g=m.grams||100;
        log.meals[meal].push({name:m.food.name,grams:g,unit:'g',amount:g,
          kcal:Math.round(m.food.kcal*g/100),
          protein:parseFloat((m.food.protein*g/100).toFixed(1)),
          carbs:parseFloat((m.food.carbs*g/100).toFixed(1)),
          fat:parseFloat((m.food.fat*g/100).toFixed(1)),
          fibre:parseFloat((m.food.fibre*g/100).toFixed(1))});
        totalKcal+=Math.round(m.food.kcal*g/100);
      } else {
        log.meals[meal].push({name:str,grams:100,unit:'g',amount:100,kcal:0,protein:0,carbs:0,fat:0,fibre:0});
      }
      count++;
    });
  });
  state.foodLog[foodDate]=log;
  saveState({food:foodDate});
  renderFoodPage();
  if(homeMode==='food') renderHomeFoodPanel();
  toast('Logged '+count+' items · ~'+totalKcal+' kcal 🥗');
}

function renderDietPlanManager(){
  const plan=state.activeDietPlan;
  const div=document.getElementById('diet-plan-manager-content');
  if(!div) return;
  if(!plan||!plan.active){
    div.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3)">No active plan.<br><button onclick="closeDietPlanManager();openDietPlanImport()" class="btn-primary" style="margin-top:12px;padding:11px 20px;font-size:14px">Import a Plan</button></div>';
    return;
  }
  const dayNum=getDietPlanDay();
  const daysLeft=dayNum?plan.days-dayNum+1:0;
  const progress=dayNum?Math.round((dayNum/plan.days)*100):100;
  let html=`<div style="background:var(--surface2);border-radius:12px;padding:14px;margin-bottom:12px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:3px">Plan name</div>
    <input id="dp-edit-name" value="${plan.name}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:14px;font-weight:700;box-sizing:border-box;margin-bottom:8px" oninput="updatePlanField('name',this.value)">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:3px">Start date</div>
        <input type="date" value="${plan.startDate}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;box-sizing:border-box" oninput="updatePlanField('startDate',this.value)">
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:3px">Duration (days)</div>
        <input type="number" value="${plan.days}" min="1" max="365" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;box-sizing:border-box" oninput="updatePlanField('days',parseInt(this.value)||14)">
      </div>
    </div>
    ${dayNum?`<div style="font-size:13px;color:var(--red);font-weight:700">Day ${dayNum} of ${plan.days} · ${daysLeft} days left</div>
    <div style="height:5px;background:var(--border);border-radius:3px;margin-top:6px;overflow:hidden">
      <div style="height:100%;width:${progress}%;background:var(--red);border-radius:3px"></div>
    </div>`:`<div style="font-size:13px;color:#22c55e;font-weight:700">Plan completed!</div>`}
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3)">Day Rotation</div>
    <button onclick="addPlanDay()" style="background:var(--red);color:#fff;border:none;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer">+ Add Day</button>
  </div>`;
  plan.rotation.forEach((day,dayIdx)=>{
    html+=`<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-family:var(--font-cond);font-weight:700;font-size:15px;color:var(--red)">DAY ${day.day}${plan.rotation.length===1?' · repeats daily':''}</div>
        <button onclick="deletePlanDay(${dayIdx})" style="background:rgba(226,75,74,.1);border:none;color:var(--red);font-size:12px;font-weight:700;cursor:pointer;padding:3px 8px;border-radius:6px">Delete day</button>
      </div>`;
    ['breakfast','lunch','dinner','snack'].forEach(meal=>{
      const items=day[meal]||[];
      html+=`<div style="margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:4px">${meal}</div>
        ${items.map((item,itemIdx)=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <input value="${item.replace(/"/g,'&quot;')}" style="flex:1;min-width:0;padding:5px 8px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text);font-size:12px" onchange="updatePlanItem(${dayIdx},'${meal}',${itemIdx},this.value)">
          <button onclick="deletePlanItem(${dayIdx},'${meal}',${itemIdx})" style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:0 4px;flex-shrink:0;line-height:1">&times;</button>
        </div>`).join('')}
        <button onclick="addPlanItem(${dayIdx},'${meal}')" style="background:none;border:1px dashed var(--border);border-radius:7px;padding:4px 10px;font-size:11px;color:var(--text3);cursor:pointer;width:100%;margin-top:2px">+ add item</button>
      </div>`;
    });
    html+=`</div>`;
  });
  html+=`<div style="display:flex;gap:8px;margin-top:12px">
    <button onclick="logTodaysPlan();closeDietPlanManager()" class="btn-primary" style="flex:2;font-size:14px;padding:11px">Log Today</button>
    <button onclick="endDietPlan()" style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:11px;font-size:13px;color:var(--red);font-weight:700;cursor:pointer">Delete Plan</button>
  </div>
  <button onclick="closeDietPlanManager();openDietPlanImport()" style="width:100%;margin-top:8px;background:none;border:1px solid var(--border);border-radius:10px;padding:10px;font-size:13px;color:var(--text2);font-weight:600;cursor:pointer">+ Import New Plan</button>`;
  div.innerHTML=html;
}

function updatePlanField(field,value){ if(!state.activeDietPlan) return; state.activeDietPlan[field]=value; saveState({profile:true}); renderDietPlanBanner(); }
function updatePlanItem(dayIdx,meal,itemIdx,value){ if(!state.activeDietPlan) return; state.activeDietPlan.rotation[dayIdx][meal][itemIdx]=value; saveState({profile:true}); }
function deletePlanItem(dayIdx,meal,itemIdx){ if(!state.activeDietPlan) return; state.activeDietPlan.rotation[dayIdx][meal].splice(itemIdx,1); saveState({profile:true}); renderDietPlanManager(); }
function addPlanItem(dayIdx,meal){ if(!state.activeDietPlan) return; const item=prompt('Add food item (e.g. "2 idli" or "rice 200g"):',''); if(!item||!item.trim()) return; if(!state.activeDietPlan.rotation[dayIdx][meal]) state.activeDietPlan.rotation[dayIdx][meal]=[]; state.activeDietPlan.rotation[dayIdx][meal].push(item.trim()); saveState({profile:true}); renderDietPlanManager(); }
function deletePlanDay(dayIdx){ if(!state.activeDietPlan) return; if(state.activeDietPlan.rotation.length<=1){toast('Cannot delete the only day');return;} if(!confirm('Delete Day '+(dayIdx+1)+'?')) return; state.activeDietPlan.rotation.splice(dayIdx,1); state.activeDietPlan.rotation.forEach((d,i)=>d.day=i+1); saveState({profile:true}); renderDietPlanManager(); }
function addPlanDay(){ if(!state.activeDietPlan) return; const n=state.activeDietPlan.rotation.length+1; state.activeDietPlan.rotation.push({day:n,breakfast:[],lunch:[],dinner:[],snack:[]}); saveState({profile:true}); renderDietPlanManager(); toast('Day '+n+' added'); }
function endDietPlan(){ if(!confirm('Delete this diet plan?')) return; if(state.activeDietPlan) state.activeDietPlan.active=false; saveState({profile:true}); closeDietPlanManager(); renderDietPlanBanner(); renderFoodPage(); toast('Diet plan deleted'); }

// ─── FOOD TAB SWITCHER ────────────────────────────────────────────────────────
let _activeFoodTab = 'search';
function setFoodTab(tab){
  _activeFoodTab = tab;
  ['search','quick','frequent','templates','ai'].forEach(t=>{
    const panel = document.getElementById('food-tab-'+t);
    const btn = document.getElementById('ftab-'+t);
    if(panel) panel.style.display = t===tab ? 'flex' : 'none';
    if(btn){
      btn.style.color = t===tab ? 'var(--red)' : 'var(--text3)';
      btn.style.borderBottomColor = t===tab ? 'var(--red)' : 'transparent';
    }
  });
  if(tab==='frequent') renderFrequentFoods();
  if(tab==='templates') renderMealTemplates();
}

// ─── QUICK COMBO PARSER ───────────────────────────────────────────────────────
function parseQuickCombo(){
  const raw = document.getElementById('quick-combo-inp').value.trim();
  if(!raw){toast('Type what you ate first');return;}
  // Split on + or , or & or newline
  const parts = raw.split(/[+,&\n]/).map(s=>s.trim()).filter(Boolean);
  const results = [];
  const unmatched = [];

  parts.forEach(part=>{
    // Try to extract quantity prefix: "2 idli", "200g rice", "3x chapati"
    const qtyMatch = part.match(/^(\d+(?:\.\d+)?)\s*(?:x|×|pieces?|pcs?|g|grams?|ml)?\s+(.+)/i);
    let qty = 100, name = part;
    if(qtyMatch){
      const num = parseFloat(qtyMatch[1]);
      const isGrams = /g|gram/i.test(qtyMatch[0].split(qtyMatch[2])[0]);
      qty = isGrams ? num : num; // will be interpreted as pieces or grams
      name = qtyMatch[2].trim();
    }

    // Fuzzy match against FOOD_DB
    const nameLower = name.toLowerCase();
    let best = null, bestScore = 0;
    FOOD_DB.forEach(f=>{
      const fn = f.name.toLowerCase();
      let score = 0;
      if(fn === nameLower) score = 100;
      else if(fn.includes(nameLower) || nameLower.includes(fn.split('(')[0].trim())) score = 80;
      else {
        const words = nameLower.split(' ');
        words.forEach(w=>{ if(w.length>3 && fn.includes(w)) score += 20; });
      }
      if(score > bestScore){bestScore=score; best=f;}
    });

    if(best && bestScore >= 20){
      // Determine grams
      let grams = 100;
      if(qtyMatch){
        const isGrams = /g|gram/i.test(part.substring(0, part.indexOf(name)));
        if(isGrams) grams = qty;
        else if(best.pieceG) grams = best.pieceG * qty;
        else grams = qty === 1 ? 100 : qty * 30; // rough default
      }
      results.push({food:best, grams, label:part});
    } else {
      unmatched.push(part);
    }
  });

  // Show results with confirm
  const div = document.getElementById('quick-combo-results');
  if(!results.length){
    div.innerHTML='<div style="color:var(--text3);font-size:13px;text-align:center;padding:12px">No foods matched. Try the Search tab or be more specific.</div>';
    return;
  }

  let html = `<div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px;text-transform:uppercase">Found ${results.length} items — tap to adjust, then log all:</div>`;
  results.forEach((r,i)=>{
    const kcal = Math.round(r.food.kcal * r.grams / 100);
    const prot = (r.food.protein * r.grams / 100).toFixed(1);
    html+=`<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-weight:600;font-size:13px">${r.food.name}</div>
        <div style="font-size:11px;color:var(--text3)">${r.grams}g · ${kcal} kcal · P:${prot}g</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <input type="number" value="${r.grams}" inputmode="numeric" data-qc="${i}"
          style="width:55px;padding:5px 6px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text);font-size:13px;text-align:center"
          oninput="updateQCItem(${i},this.value,event)">
        <span style="font-size:11px;color:var(--text3)">g</span>
      </div>
    </div>`;
  });
  if(unmatched.length) html+=`<div style="font-size:11px;color:var(--text3);margin-bottom:8px">⚠ Not found: ${unmatched.join(', ')}</div>`;
  html+=`<button class="btn-primary" onclick="logQuickComboAll()" style="width:100%;font-size:15px;padding:13px;margin-top:4px">✓ Log All ${results.length} Foods</button>`;
  div.innerHTML = html;
  window._qcResults = results;
}

function updateQCItem(i, val){
  if(!window._qcResults) return;
  window._qcResults[i].grams = parseFloat(val)||100;
}

function logQuickComboAll(){
  if(!window._qcResults) return;
  const log = getFoodLog();
  if(!log.meals) log.meals={breakfast:[],lunch:[],dinner:[],snack:[]};
  if(!log.meals[_fSelectedMeal]) log.meals[_fSelectedMeal]=[];
  let totalKcal = 0;
  window._qcResults.forEach(r=>{
    const g = r.grams;
    log.meals[_fSelectedMeal].push({
      name:r.food.name, grams:g, unit:'g', amount:g,
      kcal:Math.round(r.food.kcal*g/100),
      protein:parseFloat((r.food.protein*g/100).toFixed(1)),
      carbs:parseFloat((r.food.carbs*g/100).toFixed(1)),
      fat:parseFloat((r.food.fat*g/100).toFixed(1)),
      fibre:parseFloat((r.food.fibre*g/100).toFixed(1))
    });
    totalKcal += Math.round(r.food.kcal*g/100);
  });
  if(!state.foodLog) state.foodLog={};
  state.foodLog[foodDate] = log;
  saveState({food:foodDate});
  // Learn for frequent
  window._qcResults.forEach(r=>learnFrequentFood(r.food.name));
  renderFoodPage();
  if(homeMode==='food') renderHomeFoodPanel();
  closeFoodModal();
  toast(`Logged ${window._qcResults.length} foods · ${totalKcal} kcal total 🎉`);
  window._qcResults = null;
}

// ─── FREQUENT FOODS ───────────────────────────────────────────────────────────
function learnFrequentFood(name){
  if(!state.frequentFoods) state.frequentFoods={};
  state.frequentFoods[name] = (state.frequentFoods[name]||0)+1;
}

function renderFrequentFoods(){
  const freq = state.frequentFoods||{};
  const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const div = document.getElementById('frequent-foods-list');
  if(!top.length){
    div.innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px 0">No frequent foods yet — log some meals first!</div>';
  } else {
    div.innerHTML = top.map(([name,count])=>{
      const f = FOOD_DB.find(x=>x.name===name);
      if(!f) return '';
      return `<div class="food-item" onclick="openFoodQty('${name.replace(/'/g,"\\'")}')">
        <div style="flex:1;min-width:0">
          <div class="food-item-name">${name} <span style="font-size:10px;color:var(--text3)">${count}x logged</span></div>
          <div class="food-item-meta">${f.kcal} kcal · P:${f.protein}g C:${f.carbs}g Fat:${f.fat}g per 100g</div>
        </div>
        <div class="food-item-kcal">${f.kcal}</div>
      </div>`;
    }).join('');
  }

  // Yesterday's meals
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  const yStr = yesterday.toISOString().slice(0,10);
  const yLog = state.foodLog?.[yStr];
  const yDiv = document.getElementById('yesterday-meals-list');
  if(!yLog||!Object.values(yLog.meals||{}).flat().length){
    yDiv.innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px 0">Nothing logged yesterday.</div>';
    return;
  }
  const allYItems = Object.entries(yLog.meals||{}).flatMap(([meal,items])=>items.map(i=>({...i,meal})));
  yDiv.innerHTML = `
    <button onclick="copyYesterdayMeal('${_fSelectedMeal}')" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:left;cursor:pointer;margin-bottom:6px">
      <div style="font-weight:700;font-size:13px">📋 Copy all of yesterday's ${_fSelectedMeal}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">${(yLog.meals[_fSelectedMeal]||[]).length} items → today's ${_fSelectedMeal}</div>
    </button>
    ${allYItems.slice(0,8).map(item=>`<div class="food-item" onclick="openFoodQty('${item.name.replace(/'/g,"\\'")}')">
      <div style="flex:1;min-width:0">
        <div class="food-item-name">${item.name} <span style="font-size:10px;color:var(--text3)">${item.meal}</span></div>
        <div class="food-item-meta">${item.kcal} kcal · ${item.grams||item.amount}g</div>
      </div>
      <div class="food-item-kcal">${item.kcal}</div>
    </div>`).join('')}`;
}

function copyYesterdayMeal(meal){
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  const yStr = yesterday.toISOString().slice(0,10);
  const yItems = state.foodLog?.[yStr]?.meals?.[meal]||[];
  if(!yItems.length){toast('Nothing in yesterday\'s '+meal);return;}
  const log = getFoodLog();
  if(!log.meals[meal]) log.meals[meal]=[];
  yItems.forEach(i=>log.meals[meal].push({...i}));
  state.foodLog[foodDate]=log;
  saveState({food:foodDate});
  renderFoodPage();
  if(homeMode==='food') renderHomeFoodPanel();
  closeFoodModal();
  toast('Copied '+yItems.length+' items from yesterday ✓');
}

// ─── MEAL TEMPLATES ───────────────────────────────────────────────────────────
function saveMealTemplate(){
  const log = getFoodLog();
  const items = log.meals?.[_fSelectedMeal]||[];
  if(!items.length){toast('No food in '+_fSelectedMeal+' yet — log some first');return;}
  const name = prompt('Name this template:', _fSelectedMeal.charAt(0).toUpperCase()+_fSelectedMeal.slice(1)+' Meal');
  if(!name) return;
  if(!state.mealTemplates) state.mealTemplates=[];
  state.mealTemplates.push({
    id:_genId(), name, meal:_fSelectedMeal,
    items:[...items], createdAt:new Date().toISOString()
  });
  saveState({profile:true});
  renderMealTemplates();
  toast('Template "'+name+'" saved ✓');
}

function renderMealTemplates(){
  const templates = state.mealTemplates||[];
  const div = document.getElementById('meal-templates-list');
  // Update save button label
  const btn = document.querySelector('#food-tab-templates .btn-primary');
  if(btn) btn.textContent = '💾 Save today\'s '+(_fSelectedMeal||'meal')+' as template';
  if(!templates.length){
    div.innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px 0;text-align:center">No templates yet.<br>Log a meal, then save it as a template for one-tap re-logging.</div>';
    return;
  }
  div.innerHTML = templates.map(t=>`
    <div style="background:var(--surface2);border-radius:10px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <div style="font-weight:700;font-size:14px">${t.name}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${t.items.length} items · ${t.items.reduce((a,i)=>a+(i.kcal||0),0)} kcal</div>
          <div style="font-size:11px;color:var(--text3)">${t.items.slice(0,3).map(i=>i.name).join(', ')}${t.items.length>3?'…':''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px">
          <button onclick="logTemplate('${t.id}')" style="background:var(--red);color:#fff;border:none;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer">Log</button>
          <button onclick="deleteTemplate('${t.id}')" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer;color:var(--text3)">🗑</button>
        </div>
      </div>
    </div>`).join('');
}

function logTemplate(id){
  const t = (state.mealTemplates||[]).find(x=>x.id===id);
  if(!t){toast('Template not found');return;}
  const log = getFoodLog();
  if(!log.meals[_fSelectedMeal]) log.meals[_fSelectedMeal]=[];
  t.items.forEach(i=>log.meals[_fSelectedMeal].push({...i}));
  state.foodLog[foodDate]=log;
  saveState({food:foodDate});
  renderFoodPage();
  if(homeMode==='food') renderHomeFoodPanel();
  closeFoodModal();
  toast('Logged "'+t.name+'" · '+t.items.reduce((a,i)=>a+(i.kcal||0),0)+' kcal 🎉');
}

function deleteTemplate(id){
  state.mealTemplates=(state.mealTemplates||[]).filter(t=>t.id!==id);
  saveState({profile:true});
  renderMealTemplates();
}

// ─── AI MEAL GUESSER + PHOTO ──────────────────────────────────────────────────
let _foodPhotoBase64 = null;

function previewFoodPhoto(event){
  const file = event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    _foodPhotoBase64 = e.target.result.split(',')[1];
    const prev = document.getElementById('food-photo-preview');
    prev.innerHTML = `<img src="${e.target.result}" style="max-height:80px;max-width:100%;border-radius:8px;object-fit:cover">`;
  };
  reader.readAsDataURL(file);
}

async function runAIMealGuess(){
  const desc = document.getElementById('ai-food-inp').value.trim();
  if(!desc && !_foodPhotoBase64){toast('Describe your meal or upload a photo first');return;}
  const btn = document.getElementById('ai-food-btn');
  const resultsDiv = document.getElementById('ai-food-results');
  btn.textContent = '🤖 Analysing…'; btn.disabled = true;
  resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">AI is figuring out your meal…</div>';

  // Build food list context (top 100 by name for the prompt)
  const foodNames = FOOD_DB.slice(0,300).map(f=>f.name).join(', ');

  const userContent = [];
  if(_foodPhotoBase64){
    userContent.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:_foodPhotoBase64}});
  }
  userContent.push({type:'text',text:`You are a nutrition assistant for an Indian fitness app. 
The user ${_foodPhotoBase64?'has uploaded a food photo and says:':'describes their meal as:'} "${desc||'See the photo'}"

Match these foods to our database when possible: ${foodNames}

Return ONLY valid JSON (no markdown, no explanation):
{"foods":[{"name":"exact name from db or best guess","grams":100,"confidence":"high/medium/low","note":"optional"}]}

Rules:
- Use exact names from the database when possible
- Estimate realistic portions (e.g. idli=40g, sambar=150ml, coffee=120ml)
- If something isn't in the DB, still include it with best guess name
- Be realistic about Indian portions`});

  try{
    const text = await callAI(
      typeof userContent==='string'?userContent:userContent.find(c=>c.type==='text')?.text||'',
      _foodPhotoBase64||null,
      'image/jpeg'
    );
    const clean = text.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(clean);
    renderAIFoodResults(parsed.foods||[]);
  } catch(e){
    resultsDiv.innerHTML='<div style="color:var(--red);font-size:13px;padding:12px">Could not analyse meal. Try describing it more specifically.</div>';
  }
  btn.textContent='🤖 Guess My Meal →'; btn.disabled=false;
}

let _aiFoodResults=[];
function renderAIFoodResults(foods){
  const resultsDiv=document.getElementById('ai-food-results');
  if(!foods.length){resultsDiv.innerHTML='<div style="color:var(--text3);font-size:13px;padding:12px;text-align:center">No foods detected. Try describing more specifically.</div>';return;}
  _aiFoodResults=foods.map(f=>{
    const match=FOOD_DB.find(x=>x.name.toLowerCase()===f.name.toLowerCase())||
                FOOD_DB.find(x=>x.name.toLowerCase().includes(f.name.toLowerCase().split('(')[0].trim()))||null;
    return {...f,dbFood:match};
  });
  let html=`<div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px;text-transform:uppercase">AI found ${_aiFoodResults.length} items — adjust grams if needed:</div>`;
  _aiFoodResults.forEach((f,i)=>{
    const db=f.dbFood;
    const kcal=db?Math.round(db.kcal*f.grams/100):'?';
    const conf={high:'🟢',medium:'🟡',low:'🔴'}[f.confidence||'medium'];
    html+=`<div style="background:var(--surface2);border-radius:10px;padding:10px 12px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-weight:600;font-size:13px">${conf} ${f.name}${!db?' <span style="font-size:10px;color:var(--red)">(not in DB)</span>':''}</div>
        <div style="font-size:12px;color:var(--red);font-weight:700">${kcal} kcal</div>
      </div>
      ${f.note?`<div style="font-size:11px;color:var(--text3);margin-bottom:4px">${f.note}</div>`:''}
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;color:var(--text3)">Amount:</span>
        <input type="number" value="${f.grams}" inputmode="numeric" data-ai="${i}"
          style="width:70px;padding:5px 8px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text);font-size:13px;text-align:center"
          oninput="updateAIItem(${i},this.value)">
        <span style="font-size:12px;color:var(--text3)">g</span>
      </div>
    </div>`;
  });
  const logCount=_aiFoodResults.filter(f=>f.dbFood).length;
  html+=`<button class="btn-primary" onclick="logAIFoods()" style="width:100%;font-size:15px;padding:13px;margin-top:4px">
    ✓ Log ${logCount} matched foods${_aiFoodResults.length>logCount?' ('+(_aiFoodResults.length-logCount)+' skipped)':''}
  </button>`;
  resultsDiv.innerHTML=html;
}

function updateAIItem(i,val){ if(_aiFoodResults[i]) _aiFoodResults[i].grams=parseFloat(val)||100; }

function logAIFoods(){
  const log=getFoodLog();
  if(!log.meals[_fSelectedMeal]) log.meals[_fSelectedMeal]=[];
  let count=0,totalKcal=0;
  _aiFoodResults.forEach(f=>{
    if(!f.dbFood) return;
    const g=f.grams||100;
    log.meals[_fSelectedMeal].push({
      name:f.dbFood.name,grams:g,unit:'g',amount:g,
      kcal:Math.round(f.dbFood.kcal*g/100),
      protein:parseFloat((f.dbFood.protein*g/100).toFixed(1)),
      carbs:parseFloat((f.dbFood.carbs*g/100).toFixed(1)),
      fat:parseFloat((f.dbFood.fat*g/100).toFixed(1)),
      fibre:parseFloat((f.dbFood.fibre*g/100).toFixed(1))
    });
    learnFrequentFood(f.dbFood.name);
    totalKcal+=Math.round(f.dbFood.kcal*g/100);
    count++;
  });
  state.foodLog[foodDate]=log;
  saveState({food:foodDate});
  renderFoodPage();
  if(homeMode==='food') renderHomeFoodPanel();
  closeFoodModal();
  _aiFoodResults=[];
  _foodPhotoBase64=null;
  toast('Logged '+count+' foods · '+totalKcal+' kcal 🎉');
}
let _communityFoods=[]; // cached community foods
let _communityFoodsLoaded=false;

async function loadCommunityFoods(){
  if(!_sb||_communityFoodsLoaded) return;
  try{
    const {data}=await _sb.from('community_foods')
      .select('*').order('created_at',{ascending:false}).limit(200);
    if(data){
      _communityFoods=data.map(r=>({
        ...r.food_data,
        _community:true,
        _contributor:r.display_name||'Community',
        _communityId:r.id
      }));
      // Add to FOOD_DB if not already there
      _communityFoods.forEach(f=>{
        if(!FOOD_DB.find(x=>x.name.toLowerCase()===f.name.toLowerCase()))
          FOOD_DB.push(f);
      });
      _communityFoodsLoaded=true;
    }
  }catch(e){console.warn('Community foods load error:',e);}
}

// Share a past workout as a community template
async function shareWorkout(wid){
  if(!_sb||!_sbUser){toast('Sign in to share');return;}
  const w=state.workoutHistory.find(x=>x.id===wid);
  if(!w){toast('Workout not found');return;}
  const title=prompt('Give this workout a name (e.g. "Upper Body Power"):', fmtDate(w.date)+' Workout');
  if(!title) return;
  const displayName=document.getElementById('user-menu-name')?.textContent||'LiftLog User';
  const {error}=await _sb.from('community_workouts').insert({
    user_id:_sbUser.id,
    display_name:displayName,
    title,
    exercises:w.exercises
  });
  if(!error) toast('Workout shared with community! 🌍');
  else toast('Share failed: '+error.message);
}

// Browse and clone community workouts
let _communityWorkouts=[];
async function openCommunityWorkouts(){
  if(!_sb){toast('Sign in to browse community workouts');return;}
  try{
    const {data}=await _sb.from('community_workouts')
      .select('*').order('created_at',{ascending:false}).limit(50);
    _communityWorkouts=data||[];
    renderCommunityWorkoutsModal();
  }catch(e){toast('Could not load community workouts');}
}

function renderCommunityWorkoutsModal(){
  let existing=document.getElementById('community-modal');
  if(existing) existing.remove();
  const modal=document.createElement('div');
  modal.id='community-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:flex-end';
  const sheet=document.createElement('div');
  sheet.style.cssText='background:var(--surface);width:100%;max-height:80vh;border-radius:16px 16px 0 0;overflow-y:auto;padding:16px';
  sheet.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-family:var(--font-cond);font-weight:900;font-size:18px">🌍 Community Workouts</div>
      <button onclick="document.getElementById('community-modal').remove()" style="background:none;border:none;font-size:22px;color:var(--text3);cursor:pointer">×</button>
    </div>
    ${_communityWorkouts.length===0?'<div style="text-align:center;padding:20px;color:var(--text3)">No community workouts yet — share yours!</div>':
    _communityWorkouts.map(w=>`
      <div style="background:var(--surface2);border-radius:10px;padding:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div>
            <div style="font-weight:700;font-size:14px">${w.title}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">by ${w.display_name||'Community'} · ${w.exercises?.length||0} exercises</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${(w.exercises||[]).slice(0,3).map(e=>e.name).join(', ')}${w.exercises?.length>3?'…':''}</div>
          </div>
          <button onclick="cloneCommunityWorkout('${w.id}')" style="background:var(--red);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0;margin-left:8px">Use It</button>
        </div>
      </div>`).join('')}
  `;
  modal.appendChild(sheet);
  modal.onclick=e=>{if(e.target===modal)modal.remove();};
  document.body.appendChild(modal);
}

function cloneCommunityWorkout(id){
  const w=_communityWorkouts.find(x=>x.id===id);
  if(!w) return;
  // Load exercises into today's workout
  const newExercises=w.exercises.map(ex=>({
    ...ex,
    sets:(ex.sets||[{w:0,r:10}]).map(s=>({...s,done:false}))
  }));
  state.exercises=[...state.exercises,...newExercises];
  renderExercises();
  autoSave();
  document.getElementById('community-modal').remove();
  toast('Loaded "'+w.title+'" into today\'s workout!');
}
