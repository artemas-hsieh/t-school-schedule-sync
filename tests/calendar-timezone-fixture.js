'use strict';
const assert = require('node:assert/strict');

module.exports = function installCalendarTimeZoneFixture(context) {
  const calendars = new Map();
  const originalFetch = context.UrlFetchApp && context.UrlFetchApp.fetch;
  context.ScriptApp.getOAuthToken = () => 'test-calendar-token';
  context.UrlFetchApp = {
    fetch(url, options) {
      if (!url.startsWith('https://www.googleapis.com/calendar/v3/calendars/')) {
        return originalFetch(url, options);
      }
      assert.equal(options.headers.Authorization, 'Bearer test-calendar-token');
      assert.equal(options.followRedirects, false);
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/');
      const calendar = calendars.get(decodeURIComponent(parts[4]));
      assert.ok(calendar, 'Calendar API 必須使用指定日曆');
      let body;
      if (!options.method) {
        const uid = parsed.searchParams.get('iCalUID');
        const event = calendar.getEventById(uid);
        body = { items: event ? [{ id: uid + '-api', iCalUID: uid }] : [] };
      } else {
        assert.equal(options.method, 'patch');
        const uid = decodeURIComponent(parts[6]).replace(/-api$/, '');
        const event = calendar.getEventById(uid);
        assert.ok(event);
        body = JSON.parse(options.payload);
        assert.equal(body.start.timeZone, 'Asia/Taipei');
        assert.equal(body.end.timeZone, 'Asia/Taipei');
        assert.deepEqual(Object.keys(body).sort(), ['end', 'start']);
        event.start = new Date(body.start.dateTime);
        event.end = new Date(body.end.dateTime);
        event.timeZone = body.start.timeZone;
      }
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
    }
  };
  return calendar => calendars.set(calendar.getId(), calendar);
};
