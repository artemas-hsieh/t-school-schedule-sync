'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
global.window = global;
global.TSchoolScheduleData = require('../schedule-data.js');
require('../sidebar-template.js');
require('../setup-dialog-template.js');
require('../code-template.js');
const code = global.buildAppsScriptCode({
  sourceApiUrl: global.TSchoolScheduleData.API_URL,
  emailTemplateManifestUrl: 'https://raw.githubusercontent.com/artemas-hsieh/t-school-schedule-sync/5f31cd2fb263b9b5e579eab0d25c1b4f278f854f/notification-email-templates.json'
});
const calls = [];
let lookupStatus = 200;
let patchStatus = 200;
let lookupBody = { items: [{ id: 'api-id', iCalUID: 'uid@google.com' }] };
const context = vm.createContext({
  ScriptApp: { getOAuthToken: () => 'test-token' },
  UrlFetchApp: { fetch(url, options) {
    calls.push({ url, options });
    return {
      getResponseCode: () => options.method ? patchStatus : lookupStatus,
      getContentText: () => JSON.stringify(options.method ? {} : lookupBody)
    };
  } }
});
vm.runInContext(code, context);
const calendar = { getId: () => 'calendar@example.com' };
const event = { getId: () => 'uid@google.com' };
const item = {
  start: new Date('2026-10-29T08:25:00+08:00'),
  end: new Date('2026-10-29T09:15:00+08:00'),
  isAllDay: false
};
context.applyCalendarEventTimeZone_(calendar, event, item);
assert.match(calls[0].url, /calendar%40example.com\/events\?iCalUID=uid%40google.com$/);
assert.match(calls[1].url, /\/events\/api-id$/);
const payload = JSON.parse(calls[1].options.payload);
assert.deepEqual(payload, {
  start: { dateTime: '2026-10-29T00:25:00.000Z', timeZone: 'Asia/Taipei' },
  end: { dateTime: '2026-10-29T01:15:00.000Z', timeZone: 'Asia/Taipei' }
});
assert.equal(new Date(payload.start.dateTime).getTime(), item.start.getTime());
calls.length = 0;
context.applyCalendarEventTimeZone_(calendar, event, { ...item, isAllDay: true });
assert.equal(calls.length, 0);
for (const body of [
  { items: [] },
  { items: [{ id: 'wrong', iCalUID: 'other-uid' }] },
  { items: [{ id: 'api-id', iCalUID: event.getId() }, { id: 'second-id', iCalUID: event.getId() }] },
  { ...lookupBody, nextPageToken: 'more' }
]) {
  calls.length = 0;
  lookupBody = body;
  assert.throws(() => context.applyCalendarEventTimeZone_(calendar, event, item), /無法唯一辨識/);
  assert.equal(calls.length, 1);
}
lookupStatus = 503;
assert.throws(() => context.applyCalendarEventTimeZone_(calendar, event, item), /無法讀取事件時區/);
lookupStatus = 200;
lookupBody = { items: [{ id: 'api-id', iCalUID: 'uid@google.com' }] };
patchStatus = 403;
assert.throws(() => context.applyCalendarEventTimeZone_(calendar, event, item), /無法設定事件/);
const description = vm.runInContext('MANAGED_CALENDAR_DESCRIPTION', context);
let timeZone = 'Etc/UTC';
const managed = {
  getDescription: () => description,
  getTimeZone: () => timeZone,
  setTimeZone: value => { timeZone = value; }
};
context.ensureManagedCalendarTimeZone_({ ...managed, getDescription: () => '私人日曆' });
assert.equal(timeZone, 'Etc/UTC');
context.ensureManagedCalendarTimeZone_(managed);
assert.equal(timeZone, 'Asia/Taipei');
// A force repair must also fix timezone metadata when the clock times are unchanged
let repairs = 0;
context.applyCalendarEventTimeZone_ = () => { repairs += 1; };
context.isStoredManagedEvent_ = () => true;
context.setManagedEventTags_ = () => {};
context.applyEventReminders_ = () => {};
context.buildEventTitle_ = () => '課程';
context.buildEventLocation_ = () => '';
context.buildManagedDescription_ = () => '';
const storedEvent = {
  ...event,
  isAllDayEvent: () => false,
  getStartTime: () => item.start, getEndTime: () => item.end,
  getTitle: () => '課程', getLocation: () => '', getDescription: () => ''
};
const storedCalendar = { getEventById: () => storedEvent };
context.updateCalendarEvent_(storedCalendar, event.getId(), item, 'key', {}, undefined, {});
assert.equal(repairs, 0);
context.updateCalendarEvent_(storedCalendar, event.getId(), item, 'key', {}, undefined, { forceCalendarCheck: true });
assert.equal(repairs, 1);
console.log('Calendar timezone checks passed');
