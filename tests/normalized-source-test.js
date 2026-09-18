'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const scheduleData = require('../schedule-data.js');
const contract = scheduleData.sourceContract;
global.window = global;
require('../sidebar-template.js'); require('../setup-dialog-template.js'); require('../code-template.js');
const manifest = 'https://raw.githubusercontent.com/artemas-hsieh/t-school-schedule-sync/5f31cd2fb263b9b5e579eab0d25c1b4f278f854f/notification-email-templates.json';
const legacyCode = global.buildAppsScriptCode({ sourceApiUrl: scheduleData.API_URL, emailTemplateManifestUrl: manifest });
const Utilities = { formatDate(value, _timezone, format) {
  const iso = new Date(new Date(value).getTime()+8*3600000).toISOString();
  return format.replace(/yyyy/g,iso.slice(0,4)).replace(/MM/g,iso.slice(5,7)).replace(/dd/g,iso.slice(8,10)).replace(/HH/g,iso.slice(11,13)).replace(/mm/g,iso.slice(14,16)).replace(/ss/g,iso.slice(17,19));
} };
const legacy = vm.createContext({ console, Intl, Utilities }); vm.runInContext(legacyCode, legacy);
const now = new Date('2026-09-08T00:00:00.000Z');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'resources/schedule-data-1.json'), 'utf8'));
const records = legacy.inferHeaderDates_(raw, now);
const weekMap = new Map();
records.forEach(r => {
  const weekNum = Number(raw.tableData[r.rowIndex].weekNum);
  const dates = weekMap.get(weekNum) || []; dates.push(r.dateKey); weekMap.set(weekNum, dates);
});
const vacation = legacy.getVacationWeekNumbersFromPayload_(raw);
const weeks = [...weekMap].map(([weekNum, dates]) => ({ weekNum, firstDate: dates.sort()[0], lastDate: dates.at(-1), period: vacation[weekNum] ? 'vacation' : 'term' }));
const schedules = [1,2,3].map(code => {
  const source = legacy.parseSchedulePayload_(raw, contract.LABELS[code-1], now);
  return {
    grade: { code, label: contract.LABELS[code-1], sourceLabel: contract.API_LABELS[code-1] },
    termKey: source.termKey, timezone: 'Asia/Taipei', firstDate: source.firstDateKey, lastDate: source.lastDateKey,
    sourceUpdatedLabel: source.sourceUpdatedLabel, weeks,
    catalog: JSON.parse(JSON.stringify(source.catalog.all)),
    events: source.events.map((e,i) => ({ id: String(i), title: e.originalTitle, date: e.dateKey, allDay: e.isAllDay, weekNum: e.weekNum, periodStart: e.periodStart, periodEnd: e.periodEnd, startTime: e.isAllDay ? null : e.startTime, endTime: e.isAllDay ? null : e.endTime, location: e.location, sourceUpdatedLabel: e.sourceUpdatedLabel }))
  };
});
const bundle = { schemaVersion:1, schedules, coverage:schedules.flatMap(s=>weeks.map(w=>({grade:s.grade.code,weekNum:w.weekNum,verifiedAt:now.toISOString()}))), parser:{kind:'deterministic',version:'legacy-fixture-replay'},policyVersion:1,fullVerifiedAt:now.toISOString() };
contract.validateBundle(bundle,now.getTime());
const snapshotId = crypto.createHash('sha256').update(contract.canonical({schemaVersion:1,schedules:contract.content(schedules)})).digest('hex');
const permission = {schemaVersion:1,snapshotId,revision:1,verifiedAt:now.toISOString(),validUntil:new Date(now.getTime()+contract.HOURS).toISOString(),publishedAt:now.toISOString(),syncAllowed:true,status:'ready'};
global.TSchoolScheduleData = {...scheduleData,NORMALIZED_API_ORIGIN:'https://source.example.test'};
const code = global.buildAppsScriptCode({sourceApiUrl:'https://source.example.test',emailTemplateManifestUrl:manifest});
global.TSchoolScheduleData = scheduleData;
assert.doesNotThrow(()=>new Function(code));
let currentPermission=permission; let reads=0;
const normalized = vm.createContext({console,Intl,Utilities,UrlFetchApp:{fetch:()=>{reads++;return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(currentPermission)};}}});
vm.runInContext(code,normalized);
normalized.scheduleBusinessNow_=()=>now;
for(const schedule of schedules) {
  const response={...permission,schedule};
  const before=legacy.parseSchedulePayload_(raw,schedule.grade.label,now);
  const after=normalized.parseSchedulePayload_(response,schedule.grade.label,now);
  const summary=scheduleData.summarizePayload(response,now);
  assert.equal(after.catalogFingerprint,before.catalogFingerprint);
  assert.equal(after.scheduleFingerprint,before.scheduleFingerprint);
  assert.equal(summary.catalogFingerprint,after.catalogFingerprint);
  assert.deepEqual(Array.from(after.events,normalized.makeOccurrenceKey_),Array.from(before.events,legacy.makeOccurrenceKey_));
  assert.deepEqual(JSON.parse(JSON.stringify(after.events)),JSON.parse(JSON.stringify(before.events)));
  const state={};before.events.forEach(e=>{const key=legacy.makeOccurrenceKey_(e);state[key]={...e,stateKey:key,calendarEventId:'test-'+key};});
  const plan=normalized.buildSyncPlan_(state,after.events,'2026-01-01');
  assert.equal(plan.additions.length,0); assert.equal(plan.deletions.length,0);
  normalized.assertNormalizedCalendarWritesAllowed_(after,true);
  for(const invalid of [{...response,status:'pending_review',syncAllowed:false},{...response,schedule:{...schedule,grade:{...schedule.grade,code:4}}},{...response,validUntil:new Date(now.getTime()-1).toISOString()}]) assert.throws(()=>normalized.parseSchedulePayload_(invalid,schedule.grade.label,now));
}
currentPermission={...permission,status:'pending_review',syncAllowed:false};
assert.throws(()=>normalized.assertNormalizedCalendarWritesAllowed_(null,true),/暫停同步/);
// A permission cached earlier in this same execution cannot authorize a new mutation.
for(const name of ['createCalendarEvent_','updateCalendarEvent_','updateCalendarOutlineFields_','migrateCalendarEventMetadata_']) {
  const before=reads;
  assert.throws(()=>normalized[name](),/暫停同步/);
  assert.equal(reads,before+1);
}
assert.throws(()=>normalized.applySyncOperation_({type:'delete'}),/暫停同步/);
normalized.findManagedCalendarEventsByStateKey_=()=>[{}];
assert.throws(()=>normalized.createCalendarEventIdempotent_(),/暫停同步/);
for(const name of ['createCalendarEvent_','createCalendarEventIdempotent_','updateCalendarEvent_','updateCalendarOutlineFields_','migrateCalendarEventMetadata_','applySyncOperation_','applySyncPlan_','recoverDeletedManagedEvents_']) {
  vm.runInContext('normalizedSourcePermissionCheckedAt_ = 0',normalized);
  assert.throws(()=>normalized[name](),/暫停同步/,name+' must check permission before any Calendar operation');
}
let writes=0;normalized.createCalendarEvent_=()=>{writes++;};
assert.throws(()=>normalized.runSyncJobBatch_({},null,{},[],{},'2026-09-08'),/暫停同步/);
assert.equal(writes,0);assert.ok(reads>0);

