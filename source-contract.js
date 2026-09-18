(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  if (root) root.TSchoolSourceContractFactory = factory;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSourceContract() {
  'use strict';
  const HOURS = 36 * 60 * 60 * 1000;
  const LABELS = ['高一', '高二', '高三'];
  const API_LABELS = ['一年級', '二年級', '三年級'];
  const TIMES = [['08:25','09:15'],['09:15','10:05'],['10:15','11:05'],['11:05','11:55'],['13:25','14:15'],['14:15','15:05'],['15:15','16:05'],['16:05','16:55']];
  function fail(code) { const error = new Error('課表資料驗證失敗：' + code); error.code = code; throw error; }
  function keys(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('OBJECT');
    const actual = Object.keys(value).sort();
    if (JSON.stringify(actual) !== JSON.stringify(names.slice().sort())) fail('FIELDS');
  }
  function text(value, max, empty) {
    if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || value !== value.trim() ||
        /[\u0000-\u001f\u007f<>]|https?:\/\/|user_content_key|authorization|bearer\s|[^\s@]+@[^\s@]+\.[^\s@]+/i.test(value)) fail('TEXT');
    return value;
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value) fail('DATE');
    return value;
  }
  function instant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('INSTANT');
    return Date.parse(value);
  }
  function integer(value, min, max) { if (!Number.isInteger(value) || value < min || value > max) fail('INTEGER'); }
  function normalized(value) { return value.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF\s]/g,'').toLowerCase(); }
  function term(code, firstDate) {
    const y = Number(firstDate.slice(0,4)); const m = Number(firstDate.slice(5,7));
    return API_LABELS[code - 1] + '|' + (m >= 8 ? y : y - 1) + '-' + (m >= 8 || m === 1 ? 1 : 2);
  }
  function validateSchedule(s) {
    keys(s, ['grade','termKey','timezone','firstDate','lastDate','sourceUpdatedLabel','weeks','catalog','events']);
    keys(s.grade, ['code','label','sourceLabel']); integer(s.grade.code,1,3);
    if (s.grade.label !== LABELS[s.grade.code-1] || s.grade.sourceLabel !== API_LABELS[s.grade.code-1] || s.timezone !== 'Asia/Taipei') fail('GRADE');
    date(s.firstDate); date(s.lastDate); text(s.sourceUpdatedLabel,120,true);
    if (s.termKey !== term(s.grade.code,s.firstDate) || s.firstDate > s.lastDate) fail('TERM');
    if (!Array.isArray(s.weeks) || s.weeks.length < 4 || s.weeks.length > 26) fail('WEEKS');
    const weeks = Object.create(null); let last = '';
    s.weeks.forEach(w => {
      keys(w,['weekNum','firstDate','lastDate','period']); integer(w.weekNum,1,60); date(w.firstDate); date(w.lastDate);
      if (weeks[w.weekNum] || w.firstDate <= last || w.firstDate > w.lastDate || Date.parse(w.lastDate) - Date.parse(w.firstDate) > 6*86400000 || !['term','vacation'].includes(w.period)) fail('WEEK');
      weeks[w.weekNum] = w; last = w.lastDate;
    });
    if (s.firstDate !== s.weeks[0].firstDate || s.lastDate !== last || Date.parse(last)-Date.parse(s.firstDate) >= 26*7*86400000) fail('RANGE');
    if (!Array.isArray(s.catalog) || !s.catalog.length || s.catalog.length > 2000) fail('CATALOG');
    const titles = Object.create(null);
    s.catalog.forEach(c => {
      keys(c,['title','period']); text(c.title,240,false);
      const key = normalized(c.title);
      if (Object.prototype.hasOwnProperty.call(titles,key) || !['term','vacation'].includes(c.period)) fail('CATALOG_COLLISION');
      titles[key] = c;
    });
    if (!Array.isArray(s.events) || s.events.length < 1 || s.events.length > 2000) fail('EVENTS');
    const ids = new Set(); const occurrences = new Set(); const seenTitles = new Set(); const vacationTitles = new Set();
    s.events.forEach(e => {
      keys(e,['id','title','date','allDay','weekNum','periodStart','periodEnd','startTime','endTime','location','sourceUpdatedLabel']);
      text(e.id,128,false); text(e.title,240,false); text(e.location,240,true); text(e.sourceUpdatedLabel,120,true); date(e.date);
      if (ids.has(e.id)) fail('DUPLICATE_ID'); ids.add(e.id);
      const w = weeks[e.weekNum]; const c = titles[normalized(e.title)];
      if (!w || e.date < w.firstDate || e.date > w.lastDate || !c || c.title !== e.title || typeof e.allDay !== 'boolean') fail('EVENT_CONTEXT');
      seenTitles.add(normalized(e.title));
      if (w.period === 'vacation') vacationTitles.add(normalized(e.title));
      if (e.allDay) {
        if (e.periodStart !== 0 || e.periodEnd !== 0 || e.startTime !== null || e.endTime !== null) fail('ALL_DAY');
      } else {
        integer(e.periodStart,1,8); integer(e.periodEnd,e.periodStart,8);
        if (e.startTime !== TIMES[e.periodStart-1][0] || e.endTime !== TIMES[e.periodEnd-1][1]) fail('PERIOD_TIME');
      }
      const occurrence = JSON.stringify([normalized(e.title),e.date,e.allDay,e.periodStart,e.periodEnd,normalized(e.location)]);
      if (occurrences.has(occurrence)) fail('DUPLICATE_OCCURRENCE'); occurrences.add(occurrence);
    });
    if (seenTitles.size !== s.catalog.length) fail('UNUSED_CATALOG');
    s.catalog.forEach(c => { if (c.period !== (vacationTitles.has(normalized(c.title)) ? 'vacation' : 'term')) fail('CATALOG_PERIOD'); });
    return s;
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function content(schedules) {
    return schedules.map(s => {
      validateSchedule(s);
      return Object.assign({},s, { catalog:s.catalog.slice().sort((a,b)=>canonical(a)<canonical(b)?-1:1), events:s.events.slice().sort((a,b)=>canonical(a)<canonical(b)?-1:1) });
    }).sort((a,b)=>a.grade.code-b.grade.code);
  }
  function validateBundle(b, now) {
    keys(b,['schemaVersion','schedules','coverage','parser','policyVersion','fullVerifiedAt']);
    if (b.schemaVersion !== 1 || b.policyVersion !== 1 || !Array.isArray(b.schedules) || b.schedules.length !== 3) fail('BUNDLE');
    keys(b.parser,['kind','version']); text(b.parser.kind,60,false); text(b.parser.version,80,false);
    if (b.parser.kind !== 'deterministic') fail('PARSER');
    if (!Array.isArray(b.coverage)) fail('COVERAGE');
    const expected = new Set(); const grades = new Set();
    b.schedules.forEach(s => {
      validateSchedule(s); if (grades.has(s.grade.code)) fail('GRADE'); grades.add(s.grade.code);
      if (now && Math.min(Math.abs(Date.parse(s.firstDate)-now),Math.abs(Date.parse(s.lastDate)-now))>370*86400000) fail('DISTANT_TERM');
      s.weeks.forEach(w=>expected.add(s.grade.code+':'+w.weekNum));
    });
    const full = instant(b.fullVerifiedAt);
    const seen = new Set();
    b.coverage.forEach(c=>{
      keys(c,['grade','weekNum','verifiedAt']); const key=c.grade+':'+c.weekNum; const at=instant(c.verifiedAt);
      if (!expected.has(key) || seen.has(key) || at<full || (now && at>now+60000)) fail('COVERAGE'); seen.add(key);
    });
    if (seen.size!==expected.size || (now && full>now+60000)) fail('COVERAGE');
    return b;
  }
  function verifiedAt(b) { return new Date(Math.min.apply(null,b.coverage.map(c=>instant(c.verifiedAt)))).toISOString(); }
  function assertPermission(p, now, expectedSnapshot) {
    const time=now instanceof Date?now.getTime():Number(now || Date.now());
    if (!p || p.schemaVersion!==1 || !/^[a-f0-9]{64}$/.test(p.snapshotId || '') || (expectedSnapshot && p.snapshotId!==expectedSnapshot)) fail('SNAPSHOT');
    integer(p.revision,1,Number.MAX_SAFE_INTEGER);
    const verified=instant(p.verifiedAt); const until=instant(p.validUntil); instant(p.publishedAt);
    if (until!==verified+HOURS || verified>time+60000) fail('VALIDITY');
    if (p.syncAllowed!==true || p.status!=='ready' || time>=until) {
      const error=new Error((p.status==='pending_review'?'課表異動待審核，已暫停同步':time>=until?'課表來源已過期，已暫停同步':'課表來源已暫停同步')+'｜最後驗證：'+p.verifiedAt);
      error.code='SOURCE_PAUSED'; error.sourcePaused=true; throw error;
    }
    return p;
  }
  function validateResponse(p, grade, now) {
    keys(p,['schemaVersion','snapshotId','revision','verifiedAt','validUntil','publishedAt','syncAllowed','status','schedule']);
    validateSchedule(p.schedule);
    if (p.schedule.grade.label!==grade) fail('GRADE');
    assertPermission(p,now); return p;
  }
  return { HOURS,LABELS,API_LABELS,TIMES,fail,keys,text,date,instant,normalized,term,canonical,content,validateSchedule,validateBundle,verifiedAt,assertPermission,validateResponse };
});
