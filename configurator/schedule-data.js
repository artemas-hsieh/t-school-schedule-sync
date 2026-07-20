(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.TSchoolScheduleData = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbxoTgVMnLevp0OPZQEFOYscUrXD1iMagasz2WPArXpkG-w6jRygVMS8kOwcywhnQW_i/exec';
  const GRADE_API_NAMES = {
    '高一': '一年級',
    '高二': '二年級',
    '高三': '三年級'
  };
  const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
  const MANUAL_MERGE_EXCEPTIONS = Object.freeze({});
  const ACTIVITY_PATTERNS = [
    /全校(?:性)?活動/,
    /^高[一二三](?:導入期|全校活動)$/,
    /^休業式(?:_高[一二三])?$/,
    /^勞動節$/,
    /模擬考/,
    /校際交流/,
    /教育局.*(?:協作坊|輔導團)/,
    /^全天(?:吉林|弘道)$/,
    /防災|避難演練|畢業典禮|畢展布展/
  ];

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .replace(/\r/g, '\n')
      .replace(/[（]/g, '(')
      .replace(/[）]/g, ')')
      .replace(/[＿]/g, '_')
      .replace(/[\t\u3000]+/g, ' ')
      .replace(/[ ]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function normalizeTitle(value) {
    return normalizeText(value)
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  function splitCellEntries(value) {
    const normalized = normalizeText(value);

    if (!normalized) {
      return [];
    }

    return normalized
      .split(/\n[-─━—]{4,}\n/g)
      .map(normalizeText)
      .filter(Boolean);
  }

  function parseEntry(value) {
    let title = normalizeText(value);
    const locations = [];
    let match = title.match(/\s*\[([^\]]+)\]\s*$/);

    while (match) {
      locations.unshift(normalizeText(match[1]));
      title = normalizeText(title.slice(0, match.index));
      match = title.match(/\s*\[([^\]]+)\]\s*$/);
    }

    const mergeTarget = MANUAL_MERGE_EXCEPTIONS[normalizeTitle(title)];

    return {
      title: mergeTarget || title,
      location: locations.join('、')
    };
  }

  function isStructuralValue(value) {
    const text = normalizeText(value);

    return !text ||
      /^第\s*\d+\s*週$/.test(text) ||
      /^星期[一二三四五六日]/.test(text) ||
      /^\(?\d{1,2}\/\d{1,2}\)?$/.test(text) ||
      /^\d{1,2}:\d{2}\s*[~～-]\s*\d{1,2}:\d{2}$/.test(text.replace(/\n/g, '')) ||
      /^[1-8]$/.test(text) ||
      text === '節次' ||
      text === '備註' ||
      text.indexOf('更新時間') === 0;
  }

  function isActivityTitle(title) {
    const text = normalizeText(title);
    return ACTIVITY_PATTERNS.some(pattern => pattern.test(text));
  }

  function assertPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('課表來源沒有回傳可讀取的資料。');
    }

    if (!Array.isArray(payload.tableData) || payload.tableData.length < 10) {
      throw new Error('課表來源缺少完整的表格資料。');
    }

    if (!Array.isArray(payload.weekDataList) || payload.weekDataList.length === 0) {
      throw new Error('課表來源缺少週次資料。');
    }

    if (!GRADE_API_NAMES || !Object.values(GRADE_API_NAMES).includes(payload.currentGrade)) {
      throw new Error('課表來源回傳了無法辨識的年級。');
    }

    return payload;
  }

  function extractCatalog(payload) {
    assertPayload(payload);
    const byKey = new Map();

    payload.tableData.forEach(row => {
      if (!row || row.isHeader || !Array.isArray(row.cells)) {
        return;
      }

      row.cells.forEach(cell => {
        splitCellEntries(cell && cell.value).forEach(rawEntry => {
          if (isStructuralValue(rawEntry)) {
            return;
          }

          const parsed = parseEntry(rawEntry);
          const key = normalizeTitle(parsed.title);

          if (!key || byKey.has(key)) {
            return;
          }

          byKey.set(key, {
            title: parsed.title,
            type: isActivityTitle(parsed.title) ? 'activity' : 'course'
          });
        });
      });
    });

    const all = Array.from(byKey.values()).sort((a, b) =>
      a.title.localeCompare(b.title, 'zh-Hant')
    );

    return {
      all,
      courses: all.filter(item => item.type === 'course'),
      activities: all.filter(item => item.type === 'activity')
    };
  }

  function parseMonthDay(value) {
    const match = normalizeText(value).match(/\(?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\)?/);

    if (!match) {
      return null;
    }

    const month = Number(match[1]);
    const day = Number(match[2]);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    return { month, day };
  }

  function getHeaderDateRecords(payload) {
    const records = [];

    payload.tableData.forEach((row, rowIndex) => {
      if (!row || !row.isHeader || !Array.isArray(row.cells)) {
        return;
      }

      row.cells.slice(2, 9).forEach((cell, dayIndex) => {
        const monthDay = parseMonthDay(cell && cell.value);

        if (monthDay) {
          records.push({ rowIndex, dayIndex, month: monthDay.month, day: monthDay.day });
        }
      });
    });

    return records;
  }

  function buildDateRecords(records, startYear) {
    let year = startYear;
    let previousMonth = null;

    return records.map(record => {
      if (previousMonth !== null && previousMonth >= 10 && record.month <= 3) {
        year += 1;
      }

      previousMonth = record.month;
      return Object.assign({}, record, {
        date: new Date(year, record.month - 1, record.day)
      });
    });
  }

  function inferDateRecords(payload, nowValue) {
    assertPayload(payload);
    const records = getHeaderDateRecords(payload);

    if (records.length < 7) {
      throw new Error('課表日期不足，無法判定學期。');
    }

    const now = nowValue instanceof Date ? new Date(nowValue) : new Date(nowValue || Date.now());
    now.setHours(0, 0, 0, 0);
    const candidateYears = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
    let best = null;

    candidateYears.forEach(year => {
      const dated = buildDateRecords(records, year);
      const nearestDistance = Math.min.apply(null, dated.map(item =>
        Math.abs(item.date.getTime() - now.getTime())
      ));

      if (!best || nearestDistance < best.nearestDistance) {
        best = { dated, nearestDistance };
      }
    });

    const maxDistance = 220 * 24 * 60 * 60 * 1000;

    if (!best || best.nearestDistance > maxDistance) {
      throw new Error('課表日期與目前時間相距過遠，無法安全判定年份。');
    }

    return best.dated;
  }

  function formatDateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || '');

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
  }

  function summarizePayload(payload, nowValue) {
    assertPayload(payload);
    const dateRecords = inferDateRecords(payload, nowValue);
    const catalog = extractCatalog(payload);
    const firstDate = dateRecords[0].date;
    const lastDate = dateRecords[dateRecords.length - 1].date;
    const updateValues = [];

    payload.tableData.forEach(row => {
      (row.cells || []).forEach(cell => {
        const value = normalizeText(cell && cell.value);

        if (value.indexOf('更新時間') === 0 && !updateValues.includes(value)) {
          updateValues.push(value);
        }
      });
    });

    const termKey = [payload.currentGrade, formatDateKey(firstDate)].join('|');
    const fingerprint = hashText(JSON.stringify([
      termKey,
      formatDateKey(lastDate),
      catalog.all.map(item => item.title)
    ]));

    return {
      currentGrade: payload.currentGrade,
      weekCount: payload.weekDataList.length,
      firstDate,
      lastDate,
      firstDateKey: formatDateKey(firstDate),
      lastDateKey: formatDateKey(lastDate),
      termKey,
      fingerprint,
      updateValues,
      catalog
    };
  }

  async function fetchGradeSchedule(gradeName, fetchImpl) {
    const apiGrade = GRADE_API_NAMES[gradeName];

    if (!apiGrade) {
      throw new Error('不支援的年級：' + gradeName);
    }

    const request = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);

    if (!request) {
      throw new Error('目前環境無法讀取課表來源。');
    }

    const response = await request(API_URL + '?grade=' + encodeURIComponent(apiGrade), {
      redirect: 'follow',
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error('課表來源回應失敗（HTTP ' + response.status + '）。');
    }

    return assertPayload(await response.json());
  }

  return {
    API_URL,
    GRADE_API_NAMES,
    ACTIVITY_PATTERNS,
    MANUAL_MERGE_EXCEPTIONS,
    WEEKDAY_LABELS,
    normalizeText,
    normalizeTitle,
    splitCellEntries,
    parseEntry,
    isActivityTitle,
    assertPayload,
    extractCatalog,
    inferDateRecords,
    summarizePayload,
    fetchGradeSchedule,
    formatDateKey
  };
});