// Exercise real batch planning, Calendar ownership, persistence and idempotent recovery.
// Only external services are mocked; a pause happens after the first create succeeds.
const properties = new Map();
const scriptProperties = {
  getProperty:key=>properties.get(key)||null,
  setProperty(key,value){properties.set(key,String(value));return this;},
  getProperties:()=>Object.fromEntries(properties),
  setProperties(values){Object.entries(values).forEach(([k,v])=>properties.set(k,String(v)));return this;},
  deleteProperty(key){properties.delete(key);return this;}
};
let savedJob; const triggers=[];
currentPermission=permission;
const batch = vm.createContext({console,Intl,Utilities:{...Utilities,getUuid:()=>crypto.randomUUID()},
  PropertiesService:{getScriptProperties:()=>scriptProperties},
  ScriptApp:{getScriptId:()=> 'normalized-batch-test'},
  CalendarApp:{EventTransparency:{OPAQUE:'OPAQUE',TRANSPARENT:'TRANSPARENT'}},
  UrlFetchApp:normalized.UrlFetchApp
});
vm.runInContext(code,batch);
batch.scheduleBusinessNow_=()=>now;
batch.saveSyncJob_=job=>{savedJob=JSON.parse(JSON.stringify(job));};
batch.ensureOneTimeTrigger_=(handler,delay)=>triggers.push({handler,delay});
batch.writeSyncJobProgress_=()=>{};
const calendarEvents=[];
let pauseAfterCreate=false;
let mutationCount=0;
const calendar={
  getId:()=> 'normalized-calendar',
  getEvents:()=>calendarEvents.filter(event=>!event.deleted),
  getEventById:id=>calendarEvents.find(event=>event.getId()===id&&!event.deleted)||null,
  createEvent(title,start,end,options){
    mutationCount++;
    const id='calendar-'+calendarEvents.length; const tags={};
    const event={title,start,end,...options,deleted:false,
      getId:()=>id,getTitle(){return this.title;},getLocation(){return this.location;},
      getDescription(){return this.description;},getStartTime(){return new Date(this.start);},
      getEndTime(){return new Date(this.end);},isAllDayEvent:()=>false,
      getTag:key=>tags[key]||'',
      setTag(key,value){mutationCount++;tags[key]=String(value);return this;},
      setTitle(value){mutationCount++;this.title=value;},
      setLocation(value){mutationCount++;this.location=value;},
      setDescription(value){mutationCount++;this.description=value;},
      setTransparency(){mutationCount++;},removeAllReminders(){mutationCount++;},
      deleteEvent(){mutationCount++;this.deleted=true;}
    };
    calendarEvents.push(event);
    if(pauseAfterCreate) currentPermission={...permission,revision:2,status:'pending_review',syncAllowed:false};
    return event;
  }
};
const settings={descriptionPreset:'standard',customDescription:'',reminderMode:'none',reminderMinutes:10};
const desired=batch.parseSchedulePayload_({...permission,schedule:schedules[0]},'高一',now).events.filter(e=>!e.isAllDay).slice(0,3);
const existingKey=batch.makeOccurrenceKey_(desired[0]);
const existing=batch.createCalendarEvent_(calendar,desired[0],existingKey,settings);
const committedState={[existingKey]:batch.serializeStateItem_(desired[0],existing.getId(),batch.makeEventSignature_(desired[0],settings),settings)};
const committedBefore=JSON.stringify(committedState);
// A same-content private event without management tags must never be adopted or changed.
const privateEvent=calendar.createEvent(desired[1].originalTitle,desired[1].start,desired[1].end,{location:desired[1].location,description:'私人事件'});
const privateBefore=JSON.stringify(privateEvent);
const job={schemaVersion:2,jobId:'pause-resume',status:'running',phase:'calendar',reason:'manual',
  firstSetup:false,forceCalendarCheck:false,retryCount:0,processedOperations:0,desiredCount:3,
  initialOperationCount:2,inFlight:[],changes:[],migrationFromId:'',migrationEntries:[],migrationCursor:0};
