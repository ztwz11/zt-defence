'use strict';

function createHistoryScreenModel(entries) {
  const safeEntries = Array.isArray(entries) ? entries.map((entry) => ({ ...entry })) : [];

  return {
    screenId: 'History',
    totalEntries: safeEntries.length,
    entries: safeEntries,
  };
}

module.exports = {
  createHistoryScreenModel,
};
