/* ════════════════════════════════════════════════════════════
   app.js
   Drives the SPA: Hebcal calendar + zmanim, smart "now" suggestion,
   day-aware content filtering, parsha index, search, prayer detail.
   ══════════════════════════════════════════════════════════════ */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const STATE = {
  lat:31.7683, lng:35.2137, tz:'Asia/Jerusalem', cityHe:'ירושלים', city:'Jerusalem',
  hebcal:null, zmanim:null, todayHE:null, diaspora:false,
  dayInfo:null,
};

/* ─── Hebrew date helpers ─── */
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
  const yr = hd.hy ? gematriaYear(hd.hy) : '';
  return `${day} ${month} ${yr}`;
}
function gematriaYear(year){
  const y = year - 5000;
  const map = [[400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],[90,'צ'],[80,'פ'],[70,'ע'],[60,'ס'],[50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],[9,'ט'],[8,'ח'],[7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א']];
  let n=y, out=''; for(const [v,l] of map){ while(n>=v){ out+=l; n-=v; } }
  out = out.replace(/יה$/,'ט"ו').replace(/יו$/,'ט"ז');
  if(out.length>=2 && !out.includes('"')) out = out.slice(0,-1)+'"'+out.slice(-1);
  return 'ה\''+out;
}

function fmtHM(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',hour12:false});
}
function todayISO(){ return new Date().toISOString().slice(0,10); }

/* ─── Hebcal API ─── */
async function fetchZmanim(date){
  const url = `https://www.hebcal.com/zmanim?cfg=json&latitude=${STATE.lat}&longitude=${STATE.lng}&tzid=${encodeURIComponent(STATE.tz)}&date=${date}`;
  const r = await fetch(url); if(!r.ok) throw new Error('zmanim'); return r.json();
}
async function fetchHebrewDate(date){
  const [y,m,d] = date.split('-').map(Number);
  const url = `https://www.hebcal.com/converter?cfg=json&gy=${y}&gm=${m}&gd=${d}&g2h=1&strict=1`;
  const r = await fetch(url); if(!r.ok) throw new Error('converter'); return r.json();
}
async function fetchHolidays(date){
  const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&ss=on&mf=on&s=on&c=on&geo=pos&latitude=${STATE.lat}&longitude=${STATE.lng}&tzid=${encodeURIComponent(STATE.tz)}&start=${date}&end=${date}&i=${STATE.diaspora?'off':'on'}`;
  const r = await fetch(url); if(!r.ok) throw new Error('holidays'); return r.json();
}
async function fetchSefariaCalendar(){
  // Sefaria's calendar API gives current parsha, daf, etc.
  try { const r = await fetch('https://www.sefaria.org/api/calendars'); return r.ok ? r.json() : null; }
  catch { return null; }
}

/* ─── Day classification (richer) ─── */
function classifyDay(holidays, hd){
  const items = holidays.items||[];
  let kind = 'חול', pillClass = '', parsha = '';
  let isShabbat = false, isYomtov = false, isCholHamoed = false;
  let isRoshChodesh = false, isChanukah = false, isPurim = false;
  let isFastDay = false, isLagBaomer = false, isTuBshvat = false;
  let isErevYomTov = false;
  const tags = [];
  for(const ev of items){
    if(ev.category === 'parashat'){ parsha = ev.hebrew || ev.title; }
    if(ev.yomtov) isYomtov = true;
    const t = (ev.title||'') + ' ' + (ev.hebrew||'');
    if(/Chol HaMoed/i.test(t)) isCholHamoed = true;
    if(/Rosh Chodesh|ראש חדש/.test(t)) isRoshChodesh = true;
    if(/Chanukah|חנוכה/.test(t)) isChanukah = true;
    if(/Purim|פורים/.test(t)) isPurim = true;
    if(/Lag B'?Omer|ל"?ג בעומר/.test(t)) isLagBaomer = true;
    if(/Tu B'?Shvat|ט"ו בשבט|טו בשבט/.test(t)) isTuBshvat = true;
    if(/Tzom|Fast|Tisha|Tzom Gedaliah|Asarah|Shiva Asar|תענית|צום/i.test(t) && !/Esther/.test(t)) isFastDay = true;
    if(/Erev/i.test(t)) isErevYomTov = true;
    tags.push(t);
  }
  const now = new Date();
  const dow = now.getDay();
  // Friday after candle-lighting → already in Shabbat zone
  if(dow === 6) isShabbat = true;
  if(dow === 5 && now.getHours() >= 17) isShabbat = true;

  if(isShabbat){ kind = 'שבת קודש'; pillClass = 'shabbat'; }
  else if(isYomtov){ kind = 'יום טוב'; pillClass = 'yomtov'; }
  else if(isCholHamoed){ kind = 'חול המועד'; pillClass = ''; }
  else if(isRoshChodesh){ kind = 'ראש חודש'; pillClass = ''; }

  /* No-tachanun day rule (Chabad nusach):
     Shabbat, Yom Tov, Chol HaMoed, Rosh Chodesh, ערב יום טוב, חודש ניסן,
     ל"ג בעומר, פסח שני, ט"ו באב, ט"ו בשבט, ט' באב, פורים, שושן פורים, חנוכה. */
  let noTachanun = isShabbat || isYomtov || isCholHamoed || isRoshChodesh ||
                    isChanukah || isPurim || isLagBaomer || isTuBshvat || isErevYomTov;
  // Heuristic: ניסן (after seder) — Hebcal's converter gives hd.hm
  if(hd && (hd.hm === 'Nisan')) noTachanun = true;
  // ערב שבת after mincha — handled by isShabbat at 17:00+
  return {
    kind, pillClass, parsha,
    isShabbat, isYomtov, isCholHamoed, isRoshChodesh,
    isChanukah, isPurim, isLagBaomer, isTuBshvat, isFastDay, isErevYomTov,
    noTachanun, dow,
    hebMonth: hd?.hm,
  };
}

/* ─── Smart "now" prayer chooser (with night handling) ─── */
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

  const dow = now.getDay();

  /* === NIGHT (00:00 – alot) — previous day's evening flow === */
  if(alot && hh < alot){
    // Friday night → still ערב שבת maariv
    if(dow === 6) return { id:'shabbat-eve', reason:'ליל שבת — אחרי קבלת שבת' };
    // Saturday night before tzeit shouldn't happen at hh<alot
    return { id:'krias-shema-al-hamita', reason:`לילה — קריאת שמע על המיטה (לפני עלות ${fmtHM(zm.times?.alotHaShachar)})` };
  }
  if(!alot && hh < 4){
    // No zmanim available, but it's clearly late night
    if(dow === 6) return { id:'shabbat-eve', reason:'ליל שבת' };
    return { id:'krias-shema-al-hamita', reason:'שעת לילה — קריאת שמע על המיטה' };
  }

  /* === Pre-dawn (alot to sunrise) === */
  if(alot && sunrise && hh >= alot && hh < sunrise){
    if(dow === 6) return { id:'shabbat-morning', reason:'לפני שחרית של שבת' };
    return { id:'upon-arising', reason:'לפני שחרית — השכמת הבוקר' };
  }

  /* === Friday late-afternoon — קבלת שבת === */
  if(dow === 5 && sunset && hh >= (sunset - 1.0)){
    return { id:'shabbat-eve', reason:'ערב שבת — נכנסים לקדושת השבת' };
  }

  /* === Shabbat day === */
  if(dow === 6){
    if(sunrise && hh >= sunrise && (chatzot==null || hh < chatzot)){
      return { id:'shabbat-morning', reason:'שבת בבוקר' };
    }
    if(chatzot && minchaG && hh >= chatzot && (sunset==null || hh < sunset)){
      return { id:'shabbat-mincha', reason:'שבת אחר הצהריים — מנחה / סעודה שלישית' };
    }
    if(sunset && hh >= sunset){
      return { id:'motzaei-shabbat', reason:'מוצאי שבת — הבדלה' };
    }
  }

  /* === Weekday flow === */
  if(sunrise && hh >= sunrise && (chatzot==null || hh < chatzot + 0.25)){
    return { id:'shacharit', reason:`זמן שחרית — לאחר הנץ ${fmtHM(zm.times?.sunrise)}` };
  }
  if(minchaG && hh >= minchaG && (sunset==null || hh < sunset)){
    return { id:'mincha', reason:`זמן מנחה — מנחה גדולה ${fmtHM(zm.times?.minchaGedola)}` };
  }
  if(sunset && tzeit && hh >= sunset && hh < tzeit + 5){
    return { id:'maariv', reason:`זמן מעריב — צאת הכוכבים ${fmtHM(zm.times?.tzeit72min || zm.times?.tzeit)}` };
  }
  if(tzeit && hh >= tzeit + 5){
    return { id:'krias-shema-al-hamita', reason:'שעת לילה — קריאת שמע על המיטה' };
  }
  return { id:'shacharit', reason:'תפילת היום' };
}

/* ─── Day-context filter logic (shared by body + TOC) ─── */
function shouldShowSection(ctx, dayInfo){
  if(!ctx) return true;
  switch(ctx.kind){
    case 'shir-shel-yom':       return ctx.dow === dayInfo.dow;
    case 'tachanun':             return !dayInfo.noTachanun;
    case 'avinu-malkenu':        return dayInfo.isFastDay || (!dayInfo.noTachanun && (dayInfo.dow === 1 || dayInfo.dow === 4));
    case 'mon-thu-only':         return (dayInfo.dow === 1 || dayInfo.dow === 4) && !dayInfo.noTachanun;
    case 'rosh-chodesh-only':    return dayInfo.isRoshChodesh;
    case 'elul-tishrei':         return dayInfo.hebMonth === 'Elul' || dayInfo.hebMonth === 'Tishrei';
    case 'fast-day-only':        return dayInfo.isFastDay;
    case 'bahab-only':           return false;
    default: return true;
  }
}
function filterBodyForToday(prayer, dayInfo){
  const parts = [];
  for(const sec of (prayer.sections||[])){
    const html = prayer.sectionHtml?.[sec.id];
    if(!html) continue;
    if(!shouldShowSection(sec.context, dayInfo)) continue;
    parts.push(html);
  }
  let body = parts.join('\n');
  // For Song of the Day: strip non-today day-blocks
  body = body.replace(/<div class="dow-block" data-dow="(\d)"[^>]*>([\s\S]*?)<\/div>/g, (m, d, inner) => {
    return (parseInt(d) === dayInfo.dow) ? inner : '';
  });
  return body;
}
function filteredSections(prayer, dayInfo){
  return (prayer.sections||[]).filter(sec => shouldShowSection(sec.context, dayInfo));
}

/* ─── Render: zmanim + home meta ─── */
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
  grid.innerHTML = rows.map(([k,v]) =>
    `<div class="zmanim-row"><span class="zmanim-row-label">${k}</span><span class="zmanim-row-value">${fmtHM(v)}</span></div>`
  ).join('');
}
function renderHomeMeta(){
  $('#dateLine').textContent = new Date().toLocaleDateString('he-IL',
    {weekday:'long',day:'numeric',month:'long',year:'numeric'});
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
  const p = PRAYERS_BY_ID[suggestion.id]; if(!p) return;
  $('#nowTitle').textContent = p.title;
  $('#nowMeta').textContent  = p.meta;
  $('#nowReason').textContent = suggestion.reason;
  const tagMap = {
    'shabbat-eve':'ערב שבת',
    'shabbat-morning':'שבת בבוקר',
    'shabbat-mincha':'שבת אחה"צ',
    'shabbat-out':'מוצאי שבת',
    'mincha':'מנחה',
    'maariv':'מעריב',
    'shacharit':'שחרית',
    'morning':'השכמת הבוקר',
    'night':'לילה',
    'meal':'אחר הסעודה',
    'parsha':'פרשת השבוע',
  };
  $('#nowTag').textContent = tagMap[p.kind] || 'תפילה נוכחית';
  $('#nowCard').onclick = () => openPrayer(p.id);
}

/* ─── Prayer detail ─── */
function openPrayer(id){
  const p = PRAYERS_BY_ID[id]; if(!p) return;
  $('#screen-home').classList.remove('active');
  $('#screen-settings')?.classList.remove('active');
  $('#screen-prayer').classList.add('active');
  $('#prayerTopTitle').textContent = p.title;

  const dayInfo = STATE.dayInfo || { dow: new Date().getDay(), noTachanun:false };

  if(p.kind === 'parsha'){
    renderParshaIndex();
    buildProgressRail([]);
    return;
  }
  if(p.kind === 'tehillim-daily'){
    renderTehillimDaily();
    return;
  }

  $('#prayerBody').innerHTML = filterBodyForToday(p, dayInfo);
  const visibleSections = filteredSections(p, dayInfo);
  $('#tocList').innerHTML = visibleSections.map((s,i) =>
    `<li data-anchor="${s.id}"><span>${s.title}</span><span class="toc-num">${i+1}</span></li>`
  ).join('');
  $$('#tocList li').forEach(li =>
    li.addEventListener('click', () => {
      closeSheet();
      const el = document.getElementById(li.dataset.anchor);
      if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
    })
  );
  buildProgressRail(visibleSections);
  window.scrollTo({top:0});
}

function backHome(){
  $('#screen-prayer').classList.remove('active');
  $('#screen-settings')?.classList.remove('active');
  $('#screen-home').classList.add('active');
  closeSheet();
  if(_railObserver){ _railObserver.disconnect(); _railObserver = null; }
}

/* ─── Progress rail ─── */
let _railObserver = null;
let _railSectionMap = null;          // sectionId → dot element
let _railSectionOrder = [];          // [sectionId, ...] in document order
let _railFillEl = null, _railTrackEl = null;
let _railActiveDot = null;

function buildProgressRail(sections){
  const rail = $('#progressRail');
  const track = $('#railTrack');
  const fill = $('#railFill');
  if(!rail || !track || !fill) return;
  if(!sections || sections.length === 0){
    rail.style.display = 'none';
    track.innerHTML = '';
    fill.style.width = '0';
    return;
  }
  rail.style.display = 'block';
  _railFillEl = fill; _railTrackEl = track;
  _railSectionMap = {};
  _railSectionOrder = sections.map(s => s.id);
  track.innerHTML = sections.map((s,i) => `
    <div class="rail-dot" data-anchor="${s.id}" data-idx="${i}" title="${s.title}">
      <div class="rail-tooltip"><span>${s.title}</span><button type="button" class="rail-tooltip-jump" data-jump="${s.id}">קפיצה</button></div>
    </div>
  `).join('');
  $$('#railTrack .rail-dot').forEach(dot => {
    _railSectionMap[dot.dataset.anchor] = dot;
    dot.addEventListener('click', (e) => onRailDotClick(dot, e));
  });
  // observe section visibility for auto-progress
  if(_railObserver) _railObserver.disconnect();
  _railObserver = new IntersectionObserver(onRailIntersect, {
    rootMargin: '-30% 0px -55% 0px',
    threshold: 0,
  });
  for(const s of sections){
    const el = document.getElementById(s.id);
    if(el) _railObserver.observe(el);
  }
}

function onRailIntersect(entries){
  for(const ent of entries){
    const id = ent.target.id;
    if(!_railSectionMap || !_railSectionMap[id]) continue;
    if(ent.isIntersecting){
      // Mark this section + all earlier as done; mark THIS as active
      let activeIdx = -1;
      _railSectionOrder.forEach((sid, i) => {
        const dot = _railSectionMap[sid];
        if(!dot) return;
        if(sid === id){ activeIdx = i; }
      });
      if(activeIdx < 0) continue;
      _railSectionOrder.forEach((sid, i) => {
        const dot = _railSectionMap[sid];
        dot.classList.toggle('is-done', i < activeIdx);
        dot.classList.toggle('is-active', i === activeIdx);
      });
      // Compute fill width based on dot offset
      const dot = _railSectionMap[id];
      const trackRect = _railTrackEl.getBoundingClientRect();
      const dotRect = dot.getBoundingClientRect();
      // For RTL track, fill from right to dot's right-edge → use width from right
      const widthPx = (trackRect.right - dotRect.left);
      _railFillEl.style.width = Math.max(0, widthPx) + 'px';
      _railFillEl.style.right = '0';
    }
  }
}

function onRailDotClick(dot, e){
  if(e && (e.target.closest('.rail-tooltip-jump'))){
    // Jump to anchor
    const anchor = e.target.dataset.jump;
    const el = document.getElementById(anchor);
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
    dot.classList.remove('is-active');
    return;
  }
  // First click → just expand this dot (deactivate others)
  $$('#railTrack .rail-dot.is-active').forEach(d => { if(d !== dot) d.classList.remove('is-active'); });
  dot.classList.toggle('is-active');
}

/* ─── Parsha index ─── */
function renderParshaIndex(){
  // current parsha's English name comes from STATE.hebcal items
  const items = STATE.hebcal?.items || [];
  const curEn = (items.find(i => i.category === 'parashat')?.title || '')
                 .replace(/^Parashat\s+/,'').replace(/^Parshas\s+/,'');
  const norm = s => s.toLowerCase().replace(/[^a-z]/g,'');
  const cur = (PARSHAS||[]).findIndex(p => norm(p.en) === norm(curEn));

  // Reorder: current first, then the rest in Torah order
  const list = (PARSHAS||[]).slice();
  let ordered = list;
  if(cur >= 0){
    ordered = [list[cur], ...list.slice(0, cur), ...list.slice(cur+1)];
  }

  let html = `<h2 id="parsha-index">פרשת השבוע</h2>`;
  if(cur >= 0){
    html += `<p class="rubric">פרשת השבוע הנוכחית: <b>${list[cur].he}</b></p>`;
  }
  html += `<div class="parsha-grid">`;
  ordered.forEach((p, i) => {
    const isCur = (cur >= 0 && i === 0);
    html += `<button class="parsha-row ${isCur?'is-current':''}" data-ref="${p.ref}" data-he="${p.he}" data-book="${p.book}">
       <div class="parsha-row-name">${p.he}</div>
       <div class="parsha-row-book">${p.book}</div>
       ${isCur?'<div class="parsha-row-tag">השבוע</div>':''}
    </button>`;
  });
  html += `</div><div id="parshaText"></div>`;
  $('#prayerBody').innerHTML = html;
  $('#tocList').innerHTML = ordered.map((p,i) =>
    `<li data-parsha-ref="${p.ref}"><span>${p.he}</span><span class="toc-num">${(cur>=0 && i===0)?'★':''}</span></li>`
  ).join('');
  // Wire clicks
  $$('.parsha-row').forEach(el => el.addEventListener('click', () => loadParsha(el.dataset.ref, el.dataset.he)));
  $$('#tocList li').forEach(li => li.addEventListener('click', () => {
    closeSheet(); loadParsha(li.dataset.parshaRef, li.querySelector('span').textContent);
  }));
  window.scrollTo({top:0});
}

async function loadParsha(ref, heName){
  const target = $('#parshaText');
  target.innerHTML = `<h3 id="parsha-text-head">${heName}</h3><p class="rubric">טוען מ-Sefaria…</p>`;
  target.scrollIntoView({behavior:'smooth', block:'start'});
  try {
    const url = `https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew&return_format=text_only`;
    const r = await fetch(url);
    if(!r.ok) throw new Error('parsha fetch failed');
    const d = await r.json();
    const v = (d.versions||[]).find(x => x.language === 'he') || (d.versions||[])[0];
    const text = v?.text || [];
    const flat = (function flatten(x){
      if(typeof x === 'string') return [x];
      if(Array.isArray(x)){ const out=[]; for(const i of x) out.push(...flatten(i)); return out; }
      return [];
    })(text);
    let html = `<h3 id="parsha-text-head">${heName}</h3>
                <p class="rubric">${ref}</p>`;
    flat.forEach((p, i) => { if(p && p.trim()) html += `<p><span class="verse-num">${i+1}</span> ${p}</p>`; });
    target.innerHTML = html;
  } catch(err){
    target.innerHTML = `<h3>${heName}</h3><p class="rubric">לא ניתן לטעון את הטקסט. נסה שוב מאוחר יותר.</p>`;
  }
}

/* ─── Tehillim ─── */
function loadPersonalTehillim(){
  try{ return JSON.parse(localStorage.getItem('sidur-personal-tehillim') || '[]'); }
  catch{ return []; }
}
function savePersonalTehillim(list){
  localStorage.setItem('sidur-personal-tehillim', JSON.stringify(list));
}
function loadPersonalPos(){
  return localStorage.getItem('sidur-personal-pos') || 'before';
}
function savePersonalPos(pos){ localStorage.setItem('sidur-personal-pos', pos); }

function todayHebrewDayOfMonth(){
  // Use STATE.todayHE.hd if present (Hebcal converter); else fall back to Gregorian day
  return STATE.todayHE?.hd || new Date().getDate();
}
function tehillimRangesForDay(dayOfMonth){
  const d = String(Math.min(30, Math.max(1, dayOfMonth)));
  const ranges = TEHILLIM_DAILY[d] || [];
  // Special: if month has 29 days, day 29 = day 29 + day 30
  // We can't reliably know without month-info; render as-is for now.
  return ranges;
}
function renderTehillimChapter(ch, opts){
  opts = opts || {};
  const verses = (TEHILLIM_CHAPTERS && TEHILLIM_CHAPTERS[ch]) || [];
  if(!verses.length){
    return `<div class="tehillim-chapter"><h2 class="tehillim-chapter-h" id="tehillim-${ch}">פרק ${toGematria(ch)}</h2><p class="rubric">— הטקסט עוד לא נטען —</p></div>`;
  }
  const personalMark = opts.personal ? `<span class="tehillim-personal-mark">אישי</span>` : '';
  let html = `<div class="tehillim-chapter"><h2 class="tehillim-chapter-h" id="tehillim-${ch}">פרק ${toGematria(ch)}${personalMark}</h2>`;
  let from = opts.from || 1, to = opts.to || verses.length;
  for(let i = from-1; i < to && i < verses.length; i++){
    html += `<span class="tehillim-verse"><span class="tehillim-verse-num">${toGematria(i+1)}</span>${verses[i]}</span>`;
  }
  html += `</div>`;
  return html;
}
function rangeKey(r){
  if(typeof r === 'number') return `c${r}`;
  return `c${r.ch}-${r.from || 1}-${r.to || ''}`;
}
function renderTehillimDaily(){
  const dom = todayHebrewDayOfMonth();
  const dailyRanges = tehillimRangesForDay(dom).slice();
  const personal = loadPersonalTehillim();
  const pos = loadPersonalPos();

  const personalRanges = personal.map(c => ({ ch: c, from: 1, to: TEHILLIM_CHAPTERS[c]?.length || 1, _personal: true }));

  const top = `<h2 id="tehillim-top">תהילים יומי</h2>
    <p class="rubric"><span class="tehillim-day-pill">יום ${toGematria(dom)} בחודש</span></p>`;

  let html = top;
  const addBlocks = (ranges, label) => {
    if(!ranges.length) return;
    if(label) html += `<div class="tehillim-block-h">${label}</div>`;
    for(const r of ranges){
      if(typeof r === 'number') html += renderTehillimChapter(r, { personal: !!r._personal });
      else html += renderTehillimChapter(r.ch, { from:r.from, to:r.to, personal: !!r._personal });
    }
  };

  // Build sections-list for TOC + progress rail
  const tocSections = [];
  const dailyToc = (rs) => rs.map(r => {
    const ch = (typeof r === 'number') ? r : r.ch;
    const id = `tehillim-${ch}`;
    return { id, title: `פרק ${toGematria(ch)}` + (r.from > 1 || (r.to && r.to < (TEHILLIM_CHAPTERS[ch]?.length || 999)) ? ` (${toGematria(r.from||1)}–${toGematria(r.to||TEHILLIM_CHAPTERS[ch]?.length||1)})` : '') };
  });

  if(pos === 'before' && personal.length){
    addBlocks(personalRanges, 'הפרקים האישיים שלי');
    addBlocks(dailyRanges, 'תהילים יומי');
    tocSections.push(...dailyToc(personalRanges));
    tocSections.push(...dailyToc(dailyRanges));
  } else if(pos === 'after' && personal.length){
    addBlocks(dailyRanges, 'תהילים יומי');
    addBlocks(personalRanges, 'הפרקים האישיים שלי');
    tocSections.push(...dailyToc(dailyRanges));
    tocSections.push(...dailyToc(personalRanges));
  } else {
    addBlocks(dailyRanges, '');
    tocSections.push(...dailyToc(dailyRanges));
  }

  $('#prayerBody').innerHTML = html;
  $('#tocList').innerHTML = tocSections.map((s,i) =>
    `<li data-anchor="${s.id}"><span>${s.title}</span><span class="toc-num">${i+1}</span></li>`
  ).join('');
  $$('#tocList li').forEach(li => li.addEventListener('click', () => {
    closeSheet();
    document.getElementById(li.dataset.anchor)?.scrollIntoView({behavior:'smooth', block:'start'});
  }));
  buildProgressRail(tocSections);
  window.scrollTo({top:0});
}

function toGematria(num){
  // Hebrew number 1..400. For chapters 1..150 of Tehillim.
  const map = [[400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],[90,'צ'],[80,'פ'],[70,'ע'],[60,'ס'],[50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],[9,'ט'],[8,'ח'],[7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א']];
  let n = num, out = '';
  for(const [v,l] of map){ while(n >= v){ out += l; n -= v; } }
  out = out.replace(/יה$/,'ט"ו').replace(/יו$/,'ט"ז');
  if(out.length >= 2 && !out.includes('"')) out = out.slice(0,-1) + '"' + out.slice(-1);
  return out;
}

/* ─── Settings screen ─── */
function openSettings(){
  $('#screen-home').classList.remove('active');
  $('#screen-prayer').classList.remove('active');
  $('#screen-settings').classList.add('active');
  renderPersonalList();
  // Set radio state
  const pos = loadPersonalPos();
  $$('input[name="personalPos"]').forEach(i => i.checked = (i.value === pos));
  // Set rc-btn states (settings copies)
  applyPrefs();
  window.scrollTo({top:0});
}
function backFromSettings(){
  $('#screen-settings').classList.remove('active');
  $('#screen-home').classList.add('active');
}
function renderPersonalList(){
  const list = loadPersonalTehillim();
  const ul = $('#personalList');
  if(!ul) return;
  if(list.length === 0){
    ul.innerHTML = '<li style="color:var(--muted);font-size:13.5px;padding:12px 4px;text-align:center">אין פרקים אישיים. הוסיפו פרק כדי להתחיל.</li>';
    return;
  }
  ul.innerHTML = list.map((ch, i) => `
    <li class="personal-item" draggable="true" data-idx="${i}" data-ch="${ch}">
      <span class="personal-handle" aria-hidden="true">⋮⋮</span>
      <span class="personal-num">פרק ${toGematria(ch)}</span>
      <button class="personal-remove" data-rm="${i}" aria-label="הסר פרק">✕</button>
    </li>
  `).join('');
  // Wire remove
  $$('.personal-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = parseInt(btn.dataset.rm);
    const list = loadPersonalTehillim();
    list.splice(idx, 1);
    savePersonalTehillim(list);
    renderPersonalList();
  }));
  // Wire drag-and-drop reordering (mouse)
  let dragSrc = null;
  $$('.personal-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrc = item; item.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.dataset.idx);
    });
    item.addEventListener('dragend', () => { item.classList.remove('is-dragging'); $$('.personal-item').forEach(i => i.classList.remove('is-drag-target')); dragSrc = null; });
    item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('is-drag-target'); });
    item.addEventListener('dragleave', () => item.classList.remove('is-drag-target'));
    item.addEventListener('drop', (e) => {
      e.preventDefault(); item.classList.remove('is-drag-target');
      if(!dragSrc || dragSrc === item) return;
      const fromIdx = parseInt(dragSrc.dataset.idx);
      const toIdx = parseInt(item.dataset.idx);
      const list = loadPersonalTehillim();
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      savePersonalTehillim(list);
      renderPersonalList();
    });
  });
  // Touch reordering — long-press to start drag
  setupTouchReorder();
}

function setupTouchReorder(){
  const items = $$('.personal-item');
  let dragging = null, startY = 0, currentY = 0, placeholder = null;
  items.forEach(item => {
    item.addEventListener('touchstart', (ev) => {
      // Don't drag if user touched the remove button
      if(ev.target.closest('.personal-remove')) return;
      dragging = item;
      startY = ev.touches[0].clientY;
      currentY = startY;
      item.classList.add('is-dragging');
    }, {passive:true});
    item.addEventListener('touchmove', (ev) => {
      if(!dragging) return;
      currentY = ev.touches[0].clientY;
      ev.preventDefault();
      // Find which sibling we're hovering over
      const others = $$('.personal-item').filter(i => i !== dragging);
      for(const other of others){
        const r = other.getBoundingClientRect();
        if(currentY >= r.top && currentY <= r.bottom){
          other.classList.add('is-drag-target');
          others.filter(o => o !== other).forEach(o => o.classList.remove('is-drag-target'));
          return;
        }
      }
    }, {passive:false});
    item.addEventListener('touchend', () => {
      if(!dragging) return;
      const tgt = $$('.personal-item').find(i => i.classList.contains('is-drag-target'));
      $$('.personal-item').forEach(i => i.classList.remove('is-drag-target', 'is-dragging'));
      if(tgt && tgt !== dragging){
        const fromIdx = parseInt(dragging.dataset.idx);
        const toIdx = parseInt(tgt.dataset.idx);
        const list = loadPersonalTehillim();
        const [moved] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, moved);
        savePersonalTehillim(list);
        renderPersonalList();
      }
      dragging = null;
    });
  });
}

function addPersonalChapter(){
  const input = $('#addChapterInput');
  const v = parseInt(input.value);
  if(!v || v < 1 || v > 150){
    input.style.borderColor = 'var(--danger)';
    setTimeout(() => input.style.borderColor = '', 600);
    return;
  }
  const list = loadPersonalTehillim();
  if(list.includes(v)){
    input.value = '';
    return;
  }
  list.push(v);
  savePersonalTehillim(list);
  input.value = '';
  renderPersonalList();
}

/* ─── Sheet ─── */
function openSheet(){ $('#tocSheet').classList.add('open'); $('#sheetMask').classList.add('open'); $('#tocSheet').setAttribute('aria-hidden','false'); }
function closeSheet(){ $('#tocSheet').classList.remove('open'); $('#sheetMask').classList.remove('open'); $('#tocSheet').setAttribute('aria-hidden','true'); }

/* ─── Reading preferences (font size + alignment) ─── */
const READING_SIZES = [16, 18, 20, 22, 25, 28, 32];   // px steps
function loadPrefs(){
  return {
    sizeIdx: parseInt(localStorage.getItem('sidur-size-idx') ?? '2'),
    align: localStorage.getItem('sidur-align') ?? 'right',
  };
}
function applyPrefs(){
  const p = loadPrefs();
  const size = READING_SIZES[Math.max(0, Math.min(READING_SIZES.length-1, p.sizeIdx))];
  document.documentElement.style.setProperty('--prayer-size', size + 'px');
  document.documentElement.style.setProperty('--prayer-align', p.align);
  $$('.rc-btn[data-size]').forEach(b => b.classList.remove('is-active'));
  // Mark "default" (idx=2) when at default; otherwise mark relative
  const sizeBtn = (p.sizeIdx > 2) ? '+1' : (p.sizeIdx < 2) ? '-1' : '0';
  $$('.rc-btn[data-size="' + sizeBtn + '"]').forEach(b => b.classList.add('is-active'));
  $$('.rc-btn[data-align]').forEach(b => b.classList.toggle('is-active', b.dataset.align === p.align));
}
function adjustReadingPref(action){
  const p = loadPrefs();
  if(action === '+1') p.sizeIdx = Math.min(READING_SIZES.length-1, p.sizeIdx + 1);
  else if(action === '-1') p.sizeIdx = Math.max(0, p.sizeIdx - 1);
  else if(action === '0') p.sizeIdx = 2;
  else if(action === 'right' || action === 'justify') p.align = action;
  localStorage.setItem('sidur-size-idx', String(p.sizeIdx));
  localStorage.setItem('sidur-align', p.align);
  applyPrefs();
}
function toggleReadingPanel(e){
  if(e){ e.preventDefault(); e.stopPropagation(); }
  const panel = $('#readingPanel');
  panel.hidden = !panel.hidden;
  if(!panel.hidden) applyPrefs();
}

/* ─── Search ─── */
let SEARCH_INDEX = null;
function buildSearchIndex(){
  if(SEARCH_INDEX) return;
  const idx = [];
  for(const p of PRAYERS){
    idx.push({ kind:'prayer', prayerId:p.id, title:p.title, sub:p.meta, hay:strip(p.title+' '+p.meta) });
    for(const s of (p.sections||[])){
      idx.push({ kind:'section', prayerId:p.id, sectionId:s.id, title:s.title, sub:p.title, hay:strip(s.title) });
    }
    if(p.searchIndex){
      for(const si of p.searchIndex){
        idx.push({ kind:'snippet', prayerId:p.id, sectionId:si.id, title:si.title, sub:p.title, snippet:si.plain.slice(0,120), hay:strip(si.plain) });
      }
    }
  }
  if(typeof PARSHAS !== 'undefined'){
    for(const p of PARSHAS){
      idx.push({ kind:'parsha', parshaRef:p.ref, parshaHe:p.he, title:p.he, sub:`פרשה — ${p.book}`, hay:strip(p.he+' '+p.en) });
    }
  }
  SEARCH_INDEX = idx;
}
function strip(s){
  return (s||'').replace(/[֑-ׇ]/g,'')   // niqqud
                .replace(/<[^>]+>/g,'')           // tags
                .replace(/[׳״'"׳״]/g,'')
                .replace(/\s+/g,' ')
                .toLowerCase();
}
function performSearch(query){
  buildSearchIndex();
  const q = strip(query);
  if(!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const out = [];
  for(const item of SEARCH_INDEX){
    let score = 0;
    let matched = true;
    for(const tok of tokens){
      if(item.hay.includes(tok)) score += (item.kind === 'prayer' ? 8 : item.kind === 'section' ? 5 : item.kind === 'parsha' ? 6 : 1);
      else { matched = false; break; }
    }
    if(matched){
      // Prefer prayers > sections > parshas > snippets
      score += item.kind === 'prayer' ? 100 : item.kind === 'section' ? 60 : item.kind === 'parsha' ? 40 : 0;
      out.push({...item, score});
    }
  }
  out.sort((a,b) => b.score - a.score);
  return out.slice(0, 30);
}
function openSearch(){
  $('#searchOverlay').classList.add('open');
  $('#searchInput').focus();
}
function closeSearch(){
  $('#searchOverlay').classList.remove('open');
  $('#searchInput').value = '';
  $('#searchResults').innerHTML = '';
}
function renderSearchResults(query){
  const results = performSearch(query);
  const root = $('#searchResults');
  if(!query.trim()){ root.innerHTML = '<div class="search-empty">התחילו להקליד כדי לחפש תפילה, קטע או מילים</div>'; return; }
  if(results.length === 0){ root.innerHTML = '<div class="search-empty">לא נמצאו תוצאות</div>'; return; }
  // Deduplicate snippet entries that match the same prayer/section as a higher-ranked item
  const seen = new Set();
  const unique = [];
  for(const r of results){
    const key = (r.prayerId||'') + '|' + (r.sectionId||'') + '|' + (r.parshaRef||'') + '|' + r.kind;
    const dropKey = (r.prayerId||'') + '|' + (r.sectionId||'');
    if(r.kind === 'snippet' && seen.has(dropKey)) continue;
    if(seen.has(key)) continue;
    seen.add(key); seen.add(dropKey);
    unique.push(r);
  }
  root.innerHTML = unique.map(r => {
    const tagMap = {prayer:'תפילה', section:'קטע', parsha:'פרשה', snippet:'מילים בתוך התפילה'};
    return `<button class="search-result" data-kind="${r.kind}" data-pid="${r.prayerId||''}" data-sid="${r.sectionId||''}" data-pref="${r.parshaRef||''}" data-phe="${r.parshaHe||''}">
      <div class="search-result-tag">${tagMap[r.kind]||''}</div>
      <div class="search-result-title">${r.title}</div>
      <div class="search-result-sub">${r.sub||''}</div>
      ${r.snippet ? `<div class="search-result-snippet">${highlight(r.snippet, query)}</div>` : ''}
    </button>`;
  }).join('');
  $$('.search-result').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.kind;
    closeSearch();
    if(k === 'parsha'){
      openPrayer('parsha');
      setTimeout(() => loadParsha(el.dataset.pref, el.dataset.phe), 50);
    } else {
      openPrayer(el.dataset.pid);
      const sid = el.dataset.sid;
      if(sid){ setTimeout(() => { document.getElementById(sid)?.scrollIntoView({behavior:'smooth', block:'start'}); }, 80); }
    }
  }));
}
function highlight(text, query){
  if(!text || !query) return text;
  const q = strip(query).split(/\s+/).filter(Boolean);
  let out = text;
  q.forEach(tok => {
    const re = new RegExp(`(${tok})`, 'gi');
    out = out.replace(re, '<mark>$1</mark>');
  });
  return out;
}

/* ─── Service worker (offline + installable PWA) ─── */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err =>
      console.warn('sw register failed', err)
    );
  });
}

/* ─── Inject Daily-Tehillim entry as a top-level "prayer" ─── */
function injectDailyTehillim(){
  if(typeof PRAYERS === 'undefined' || PRAYERS.find(p => p.id === 'daily-tehillim')) return;
  const tehillimEntry = {
    id: 'daily-tehillim',
    kind: 'tehillim-daily',
    title: 'תהילים יומי',
    meta: 'הפרקים של היום בחודש + פרקים אישיים',
    iconChar: 'ת',
    iconClass: 'cool',
    sections: [],     // built dynamically per day
    sectionHtml: {},
    searchIndex: [],
  };
  // Place it right after "shacharit" (or at the start if no shacharit)
  const idx = PRAYERS.findIndex(p => p.id === 'shacharit');
  PRAYERS.splice(idx >= 0 ? idx + 1 : 0, 0, tehillimEntry);
  PRAYERS_BY_ID[tehillimEntry.id] = tehillimEntry;
}

/* ─── Wire up ─── */
document.addEventListener('DOMContentLoaded', async () => {
  injectDailyTehillim();
  renderHomeMeta();
  renderPrayersList();

  $('#tocBtn')?.addEventListener('click', openSheet);
  $('#sheetMask')?.addEventListener('click', closeSheet);
  $('#backBtn')?.addEventListener('click', backHome);
  $('#searchBtn')?.addEventListener('click', openSearch);
  $('#searchClose')?.addEventListener('click', closeSearch);
  $('#searchInput')?.addEventListener('input', e => renderSearchResults(e.target.value));
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeSearch(); });

  /* Settings screen */
  $('#settingsBtn')?.addEventListener('click', openSettings);
  $('#settingsBackBtn')?.addEventListener('click', backFromSettings);
  $('#addChapterBtn')?.addEventListener('click', addPersonalChapter);
  $('#addChapterInput')?.addEventListener('keydown', (e) => { if(e.key === 'Enter') addPersonalChapter(); });
  $$('input[name="personalPos"]').forEach(r => r.addEventListener('change', () => savePersonalPos(r.value)));
  $$('.settings-rc[data-size]').forEach(b => b.addEventListener('click', () => adjustReadingPref(b.dataset.size)));
  $$('.settings-rc[data-align]').forEach(b => b.addEventListener('click', () => adjustReadingPref(b.dataset.align)));

  $('#themeBtn')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? '' : 'dark';
    if(cur) document.documentElement.setAttribute('data-theme','dark');
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('sidur-theme', cur);
  });
  if(localStorage.getItem('sidur-theme') === 'dark'){
    document.documentElement.setAttribute('data-theme','dark');
  }

  // Reading controls — panel hidden by default, toggled only by the icon
  applyPrefs();
  $('#readingPanel').hidden = true;
  $('#readingToggle')?.addEventListener('click', toggleReadingPanel);
  $$('.rc-btn[data-size]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); adjustReadingPref(b.dataset.size); }));
  $$('.rc-btn[data-align]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); adjustReadingPref(b.dataset.align); }));

  // Hide reading controls during scroll; show again when scrolling stops
  let _scrollHideTimer = null;
  let _lastScrollY = window.scrollY;
  document.addEventListener('scroll', () => {
    const ctrl = $('#readingControls'); if(!ctrl) return;
    const panel = $('#readingPanel');
    const dy = Math.abs(window.scrollY - _lastScrollY);
    _lastScrollY = window.scrollY;
    if(dy > 2){
      ctrl.classList.add('hidden');
      if(panel && !panel.hidden) panel.hidden = true;
    }
    clearTimeout(_scrollHideTimer);
    _scrollHideTimer = setTimeout(() => ctrl.classList.remove('hidden'), 600);
  }, {passive:true});
  document.addEventListener('scroll', () => {
    document.querySelector('.app-header')?.classList.toggle('scrolled', window.scrollY > 4);
  }, {passive:true});

  // Initial offline-friendly suggestion
  STATE.dayInfo = { dow: new Date().getDay(), noTachanun:false };
  renderNowCard(chooseNowPrayer({times:{}}, STATE.dayInfo));

  try{
    const date = todayISO();
    const [zm, hd, hol] = await Promise.all([fetchZmanim(date), fetchHebrewDate(date), fetchHolidays(date)]);
    STATE.zmanim = zm; STATE.todayHE = hd; STATE.hebcal = hol;
    $('#hebrewDate').textContent = fmtHebDate(hd);
    const dayInfo = classifyDay(hol, hd);
    STATE.dayInfo = dayInfo;
    $('#parshaLine').textContent = dayInfo.parsha || '';
    $('#dayKindPill').textContent = dayInfo.kind;
    $('#dayKindPill').className = 'zmanim-pill ' + (dayInfo.pillClass || '');
    renderZmanim(zm);
    renderNowCard(chooseNowPrayer(zm, dayInfo));
  } catch(err){
    console.warn('Hebcal fetch failed', err);
    $('#hebrewDate').textContent = '—';
    $('#parshaLine').textContent = 'אין חיבור לשירות לוח השנה';
    $('#zmanimGrid').innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:13px;padding:8px 0">לא ניתן לטעון את זמני היום. הצעת התפילה מבוססת על השעה בלבד.</div>';
  }
});
