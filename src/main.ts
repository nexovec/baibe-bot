import roleBuilder, { Builder } from "roles/builder";
import roleHarvester from "roles/harvester";
import roleUpgrader, { Upgrader } from "roles/upgrader";
import ErrorMapper from "utils/ErrorMapper";
import { runTower } from "./tower";
import { init, tick } from "./entry";

declare global {
  interface CreepMemory {
    role: string;
  }
  interface Memory {
    cpu: unknown;
    profiler: unknown;
  }
}

function unwrappedLoop(): void {
  console.log(`Current game tick is ${Game.time}`);
  Object.values(Game.rooms).forEach((room) => {
    if (room.controller?.my) {
      const towers = room.find<StructureTower>(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });

      towers.forEach((tower) => {
        runTower(tower);
      });
    }
  });

  // Automatically delete memory of missing creeps
  if (Memory.creeps != null) {
    Object.keys(Memory.creeps)
      .filter((name) => !(name in Game.creeps))
      .forEach((name) => delete Memory.creeps[name]);
  }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
const loop = ErrorMapper.wrapLoop(unwrappedLoop);

// CUSTOM CLI FUNCTIONS

interface custom_fns extends NodeJS.Global {
  toggle_running?: () => void;
  genocide?: () => string;
  reset_profiler?: () => string;
}
const custom_global: custom_fns = global;
custom_global.toggle_running = function (): void {
  throw Error("Not yet implemented");
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
