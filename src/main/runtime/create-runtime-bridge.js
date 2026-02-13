'use strict';

const { createRuntimeCoordinator } = require('../../runtime/runtime-coordinator');

function createRuntimeBridge(options) {
  return createRuntimeCoordinator(options);
}

module.exports = {
  createRuntimeBridge,
};
