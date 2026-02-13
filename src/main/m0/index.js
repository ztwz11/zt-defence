'use strict';

module.exports = {
  ...require('./session-coordinator'),
  ...require('./result-presenter'),
  ...require('./history-projection'),
};
