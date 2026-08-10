(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.TSchoolSetupCode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PREFIX = 'TSCHOOL_SETUP_V1';
  const SCHEMA_VERSION = 1;
  const MAX_CODE_LENGTH = 32 * 1024;
  const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function uniqueStrings(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
      .map(value => String(value == null ? '' : value).trim())
      .filter(value => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  }

  function normalizeHours(values) {
    const result = [];
    (Array.isArray(values) ? values : []).forEach(value => {
      const hour = Number(value);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23 || result.includes(hour)) return;
      result.push(hour);
    });
    return result.sort((a, b) => a - b);
  }

  function makeSourceSnapshot(value) {
    const source = value && typeof value === 'object' ? value : null;
    const items = source && Array.isArray(source.items) ? source.items : [];

    if (!source || !source.firstDateKey || !source.lastDateKey || !items.length) {
      return null;
    }

    const cleanItems = items.slice(0, 500).map(item => ({
      title: String(item && item.title || '').trim(),
      type: item && item.type === 'activity' ? 'activity' : 'course',
      period: item && item.period === 'vacation' ? 'vacation' : 'term'
    })).filter(item => item.title);

    if (!cleanItems.length) return null;
    return {
      firstDateKey: String(source.firstDateKey || ''),
      lastDateKey: String(source.lastDateKey || ''),
      sourceUpdatedLabel: String(source.sourceUpdatedLabel || ''),
      items: cleanItems
    };
  }

  function makePayload(settings, options) {
    const input = settings || {};
    const config = options || {};
    const catalogFingerprint = String(
      input.initialCatalogFingerprint ||
      input.catalogFingerprint ||
      input.initialSourceFingerprint ||
      input.sourceFingerprint ||
      ''
    );
    const catalogFingerprintVersion = Number(
      input.initialCatalogFingerprintVersion || input.catalogFingerprintVersion
    ) || 0;
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      createdAt: String(config.createdAt || new Date().toISOString()),
      generatorVersion: String(input.appVersion || ''),
      gradeName: String(input.gradeName || ''),
      termKey: String(input.initialTermKey || input.termKey || ''),
      catalogFingerprintVersion,
      catalogFingerprint,
      // 舊版通用 Code.gs 仍讀取此欄位；新程式不得再把它當成完整課表指紋。
      sourceFingerprint: catalogFingerprint,
      selectedCourses: uniqueStrings(input.selectedCourses),
      includeActivities: input.includeActivities !== false,
      excludedActivities: uniqueStrings(input.excludedActivities),
      notificationEmail: String(input.notificationEmail || '').trim(),
      instantNotificationsEnabled: input.instantNotificationsEnabled !== false,
      notificationHours: normalizeHours(input.notificationHours)
    };
    const sourceSnapshot = makeSourceSnapshot(input.setupSourceSnapshot);
    if (sourceSnapshot) payload.sourceSnapshot = sourceSnapshot;
    return payload;
  }

  function utf8Encode(value) {
    const text = String(value == null ? '' : value);
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    const encoded = unescape(encodeURIComponent(text));
    return Array.from(encoded, character => character.charCodeAt(0));
  }

  function utf8Decode(bytes) {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    }
    const binary = bytes.map(byte => String.fromCharCode(byte)).join('');
    return decodeURIComponent(escape(binary));
  }

  function base64Encode(bytes) {
    let output = '';
    for (let index = 0; index < bytes.length; index += 3) {
      const first = bytes[index];
      const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
      const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
      const combined = (first << 16) | (second << 8) | third;
      output += BASE64_ALPHABET[(combined >>> 18) & 63];
      output += BASE64_ALPHABET[(combined >>> 12) & 63];
      output += index + 1 < bytes.length ? BASE64_ALPHABET[(combined >>> 6) & 63] : '=';
      output += index + 2 < bytes.length ? BASE64_ALPHABET[combined & 63] : '=';
    }
    return output;
  }

  function base64Decode(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    if (!normalized || /[^A-Za-z0-9+/=]/.test(normalized)) throw new Error('設定碼內容格式錯誤');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const bytes = [];
    for (let index = 0; index < padded.length; index += 4) {
      const values = padded.slice(index, index + 4).split('').map(character =>
        character === '=' ? 0 : BASE64_ALPHABET.indexOf(character)
      );
      if (values.some(value => value < 0)) throw new Error('設定碼內容格式錯誤');
      const combined = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
      bytes.push((combined >>> 16) & 255);
      if (padded[index + 2] !== '=') bytes.push((combined >>> 8) & 255);
      if (padded[index + 3] !== '=') bytes.push(combined & 255);
    }
    return bytes;
  }

  function toBase64Url(value) {
    return base64Encode(utf8Encode(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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

  function encode(settings, options) {
    const payload = makePayload(settings, options);
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const code = [PREFIX, encodedPayload, hashText(encodedPayload)].join('.');
    if (code.length > MAX_CODE_LENGTH) throw new Error('設定碼過長，請減少選擇項目後重試');
    return code;
  }

  function decode(code) {
    const normalized = String(code || '').trim();
    if (!normalized) throw new Error('請貼上設定碼');
    if (normalized.length > MAX_CODE_LENGTH) throw new Error('設定碼過長');
    const parts = normalized.split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX) throw new Error('這不是可用的 T-SCHOOL 設定碼');
    if (hashText(parts[1]) !== parts[2]) throw new Error('設定碼不完整，請回網站重新複製');
    let payload;
    try {
      payload = JSON.parse(utf8Decode(base64Decode(parts[1])));
    } catch (error) {
      throw new Error('設定碼內容無法讀取，請回網站重新複製');
    }
    if (!payload || payload.schemaVersion !== SCHEMA_VERSION) {
      throw new Error('設定碼版本不受支援，請回網站重新產生');
    }
    return payload;
  }

  return {
    PREFIX,
    SCHEMA_VERSION,
    MAX_CODE_LENGTH,
    decode,
    encode,
    hashText,
    makePayload
  };
});
