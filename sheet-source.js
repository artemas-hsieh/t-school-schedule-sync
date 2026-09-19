(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  if (root) root.TSchoolSheetSourceFactory = factory;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSheetSource() {
  'use strict';

  const COURSE_INDEX_ID = '1sEUQ4NuT7CEbxaiXl9pY8nmZaE6iJe7SPYmYbiqDArk';
  const HOLIDAY_URL = 'https://data.ntpc.gov.tw/api/datasets/308dcd75-6434-45bc-a95f-584da4fed251/csv/file';
  const CROSS_SCHOOL_DAYS = { '週四跨校選修': 4, '週五跨校選修': 5 };
  let holidayCsvRuntime = null;
  const GRADES = { '高一': '一年級', '高二': '二年級', '高三': '三年級' };
  const PERIODS = [
    ['08:25', '09:15'], ['09:15', '10:05'], ['10:15', '11:05'], ['11:05', '11:55'],
    ['13:25', '14:15'], ['14:15', '15:05'], ['15:15', '16:05'], ['16:05', '16:55']
  ];
  const FIELDS = ['日期', '週次', '星期', '節次', '實體', '線上', '非同步', '課程地點', '實體課程教室', '單元主題', '課程內容'];
  const text = value => String(value == null ? '' : value).normalize('NFKC').trim();
  const compact = value => text(value).replace(/\s/g, '');
  const pad = value => String(value).padStart(2, '0');
  const fail = message => {
    const error = new Error('[ACTION_REQUIRED] ' + message);
    error.code = 'SHEET_SOURCE_INVALID';
    throw error;
  };

  function parseCsv(input) {
    const source = String(input || '').replace(/^\uFEFF/, '');
    if (/^\s*</.test(source)) fail('課程索引回傳登入頁或網頁，請確認來源可公開讀取');
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (char === '"') {
        if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = !quoted;
      } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
        row.push(cell); cell = '';
        if (char !== ',') {
          rows.push(row); row = [];
          if (char === '\r' && source[i + 1] === '\n') i += 1;
        }
      } else cell += char;
    }
    if (quoted) fail('課程索引 CSV 引號未完整結束');
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function parseCatalog(values) {
    const header = values.findIndex(row => row.some(v => compact(v) === '課程名稱') && row.some(v => compact(v) === '課程類別'));
    if (header < 0) fail('課程索引缺少「課程名稱」或「課程類別」欄');
    const names = values[header].map(compact);
    const seen = new Map();
    values.slice(header + 1).forEach((row, offset) => {
      const title = String(row[names.indexOf('課程名稱')] || '').trim();
      const category = compact(row[names.indexOf('課程類別')]);
      if (!title && !category) return;
      if (!title || !category) fail('課程索引第 ' + (header + offset + 2) + ' 列缺少名稱或類別');
      if (seen.has(title) && seen.get(title).category !== category) fail('課程索引重複課程的類別不同：' + title);
      seen.set(title, { title, period: 'term', category, defaultSelected: category === '必修' });
    });
    if (!seen.size) fail('此年級尚未提供課程列表');
    return Array.from(seen.values());
  }

  function catalogUrl(grade) {
    if (!GRADES[grade]) fail('不支援的年級');
    // Tab names, rather than frozen gids, also support a newly populated 高一 tab.
    return 'https://docs.google.com/spreadsheets/d/' + COURSE_INDEX_ID +
      '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(grade);
  }

  function fieldName(value) {
    const label = compact(value).replace(/[：:＊*]/g, '');
    const aliases = { 上課日期: '日期', 課程日期: '日期', 上課節次: '節次', 課程節次: '節次', 周次: '週次', 地點: '課程地點', 上課地點: '課程地點', 教室: '實體課程教室', 實體教室: '實體課程教室', 主題: '單元主題', 實體課程: '實體', 線上課程: '線上', 非同步課程: '非同步' };
    if (FIELDS.includes(label)) return label;
    if (Object.prototype.hasOwnProperty.call(aliases, label)) return aliases[label];
    if (/^[^\d]{0,8}課程內容$/.test(label)) return '課程內容';
    return '';
  }

  function headers(values, range) {
    let best = null;
    values.forEach((row, rowIndex) => {
      const columns = {};
      let duplicate = false;
      row.forEach((value, column) => {
        const name = fieldName(value);
        if (!name) return;
        if (columns[name] !== undefined) duplicate = true;
        columns[name] = column;
      });
      // An edited/deleted locator header can be recovered only if ordered
      // neighboring headers and the actual cells leave exactly one candidate.
      if (range && Object.keys(columns).length >= 5 && !duplicate) {
        ['日期', '節次'].forEach(name => {
          if (columns[name] !== undefined) return;
          const position = FIELDS.indexOf(name);
          const left = FIELDS.slice(0, position).reverse().find(field => columns[field] !== undefined);
          const right = FIELDS.slice(position + 1).find(field => columns[field] !== undefined);
          if (!right || (name === '節次' && !left)) return;
          const candidates = [];
          for (let c = left ? columns[left] + 1 : 0; c < columns[right]; c += 1) {
            const samples = values.slice(rowIndex + 1).map(r => r[c]).filter(v => text(v));
            const valid = samples.filter(v => name === '日期' ? dates(v, range).length : periods(v).length);
            if (valid.length >= 2 && valid.length === samples.length) candidates.push(c);
          }
          if (candidates.length === 1) columns[name] = candidates[0];
        });
      }
      const score = Object.keys(columns).length;
      if (columns['日期'] !== undefined && columns['節次'] !== undefined && !duplicate &&
          columns['日期'] < columns['節次'] && (!best || score > best.score)) {
        best = { rowIndex, columns, score };
      }
    });
    return best;
  }

  function expandMerges(values, merges) {
    const rows = values.map(row => row.slice());
    (merges || []).forEach(merge => {
      const r = merge.startRowIndex || 0, c = merge.startColumnIndex || 0;
      // Only an actual vertical merge authorizes carrying a value down.
      // Horizontal expansion would make several columns claim the same header.
      for (let y = r + 1; y < merge.endRowIndex && y < rows.length; y += 1) {
        rows[y][c] = rows[r] && rows[r][c];
      }
    });
    return rows;
  }

  function dateKey(value, range) {
    let raw = text(value);
    if (/^\d{5}(?:\.\d+)?$/.test(raw) && +raw > 20000 && +raw < 100000) {
      raw = new Date(Date.UTC(1899, 11, 30) + Math.floor(+raw) * 86400000).toISOString().slice(0, 10);
    }
    raw = raw.replace(/T\d\d:\d\d.*$/, '').replace(/[（(](?:週|星期)?[一二三四五六日天1-7][）)]$/, '').trim();
    const match = raw.match(/^(?:(\d{2,4})\s*[年/.-]\s*)?(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?$/);
    if (!match) return '';
    const month = +match[2], day = +match[3], candidates = [];
    for (let year = +range.validFrom.slice(0, 4); year <= +range.validUntil.slice(0, 4); year += 1) {
      const date = new Date(Date.UTC(year, month - 1, day));
      const key = year + '-' + pad(month) + '-' + pad(day);
      if (date.getUTCMonth() === month - 1 && date.getUTCDate() === day && key >= range.validFrom && key <= range.validUntil) candidates.push(key);
    }
    // Teachers commonly leave the previous year's January on copied outlines.
    // Resolve only a unique month/day inside the explicit source-group interval.
    return candidates.length === 1 ? candidates[0] : '';
  }

  function periods(value) {
    const raw = compact(value).replace(/[第節]/g, '').replace(/[一二三四五六七八]/g, c => String('一二三四五六七八'.indexOf(c) + 1));
    if (!raw) return [];
    const numbers = [];
    for (const part of raw.split(/[,，、;；/]/)) {
      if (/^[1-8]$/.test(part)) numbers.push(+part);
      else if (/^[1-8]{2,8}$/.test(part)) numbers.push(...part.split('').map(Number));
      else {
        const m = part.match(/^([1-8])[-~～—–至到]([1-8])$/);
        if (!m || +m[1] > +m[2]) return [];
        for (let n = +m[1]; n <= +m[2]; n += 1) numbers.push(n);
      }
    }
    const sorted = Array.from(new Set(numbers)).sort((a, b) => a - b), ranges = [];
    sorted.forEach(n => {
      const last = ranges[ranges.length - 1];
      if (last && last.periodEnd === n - 1) last.periodEnd = n;
      else ranges.push({ periodStart: n, periodEnd: n });
    });
    return ranges;
  }

  function dates(value, range) {
    const single = dateKey(value, range);
    if (single) return [single];
    const raw = text(value);
    const span = raw.match(/^(\d{1,2})[月/]\s*(\d{1,2})(?:日)?\s*[-~～至]\s*(?:(\d{1,2})[月/]\s*)?(\d{1,2})日?$/);
    if (!span) return [];
    const start = dateKey(span[1] + '/' + span[2], range);
    const end = dateKey((span[3] || span[1]) + '/' + span[4], range);
    if (!start || !end || start > end) return [];
    const result = [];
    for (let time = Date.parse(start + 'T00:00:00Z'); time <= Date.parse(end + 'T00:00:00Z'); time += 86400000) {
      if (result.length >= 31) return [];
      result.push(new Date(time).toISOString().slice(0, 10));
    }
    return result;
  }

  function parseOutline(values, sheetName, range, merges) {
    const rows = expandMerges(values, merges);
    const header = headers(rows, range), events = [], issues = [], warnings = [];
    if (!header) return { events, issues: ['找不到日期與節次欄位'], warnings, header: null };
    const cols = header.columns;
    const get = (row, key) => cols[key] === undefined ? '' : row[cols[key]];
    const hasSession = value => {
      const marker = compact(value).toLowerCase();
      return Boolean(marker && !/^(?:否|無|false|no|[-—])$/.test(marker) &&
        (!Number.isFinite(Number(marker)) || Number(marker) > 0));
    };
    rows.slice(header.rowIndex + 1).forEach((row, index) => {
      const rowNumber = header.rowIndex + index + 2;
      const date = get(row, '日期'), period = get(row, '節次');
      if (fieldName(date) === '日期' && fieldName(period) === '節次') return;
      const physical = hasSession(get(row, '實體')), online = hasSession(get(row, '線上'));
      const asynchronous = hasSession(get(row, '非同步'));
      const location = text(get(row, '課程地點'));
      if ((asynchronous > 0 || location === '非同步') && !physical && !online) return;
      if (/^(?:停課|取消|放假|無課程|不上課)$/.test(compact(date)) || /^(?:停課|取消|放假|無課程|不上課)$/.test(compact(period))) return;
      if (/^(?:總計|合計|小計|總節數)/.test(compact(date))) return;
      if (!text(date) && !text(period) && !physical && !online) {
        if (text(get(row, '單元主題')) || text(get(row, '課程內容'))) issues.push('第 ' + rowNumber + ' 列有課程內容但缺少日期與節次');
        return;
      }
      const days = dates(date, range), spans = periods(period);
      if (!days.length || !spans.length) {
        issues.push('第 ' + rowNumber + ' 列的' + (!days.length ? '日期' : '節次') + '無法唯一判定');
        return;
      }
      const suppliedYear = text(date).match(/^(\d{4})[-/年]/);
      if (suppliedYear && suppliedYear[1] !== days[0].slice(0, 4)) warnings.push('第 ' + rowNumber + ' 列依來源組範圍修正年份為 ' + days[0].slice(0, 4));
      const outline = { classroom: text(get(row, '實體課程教室')), topic: text(get(row, '單元主題')), content: text(get(row, '課程內容')) };
      days.forEach(day => spans.forEach(span => events.push({
        originalTitle: sheetName, isAllDay: false, dateKey: day,
        periodStart: span.periodStart, periodEnd: span.periodEnd,
        startTime: PERIODS[span.periodStart - 1][0], endTime: PERIODS[span.periodEnd - 1][1],
        start: new Date(day + 'T' + PERIODS[span.periodStart - 1][0] + ':00+08:00'),
        end: new Date(day + 'T' + PERIODS[span.periodEnd - 1][1] + ':00+08:00'),
        weekday: '日一二三四五六'[new Date(day + 'T12:00:00+08:00').getUTCDay()],
        weekNum: Number(get(row, '週次')) || 0, location, courseOutline: outline,
        sourceUpdatedLabel: '', sourceRow: rowNumber
      })));
    });
    const unique = new Map();
    events.forEach(event => {
      const key = [event.dateKey, event.periodStart, event.periodEnd].join('|');
      const previous = unique.get(key);
      if (previous && (previous.location !== event.location || JSON.stringify(previous.courseOutline) !== JSON.stringify(event.courseOutline))) issues.push('第 ' + event.sourceRow + ' 列與同時段課程內容衝突');
      else {
        const overlap = Array.from(unique.values()).find(other =>
          other.dateKey === event.dateKey &&
          other.periodStart <= event.periodEnd && other.periodEnd >= event.periodStart &&
          (other.periodStart !== event.periodStart || other.periodEnd !== event.periodEnd));
        if (overlap) issues.push('第 ' + event.sourceRow + ' 列與第 ' + overlap.sourceRow + ' 列的節次重疊');
        unique.set(key, event);
      }
    });
    if (!events.length) issues.push('沒有可驗證的同步課程日期，無法判定課程是否結束');
    return { events: Array.from(unique.values()), issues, warnings, header };
  }

  function termKey(grade, set) {
    const key = String(set.key || '').match(/^(\d{3,4})-([12])(?:-|$)/);
    if (key) return GRADES[grade] + '|' + (+key[1] < 1911 ? +key[1] + 1911 : +key[1]) + '-' + key[2];
    const year = +set.validFrom.slice(0, 4), month = +set.validFrom.slice(5, 7);
    return GRADES[grade] + '|' + (month >= 8 ? year : year - 1) + '-' + (month >= 8 || month === 1 ? 1 : 2);
  }

  function termOrder(key) {
    const m = String(key).match(/\|(\d{4})-([12])$/);
    return m ? +m[1] * 2 + +m[2] : -1;
  }

  function parseNationalHolidays(csv, firstDate, lastDate) {
    const rows = parseCsv(csv), labels = (rows.shift() || []).map(compact);
    const fields = ['date', 'year', 'name', 'isholiday', 'holidaycategory', 'description'];
    if (fields.some(field => !labels.includes(field))) fail('國定假日來源欄位不完整，已保留既有行程');
    const byDate = new Map(), holidays = new Set();
    for (const row of rows) {
      if (!row.some(value => text(value))) continue;
      const item = Object.fromEntries(fields.map(field => [field, text(row[labels.indexOf(field)])]));
      if (!/^\d{8}$/.test(item.date) || !/^(?:是|否)$/.test(item.isholiday) || item.year !== item.date.slice(0, 4)) fail('國定假日來源資料無法辨識');
      const day = item.date.slice(0, 4) + '-' + item.date.slice(4, 6) + '-' + item.date.slice(6);
      const parsed = new Date(day + 'T00:00:00Z');
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) fail('國定假日來源日期無效');
      if (byDate.has(day) && JSON.stringify(byDate.get(day)) !== JSON.stringify(item)) fail('國定假日來源有重複衝突日期');
      byDate.set(day, item);
      // 軍人節等「特定節日」不適用全校；勞動節自 2026 年起適用全國各機關學校
      const national = item.holidaycategory === '放假之紀念日及節日' || item.holidaycategory === '補假' ||
        (item.holidaycategory === '特定節日' && /全國各機關學校/.test(item.description));
      if (item.isholiday === '是' && national) holidays.add(day);
    }
    // 此資料集只列假日及特殊工作日；完整年度須包含元旦及每個週末
    // 未公布的新年度與截斷下載不能被視為「沒有國定假日」
    for (let year = +firstDate.slice(0, 4); year <= +lastDate.slice(0, 4); year += 1) {
      if (!holidays.has(year + '-01-01')) fail(year + ' 年國定假日尚未完整公布或無法讀取');
      for (let time = Date.UTC(year, 0, 1); time < Date.UTC(year + 1, 0, 1); time += 86400000) {
        const date = new Date(time);
        if ([0, 6].includes(date.getUTCDay()) && !byDate.has(date.toISOString().slice(0, 10))) fail(year + ' 年國定假日資料不完整');
      }
    }
    return holidays;
  }

  function loadNationalHolidays(firstDate, lastDate) {
    if (holidayCsvRuntime) return parseNationalHolidays(holidayCsvRuntime, firstDate, lastDate);
    let cache = null;
    try {
      cache = CacheService.getScriptCache();
      const cached = cache.get('TSCHOOL_NATIONAL_HOLIDAYS_V1');
      if (cached) {
        const result = parseNationalHolidays(cached, firstDate, lastDate);
        holidayCsvRuntime = cached;
        return result;
      }
    } catch (error) { /* Cache failure or an older year range requires a fresh read. */ }
    const response = UrlFetchApp.fetch(HOLIDAY_URL, { followRedirects: false, muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) fail('國定假日來源暫時無法讀取，已保留既有行程');
    const csv = response.getContentText('UTF-8');
    if (csv.length > 512 * 1024) fail('國定假日來源超過可處理範圍');
    const result = parseNationalHolidays(csv, firstDate, lastDate);
    holidayCsvRuntime = csv;
    try { if (cache) cache.put('TSCHOOL_NATIONAL_HOLIDAYS_V1', csv, 3600); } catch (error) { /* Optional cache. */ }
    return result;
  }

  function buildCrossSchoolEvents(titles, firstDate, lastDate, holidays) {
    const events = [];
    for (let time = Date.parse(firstDate + 'T00:00:00Z'); time <= Date.parse(lastDate + 'T00:00:00Z'); time += 86400000) {
      const date = new Date(time), day = date.toISOString().slice(0, 10);
      if (holidays.has(day)) continue;
      for (const title of titles) {
        if (CROSS_SCHOOL_DAYS[title] !== date.getUTCDay()) continue;
        events.push({ originalTitle: title, isAllDay: false, dateKey: day,
          periodStart: 3, periodEnd: 4, startTime: PERIODS[2][0], endTime: PERIODS[3][1],
          start: new Date(day + 'T' + PERIODS[2][0] + ':00+08:00'),
          end: new Date(day + 'T' + PERIODS[3][1] + ':00+08:00'),
          weekday: '日一二三四五六'[date.getUTCDay()], weekNum: 0, location: '',
          sourceUpdatedLabel: '', courseOutline: { classroom: '', topic: '', content: '' },
          outlineHash: '', outlineIdentityHash: '', sourceRow: 0 });
      }
    }
    return events;
  }

  // Installed Apps Script adapter. These globals are only used inside Apps Script;
  // the website uses parseCatalog/catalogUrl and never requests private outlines.
  function loadSource(grade, settings, now) {
    const index = loadCourseOutlineSourceIndex_();
    if (index.source !== 'live') fail('課綱來源索引暫時無法確認，已保留既有行程');
    const list = parseCatalog(readSheetsDisplayValues_(COURSE_INDEX_ID, [grade])[grade]);
    const allSets = index.setsByGrade[grade] || [];
    const groups = new Map();
    allSets.forEach(set => {
      const key = termKey(grade, set);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(set);
    });
    const keys = Array.from(groups.keys()).sort((a, b) => termOrder(a) - termOrder(b));
    if (!keys.length) fail(grade + '尚無已啟用的課綱來源');
    const sameGrade = settings && settings.gradeName === grade;
    const currentKey = sameGrade && settings.termKey ? normalizeTermKey_(settings.termKey) : '';
    const cache = new Map();
    const read = key => {
      if (!cache.has(key)) cache.set(key, readTerm(grade, key, groups.get(key), list));
      return cache.get(key);
    };
    let source;
    if (currentKey && settings.setupComplete) {
      if (!groups.has(currentKey)) fail('當前學期課綱已停用或移除，無法確認全部課程已結束；請保留當期來源的啟用狀態');
      const current = read(currentKey);
      source = current;
      if (current.events.every(event => event.end.getTime() <= now.getTime()) && current.observedLastEnd <= now.getTime()) {
        const next = keys.find(key => termOrder(key) === termOrder(currentKey) + 1);
        if (next) {
          try { source = read(next); }
          catch (error) { current.sourceWarnings.push('新學期課綱尚未完整可讀：' + error.message); }
        }
        else {
          // A summer transition may move to the next grade. The UI still asks
          // the student to confirm the actual grade before any Calendar write.
          const nextGrade = ['高一', '高二', '高三'][['高一', '高二', '高三'].indexOf(grade) + 1];
          if (nextGrade && /-2$/.test(currentKey)) {
            const nextSets = (index.setsByGrade[nextGrade] || []).filter(set => termOrder(termKey(nextGrade, set)) === termOrder(currentKey) + 1);
            if (nextSets.length) {
              try {
                const nextList = parseCatalog(readSheetsDisplayValues_(COURSE_INDEX_ID, [nextGrade])[nextGrade]);
                source = readTerm(nextGrade, termKey(nextGrade, nextSets[0]), nextSets, nextList);
                source.previousGradeName = grade;
              } catch (error) { current.sourceWarnings.push('新學期課綱尚未完整可讀：' + error.message); }
            }
          }
        }
        if (source !== current) source.transitionEligible = true;
      }
    } else {
      // New installs examine the latest already-started term. Only after every
      // course ends may they use the immediately following enabled term.
      const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
      const started = keys.filter(key => groups.get(key).some(set => set.validFrom <= today));
      const initialKey = started[started.length - 1] || keys[0];
      source = read(initialKey);
      if (source.events.every(event => event.end.getTime() <= now.getTime()) && source.observedLastEnd <= now.getTime()) {
        const next = keys.find(key => termOrder(key) === termOrder(initialKey) + 1);
        if (next) {
          try { source = read(next); }
          catch (error) { source.sourceWarnings.push('新學期課綱尚未完整可讀：' + error.message); }
        }
      }
    }
    return source;
  }

  function readTerm(grade, key, sets, list) {
    const events = [], titles = new Set(), warnings = [], provenance = [];
    for (const set of sets) {
      for (const id of set.spreadsheetIds) {
        const metadata = readSheetsWorkbookMetadata_(id);
        const sheets = metadata.sheets.filter(sheet => !/(?:總表|總覽|目錄|填寫說明|範本|模板)$/.test(sheet.properties.title));
        if (!sheets.length) fail('課綱試算表沒有課程分頁：' + metadata.properties.title);
        const values = readSheetsDisplayValues_(id, sheets.map(sheet => sheet.properties.title));
        for (const sheet of sheets) {
          const title = sheet.properties.title;
          if (titles.has(title)) fail('同一學期有重複課程分頁：' + title);
          const result = parseOutline(values[title], title, set, sheet.merges);
          if (result.issues.length) fail(title + '：' + result.issues.slice(0, 4).join('；'));
          titles.add(title);
          result.events.forEach(event => {
            event.outlineHash = hashText_(JSON.stringify([event.courseOutline.classroom, event.courseOutline.topic, event.courseOutline.content]));
            event.outlineIdentityHash = makeCourseOutlineIdentityHash_(event.courseOutline);
            events.push(event);
          });
          warnings.push(...result.warnings.map(w => title + '：' + w));
          provenance.push([id, sheet.properties.sheetId, title]);
        }
      }
    }
    // A vanished tab must not look like a completed course or a cancellation.
    const storeKey = 'TSCHOOL_SHEET_COURSES_' + hashText_(key);
    const previous = readChunkedJson_(storeKey, []);
    const previousTitles = Array.isArray(previous) ? previous : previous.titles || [];
    const crossTitles = Array.from(new Set(list.map(item => item.title).concat(previousTitles)))
      .filter(title => Object.prototype.hasOwnProperty.call(CROSS_SCHOOL_DAYS, title) && !titles.has(title));
    if (crossTitles.length) {
      const outlineDates = events.map(event => event.dateKey).sort();
      if (!outlineDates.length) fail('缺少可判定跨校選修起訖的課綱日期');
      const first = outlineDates[0], last = outlineDates[outlineDates.length - 1];
      const holidays = loadNationalHolidays(first, last);
      events.push(...buildCrossSchoolEvents(crossTitles, first, last, holidays));
      crossTitles.forEach(title => titles.add(title));
      provenance.push(['cross-school-weekly-v1', first, last, crossTitles.slice().sort()]);
    }
    const missing = previousTitles.filter(title => !titles.has(title));
    if (missing.length) fail('當期課綱缺少先前讀取的課程分頁：' + missing.join('、'));
    const lastEnd = Math.max(...events.map(event => event.end.getTime()));
    const observedLastEnd = Math.max(lastEnd, Number(previous.lastEnd) || 0);
    writeChunkedJson_(storeKey, { titles: Array.from(titles), lastEnd: observedLastEnd });
    const dates = events.map(e => e.dateKey).sort();
    const catalogAll = sortCatalogItemsByPeriod_(Array.from(titles).map(title => {
      const item = list.find(c => c.title === title);
      return { title, period: 'term', category: item ? item.category : '', defaultSelected: Boolean(item && item.defaultSelected) };
    }));
    const lastDateKey = dates[dates.length - 1], firstDateKey = dates[0];
    return {
      sourceKind: 'outline-sheets', gradeName: grade, termKey: key, firstDateKey, lastDateKey,
      catalogFingerprintVersion: SETUP_CATALOG_FINGERPRINT_VERSION,
      catalogFingerprint: makeSetupCatalogFingerprint_(key, lastDateKey, catalogAll),
      scheduleFingerprint: hashText_(JSON.stringify(['outline-sheets', 1, key, sortCanonicalRows_(events.map(e => [e.originalTitle, e.dateKey, e.periodStart, e.periodEnd, e.location, e.outlineHash])), provenance.sort()])),
      catalog: { all: catalogAll, termItems: catalogAll, vacationItems: [] },
      events, sourceUpdatedLabel: '', sourceStale: false, sourceWarnings: warnings,
      complete: true, observedLastEnd
    };
  }

  return { COURSE_INDEX_ID, GRADES, HOLIDAY_URL, parseCsv, parseCatalog, catalogUrl, headers, expandMerges, dateKey, dates, periods, parseOutline, termKey, termOrder, parseNationalHolidays, buildCrossSchoolEvents, loadSource };
});
