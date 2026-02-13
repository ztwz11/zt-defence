'use strict';

const RUNTIME_EVENT = Object.freeze({
  RUN_PHASE: 'runtime/run-phase',
  HUD_UPDATE: 'runtime/hud-update',
  SIMULATION_EVENT: 'runtime/simulation-event',
  RESULT: 'runtime/result',
});

const RUNTIME_EVENT_NAMES = Object.freeze(Object.values(RUNTIME_EVENT));

module.exports = {
  RUNTIME_EVENT,
  RUNTIME_EVENT_NAMES,
};
