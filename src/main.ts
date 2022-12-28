import ErrorMapper from "utils/ErrorMapper";
import { init, tick } from "./entry";
import "settings";

declare global {
  enum Simultaneous_Actions {
    HARVEST = 0,
    ATTACK,
    RANGED_ATTACK,
    RANGED_MASS_ATTACK,
    UPGRADE_CONTROLLER,
    WITHDRAW,
    TRANSFER,
    DROP,
    BUILD,
    REPAIR,
    DISMANTLE,
    ATTACK_CONTROLLER,
    RANGED_HEAL,
    HEAL
  }
  interface CreepMemory {
    transfering: boolean;
    custom_msg?: string;
  }
  interface Memory {
    cpu: unknown;
    profiler: unknown;
  }
}

let suspended = false;
let initialized = false;

function unwrappedLoop(): void {
  // console.log(`Current game tick is ${Game.time}`);
  // Automatically delete memory of missing creeps
  if (Memory.creeps != null) {
    Object.keys(Memory.creeps)
      .filter((name) => !(name in Game.creeps))
      .forEach((name) => delete Memory.creeps[name]);
    Object.keys(Game.creeps)
      .filter((name) => !(name in Memory.creeps))
      .map((name) => (Memory.creeps[name] = { transfering: false }));
  }
  if (!suspended) {
    if (!initialized) {
      init();
      initialized = true;
    }
    tick();
  }

  if (Game.cpu.bucket > PIXEL_CPU_COST && Game.cpu.generatePixel != null) {
    Game.cpu.generatePixel();
  }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
const loop = ErrorMapper.wrapLoop(unwrappedLoop);

// CUSTOM CLI FUNCTIONS

interface custom_fns extends NodeJS.Global {
  suspend?: () => boolean;
  genocide?: () => string;
  reset_profiler?: () => string;
}
const custom_global: custom_fns = global;
custom_global.suspend = function (): boolean {
  suspended = !suspended;
  return suspended;
};
custom_global.genocide = function (): string {
  for (const creep of Object.values(Game.creeps)) {
    creep.suicide();
  }
  return "All creeps have been killed!";
};
custom_global.reset_profiler = function (): string {
  Memory.profiler = {};
  Memory.cpu = {
    history: [],
    average: 0
  };
  return "success";
};

export { loop, unwrappedLoop };
