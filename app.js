/* ════════════════════════════════════════════════════════════
   app.js
   Drives the SPA: Hebcal calendar + zmanim, smart "now" suggestion,
   prayer list rendering, prayer detail view + section TOC sheet.
   ══════════════════════════════════════════════════════════════ */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ─── User location (Jerusalem default) ─── */
const STATE = {
  lat:31.7683, lng:35.2137, tz:'Asia/Jerusalem', cityHe:'ירושלים', city:'Jerusalem',
  hebcal:null,            // result of hebcal /shabbat lookup
  zmanim:null,            // /zmanim result
  todayHE:null,           // today /converter result
  diaspora:false,
};

/* ─── Hebrew date / parsha helpers ─── */
const HEB_MONTHS = {
  Nisan:'ניסן',Iyyar:'אייר',Sivan:'סיון',Tamuz:'תמוז',Av:'אב',Elul:'אלול',
  Tishrei:'תשרי',Cheshvan:'חשון',Kislev:'כסלו',Tevet:'טבת','Sh\'vat':'שבט',Shvat:'שבט',
  'Adar':'אדר','Adar I':'אדר א\'','Adar II':'אדר ב\'','Adar 1':'אדר א\'','Adar 2':'אדר ב\'',
};
const HEB_NUMERALS = ['','א\'','ב\'','ג\'','ד\'','ה\'','ו\'','ז\'','ח\'','ט\'','י\'','י"א','י"ב','י"ג','י"ד','ט"ו','ט"ז','י"ז','י"ח','י"ט','כ\'','כ"א','כ"ב','כ"ג','כ"ד','כ"ה','כ"ו','כ"ז','כ"ח','כ"ט','ל\''];

function fmtHebDate(hd){
  if(!hd) return '';
  const day = HEB_NUMERALS[hd.hd] || String(hd.hd);
  const month = HEB_MONTHS[hd.hm] || hd.hm;
  // year (e.g. 5786) → letters: drop the 5000 prefix and render as gematria
  const yr = hd.hy ? gematriaYear(hd.hy) : '';
  return `${day} ${month} ${yr}`;
}
function gematriaYear(year){
  const y = year - 5000;             // e.g. 5786 → 786
  const map = [
    [400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],
    [90,'צ'],[80,'פ'],[70,'ע'],[60,'ס'],[50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],
    [9,'ט'],[8,'ח'],[7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א'],
  ];
  let n = y, out = '';
  for(const [v,l] of map){ while(n >= v){ out += l; n -= v; } }
  // special: 15→ט"ו, 16→ט"ז to avoid sacred names
  out = out.replace(/יה$/,'ט"ו').replace(/יו$/,'ט"ז');
  // insert " before last letter for traditional rendering
  if(out.length >= 2 && !out.includes('"')) out = out.slice(0,-1) + '"' + out.slice(-1);
  return 'ה\'' + out;
}

/* ─── Time formatting ─── */
function fmtHM(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',hour12:false});
}
function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}

/* ─── Hebcal API calls ─── */
async function fetchZmanim(date){
  const url = `https://www.hebcal.com/zmanim?cfg=json&latitude=${STATE.lat}&longitude=${STATE.lng}&tzid=${encodeURIComponent(STATE.tz)}&date=${date}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error('zmanim fetch failed');
  return r.json();
}
async function fetchHebrewDate(date){
  const [y,m,d] = date.split('-').map(Number);
  const url = `https://www.hebcal.com/converter?cfg=json&gy=${y}&gm=${m}&gd=${d}&g2h=1&strict=1`;
  const r = await fetch(url);
  if(!r.ok) throw new Error('converter fetch failed');
  return r.json();
}
async function fetchHolidays(date){
  // Hebcal events for ±2 days to catch shabbat / yomtov
  const [y,m,d] = date.split('-').map(Number);
  const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&ss=on&mf=on&s=on&c=on&geo=pos&latitude=${STATE.lat}&longitude=${STATE.lng}&tzid=${encodeURIComponent(STATE.tz)}&start=${date}&end=${date}&i=${STATE.diaspora?'off':'on'}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error('holidays fetch failed');
  return r.json();
}

/* ─── Day classification for smart suggestion ─── */
function classifyDay(holidays, hd){
  const items = holidays.items||[];
  const cats = items.map(i => i.category);
  let kind = 'חול';
  let pillClass = '';
  let parsha = '';
  let isShabbat = false, isYomtov = false, isCholHamoed = false;
  for(const ev of items){
    if(ev.category === 'parashat'){ parsha = ev.hebrew || ev.title; }
    if(ev.yomtov) isYomtov = true;
    if(/Chol HaMoed/i.test(ev.title)) isCholHamoed = true;
  }
  const dow = new Date().getDay(); // 0=Sun..6=Sat
  if(dow === 6 || (dow === 5 && new Date().getHours() >= 17)){
    isShabbat = true;
  }
  if(isShabbat){ kind = 'שבת קודש'; pillClass = 'shabbat'; }
  else if(isYomtov){ kind = 'יום טוב'; pillClass = 'yomtov'; }
  else if(isCholHamoed){ kind = 'חול המועד'; pillClass = ''; }
  return { kind, pillClass, parsha, isShabbat, isYomtov, isCholHamoed };
}

