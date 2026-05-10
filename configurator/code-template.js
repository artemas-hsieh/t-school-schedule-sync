(function () {
  function formatString(value) {
    return JSON.stringify(String(value || ''));
  }

  function formatNumberArray(values) {
    return `[${values.map(Number).join(', ')}]`;
  }

  function formatStringArray(values) {
    if (!values || values.length === 0) {
      return '[]';
    }

    return `[\n${values.map(value => `  ${formatString(value)}`).join(',\n')}\n]`;
  }

  function formatObject(value) {
    return JSON.stringify(value || {}, null, 2);
  }

  window.buildAppsScriptCode = function buildAppsScriptCode(settings) {
    const notifyHour = Number(settings.notifySyncHour || settings.notifyHour || 5);
    const courseDictionary = window.TSCHOOL_COURSE_DICTIONARY || {};
    const nonElectiveEvents = window.TSCHOOL_NON_ELECTIVE_EVENTS || {};

    return `const CONFIG = {
  sheetUrl: ${formatString(settings.sheetUrl)},
  sheetName: ${formatString(settings.sheetName)},
  calendarId: ${formatString(settings.calendarId)},

  gradeName: ${formatString(settings.gradeName)},
  timezone: 'Asia/Taipei',

  eventTitlePrefix: '',
  syncIdPrefix: '[T-SCHOOL-SCHEDULE-SYNC]',

  syncLookbackDays: 0,
  autoSyncHours: ${formatNumberArray(settings.autoSyncHours)},
  notifySyncHour: ${notifyHour},
  notificationEmail: ${formatString(settings.notificationEmail)},
  notificationSuccessSubject: '[T-SCHOOL 課表同步] 課表同步成功',
  notificationFailureSubject: '[T-SCHOOL 課表同步] ！課表同步失敗！',
  rescheduleNoticeStateProperty: 'RESCHEDULE_NOTICE_STATE',

  quickDeleteAllFromYear: 2000,
  quickDeleteAllToYear: 2100,

  schoolYearOffset: 1911
};

const SELECTED_COURSES = ${formatStringArray(settings.selectedCourses)};

const INCLUDE_NON_ELECTIVE_EVENTS = ${settings.includeWholeSchool ? 'true' : 'false'};

const COURSE_DICTIONARY = ${formatObject(courseDictionary)};

const NON_ELECTIVE_EVENTS = ${formatObject(nonElectiveEvents)};

function syncMyScheduleToCalendar() {
  try {
    return syncMyScheduleToCalendar_({
      notifyOnSuccess: false
    });
  } catch (error) {
    sendSyncNotification_(CONFIG.notificationFailureSubject);
    throw error;
  }
}

function syncMyScheduleToCalendarWithNotification() {
  try {
    return syncMyScheduleToCalendar_({
      notifyOnSuccess: true
    });
  } catch (error) {
    sendSyncNotification_(CONFIG.notificationFailureSubject);
    throw error;
  }
}

function forceFullSyncMyScheduleToCalendar() {
  try {
    return syncMyScheduleToCalendar_({
      notifyOnSuccess: false,
      forceCalendarCheck: true
    });
  } catch (error) {
    sendSyncNotification_(CONFIG.notificationFailureSubject);
    throw error;
  }
}

function syncMyScheduleToCalendar_(options) {
  const ss = SpreadsheetApp.openByUrl(CONFIG.sheetUrl);
  const sheet = ss.getSheetByName(CONFIG.sheetName);

  if (!sheet) {
    throw new Error(\`找不到工作表：\${CONFIG.sheetName}\`);
  }

  const calendar = CalendarApp.getCalendarById(CONFIG.calendarId);

  if (!calendar) {
    throw new Error(\`找不到日曆，請確認 Calendar ID：\${CONFIG.calendarId}\`);
  }

  const syncStartDate = getSyncStartDate_();
  const sheetContext = buildSheetContext_(sheet);
  const rescheduleNotices = findNewRescheduleNotices_(sheetContext);
  const events = parseMyGradeEvents_(sheetContext).filter(item => item.date >= syncStartDate);
  const oldState = loadState_();
  const keptState = {};
  const newState = {};
  const forceCalendarCheck = Boolean(options && options.forceCalendarCheck);
  let skippedUnchangedCount = 0;

  events.forEach(item => {
    const syncId = makeSyncId_(item);
    const syncSignature = makeItemSyncSignature_(item);
    newState[syncId] = Object.assign({}, item, {
      syncSignature
    });

    const previous = oldState[syncId];

    if (previous && previous.calendarEventId) {
      if (!forceCalendarCheck && isUnchangedStoredItem_(previous, item, syncSignature)) {
        newState[syncId].calendarEventId = previous.calendarEventId;
        skippedUnchangedCount++;
        return;
      }

      const updatedId = updateCalendarEvent_(calendar, previous.calendarEventId, item, syncId);
      newState[syncId].calendarEventId = updatedId;
    } else {
      const event = createCalendarEvent_(calendar, item, syncId);
      newState[syncId].calendarEventId = event.getId();
    }
  });

  Object.keys(oldState).forEach(syncId => {
    const oldItem = oldState[syncId];

    if (shouldKeepOldState_(oldItem, syncStartDate)) {
      keptState[syncId] = oldItem;
      return;
    }

    if (!newState[syncId] && oldItem.calendarEventId) {
      deleteCalendarEvent_(calendar, oldItem.calendarEventId);
    }
  });

  saveState_(Object.assign({}, keptState, newState));
  notifySyncSuccess_(Boolean(options && options.notifyOnSuccess), rescheduleNotices);

  Logger.log(\`同步完成，自 \${formatDateKey_(syncStartDate)} 起共 \${events.length} 筆事件，跳過未變更 \${skippedUnchangedCount} 筆。\`);
}

function buildSheetContext_(sheet) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  const displays = range.getDisplayValues();
  const grade = findGradeBlock_(values, CONFIG.gradeName);
  const weekRows = findWeekRows_(values, grade.labelCol);

  return {
    sheet,
    range,
    values,
    displays,
    grade,
    weekRows,
    matchContext: buildMatchContext_()
  };
}

function parseMyGradeEvents_(sheetContext) {
  const values = sheetContext.values;
  const displays = sheetContext.displays;
  const grade = sheetContext.grade;
  const weekRows = sheetContext.weekRows;
  const events = [];
  const mergedMap = buildMergedRangeMap_(sheetContext.range);
  const handledMergedCells = {};

  weekRows.forEach((weekStartRow, index) => {
    const nextWeekStartRow = weekRows[index + 1] || values.length;
    const weekName = String(values[weekStartRow][grade.labelCol] || '').trim();

    const dateRow = weekStartRow;
    const weekdayRow = weekStartRow + 1;
    const firstPeriodRow = weekStartRow + 2;

    const dayGroups = buildDayGroups_(values, displays, dateRow, weekdayRow, grade);

    for (let periodIndex = 0; periodIndex < 8; periodIndex++) {
      const rowIndex = firstPeriodRow + periodIndex;

      if (rowIndex >= nextWeekStartRow) {
        continue;
      }

      const periodNumber = Number(values[rowIndex][grade.labelCol]);

      if (!periodNumber || periodNumber < 1 || periodNumber > 8) {
        continue;
      }

      dayGroups.forEach(day => {
        day.cols.forEach(colIndex => {
          const mergedInfo = getMergedInfo_(mergedMap, rowIndex, colIndex);

          if (mergedInfo) {
            const mergedKey = \`\${mergedInfo.startRow},\${mergedInfo.startCol}\`;

            if (handledMergedCells[mergedKey]) {
              return;
            }

            if (mergedInfo.startRow !== rowIndex + 1 || mergedInfo.startCol !== colIndex + 1) {
              return;
            }

            handledMergedCells[mergedKey] = true;
          }

          const rawText = mergedInfo
            ? mergedInfo.value
            : normalizeCellText_(displays[rowIndex][colIndex]);

          if (!rawText) {
            return;
          }

          const parsed = parseCourseCell_(rawText);
          const matched = classifyMatchedEvent_(parsed.title, sheetContext.matchContext);

          if (!matched.shouldInclude) {
            return;
          }

          const date = toDateObject_(values[dateRow][day.firstCol]);

          if (!date) {
            return;
          }

          const timeInfo = parsePeriodTime_(displays[rowIndex][0]);

          if (!timeInfo) {
            return;
          }

          let periodEnd = periodNumber;
          let endClock = timeInfo.end;

          if (mergedInfo && mergedInfo.endRow > mergedInfo.startRow) {
            const mergedEndRowIndex = mergedInfo.endRow - 1;
            const detectedEndPeriod = getPeriodNumberFromRow_(values, mergedEndRowIndex, grade.labelCol);
            const detectedEndClock = getEndTimeFromPeriodRow_(displays, mergedEndRowIndex);

            if (detectedEndPeriod && detectedEndClock) {
              periodEnd = detectedEndPeriod;
              endClock = detectedEndClock;
            }
          }

          const event = {
            title: buildEventTitle_(parsed.title, matched.type),
            originalTitle: parsed.title,
            type: matched.type,
            weekName,
            date,
            weekday: day.weekday,
            periodStart: periodNumber,
            periodEnd,
            start: combineDateAndClock_(date, timeInfo.start),
            end: combineDateAndClock_(date, endClock),
            location: parsed.location,
            description: buildDescription_({
              weekName,
              weekday: day.weekday,
              periodStart: periodNumber,
              periodEnd,
              sourceCell: toA1_(rowIndex + 1, colIndex + 1),
              rawText
            }),
            sourceCell: toA1_(rowIndex + 1, colIndex + 1),
            sourceColumn: colIndex + 1,
            rawText
          };

          events.push(event);
        });
      });
    }
  });

  return mergeContinuousEvents_(events);
}

function buildMergedRangeMap_(range) {
  const map = {};
  const mergedRanges = range.getMergedRanges();

  mergedRanges.forEach(range => {
    const startRow = range.getRow();
    const startCol = range.getColumn();
    const numRows = range.getNumRows();
    const numCols = range.getNumColumns();
    const value = normalizeCellText_(range.getDisplayValue());

    if (!value) {
      return;
    }

    for (let row = startRow; row < startRow + numRows; row++) {
      for (let col = startCol; col < startCol + numCols; col++) {
        map[\`\${row},\${col}\`] = {
          startRow,
          startCol,
          endRow: startRow + numRows - 1,
          endCol: startCol + numCols - 1,
          value
        };
      }
    }
  });

  return map;
}

function getMergedInfo_(mergedMap, rowIndex, colIndex) {
  return mergedMap[\`\${rowIndex + 1},\${colIndex + 1}\`] || null;
}

function getPeriodNumberFromRow_(values, rowIndex, labelCol) {
  const value = values[rowIndex][labelCol];
  const period = Number(value);

  if (!period || period < 1 || period > 8) {
    return null;
  }

  return period;
}

function getEndTimeFromPeriodRow_(displays, rowIndex) {
  const timeInfo = parsePeriodTime_(displays[rowIndex][0]);

  if (!timeInfo) {
    return null;
  }

  return timeInfo.end;
}

function findGradeBlock_(values, gradeName) {
  const headerRowIndex = 1;
  const row = values[headerRowIndex];

  let gradeCol = -1;

  for (let col = 0; col < row.length; col++) {
    if (String(row[col] || '').trim() === gradeName) {
      gradeCol = col;
      break;
    }
  }

  if (gradeCol === -1) {
    throw new Error(\`找不到年級區塊：\${gradeName}\`);
  }

  let nextGradeCol = row.length;

  for (let col = gradeCol + 1; col < row.length; col++) {
    const text = String(row[col] || '').trim();

    if (text === '高一' || text === '高二' || text === '高三' || text.includes('會議安排')) {
      nextGradeCol = col;
      break;
    }
  }

  return {
    labelCol: gradeCol,
    firstCourseCol: gradeCol + 1,
    lastCourseCol: nextGradeCol - 1
  };
}

function findWeekRows_(values, labelCol) {
  const rows = [];

  for (let row = 0; row < values.length; row++) {
    const text = String(values[row][labelCol] || '').trim();

    if (/^第.+週$/.test(text)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    throw new Error('找不到任何週次列，請確認課表格式是否改變。');
  }

  return rows;
}

function buildDayGroups_(values, displays, dateRow, weekdayRow, grade) {
  const groups = [];
  let current = null;

  for (let col = grade.firstCourseCol; col <= grade.lastCourseCol; col++) {
    const weekday = normalizeCellText_(displays[weekdayRow][col]);
    const dateValue = values[dateRow][col];

    if (isWeekdayText_(weekday)) {
      if (current) {
        groups.push(current);
      }

      current = {
        weekday,
        firstCol: col,
        cols: [col]
      };
    } else if (current) {
      const hasDate = Boolean(toDateObject_(dateValue));

      if (!hasDate) {
        current.cols.push(col);
      } else {
        groups.push(current);
        current = null;
      }
    }
  }

  if (current) {
    groups.push(current);
  }

  return groups;
}

function buildMatchContext_() {
  const gradeDictionary = COURSE_DICTIONARY[CONFIG.gradeName] || {};
  const gradeOtherEvents = getGradeOtherEvents_();
  const selectedCandidates = [];
  const otherEventCandidates = [];
  const knownCandidates = [];

  SELECTED_COURSES.forEach(selectedCourse => {
    const normalizedSelectedCourse = normalizeCourseName_(selectedCourse);

    addPreparedCandidate_(selectedCandidates, selectedCourse);

    for (const baseCourse in gradeDictionary) {
      if (normalizeCourseName_(baseCourse) !== normalizedSelectedCourse) {
        continue;
      }

      addPreparedCandidates_(selectedCandidates, gradeDictionary[baseCourse] || []);
    }
  });

  for (const baseCourse in gradeDictionary) {
    addPreparedCandidate_(knownCandidates, baseCourse);
    addPreparedCandidates_(knownCandidates, gradeDictionary[baseCourse] || []);
  }

  addPreparedCandidates_(otherEventCandidates, gradeOtherEvents);
  addPreparedCandidates_(knownCandidates, getGradeRequiredCourseEvents_());
  addPreparedCandidates_(knownCandidates, gradeOtherEvents);

  return {
    selectedCandidates,
    otherEventCandidates,
    knownCandidates
  };
}

function addPreparedCandidates_(target, candidates) {
  (candidates || []).forEach(candidate => addPreparedCandidate_(target, candidate));
}

function addPreparedCandidate_(target, candidate) {
  const parsed = parseCourseCell_(candidate);
  const normalizedTitle = normalizeCourseName_(parsed.title);

  if (normalizedTitle && target.indexOf(normalizedTitle) === -1) {
    target.push(normalizedTitle);
  }
}

function matchesPreparedCandidates_(normalizedTitle, candidates) {
  return candidates.some(candidate => {
    return isNormalizedCourseTitlePatternMatch_(normalizedTitle, candidate);
  });
}

function classifyMatchedEvent_(title, matchContext) {
  const context = matchContext || buildMatchContext_();
  const normalizedTitle = normalizeCourseName_(title);

  const matchedCourse = matchesPreparedCandidates_(normalizedTitle, context.selectedCandidates);

  if (matchedCourse) {
    return {
      shouldInclude: true,
      type: 'course'
    };
  }

  const matchedKnownOtherEvent = INCLUDE_NON_ELECTIVE_EVENTS &&
    matchesPreparedCandidates_(normalizedTitle, context.otherEventCandidates);

  if (matchedKnownOtherEvent) {
    return {
      shouldInclude: true,
      type: 'wholeSchool'
    };
  }

  const matchedNewNonCourseEvent = INCLUDE_NON_ELECTIVE_EVENTS &&
    !matchesPreparedCandidates_(normalizedTitle, context.knownCandidates);

  if (matchedNewNonCourseEvent) {
    return {
      shouldInclude: true,
      type: 'wholeSchool'
    };
  }

  return {
    shouldInclude: false,
    type: 'ignored'
  };
}

function getGradeOtherEvents_() {
  const gradeEvents = NON_ELECTIVE_EVENTS[CONFIG.gradeName] || {};
  return Array.isArray(gradeEvents) ? gradeEvents : gradeEvents['其他'] || [];
}

function getGradeRequiredCourseEvents_() {
  const gradeEvents = NON_ELECTIVE_EVENTS[CONFIG.gradeName] || {};
  return Array.isArray(gradeEvents) ? [] : gradeEvents['必修課程'] || [];
}

function isCourseTitlePatternMatch_(normalizedTitle, course) {
  const normalizedCourse = normalizeCourseName_(course);
  return isNormalizedCourseTitlePatternMatch_(normalizedTitle, normalizedCourse);
}

function isNormalizedCourseTitlePatternMatch_(normalizedTitle, normalizedCourse) {
  if (normalizedTitle === normalizedCourse) {
    return true;
  }

  if (!normalizedTitle.startsWith(normalizedCourse)) {
    return false;
  }

  const suffix = normalizedTitle.slice(normalizedCourse.length);
  return /^(\([^)]*\))+$/.test(suffix) ||
    /^_[^_].+/.test(suffix) ||
    /^[-－:：].+/.test(suffix);
}

function parseCourseCell_(text) {
  const normalized = normalizeCellText_(text);
  const locationMatches = [...normalized.matchAll(/\\[([^\\]]+)\\]/g)];
  const locations = locationMatches.map(match => match[1].trim()).filter(Boolean);

  const title = normalized
    .replace(/\\[[^\\]]+\\]/g, '')
    .replace(/\\s+/g, ' ')
    .trim();

  return {
    title,
    location: locations.join('、')
  };
}

function mergeContinuousEvents_(events) {
  const sorted = events.slice().sort((a, b) => {
    return a.date - b.date ||
      a.sourceColumn - b.sourceColumn ||
      a.periodStart - b.periodStart ||
      a.originalTitle.localeCompare(b.originalTitle);
  });

  const merged = [];

  sorted.forEach(event => {
    const last = merged[merged.length - 1];

    const canMerge = last &&
      last.originalTitle === event.originalTitle &&
      last.location === event.location &&
      sameDate_(last.date, event.date) &&
      last.sourceColumn === event.sourceColumn &&
      last.periodEnd + 1 === event.periodStart &&
      last.end.getTime() === event.start.getTime();

    if (canMerge) {
      last.periodEnd = event.periodEnd;
      last.end = event.end;
      last.description = buildDescription_({
        weekName: last.weekName,
        weekday: last.weekday,
        periodStart: last.periodStart,
        periodEnd: last.periodEnd,
        sourceCell: last.sourceCell,
        rawText: last.rawText
      });
    } else {
      merged.push(Object.assign({}, event));
    }
  });

  return merged;
}

function createCalendarEvent_(calendar, item, syncId) {
  return calendar.createEvent(
    item.title,
    item.start,
    item.end,
    {
      location: item.location,
      description: item.description
    }
  );
}

function updateCalendarEvent_(calendar, calendarEventId, item, syncId) {
  const event = calendar.getEventById(calendarEventId);

  if (!event) {
    const newEvent = createCalendarEvent_(calendar, item, syncId);
    return newEvent.getId();
  }

  if (event.getTitle() !== item.title) {
    event.setTitle(item.title);
  }

  if (event.getStartTime().getTime() !== item.start.getTime() ||
      event.getEndTime().getTime() !== item.end.getTime()) {
    event.setTime(item.start, item.end);
  }

  if ((event.getLocation() || '') !== (item.location || '')) {
    event.setLocation(item.location);
  }

  if ((event.getDescription() || '') !== (item.description || '')) {
    event.setDescription(item.description);
  }

  return event.getId();
}

function deleteCalendarEvent_(calendar, calendarEventId) {
  const event = calendar.getEventById(calendarEventId);

  if (event) {
    event.deleteEvent();
  }
}

function getStoredItemSyncSignature_(item) {
  return item && item.syncSignature
    ? item.syncSignature
    : makeItemSyncSignature_(item);
}

function isUnchangedStoredItem_(storedItem, currentItem, currentSignature) {
  const storedSignature = getStoredItemSyncSignature_(storedItem);

  return storedSignature === currentSignature ||
    storedSignature === makeItemLegacySyncSignature_(currentItem);
}

function makeItemSyncSignature_(item) {
  return JSON.stringify([
    item.title || '',
    item.originalTitle || '',
    item.type || '',
    getDateSignatureValue_(item.date),
    item.weekName || '',
    item.weekday || '',
    Number(item.periodStart) || 0,
    Number(item.periodEnd) || 0,
    getTimeSignatureValue_(item.start),
    getTimeSignatureValue_(item.end),
    item.location || '',
    item.sourceCell || '',
    Number(item.sourceColumn) || 0,
    item.rawText || ''
  ]);
}

function makeItemLegacySyncSignature_(item) {
  return JSON.stringify([
    item.title || '',
    item.originalTitle || '',
    item.type || '',
    getDateSignatureValue_(item.date),
    item.weekName || '',
    item.weekday || '',
    Number(item.periodStart) || 0,
    Number(item.periodEnd) || 0,
    getTimeSignatureValue_(item.start),
    getTimeSignatureValue_(item.end),
    item.location || '',
    item.description || '',
    item.sourceCell || '',
    Number(item.sourceColumn) || 0,
    item.rawText || ''
  ]);
}

function getDateSignatureValue_(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (isNaN(date.getTime())) {
    return '';
  }

  return formatDateKey_(date);
}

function getTimeSignatureValue_(value) {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();

  return isNaN(time) ? '' : time;
}

function makeSyncId_(item) {
  return [
    CONFIG.gradeName,
    formatDateKey_(item.date),
    item.periodStart,
    item.periodEnd,
    item.sourceColumn,
    normalizeCourseName_(item.originalTitle)
  ].join('|');
}

function buildEventTitle_(title, type) {
  if (type === 'wholeSchool') {
    return \`全校｜\${title}\`;
  }

  return \`\${CONFIG.eventTitlePrefix}\${title}\`;
}

function buildDescription_(data) {
  return [
    '[T-SCHOOL 課表同步] ',
    '',
    \`週次：\${formatWeekName_(data.weekName)}\`,
    \`星期：\${formatWeekdayLabel_(data.weekday)}\`,
    \`節次：\${formatPeriodRange_(data.periodStart, data.periodEnd)}\`,
    \`來源儲存格：\${data.sourceCell}\`,
    '',
    \`原始內容：\${data.rawText}\`
  ].join('\\n');
}

function formatWeekName_(weekName) {
  return String(weekName || '')
    .replace(/^第/, '')
    .replace(/週$/, '')
    .trim();
}

function formatWeekdayLabel_(weekday) {
  const text = String(weekday || '').trim();
  const match = text.match(/^星期([一二三四五六日])$/);
  return match ? \`（\${match[1]}）\` : text;
}

function formatPeriodRange_(periodStart, periodEnd) {
  if (periodStart === periodEnd) {
    return String(periodStart);
  }

  return \`\${periodStart}–\${periodEnd}\`;
}

function parsePeriodTime_(timeText) {
  const text = String(timeText || '').trim();
  const match = text.match(/(\\d{1,2}):(\\d{2})\\s*[–-]\\s*(\\d{1,2}):(\\d{2})/);

  if (!match) {
    return null;
  }

  return {
    start: {
      hour: Number(match[1]),
      minute: Number(match[2])
    },
    end: {
      hour: Number(match[3]),
      minute: Number(match[4])
    }
  };
}

function combineDateAndClock_(date, clock) {
  const result = new Date(date);
  result.setHours(clock.hour);
  result.setMinutes(clock.minute);
  result.setSeconds(0);
  result.setMilliseconds(0);
  return result;
}

function toDateObject_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  return null;
}

function isWeekdayText_(text) {
  return /^星期[一二三四五六日]$/.test(String(text || '').trim());
}

function sameDate_(a, b) {
  return formatDateKey_(a) === formatDateKey_(b);
}

function getSyncStartDate_() {
  const todayKey = Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy-MM-dd');
  const parts = todayKey.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() - CONFIG.syncLookbackDays);
  return date;
}

function shouldKeepOldState_(item, syncStartDate) {
  if (!item || !item.date) {
    return false;
  }

  const date = toDateObject_(new Date(item.date));
  return date && date < syncStartDate;
}

function formatDateKey_(date) {
  return Utilities.formatDate(date, CONFIG.timezone, 'yyyy-MM-dd');
}

function normalizeCellText_(value) {
  return String(value || '')
    .replace(/\\r/g, '\\n')
    .replace(/\\n+/g, '\\n')
    .trim();
}

function normalizeCourseName_(value) {
  return String(value || '')
    .replace(/\\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/＿/g, '_')
    .replace(/　/g, '')
    .trim();
}

function toA1_(row, col) {
  let columnName = '';
  let n = col;

  while (n > 0) {
    const remainder = (n - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    n = Math.floor((n - 1) / 26);
  }

  return \`\${columnName}\${row}\`;
}

function loadState_() {
  const raw = PropertiesService
    .getScriptProperties()
    .getProperty('SYNC_STATE');

  return raw ? JSON.parse(raw) : {};
}

function saveState_(state) {
  PropertiesService
    .getScriptProperties()
    .setProperty('SYNC_STATE', JSON.stringify(state));
}

function findNewRescheduleNotices_(sheetContext) {
  const notices = parseRescheduleNotices_(sheetContext);
  const oldState = loadRescheduleNoticeState_();

  return notices.filter(notice => !oldState[notice.key]);
}

function parseRescheduleNotices_(sheetContext) {
  const values = sheetContext.values;
  const displays = sheetContext.displays;
  const grade = sheetContext.grade;
  const weekRows = sheetContext.weekRows;
  const firstWeekRow = weekRows[0];
  const dateMap = buildSheetDateMap_(values);
  const seenText = {};
  const notices = [];

  for (let row = 0; row < firstWeekRow; row++) {
    for (let col = grade.labelCol; col <= grade.lastCourseCol; col++) {
      const text = normalizeCellText_(displays[row][col]);

      if (!text || seenText[text]) {
        continue;
      }

      seenText[text] = true;
      notices.push.apply(notices, extractRescheduleNoticesFromText_(text, dateMap, sheetContext.matchContext));
    }
  }

  return notices;
}

function extractRescheduleNoticesFromText_(text, dateMap, matchContext) {
  const notices = [];
  const normalizedText = normalizeCellText_(text);
  const pattern = /(^|\\n)\\s*([^：:]+?)\\s*[：:]\\s*(\\d{1,2})\\s*\\/\\s*(\\d{1,2})\\s*第\\s*([0-9]+)\\s*節\\s*調整\\s*為\\s*(\\d{1,2})\\s*\\/\\s*(\\d{1,2})\\s*第\\s*([0-9]+)\\s*節/g;
  let match;

  while ((match = pattern.exec(normalizedText)) !== null) {
    const parsed = parseCourseCell_(match[2]);
    const matched = classifyMatchedEvent_(parsed.title, matchContext);

    if (!matched.shouldInclude) {
      continue;
    }

    const fromDate = resolveMonthDayDate_(dateMap, Number(match[3]), Number(match[4]));
    const toDate = resolveMonthDayDate_(dateMap, Number(match[6]), Number(match[7]));
    const fromPeriods = parsePeriodDigits_(match[5]);
    const toPeriods = parsePeriodDigits_(match[8]);

    if (!fromDate || !toDate || !fromPeriods || !toPeriods) {
      continue;
    }

    const notice = {
      title: parsed.title,
      fromDate,
      fromPeriodStart: fromPeriods.start,
      fromPeriodEnd: fromPeriods.end,
      toDate,
      toPeriodStart: toPeriods.start,
      toPeriodEnd: toPeriods.end
    };

    notice.key = makeRescheduleNoticeKey_(notice);
    notices.push(notice);
  }

  return dedupeRescheduleNotices_(notices);
}

function buildSheetDateMap_(values) {
  const dateMap = {};

  values.forEach(row => {
    row.forEach(value => {
      const date = toDateObject_(value);

      if (!date || date.getFullYear() < 2000) {
        return;
      }

      const key = \`\${date.getMonth() + 1}/\${date.getDate()}\`;

      if (!dateMap[key]) {
        dateMap[key] = date;
      }
    });
  });

  return dateMap;
}

function resolveMonthDayDate_(dateMap, month, day) {
  const mapped = dateMap[\`\${month}/\${day}\`];

  if (mapped) {
    return mapped;
  }

  const fallbackYear = Number(Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyy'));
  return new Date(fallbackYear, month - 1, day);
}

function parsePeriodDigits_(digits) {
  const text = String(digits || '').trim();

  if (!/^[1-8]+$/.test(text)) {
    return null;
  }

  return {
    start: Number(text.charAt(0)),
    end: Number(text.charAt(text.length - 1))
  };
}

function dedupeRescheduleNotices_(notices) {
  const seen = {};

  return notices.filter(notice => {
    if (seen[notice.key]) {
      return false;
    }

    seen[notice.key] = true;
    return true;
  });
}

function makeRescheduleNoticeKey_(notice) {
  return [
    normalizeCourseName_(notice.title),
    formatDateKey_(notice.fromDate),
    notice.fromPeriodStart,
    notice.fromPeriodEnd,
    formatDateKey_(notice.toDate),
    notice.toPeriodStart,
    notice.toPeriodEnd
  ].join('|');
}

function notifySyncSuccess_(notifyOnSuccess, rescheduleNotices) {
  if (!notifyOnSuccess && rescheduleNotices.length === 0) {
    return;
  }

  const body = rescheduleNotices.map(formatRescheduleNotice_).join('\\n');
  sendSyncNotification_(CONFIG.notificationSuccessSubject, body);

  if (rescheduleNotices.length > 0) {
    saveRescheduleNoticeState_(rescheduleNotices);
  }
}

function formatRescheduleNotice_(notice) {
  return [
    \`「\${notice.title}」\${formatNoticeDate_(notice.fromDate)} \${formatPeriodRange_(notice.fromPeriodStart, notice.fromPeriodEnd)} 節\`,
    ' → ',
    \`\${formatNoticeDate_(notice.toDate)} \${formatPeriodRange_(notice.toPeriodStart, notice.toPeriodEnd)} 節\`
  ].join('');
}

function formatNoticeDate_(date) {
  return \`\${date.getFullYear()}/\${date.getMonth() + 1}/\${date.getDate()}\`;
}

function loadRescheduleNoticeState_() {
  const raw = PropertiesService
    .getScriptProperties()
    .getProperty(CONFIG.rescheduleNoticeStateProperty);

  return raw ? JSON.parse(raw) : {};
}

function saveRescheduleNoticeState_(notices) {
  const state = loadRescheduleNoticeState_();

  notices.forEach(notice => {
    state[notice.key] = true;
  });

  PropertiesService
    .getScriptProperties()
    .setProperty(CONFIG.rescheduleNoticeStateProperty, JSON.stringify(state));
}

function sendSyncNotification_(subject, body) {
  const recipient = getNotificationEmail_();
  MailApp.sendEmail(recipient, subject, body || '');
}

function getNotificationEmail_() {
  if (CONFIG.notificationEmail) {
    return CONFIG.notificationEmail;
  }

  const activeUserEmail = Session.getActiveUser().getEmail();

  if (!activeUserEmail) {
    throw new Error('找不到通知 Email，請在 CONFIG.notificationEmail 填入收件信箱。');
  }

  return activeUserEmail;
}

function resetSyncState() {
  PropertiesService
    .getScriptProperties()
    .deleteProperty('SYNC_STATE');
}

function resetFutureSyncState_(syncStartDate) {
  const oldState = loadState_();
  const keptState = {};

  Object.keys(oldState).forEach(syncId => {
    const item = oldState[syncId];

    if (shouldKeepOldState_(item, syncStartDate)) {
      keptState[syncId] = item;
    }
  });

  saveState_(keptState);
}

function setupAutoSyncTriggers() {
  deleteAutoSyncTriggers();

  CONFIG.autoSyncHours.forEach(hour => {
    const handler = hour === CONFIG.notifySyncHour
      ? 'syncMyScheduleToCalendarWithNotification'
      : 'syncMyScheduleToCalendar';

    ScriptApp.newTrigger(handler)
      .timeBased()
      .atHour(hour)
      .nearMinute(0)
      .everyDays(1)
      .inTimezone(CONFIG.timezone)
      .create();
  });

  Logger.log(\`已建立每日自動同步觸發器：\${CONFIG.autoSyncHours.map(hour => \`\${pad2_(hour)}:00\`).join('、')}\`);
}

function deleteAutoSyncTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;

  triggers.forEach(trigger => {
    const handler = trigger.getHandlerFunction();

    if (handler === 'syncMyScheduleToCalendar' || handler === 'syncMyScheduleToCalendarWithNotification') {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
    }
  });

  Logger.log(\`已刪除 \${deletedCount} 個自動同步觸發器。\`);
}

function quickDeleteAllCalendarEvents() {
  const calendar = CalendarApp.getCalendarById(CONFIG.calendarId);

  if (!calendar) {
    throw new Error(\`找不到日曆，請確認 Calendar ID：\${CONFIG.calendarId}\`);
  }

  let deletedCount = 0;
  const windowStart = new Date(CONFIG.quickDeleteAllFromYear, 0, 1);
  const windowEnd = new Date(CONFIG.quickDeleteAllToYear, 11, 31, 23, 59, 59);
  const events = calendar.getEvents(windowStart, windowEnd);

  events.forEach(event => {
    event.deleteEvent();
    deletedCount++;
  });

  resetSyncState();
  Logger.log(\`快速刪除完成，共刪除 \${deletedCount} 筆事件，並已清除同步狀態。\`);
}

function quickDeleteSyncedCalendarEvents() {
  const calendar = CalendarApp.getCalendarById(CONFIG.calendarId);

  if (!calendar) {
    throw new Error(\`找不到日曆，請確認 Calendar ID：\${CONFIG.calendarId}\`);
  }

  let deletedCount = 0;
  const windowStart = getSyncStartDate_();
  const windowEnd = new Date(CONFIG.quickDeleteAllToYear, 11, 31, 23, 59, 59);
  const events = calendar.getEvents(windowStart, windowEnd);

  events.forEach(event => {
    event.deleteEvent();
    deletedCount++;
  });

  resetFutureSyncState_(windowStart);
  Logger.log(\`快速刪除完成，自 \${formatDateKey_(windowStart)} 起共刪除 \${deletedCount} 筆事件，並已清除未來同步狀態。\`);
}

function previewParsedEvents() {
  const ss = SpreadsheetApp.openByUrl(CONFIG.sheetUrl);
  const sheet = ss.getSheetByName(CONFIG.sheetName);

  if (!sheet) {
    throw new Error(\`找不到工作表：\${CONFIG.sheetName}\`);
  }

  const events = parseMyGradeEvents_(buildSheetContext_(sheet));

  events.forEach(event => {
    Logger.log([
      formatDateKey_(event.date),
      event.weekday,
      \`第\${event.periodStart}-\${event.periodEnd}節\`,
      Utilities.formatDate(event.start, CONFIG.timezone, 'HH:mm'),
      Utilities.formatDate(event.end, CONFIG.timezone, 'HH:mm'),
      event.title,
      event.location,
      event.sourceCell
    ].join('｜'));
  });

  Logger.log(\`共解析出 \${events.length} 筆事件。\`);
}

function pad2_(value) {
  return String(value).padStart(2, '0');
}
`;
  };
})();
