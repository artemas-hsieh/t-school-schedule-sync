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
  const SOURCE_FETCH_MAX_ATTEMPTS = 3;
  const SOURCE_FETCH_RETRY_DELAY_MS = 750;
  const CATALOG_FINGERPRINT_VERSION = 3;
  const NATURAL_ADVANCED_BASE_TITLE = '自然進階(二)';
  const SCHEDULE_NOTE_TITLE_PREFIX = '備註｜';
  const NATURAL_ADVANCED_VARIANT_TITLES = Object.freeze([
    '自然進階(二)_化學',
    '自然進階(二)_生物',
    '自然進階(二)_物理'
  ]);
  const TITLE_SIMILARITY_CLUSTER_THRESHOLD = 0.34;
  const TITLE_SIMILARITY_EPSILON = 1e-12;
  const TRADITIONAL_CHINESE_STROKE_COLLATOR = (() => {
    try {
      return new Intl.Collator('zh-Hant-u-co-stroke', {
        numeric: true,
        sensitivity: 'base'
      });
    } catch (error) {
      return {
        compare: (left, right) => String(left).localeCompare(String(right), 'zh-Hant', {
          numeric: true,
          sensitivity: 'base'
        })
      };
    }
  })();

  function normalizeText(value) {
    let text = String(value == null ? '' : value);

    if (typeof text.normalize === 'function') {
      text = text.normalize('NFKC');
    }

    return text
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
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

  function isScheduleNoteTitle(value) {
    return normalizeTitle(value).startsWith(normalizeTitle(SCHEDULE_NOTE_TITLE_PREFIX));
  }

  function makeScheduleNoteTitle(value) {
    const title = normalizeText(value);
    const content = title.replace(/^備註[|｜]\s*/, '');
    return content ? SCHEDULE_NOTE_TITLE_PREFIX + content : '';
  }

  function isCourseSelectionHidden(value) {
    return normalizeTitle(value) === normalizeTitle(NATURAL_ADVANCED_BASE_TITLE) ||
      isScheduleNoteTitle(value);
  }

  function applyCourseSelectionRules(selectedTitles, catalogItems) {
    const selectedKeys = new Set((selectedTitles || []).map(normalizeTitle).filter(Boolean));
    const baseKey = normalizeTitle(NATURAL_ADVANCED_BASE_TITLE);
    const variantKeys = NATURAL_ADVANCED_VARIANT_TITLES.map(normalizeTitle);
    selectedKeys.delete(baseKey);
    if (variantKeys.some(key => selectedKeys.has(key))) selectedKeys.add(baseKey);
    (catalogItems || []).forEach(item => {
      const title = typeof item === 'string' ? item : item && item.title;
      if (isScheduleNoteTitle(title)) selectedKeys.add(normalizeTitle(title));
    });
    return (catalogItems || [])
      .map(item => typeof item === 'string' ? item : item && item.title)
      .filter(title => title && selectedKeys.has(normalizeTitle(title)));
  }

  // This is a presentation default, not a course/activity classifier. It only
  // decides which titles are initially checked and placed after the opt-in list.
  function isDefaultSelectedTitle(value) {
    const title = normalizeTitle(value);

    return isScheduleNoteTitle(title) ||
      /全校|學習分享會|補假|補課|放假|節假日|國定假日|模擬考|模考|開學|始業式|結業式|休業式|春節|元旦|端午節|中秋節|清明節|兒童節|國慶日|和平紀念日|開國紀念日|勞動節|光復節|教師節|行憲紀念日/.test(title);
  }

  function compareCanonicalStrings(left, right) {
    const leftText = String(left == null ? '' : left);
    const rightText = String(right == null ? '' : right);
    return leftText < rightText ? -1 : (leftText > rightText ? 1 : 0);
  }

  function makeCatalogFingerprintRows(catalogItems) {
    return (Array.isArray(catalogItems) ? catalogItems : [])
      .map(item => [
        String(item && item.title || ''),
        item && item.period === 'vacation' ? 'vacation' : 'term'
      ])
      .sort((left, right) => compareCanonicalStrings(
        JSON.stringify(left),
        JSON.stringify(right)
      ));
  }

  function makeCatalogFingerprint(termKey, lastDateKey, catalogItems) {
    return hashText(JSON.stringify([
      'setup-catalog',
      CATALOG_FINGERPRINT_VERSION,
      String(termKey || ''),
      String(lastDateKey || ''),
      makeCatalogFingerprintRows(catalogItems)
    ]));
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

  function normalizeSimilarityTitle(value) {
    return normalizeText(value)
      .replace(/\s+/g, '')
      .replace(/[・．.。:：/／|｜_＿\-‐‑–—]/g, '')
      .toLowerCase();
  }

  function compareDisplayTitles(left, right) {
    const leftText = String(left == null ? '' : left);
    const rightText = String(right == null ? '' : right);
    return TRADITIONAL_CHINESE_STROKE_COLLATOR.compare(leftText, rightText) ||
      compareCanonicalStrings(leftText, rightText);
  }

  function normalizedEditSimilarity(left, right) {
    const leftCharacters = Array.from(left);
    const rightCharacters = Array.from(right);
    const longestLength = Math.max(leftCharacters.length, rightCharacters.length);

    if (longestLength === 0) {
      return 1;
    }

    let previous = Array.from(
      { length: rightCharacters.length + 1 },
      (unused, index) => index
    );

    leftCharacters.forEach((leftCharacter, leftIndex) => {
      const current = [leftIndex + 1];
      rightCharacters.forEach((rightCharacter, rightIndex) => {
        current[rightIndex + 1] = Math.min(
          current[rightIndex] + 1,
          previous[rightIndex + 1] + 1,
          previous[rightIndex] + (leftCharacter === rightCharacter ? 0 : 1)
        );
      });
      previous = current;
    });

    return 1 - previous[rightCharacters.length] / longestLength;
  }

  function commonPrefixCoverage(left, right) {
    const leftCharacters = Array.from(left);
    const rightCharacters = Array.from(right);
    const shortestLength = Math.min(leftCharacters.length, rightCharacters.length);
    let sharedLength = 0;

    while (
      sharedLength < shortestLength &&
      leftCharacters[sharedLength] === rightCharacters[sharedLength]
    ) {
      sharedLength += 1;
    }

    return shortestLength ? sharedLength / shortestLength : 0;
  }

  function bigramDiceSimilarity(left, right) {
    const leftCharacters = Array.from(left);
    const rightCharacters = Array.from(right);

    if (leftCharacters.length < 2 || rightCharacters.length < 2) {
      return left === right ? 1 : 0;
    }

    const leftBigrams = new Map();
    let matches = 0;

    for (let index = 0; index < leftCharacters.length - 1; index += 1) {
      const bigram = leftCharacters[index] + leftCharacters[index + 1];
      leftBigrams.set(bigram, (leftBigrams.get(bigram) || 0) + 1);
    }

    for (let index = 0; index < rightCharacters.length - 1; index += 1) {
      const bigram = rightCharacters[index] + rightCharacters[index + 1];
      const available = leftBigrams.get(bigram) || 0;
      if (available > 0) {
        matches += 1;
        leftBigrams.set(bigram, available - 1);
      }
    }

    return (2 * matches) /
      (leftCharacters.length + rightCharacters.length - 2);
  }

  function calculateTitleSimilarity(left, right) {
    const leftTitle = normalizeSimilarityTitle(left);
    const rightTitle = normalizeSimilarityTitle(right);

    if (leftTitle === rightTitle) {
      return 1;
    }

    const leftLeadingCharacters = Array.from(leftTitle).slice(0, 3).join('');
    const rightLeadingCharacters = Array.from(rightTitle).slice(0, 3).join('');

    return (
      0.5 * normalizedEditSimilarity(leftLeadingCharacters, rightLeadingCharacters) +
      0.25 * commonPrefixCoverage(leftTitle, rightTitle) +
      0.15 * bigramDiceSimilarity(leftTitle, rightTitle) +
      0.1 * normalizedEditSimilarity(leftTitle, rightTitle)
    );
  }

  function compareSimilarityLeaves(left, right) {
    return compareDisplayTitles(left.title, right.title) ||
      compareCanonicalStrings(left.period, right.period) ||
      left.originalIndex - right.originalIndex;
  }

  function compareSimilaritySequences(left, right) {
    const sharedLength = Math.min(left.length, right.length);

    for (let index = 0; index < sharedLength; index += 1) {
      const comparison = compareSimilarityLeaves(left[index], right[index]);
      if (comparison !== 0) {
        return comparison;
      }
    }

    return left.length - right.length;
  }

  function parseClassVariantTitle(title) {
    const match = normalizeSimilarityTitle(title).match(/^(.*)(海風班|山嵐班)$/);
    return match && match[1]
      ? { base: match[1], variant: match[2] }
      : null;
  }

  function buildInitialSimilarityClusters(leaves) {
    const families = new Map();

    leaves.forEach(leaf => {
      const parsed = parseClassVariantTitle(leaf.title);
      if (!parsed) return;
      if (!families.has(parsed.base)) {
        families.set(parsed.base, { leaves: [], variants: new Set() });
      }
      const family = families.get(parsed.base);
      family.leaves.push(leaf);
      family.variants.add(parsed.variant);
    });

    const hardBlockFamilies = new Set();
    families.forEach((family, base) => {
      if (family.variants.has('海風班') && family.variants.has('山嵐班')) {
        hardBlockFamilies.add(base);
      }
    });

    const emittedFamilies = new Set();
    const clusters = [];
    leaves.forEach(leaf => {
      const parsed = parseClassVariantTitle(leaf.title);
      const familyBase = parsed && hardBlockFamilies.has(parsed.base)
        ? parsed.base
        : '';
      if (familyBase) {
        if (emittedFamilies.has(familyBase)) return;
        emittedFamilies.add(familyBase);
        const familyLeaves = families.get(familyBase).leaves
          .slice()
          .sort(compareSimilarityLeaves);
        clusters.push({
          id: clusters.length,
          anchor: familyLeaves[0],
          leaves: familyLeaves
        });
        return;
      }
      clusters.push({
        id: clusters.length,
        anchor: leaf,
        leaves: [leaf]
      });
    });

    return clusters;
  }

  function calculateCompleteLinkSimilarity(first, second) {
    let similarity = 1;
    first.leaves.forEach(firstLeaf => {
      second.leaves.forEach(secondLeaf => {
        similarity = Math.min(
          similarity,
          calculateTitleSimilarity(firstLeaf.title, secondLeaf.title)
        );
      });
    });
    return similarity;
  }

  function orientSimilarityClusters(first, second) {
    const firstForward = first.leaves.slice();
    const firstReverse = first.leaves.slice().reverse();
    const secondForward = second.leaves.slice();
    const secondReverse = second.leaves.slice().reverse();
    const candidates = [];

    [firstForward, firstReverse].forEach(firstSequence => {
      [secondForward, secondReverse].forEach(secondSequence => {
        candidates.push({
          joinIndex: firstSequence.length,
          leaves: firstSequence.concat(secondSequence)
        });
        candidates.push({
          joinIndex: secondSequence.length,
          leaves: secondSequence.concat(firstSequence)
        });
      });
    });

    candidates.sort((left, right) => {
      const leftSimilarity = calculateTitleSimilarity(
        left.leaves[left.joinIndex - 1].title,
        left.leaves[left.joinIndex].title
      );
      const rightSimilarity = calculateTitleSimilarity(
        right.leaves[right.joinIndex - 1].title,
        right.leaves[right.joinIndex].title
      );
      return rightSimilarity - leftSimilarity ||
        compareSimilaritySequences(left.leaves, right.leaves);
    });

    return candidates[0].leaves;
  }

  /**
   * Returns a display-only order. Call this once for each term/vacation section,
   * then filter the ordered result during search so the visible order does not jump.
   */
  function sortCatalogItemsBySimilarity(catalogItems) {
    const sourceItems = Array.isArray(catalogItems) ? catalogItems : [];
    const leaves = sourceItems.map((item, originalIndex) => ({
      item,
      originalIndex,
      title: String(item && item.title || ''),
      period: item && item.period === 'vacation' ? 'vacation' : 'term'
    })).sort(compareSimilarityLeaves);

    if (leaves.length < 2) {
      return leaves.map(leaf => leaf.item);
    }

    let clusters = buildInitialSimilarityClusters(leaves);
    let nextClusterId = clusters.length;
    const clusterSimilarities = new Map();
    const pairKey = (leftId, rightId) => leftId < rightId
      ? leftId + ':' + rightId
      : rightId + ':' + leftId;
    const getClusterSimilarity = (left, right) =>
      clusterSimilarities.get(pairKey(left.id, right.id));
    const setClusterSimilarity = (left, right, similarity) => {
      clusterSimilarities.set(pairKey(left.id, right.id), similarity);
    };

    for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
        setClusterSimilarity(
          clusters[leftIndex],
          clusters[rightIndex],
          calculateCompleteLinkSimilarity(clusters[leftIndex], clusters[rightIndex])
        );
      }
    }

    while (clusters.length > 1) {
      clusters.sort((left, right) => compareSimilarityLeaves(left.anchor, right.anchor));
      let bestPair = null;

      for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
          const similarity = getClusterSimilarity(
            clusters[leftIndex],
            clusters[rightIndex]
          );
          if (
            similarity >= TITLE_SIMILARITY_CLUSTER_THRESHOLD &&
            (!bestPair || similarity > bestPair.similarity + TITLE_SIMILARITY_EPSILON)
          ) {
            bestPair = { leftIndex, rightIndex, similarity };
          }
        }
      }

      if (!bestPair) {
        break;
      }

      const first = clusters[bestPair.leftIndex];
      const second = clusters[bestPair.rightIndex];
      const remaining = clusters.filter((cluster, index) =>
        index !== bestPair.leftIndex && index !== bestPair.rightIndex
      );
      const mergedLeaves = orientSimilarityClusters(first, second);
      const merged = {
        id: nextClusterId,
        anchor: mergedLeaves.slice().sort(compareSimilarityLeaves)[0],
        leaves: mergedLeaves
      };
      nextClusterId += 1;

      remaining.forEach(cluster => {
        setClusterSimilarity(
          merged,
          cluster,
          Math.min(
            getClusterSimilarity(first, cluster),
            getClusterSimilarity(second, cluster)
          )
        );
      });
      clusters = remaining.concat(merged);
    }

    return clusters
      .sort((left, right) => compareSimilarityLeaves(left.anchor, right.anchor))
      .flatMap(cluster => cluster.leaves)
      .map(leaf => leaf.item);
  }

  function sortCatalogItemsForSelection(catalogItems) {
    const items = Array.isArray(catalogItems) ? catalogItems : [];
    const regularItems = items.filter(item => !isDefaultSelectedTitle(item && item.title));
    const defaultSelectedItems = items.filter(item => isDefaultSelectedTitle(item && item.title));

    return sortCatalogItemsBySimilarity(regularItems)
      .concat(sortCatalogItemsBySimilarity(defaultSelectedItems));
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

  function getVacationWeekNumbers(payload) {
    assertPayload(payload);
    const weekNumbers = Array.from(new Set(payload.weekDataList
      .map(item => Number(item && item.week))
      .filter(Number.isFinite)))
      .sort((a, b) => a - b);
    const vacationStartIndex = weekNumbers.findIndex((weekNumber, index) =>
      index > 0 && weekNumber - weekNumbers[index - 1] >= 3
    );

    return new Set(vacationStartIndex === -1 ? [] : weekNumbers.slice(vacationStartIndex));
  }

  function extractCatalog(payload) {
    assertPayload(payload);
    const byKey = new Map();
    const vacationWeekNumbers = getVacationWeekNumbers(payload);

    payload.tableData.forEach(row => {
      if (!row || row.isHeader || !Array.isArray(row.cells)) {
        return;
      }

      const isNoteRow = normalizeTitle(row.cells[1] && row.cells[1].value) === '備註';
      row.cells.forEach((cell, cellIndex) => {
        if (isNoteRow && cellIndex < 2) return;
        splitCellEntries(cell && cell.value).forEach(rawEntry => {
          if (isStructuralValue(rawEntry)) {
            return;
          }

          const parsed = parseEntry(rawEntry);
          const title = isNoteRow ? makeScheduleNoteTitle(parsed.title) : parsed.title;
          const key = normalizeTitle(title);

          if (!key) {
            return;
          }

          const existing = byKey.get(key) || {
            title,
            hasVacationOccurrence: false
          };
          existing.hasVacationOccurrence =
            existing.hasVacationOccurrence ||
            vacationWeekNumbers.has(Number(row.weekNum));
          byKey.set(key, existing);
        });
      });
    });

    const catalogItems = Array.from(byKey.values())
      .map(item => ({
        title: item.title,
        period: item.hasVacationOccurrence ? 'vacation' : 'term'
      }));
    const termItems = sortCatalogItemsForSelection(
      catalogItems.filter(item => item.period === 'term')
    );
    const vacationItems = sortCatalogItemsForSelection(
      catalogItems.filter(item => item.period === 'vacation')
    );
    const all = termItems.concat(vacationItems);

    return {
      all,
      termItems,
      vacationItems
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

  function makeAcademicTermKey(gradeApiName, dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(String(dateValue || '') + 'T00:00:00');
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    if (!gradeApiName || !Number.isFinite(year) || month < 1 || month > 12) {
      throw new Error('無法判定課表屬於哪一個學期。');
    }

    const academicYear = month >= 8 ? year : year - 1;
    const semester = month >= 8 || month === 1 ? 1 : 2;
    return [gradeApiName, academicYear + '-' + semester].join('|');
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

    const termKey = makeAcademicTermKey(payload.currentGrade, firstDate);
    const catalogFingerprint = makeCatalogFingerprint(
      termKey,
      formatDateKey(lastDate),
      catalog.all
    );

    return {
      currentGrade: payload.currentGrade,
      weekCount: payload.weekDataList.length,
      firstDate,
      lastDate,
      firstDateKey: formatDateKey(firstDate),
      lastDateKey: formatDateKey(lastDate),
      termKey,
      catalogFingerprintVersion: CATALOG_FINGERPRINT_VERSION,
      catalogFingerprint,
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

    let lastError = null;
    for (let attempt = 1; attempt <= SOURCE_FETCH_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await request(API_URL + '?grade=' + encodeURIComponent(apiGrade), {
          redirect: 'follow',
          cache: 'no-store'
        });
        if (!response.ok) {
          const error = new Error('課表來源回應失敗（HTTP ' + response.status + '）。');
          error.status = Number(response.status) || 0;
          throw error;
        }
        return assertPayload(await response.json());
      } catch (error) {
        lastError = error;
        const status = Number(error && error.status) || 0;
        const retryable = !status || status === 302 || status === 404 ||
          status === 408 || status === 425 || status === 429 || status >= 500;
        if (!retryable || attempt === SOURCE_FETCH_MAX_ATTEMPTS) throw error;
        await new Promise(resolve => setTimeout(
          resolve,
          SOURCE_FETCH_RETRY_DELAY_MS * attempt
        ));
      }
    }
    throw lastError || new Error('目前無法讀取課表來源。');
  }

  return {
    API_URL,
    GRADE_API_NAMES,
    CATALOG_FINGERPRINT_VERSION,
    makeAcademicTermKey,
    MANUAL_MERGE_EXCEPTIONS,
    WEEKDAY_LABELS,
    normalizeText,
    normalizeTitle,
    NATURAL_ADVANCED_BASE_TITLE,
    NATURAL_ADVANCED_VARIANT_TITLES,
    SCHEDULE_NOTE_TITLE_PREFIX,
    isScheduleNoteTitle,
    makeScheduleNoteTitle,
    isCourseSelectionHidden,
    applyCourseSelectionRules,
    isDefaultSelectedTitle,
    compareCanonicalStrings,
    sortCatalogItemsBySimilarity,
    sortCatalogItemsForSelection,
    makeCatalogFingerprintRows,
    makeCatalogFingerprint,
    splitCellEntries,
    parseEntry,
    assertPayload,
    getVacationWeekNumbers,
    extractCatalog,
    inferDateRecords,
    summarizePayload,
    fetchGradeSchedule,
    formatDateKey
  };
});
