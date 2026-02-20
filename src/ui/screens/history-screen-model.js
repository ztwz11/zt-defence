'use strict';

const { createUiTextBundle, normalizeUiLocale } = require('../localization');

function resolveUiLocale(options) {
  if (typeof options === 'string') {
    return normalizeUiLocale(options);
  }

  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return normalizeUiLocale(undefined);
  }

  return normalizeUiLocale(options.locale);
}

function createHistoryScreenModel(entries, options) {
  const safeEntries = Array.isArray(entries) ? entries.map((entry) => ({ ...entry })) : [];
  const locale = resolveUiLocale(options);
  const textBundle = createUiTextBundle(locale);

  return {
    locale,
    screenId: 'History',
    screenLabel: textBundle.screens.history,
    totalEntries: safeEntries.length,
    entries: safeEntries,
  };
}

module.exports = {
  createHistoryScreenModel,
};