/* ─── Smart "now" prayer chooser ─── */
function chooseNowPrayer(zm, dayInfo){
  const now = new Date();
  const hh = now.getHours() + now.getMinutes()/60;
  const t = (iso) => iso ? (new Date(iso).getHours() + new Date(iso).getMinutes()/60) : null;
  const sunrise = t(zm.times?.sunrise);
  const chatzot = t(zm.times?.chatzot);
  const minchaG = t(zm.times?.minchaGedola);
  const sunset  = t(zm.times?.sunset);
  const tzeit   = t(zm.times?.tzeit72min) || t(zm.times?.tzeit85deg) || t(zm.times?.tzeit);
  const alot    = t(zm.times?.alotHaShachar);

  /* Friday evening → קבלת שבת */
  const dow = now.getDay();
  if(dow === 5 && sunset && hh >= (sunset - 1.0)){
    return { id:'kabalas-shabbat', reason:'ערב שבת — נכנסים לקדושת השבת' };
  }
  /* Shabbat morning */
  if(dow === 6 && sunrise && hh >= sunrise && (chatzot==null || hh < chatzot)){
    return { id:'shabbat-shacharit', reason:'שבת בבוקר' };
  }
  /* Saturday night → הבדלה */
  if(dow === 6 && tzeit && hh >= tzeit){
    return { id:'havdala', reason:'מוצאי שבת — הבדלה' };
  }

  /* Weekday flow */
  if(alot && sunrise && hh >= alot && hh < sunrise + 0.5){
    return { id:'birchos-hashachar', reason:'לפני התפילה / השכמת הבוקר' };
  }
  if(sunrise && hh >= sunrise - 0.25 && (chatzot==null || hh < chatzot)){
    return { id:'shacharit', reason:`זמן שחרית — לאחר הנץ ${fmtHM(zm.times?.sunrise)}` };
  }
  if(minchaG && hh >= minchaG && (sunset==null || hh < sunset)){
    return { id:'mincha', reason:`זמן מנחה — מנחה גדולה ${fmtHM(zm.times?.minchaGedola)}` };
  }
  if(sunset && hh >= sunset && tzeit && hh < tzeit + 4){
    return { id:'maariv', reason:`זמן מעריב — צאת הכוכבים ${fmtHM(zm.times?.tzeit72min || zm.times?.tzeit)}` };
  }
  if(tzeit && hh >= tzeit + 4){
    return { id:'maariv', reason:'מעריב / קריאת שמע על המיטה' };
  }
  // Default fallback
  return { id:'shacharit', reason:'תפילת היום' };
}

/* ─── Render ─── */
function renderZmanim(zm){
  const grid = $('#zmanimGrid');
  if(!zm || !zm.times){ grid.innerHTML = '<div class="zmanim-skeleton"></div>'; return; }
  const T = zm.times;
  const rows = [
    ['עלות השחר', T.alotHaShachar],
    ['הנץ החמה',  T.sunrise],
    ['סוף ק"ש',   T.sofZmanShma || T.sofZmanShmaMGA],
    ['סוף תפילה', T.sofZmanTfilla],
    ['חצות',      T.chatzot],
    ['מנחה גדולה',T.minchaGedola],
    ['פלג המנחה', T.plagHaMincha],
    ['שקיעה',     T.sunset],
    ['צאת הכוכבים', T.tzeit72min || T.tzeit85deg || T.tzeit],
  ];
  grid.innerHTML = rows.map(([k,v]) => `
    <div class="zmanim-row"><span class="zmanim-row-label">${k}</span><span class="zmanim-row-value">${fmtHM(v)}</span></div>
  `).join('');
}

function renderHomeMeta(){
  const now = new Date();
  $('#dateLine').textContent = now.toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}

function renderPrayersList(){
  const list = $('#prayersList');
  list.innerHTML = PRAYERS.map(p => `
    <button class="prayer-card" data-id="${p.id}">
      <div class="prayer-card-icon ${p.iconClass||''}">${p.iconChar||'ת'}</div>
      <div class="prayer-card-text">
        <div class="prayer-card-title">${p.title}</div>
        <div class="prayer-card-meta">${p.meta}</div>
      </div>
      <svg class="prayer-card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
  `).join('');
  list.querySelectorAll('.prayer-card').forEach(el =>
    el.addEventListener('click', () => openPrayer(el.dataset.id))
  );
}