pauseAfterCreate=true;
let pauseError;
try { batch.runSyncJobBatch_(job,calendar,committedState,desired,settings,'2026-01-01'); }
catch(error){pauseError=error;}
assert.equal(pauseError&&pauseError.sourcePaused,true);
assert.equal(calendarEvents.length,3,'only one new managed event may be created before the pause');
assert.equal(JSON.stringify(committedState),committedBefore,'a partial batch cannot overwrite committed state');
assert.equal(savedJob.inFlight.length,2,'the full batch must remain recoverable after interruption');
const pausedMutationCount=mutationCount;
const pausedResult=batch.handleSyncJobFailure_(job,pauseError);
assert.equal(pausedResult.sourcePaused,true);
assert.equal(savedJob.status,'retry_pending');
assert.equal(savedJob.retryCount,0,'source pause cannot consume the transient failure retry');
assert.equal(triggers.at(-1).delay,30*60*1000);
assert.throws(()=>batch.runSyncJobBatch_(savedJob,calendar,committedState,desired,settings,'2026-01-01'),/暫停同步/);
assert.equal(mutationCount,pausedMutationCount,'continuation during pause must perform no mutations');
pauseAfterCreate=false;
currentPermission={...permission,revision:3};
// A continuation reads the current source before resuming its saved batch.
assert.throws(()=>batch.runSyncJobBatch_(savedJob,calendar,committedState,desired,settings,'2026-01-01'),/發布版本已變更/);
batch.parseSchedulePayload_({...currentPermission,schedule:schedules[0]},'高一',now);
const resumed=batch.runSyncJobBatch_(savedJob,calendar,committedState,desired,settings,'2026-01-01');
assert.equal(resumed.pending,false);
assert.equal(Object.keys(resumed.state).length,3);
assert.equal(calendarEvents.length,4,'resume must reuse the previously created managed event');
assert.equal(resumed.state[existingKey].calendarEventId,existing.getId());
assert.equal(JSON.stringify(privateEvent),privateBefore,'private events must remain unchanged');
console.log(JSON.stringify({grades:3,fixture:'legacy fixture replay; not live three-grade evidence',eventsPerGrade:schedules.map(s=>s.events.length),upgradeRebuilds:0,pausedWrites:writes,midBatchPauseResume:'passed',privateEventMutations:0}));
