import * as _ from "lodash";
import * as names_file from "./creepNames.json";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const values = Object.values;
const entries = Object.entries;
const keys = Object.keys;
const assign = Object.assign;
const log = console.log;
const LAST_INIT_TIME = Game.time;

const creep_names = values(names_file)[0];
if (creep_names == undefined) {
  throw Error();
}
// console.log(creep_names);
let found_creep_ids: Array<Creep>;

function assert(thing: unknown) {
  if (thing) {
  } else {
    throw Error("assert");
  }
}
const panic = (x?: string): never => {
  throw Error(x);
};
const Not_Implemented = () => panic("Not yet implemented");
const Unreachable = () => panic("Unreachable");
const Unexpected_Screeps_Return = (result: ScreepsReturnCode) =>
  Error("Unexpected intent result: " + result.toString());
function byId<T extends _HasId>(id: Id<T> | undefined) {
  return id ? Game.getObjectById(id) ?? undefined : undefined;
}

// excludes the upper bound
function rand_int(): number;
function rand_int(end: number): number;
function rand_int(start: number, end: number): number;
function rand_int(start?: number, end?: number): number {
  if (end == undefined && start == undefined) {
    return rand_int(0, Number.MAX_SAFE_INTEGER);
  } else if (end == undefined) {
    return rand_int(0, start as number);
  } else if (start == undefined) {
    throw Error();
  }
  return Math.floor(Math.random() * end) + start;
}

function assemble_creep_name(): string {
  const [first_names, last_names] = creep_names;
  const first_i = rand_int(first_names.length - 1);
  const second_i = rand_int(last_names.length - 1);
  const postfix = rand_int(99);
  return first_names[first_i] + " " + last_names[second_i] + postfix.toString();
}
type Tick = number;
function init(): void {
  console.log("-----INITIALIZING-----");
}

type Depositable = StructureSpawn | StructureController | StructureExtension;
const harvesting_creeps: { [id: Id<Creep>]: Id<Source> } = {};
const creeps_depositing: { [id: Id<Creep>]: Id<Depositable> } = {};
function tick() {
  const rooms_with_spawns = _.uniq(values(Game.spawns).map((spawn) => spawn.room));
  rooms_with_spawns.forEach((room: Room) => {
    // harvesting
    const spawns = room.find(FIND_MY_SPAWNS);
    spawns.forEach((spawn) => {
      const body = [WORK, CARRY, MOVE];
      const cost = _.sum(body.map((part) => BODYPART_COST[part]));
      if (spawn.spawning) {
        return;
      }
      if (spawn.store.energy < cost) {
        return;
      }
      const result = spawn.spawnCreep(body, assemble_creep_name());
      if (result != OK) {
        console.log("couldn't spawn harvester: " + result.toString());
      }
    });
    const idle_creeps = values(Game.creeps).filter((creep) => !harvesting_creeps[creep.id]);
    function pick_suitable_harvesting_source(creep: Creep) {
      const sources = room.find(FIND_SOURCES)[0] ?? panic();
      return sources;
    }
    idle_creeps.forEach((creep) => {
      console.log("making creep harvest stuff:" + creep.name);
      harvesting_creeps[creep.id] = pick_suitable_harvesting_source(creep).id;
    });
    keys(harvesting_creeps).filter((creep_string_id) => {
      const creep_id = creep_string_id as Id<Creep>;
      const creep = byId(creep_id) as Creep;
      const ttl = creep.ticksToLive ?? panic();
      const assigned_depositable = (room.find(FIND_MY_SPAWNS)[0] ?? panic()) as Depositable;
      const path_to_deposit = PathFinder.search(creep.pos, assigned_depositable.pos);
      const travel_cost = path_to_deposit.cost;
      const creep_dying = travel_cost >= ttl;
      // move to deposit, creep is dying
      if (creep_dying) {
        console.log(
          "creep " +
            creep.name +
            " is dying, ttl is " +
            ttl.toString() +
            " while travel cost to deposit is " +
            travel_cost.toString()
        );
        creeps_depositing[creep_id] = assigned_depositable.id;
      }
      // harvesting phase exit condition
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        creeps_depositing[creep_id] = assigned_depositable.id;
      }
      // depositing phase exit condition
      if (creeps_depositing[creep_id] && creep.store.getUsedCapacity(RESOURCE_ENERGY) == 0 && !creep_dying) {
        delete creeps_depositing[creep_id];
      }

      // creep is dead
      if (ttl <= 1) {
        // TODO: test for 0
        delete harvesting_creeps[creep_id];
      }

      // intents
      const assigned_source = room.find(FIND_SOURCES)[0];
      if (creeps_depositing[creep_id]) {
        const result =
          assigned_depositable.structureType == STRUCTURE_CONTROLLER
            ? creep.upgradeController(assigned_depositable)
            : creep.transfer(assigned_depositable, RESOURCE_ENERGY);
        if (result == ERR_NOT_IN_RANGE) {
          creep.moveTo(assigned_depositable);
        } else if (result != OK) {
          console.log("unhandled depositing error: " + result.toString());
        }
      } else {
        const result = creep.harvest(assigned_source);
        if (result == ERR_NOT_IN_RANGE) {
          creep.moveTo(assigned_source);
        } else if (result != OK) {
          console.log("unhandled harvesting error: " + result.toString());
        }
      }
    });
  });
}
export { init, tick };
