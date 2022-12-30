import * as _ from "lodash";
import { panic } from "utilities";
import * as names_file from "./creepNames.json";
import { surroundingPoints } from "./weight-min-cut";
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
    // spawning
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
      function get_ideal_harvester_count(sources: Source[], body: BodyPartConstant[]) {
        const parkable_spots = sources.map((source) => {
          const spots = surroundingPoints(source.pos);
          const parkable_spots = spots.filter((spot) => {
            const terrain = room.getTerrain().get(spot.x, spot.y);
            return terrain != TERRAIN_MASK_WALL;
          });
          const work_part_count = body.filter((part) => part === WORK).length;
          // TODO: limit based on how fast they can outharvest the source regeneration
          return parkable_spots.length;
        });
        return _.sum(parkable_spots);
      }
      const needed_harvesters = get_ideal_harvester_count(room.find(FIND_SOURCES), body);
      log(needed_harvesters.toString() + " harvesters needed");
      if (values(Game.creeps).length >= needed_harvesters) {
        return;
      }
      const result = spawn.spawnCreep(body, assemble_creep_name());
      if (result != OK) {
        console.log("couldn't spawn harvester: " + result.toString());
      }
    });
    const idle_creeps = values(Game.creeps).filter((creep) => {
      return !creep.spawning && !harvesting_creeps[creep.id];
    });
    function pick_suitable_harvesting_source(creep: Creep) {
      const sources = room.find(FIND_SOURCES);
      const source_to_deposit_paths = sources.map((source) =>
        PathFinder.search(source.pos, room.controller?.pos ?? panic())
      );
      const smallest_cost = _.min(source_to_deposit_paths.map((p) => p.cost));
      const index = source_to_deposit_paths.findIndex((source) => source.cost == smallest_cost);
      return sources[index];
    }
    idle_creeps.forEach((creep) => {
      console.log("making creep harvest stuff: " + creep.name);
      harvesting_creeps[creep.id] = pick_suitable_harvesting_source(creep).id;
    });

    // removing dead creeps
    const dead_harvesters = keys(harvesting_creeps).filter((id) => (byId(id as Id<Creep>)?.ticksToLive ?? 0) <= 1);
    if (dead_harvesters.length !== 0) {
      console.log("There are " + dead_harvesters.length.toString() + " dead creeps");
    }
    dead_harvesters.forEach((creep) => delete harvesting_creeps[creep as Id<Creep>]);

    // harvesting
    keys(harvesting_creeps).filter((creep_string_id) => {
      const creep_id = creep_string_id as Id<Creep>;
      const creep = byId(creep_id) ?? panic();
      // if (creep === undefined) {
      //   throw Error("Couldn't find creep " + creep_id);
      // }
      const ttl = creep.ticksToLive ?? panic();

      const available_spawns = room.find(FIND_MY_SPAWNS);
      const assigned_depositable =
        available_spawns.find((spawn) => spawn.store.getFreeCapacity(RESOURCE_ENERGY) != 0) ??
        room.controller ??
        panic();

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
      const assigned_source = pick_suitable_harvesting_source(creep);
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