function renderNowCard(suggestion){
  const p = PRAYERS_BY_ID[suggestion.id];
  if(!p){ return; }
  $('#nowTitle').textContent = p.title;
  $('#nowMeta').textContent  = p.meta;
  $('#nowReason').textContent = suggestion.reason;
  $('#nowTag').textContent = p.kind === 'shabbat-eve' ? 'תפילת ערב שבת' :
                              p.kind === 'shabbat-morning' ? 'תפילת שחרית של שבת' :
                              p.kind === 'shabbat-out' ? 'מוצאי שבת' :
                              p.kind === 'mincha' ? 'מנחה' :
                              p.kind === 'maariv' ? 'מעריב' :
                              p.kind === 'shacharit' ? 'שחרית' :
                              'תפילה נוכחית';
  $('#nowCard').onclick = () => openPrayer(p.id);
}

/* ─── Prayer detail ─── */
function openPrayer(id){
  const p = PRAYERS_BY_ID[id]; if(!p) return;
  $('#screen-home').classList.remove('active');
  const screen = $('#screen-prayer');
  screen.classList.add('active');
  $('#prayerTopTitle').textContent = p.title;
  $('#prayerBody').innerHTML = p.text;
  $('#tocList').innerHTML = (p.sections||[]).map((s,i) =>
    `<li data-anchor="${s.id}"><span>${s.title}</span><span class="toc-num">${i+1}</span></li>`
  ).join('');
  $$('#tocList li').forEach(li =>
    li.addEventListener('click', () => {
      const anchor = li.dataset.anchor;
      closeSheet();
      const el = document.getElementById(anchor);
      if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
    })
  );
  window.scrollTo({top:0});
}
function backHome(){
  $('#screen-prayer').classList.remove('active');
  $('#screen-home').classList.add('active');
  closeSheet();
}

/* ─── TOC sheet ─── */
function openSheet(){ $('#tocSheet').classList.add('open'); $('#sheetMask').classList.add('open'); $('#tocSheet').setAttribute('aria-hidden','false'); }
function closeSheet(){ $('#tocSheet').classList.remove('open'); $('#sheetMask').classList.remove('open'); $('#tocSheet').setAttribute('aria-hidden','true'); }

/* ─── Wire up events ─── */
document.addEventListener('DOMContentLoaded', async () => {
  renderHomeMeta();
  renderPrayersList();

  $('#tocBtn')?.addEventListener('click', openSheet);
  $('#sheetMask')?.addEventListener('click', closeSheet);
  $('#backBtn')?.addEventListener('click', backHome);
  $('#themeBtn')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? '' : 'dark';
    if(cur) document.documentElement.setAttribute('data-theme','dark');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('sidur-theme', cur);
  });
  // restore theme
  if(localStorage.getItem('sidur-theme') === 'dark'){
    document.documentElement.setAttribute('data-theme','dark');
  }
  // sticky header shadow on scroll
  document.addEventListener('scroll', () => {
    document.querySelector('.app-header')?.classList.toggle('scrolled', window.scrollY > 4);
  }, {passive:true});

  // Initial fallback render: choose by clock alone (works offline)
  renderNowCard(chooseNowPrayer({times:{}}, {kind:'חול'}));

  // Try Hebcal calls (graceful fallback if offline)
  try{
    const date = todayISO();
    const [zm, hd, hol] = await Promise.all([
      fetchZmanim(date), fetchHebrewDate(date), fetchHolidays(date)
    ]);
    STATE.zmanim = zm; STATE.todayHE = hd; STATE.hebcal = hol;
    $('#hebrewDate').textContent = fmtHebDate(hd);
    const dayInfo = classifyDay(hol, hd);
    $('#parshaLine').textContent = dayInfo.parsha || '';
    $('#dayKindPill').textContent = dayInfo.kind;
    $('#dayKindPill').className = 'zmanim-pill ' + (dayInfo.pillClass || '');
    renderZmanim(zm);
    renderNowCard(chooseNowPrayer(zm, dayInfo));
  } catch(err){
    console.warn('Hebcal fetch failed, using local fallback', err);
    $('#hebrewDate').textContent = '—';
    $('#parshaLine').textContent = 'אין חיבור — שירות לוח השנה לא זמין';
    $('#zmanimGrid').innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:13px;padding:8px 0">לא ניתן לטעון את זמני היום (ייתכן שאין חיבור לאינטרנט). הצעת התפילה מבוססת על השעה בלבד.</div>';
  }
});
