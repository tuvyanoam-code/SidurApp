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
  let isErevYomTov = false, isTishaBav = false;
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
    if(/Tisha B'?Av|ט"?\s*באב/i.test(t)) isTishaBav = true;
    if(/Erev/i.test(t)) isErevYomTov = true;
    tags.push(t);
  }
  const now = new Date();
  const dow = now.getDay();
  const hh = now.getHours() + now.getMinutes()/60;
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

  /* Date-driven liturgical flags */
  const hd_d = hd?.hd;
  const hd_m = hd?.hm;
  const winterPrayerMonths = new Set(['Cheshvan','Kislev','Tevet',"Sh'vat",'Shvat','Adar','Adar I','Adar II','Adar 1','Adar 2']);
  // Aseret Yemei Teshuva: Tishrei 1–10 (Rosh Hashana through Yom Kippur)
  const isAseretYemeiTeshuva = (hd_m === 'Tishrei' && hd_d != null && hd_d >= 1 && hd_d <= 10);
  // Mashiv HaRuach U'Morid HaGeshem: from Mussaf of Shemini Atzeret (Tishrei 22) through Mussaf of Pesach (Nisan 15)
  let isMoridHaGeshem = false;
  if(hd_m === 'Tishrei' && hd_d != null && hd_d >= 22) isMoridHaGeshem = true;
  else if(winterPrayerMonths.has(hd_m)) isMoridHaGeshem = true;
  else if(hd_m === 'Nisan' && hd_d != null && hd_d <= 14) isMoridHaGeshem = true;
  // Tal U'Matar Livracha: Israel — Cheshvan 7 through Nisan 14
  let isTalUMatar = false;
  if(hd_m === 'Cheshvan' && hd_d != null && hd_d >= 7) isTalUMatar = true;
  else if(['Kislev','Tevet',"Sh'vat",'Shvat','Adar','Adar I','Adar II','Adar 1','Adar 2'].includes(hd_m)) isTalUMatar = true;
  else if(hd_m === 'Nisan' && hd_d != null && hd_d <= 14) isTalUMatar = true;
  const isYaaleVeyavo = isRoshChodesh || isCholHamoed || isYomtov;
  const isAlHanissim = isChanukah || isPurim;
  // L'David HaShem Ori: Rosh Chodesh Elul through Hoshana Rabba (Tishrei 21)
  const isElulToHRabba = (hd_m === 'Elul') || (hd_m === 'Tishrei' && hd_d != null && hd_d <= 21);
  // Motzaei Shabbat / Yom Tov heuristic: Sat after sunset OR Sun before alot
  const isMotzaeiShabbat = (dow === 6 && hh >= 18) || (dow === 0 && hh < 5);
  // Tisha B'Av Mincha: only on 9 Av (or 10 Av if 9 Av is Shabbat) during the afternoon
  const isTishaBavMincha = isTishaBav && hh >= 12;

  return {
    kind, pillClass, parsha,
    isShabbat, isYomtov, isCholHamoed, isRoshChodesh,
    isChanukah, isPurim, isLagBaomer, isTuBshvat, isFastDay, isErevYomTov,
    noTachanun, dow,
    hebMonth: hd?.hm, hebDay: hd?.hd,
    isAseretYemeiTeshuva, isMoridHaGeshem, isTalUMatar,
    isYaaleVeyavo, isAlHanissim, isElulToHRabba,
    isMotzaeiShabbat, isTishaBav, isTishaBavMincha,
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

/* ─── Conditional-paragraph labels (longest first to avoid mis-match) ─── */
const VARIANT_LABELS = [
  ['בתענית ציבור ובעשי״ת',     d => d.isFastDay || d.isAseretYemeiTeshuva],
  ['בתענית ציבור ובעשי"ת',     d => d.isFastDay || d.isAseretYemeiTeshuva],
  ['בראש חודש ובחול המועד',    d => d.isYaaleVeyavo],
  ['בראש חודש ובחוה״מ',         d => d.isYaaleVeyavo],
  ['מר״ח אלול עד הושענא רבא',   d => d.isElulToHRabba],
  ['מר"ח אלול עד הושענא רבא',   d => d.isElulToHRabba],
  ['במוצאי שבת ויום טוב',       d => d.isMotzaeiShabbat],
  ['במנחת תשעה באב',            d => d.isTishaBavMincha],
  ['בחנוכה ופורים',             d => d.isAlHanissim],
  ['בתענית ציבור',              d => d.isFastDay],
  ['בתענית צבור',               d => d.isFastDay],
  ['לחנוכה',                    d => d.isChanukah],
  ['לפורים',                    d => d.isPurim],
  ['בעשי״ת',                    d => d.isAseretYemeiTeshuva],
  ['בעשי"ת',                    d => d.isAseretYemeiTeshuva],
  ['בקיץ',                       d => !d.isMoridHaGeshem],
  ['בחורף',                      d => d.isMoridHaGeshem],
];
const DOW_LABELS = {
  'בראשון בשבת': 0,
  'בשני בשבת': 1,
  'בשלישי בשבת': 2,
  'ברביעי בשבת': 3,
  'בחמישי בשבת': 4,
  'בשישי בשבת': 5,
};

function _stripTagsLeading(s, n){
  return s.slice(0, n).replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim();
}
function _findParagraphLabel(inner){
  const lead = _stripTagsLeading(inner, 280);
  for(const [label, condFn] of VARIANT_LABELS){
    if(lead.startsWith(label)) return { label, condFn };
  }
  return null;
}

/* ─── Shir Shel Yom: keep only today's day block ─── */
function filterShirShelYom(html, dayInfo){
  // Locate each day-marker paragraph
  const labels = Object.keys(DOW_LABELS);
  const labelEsc = labels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const markerRe = new RegExp(`<p[^>]*>\\s*<small>\\s*(${labelEsc.join('|')}):?\\s*<\\/small>`, 'g');
  const matches = [];
  let m;
  while((m = markerRe.exec(html)) !== null){
    matches.push({ start: m.index, dow: DOW_LABELS[m[1]] });
  }
  if(matches.length === 0) return html;

  // Determine where the day-block region ends:
  // first occurrence (after the first day marker) of "קדיש יתום" rubric or the Mr"ch Elul rubric.
  const endRes = [
    /<p class="rubric">\s*קדיש יתום\.?\s*<\/p>/,
    /<p class="rubric">\s*מר[״"]ח אלול/
  ];
  let endPos = html.length;
  for(const re of endRes){
    const mm = re.exec(html);
    if(mm && mm.index >= matches[0].start) endPos = Math.min(endPos, mm.index);
  }

  const blockStart = matches[0].start;
  const todayMatch = matches.find(mt => mt.dow === dayInfo.dow);
  if(!todayMatch){
    // Today isn't in the weekday list (Shabbat) — drop the whole region
    return html.slice(0, blockStart) + html.slice(endPos);
  }
  const idx = matches.indexOf(todayMatch);
  const todayEnd = (idx + 1 < matches.length) ? matches[idx + 1].start : endPos;
  const todayBlock = html.slice(todayMatch.start, todayEnd);
  return html.slice(0, blockStart) + todayBlock + html.slice(endPos);
}

/* ─── HTML-level filter applied AFTER section-level filter ─── */
function applyDayFilters(html, dayInfo){
  // (1) Shir Shel Yom days
  html = filterShirShelYom(html, dayInfo);

  // (2) Multi-paragraph blocks — handle BEFORE the per-paragraph filter

  // (2a) Mr"ch Elul: rubric paragraph immediately followed by L'David psalm paragraph
  if(!dayInfo.isElulToHRabba){
    html = html.replace(
      /<p class="rubric">\s*מר[״"]ח אלול[\s\S]*?<\/p>\s*<p[^>]*>[\s\S]*?לְדָוִד[\s\S]*?<\/p>/g, ''
    );
  }

  // (2b) Avinu Malkenu inside Tachanun: rubric+text + 0–2 follow-on Avinu Malkenu paragraphs
  if(!(dayInfo.isFastDay || dayInfo.isAseretYemeiTeshuva)){
    html = html.replace(
      /<p class="rubric">\s*בתענית ציבור ובעשי[״"]ת אומרים כאן אבינו מלכנו[\s\S]*?<\/p>(?:\s*<p[^>]*>[\s\S]*?אָבִינוּ מַלְכֵּ[\s\S]*?<\/p>)*/g, ''
    );
  }

  // (2c) Mon/Thu Selichot block in Tachanun
  if(!(dayInfo.dow === 1 || dayInfo.dow === 4) || dayInfo.noTachanun){
    html = html.replace(
      /<p>\s*<b>\s*לשני וחמישי\s*<\/b>\s*<\/p>[\s\S]*?ע״כ מה שמוסיפין בשני ובחמישי[\s\S]*?<\/p>/g, ''
    );
  } else {
    // On Mon/Thu — strip the explanatory header and the trailing "ע״כ ..." marker
    html = html.replace(/<p>\s*<b>\s*לשני וחמישי\s*<\/b>\s*<\/p>\s*/g, '');
    html = html.replace(/\s*<small>\s*ע״כ מה שמוסיפין בשני ובחמישי[^<]*<\/small>/g, '');
    html = html.replace(/\s*ע״כ מה שמוסיפין בשני ובחמישי[^<]*/g, '');
  }

  // (3) Per-paragraph filter for standalone variant <p>'s
  html = html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/g, (full, inner) => {
    const m = _findParagraphLabel(inner);
    if(!m) return full;
    return m.condFn(dayInfo) ? full : '';
  });

  // (4) Inline variants within paragraphs we kept

  // (4a) Mashiv HaRuach / Morid HaTal — same paragraph carries both variants
  html = html.replace(
    /<p>\s*<small>\s*בקיץ\s*<\/small>\s*([^<:]+:)\s*<small>\s*בחורף\s*<\/small>\s*([^<:]+:)\s*<\/p>/g,
    (m, summer, winter) => `<p>${(dayInfo.isMoridHaGeshem ? winter : summer).trim()}</p>`
  );

  // (4b) Tal U'Matar inline in Birkat HaShanim
  html = html.replace(
    /וְתֵן\s*<small>\s*בקיץ\s*<\/small>\s*בְּרָכָה\s*\(\s*<small>\s*בחורף\s*<\/small>\s*טַל וּמָטָר לִבְרָכָה\s*\)/g,
    dayInfo.isTalUMatar ? 'וְתֵן טַל וּמָטָר לִבְרָכָה' : 'וְתֵן בְּרָכָה'
  );

  // (4c) Aseret Yemei Teshuva — inline parenthesized variants
  if(!dayInfo.isAseretYemeiTeshuva){
    html = html.replace(/\s*\(\s*<small>\s*בעשי[״"]ת\s*<\/small>[^)]*\)/g, '');
  }

  return html;
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
  // Legacy day-block markup (kept for compatibility)
  body = body.replace(/<div class="dow-block" data-dow="(\d)"[^>]*>([\s\S]*?)<\/div>/g, (m, d, inner) => {
    return (parseInt(d) === dayInfo.dow) ? inner : '';
  });
  // Day-aware HTML filtering
  body = applyDayFilters(body, dayInfo);
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
  if(_railScrollHandler){ window.removeEventListener('scroll', _railScrollHandler); _railScrollHandler = null; }
  if(_railResizeHandler){ window.removeEventListener('resize', _railResizeHandler); _railResizeHandler = null; }
}

/* ─── Progress rail (scroll-driven, pulses on section crossing) ─── */
let _railSectionMap = null;       // id → { dot, title, idx }
let _railSectionOrder = [];
let _railSectionPositions = [];   // [{id, top}] in document coords
let _railDots = [];
let _railFillEl = null, _railTrackEl = null, _railEl = null, _railBubbleEl = null;
let _railHideBubbleTimer = null;
let _railCurrentIdx = -1;
let _railScrollHandler = null;
let _railResizeHandler = null;
let _railRaf = null;

function buildProgressRail(sections){
  _railEl    = $('#progressRail');
  _railTrackEl = $('#railTrack');
  _railFillEl  = $('#railFill');
  if(!_railEl || !_railTrackEl || !_railFillEl) return;
  // Detach previous handlers
  if(_railScrollHandler){ window.removeEventListener('scroll', _railScrollHandler); _railScrollHandler = null; }
  if(_railResizeHandler){ window.removeEventListener('resize', _railResizeHandler); _railResizeHandler = null; }

  if(!sections || sections.length === 0){
    _railEl.style.display = 'none';
    _railTrackEl.innerHTML = '';
    _railFillEl.style.width = '0';
    if(_railBubbleEl) _railBubbleEl.classList.remove('show');
    _railSectionPositions = [];
    _railDots = [];
    return;
  }
  _railEl.style.display = 'block';

  _railSectionMap = {};
  _railSectionOrder = sections.map(s => s.id);

  _railTrackEl.innerHTML = sections.map((s,i) =>
    `<div class="rail-dot" data-anchor="${s.id}" data-idx="${i}" data-title="${s.title.replace(/"/g, '&quot;')}"></div>`
  ).join('');

  // One shared bubble appended after the track
  let bubble = $('#railBubble');
  if(!bubble){
    bubble = document.createElement('div');
    bubble.id = 'railBubble';
    bubble.className = 'rail-bubble';
    _railEl.appendChild(bubble);
  }
  _railBubbleEl = bubble;
  bubble.classList.remove('show');

  _railDots = $$('#railTrack .rail-dot');
  _railDots.forEach(dot => {
    _railSectionMap[dot.dataset.anchor] = { dot, title: dot.dataset.title, idx: parseInt(dot.dataset.idx) };
    dot.addEventListener('click', (e) => { e.stopPropagation(); showRailBubble(dot); });
  });
  _railTrackEl.addEventListener('click', () => hideRailBubble());

  _railCurrentIdx = -1;

  // Measure section tops once layout settles (font load may shift things)
  setTimeout(measureRailSectionPositions, 60);
  setTimeout(measureRailSectionPositions, 400);

  _railScrollHandler = () => {
    if(_railRaf) return;
    _railRaf = requestAnimationFrame(() => {
      _railRaf = null;
      updateRailProgress();
    });
  };
  _railResizeHandler = () => {
    measureRailSectionPositions();
    updateRailProgress();
  };
  window.addEventListener('scroll', _railScrollHandler, {passive:true});
  window.addEventListener('resize', _railResizeHandler, {passive:true});
  updateRailProgress();
}

function measureRailSectionPositions(){
  _railSectionPositions = _railSectionOrder.map(id => {
    const el = document.getElementById(id);
    return { id, top: el ? (el.getBoundingClientRect().top + window.scrollY) : 0 };
  });
}

function updateRailProgress(){
  if(!_railFillEl || !_railTrackEl || _railSectionPositions.length === 0) return;
  // Sticky offset: app header (~52px) + rail itself (~30px) + small breathing room
  const headerOffset = 96;
  const refY = window.scrollY + headerOffset;

  // Find the highest-indexed section that started above our reference line
  let curIdx = -1;
  for(let i = 0; i < _railSectionPositions.length; i++){
    if(_railSectionPositions[i].top <= refY) curIdx = i;
  }

  // Fractional progress within the current section (towards next section)
  let frac = 0;
  if(curIdx >= 0 && curIdx + 1 < _railSectionPositions.length){
    const segStart = _railSectionPositions[curIdx].top;
    const segEnd   = _railSectionPositions[curIdx + 1].top;
    if(segEnd > segStart) frac = Math.max(0, Math.min(1, (refY - segStart) / (segEnd - segStart)));
  } else if(curIdx === _railSectionPositions.length - 1){
    const segStart = _railSectionPositions[curIdx].top;
    const docEnd   = (document.documentElement.scrollHeight - window.innerHeight) + headerOffset;
    if(docEnd > segStart) frac = Math.max(0, Math.min(1, (refY - segStart) / (docEnd - segStart)));
  }

  // Compute fill width from the right edge of the track
  const trackRect = _railTrackEl.getBoundingClientRect();
  let fillWidth = 0;
  if(curIdx >= 0 && _railDots[curIdx]){
    const dotRect = _railDots[curIdx].getBoundingClientRect();
    const dotCenterX = dotRect.left + dotRect.width / 2;
    const baseWidth = trackRect.right - dotCenterX;
    let segPx = 0;
    if(curIdx + 1 < _railDots.length && _railDots[curIdx + 1]){
      const nextRect = _railDots[curIdx + 1].getBoundingClientRect();
      const nextCenterX = nextRect.left + nextRect.width / 2;
      segPx = dotCenterX - nextCenterX; // RTL: next is to the LEFT
    }
    fillWidth = baseWidth + segPx * frac;
  }
  _railFillEl.style.width = Math.max(0, Math.min(trackRect.width, fillWidth)) + 'px';

  // Detect transition + pulse newly reached dot
  if(curIdx !== _railCurrentIdx){
    const prevIdx = _railCurrentIdx;
    _railCurrentIdx = curIdx;
    _railDots.forEach((dot, i) => {
      dot.classList.toggle('is-done',    i < curIdx);
      dot.classList.toggle('is-current', i === curIdx);
    });
    if(curIdx > prevIdx && curIdx >= 0){
      const reached = _railDots[curIdx];
      if(reached){
        reached.classList.remove('rail-dot-pulse');
        void reached.offsetWidth; // restart animation
        reached.classList.add('rail-dot-pulse');
        setTimeout(() => reached.classList.remove('rail-dot-pulse'), 700);
      }
    }
  }
}

function showRailBubble(dot){
  if(!_railBubbleEl || !dot || !_railTrackEl) return;
  const trackRect = _railTrackEl.getBoundingClientRect();
  const railRect  = _railEl.getBoundingClientRect();
  const dotRect = dot.getBoundingClientRect();
  // Position bubble centered above the dot, but clamped inside the rail's width
  // bubble uses transform:translateX(50%) so .right = distance from dot's right edge to rail's right
  const dotCenterFromRailRight = railRect.right - (dotRect.left + dotRect.width/2);
  // Render bubble first so we can measure it
  _railBubbleEl.innerHTML = `
    <span>${dot.dataset.title}</span>
    <button type="button" class="rail-bubble-jump" data-jump="${dot.dataset.anchor}">קפיצה</button>
  `;
  _railBubbleEl.classList.add('show');
  // Measure
  const bubbleW = _railBubbleEl.offsetWidth;
  const railW   = railRect.width;
  // Compute desired right offset relative to rail
  let right = dotCenterFromRailRight - bubbleW/2;
  right = Math.max(8, Math.min(railW - bubbleW - 8, right));
  _railBubbleEl.style.right = right + 'px';
  _railBubbleEl.style.left = 'auto';
  _railBubbleEl.style.transform = 'none';
  // Reposition arrow to point at the dot
  let arrowOffset = (dotCenterFromRailRight - right);
  arrowOffset = Math.max(10, Math.min(bubbleW - 10, arrowOffset));
  _railBubbleEl.style.setProperty('--arrow-from-right', arrowOffset + 'px');
  // Wire jump button
  _railBubbleEl.querySelector('.rail-bubble-jump').addEventListener('click', (e) => {
    e.stopPropagation();
    const anchor = e.currentTarget.dataset.jump;
    const el = document.getElementById(anchor);
    if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
    hideRailBubble();
  });
  // Auto-hide after a few seconds
  clearTimeout(_railHideBubbleTimer);
  _railHideBubbleTimer = setTimeout(hideRailBubble, 2400);
}

function hideRailBubble(){
  if(_railBubbleEl) _railBubbleEl.classList.remove('show');
  clearTimeout(_railHideBubbleTimer);
}

// Close bubble when clicking anywhere else
document.addEventListener('click', (e) => {
  if(!_railBubbleEl || !_railEl) return;
  if(!_railEl.contains(e.target)) hideRailBubble();
}, true);

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

  // Reading controls live in Settings only — apply current prefs on load.
  applyPrefs();

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
