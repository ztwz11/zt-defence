'use strict';

function ok(value, warnings) {
  return {
    ok: true,
    value,
    warnings: Array.isArray(warnings) ? warnings.slice() : [],
  };
}

function fail(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message,
      details: details === undefined ? null : details,
    },
  };
}

function warning(code, message, details) {
  return {
    code,
    message,
    details: details === undefined ? null : details,
  };
}

module.exports = {
  ok,
  fail,
  warning,
};
