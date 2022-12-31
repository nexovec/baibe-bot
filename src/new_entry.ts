import * as _ from "lodash";
import { assemble_creep_name, assert, byId, log, panic, values } from "utilities";
import { profile } from "./profiler";
import { surroundingPoints, EIGHT_DELTA } from "./weight-min-cut";
import { keys, slice } from "lodash";
import { spawn } from "child_process";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment

type Tick = number;
function init(): void {
  console.log("-----INITIALIZING-----");
}

type Depositable = StructureSpawn | StructureController | StructureExtension;
const harvesting_creeps: { [id: Id<Creep>]: Id<Source> } = {};
const creeps_depositing: { [id: Id<Creep>]: Id<Depositable> } = {};
function get_body_cost(body: BodyPartConstant[]): number {
  return _.sum(body.map((part) => BODYPART_COST[part]));
}
function get_ideal_harvester_count_of_source(source: Source, body: BodyPartConstant[]) {
  const room = source.room;
  const spots = surroundingPoints(source.pos);
  const parkable_spots = spots.filter((spot) => {
    const terrain = room.getTerrain().get(spot.x, spot.y);
    return terrain != TERRAIN_MASK_WALL;
  });
  const work_part_count = body.filter((part) => part === WORK).length;
  const carry_part_count = body.filter((part) => part === CARRY).length;
  const controller = source.room.controller ?? panic();
  const path_cost = PathFinder.search(source.pos, { pos: controller.pos, range: 1 }).cost;
  // loss is in energy units
  // FIXME: not accounting for the away loss of the extra creeps
  const loss_to_away_from_source = path_cost * work_part_count * parkable_spots.length * HARVEST_POWER * 2;
  const needed_extra = Math.ceil(loss_to_away_from_source / (carry_part_count * CARRY_CAPACITY * HARVEST_POWER));
  // TODO: limit based on how fast they can outharvest the source regeneration
  return parkable_spots.length + needed_extra;
}
function get_ideal_harvester_count(room: Room, body: BodyPartConstant[]) {
  const sources = room.find(FIND_SOURCES);
  const parkable_spots = sources.map((source) => get_ideal_harvester_count_of_source(source, body));
  return _.sum(parkable_spots);
}
function count_harvesters_assigned_to_source(source: Source) {
  return values(harvesting_creeps).filter((s) => s == source.id).length;
}

const BASIC_HARVESTER_BODY = [WORK, CARRY, MOVE];

const CostMatrix = PathFinder.CostMatrix;
type CostMatrix = typeof PathFinder.CostMatrix;

// NOTE: ignores the origin point
// TODO: test
function flood_fill(point: RoomPosition) {
  function continue_filling(point: RoomPosition, m: CostMatrix) {
    for (const delta of EIGHT_DELTA) {
      const new_point = new RoomPosition(point.x + delta.x, point.y + delta.y, point.roomName);
      if (!m.get(new_point.x, new_point.y)) {
        continue_filling(new_point, m);
      }
    }
  }
  const mat = new CostMatrix();
  continue_filling(point, mat);
}

function tick(): void {
  const rooms_with_spawns = _.uniq(values(Game.spawns).map((spawn) => spawn.room));
  rooms_with_spawns.forEach((room: Room) => {
    // constructing
    const controller = room.controller;
    if (controller === undefined) return;
    if (controller.level >= 1) {
      const roads: RoomPosition[] = [];
      room.find(FIND_SOURCES).forEach((source) => {
        room.find(FIND_MY_SPAWNS).forEach((spawn) => {
          const path = PathFinder.search(
            spawn.pos,
            { pos: source.pos, range: 1 },
            { maxRooms: 1, plainCost: 1, swampCost: 1 }
          );
          if (path.incomplete) return;
          roads.push(...path.path);
        });
        const path = PathFinder.search(
          controller.pos,
          { pos: source.pos, range: 1 },
          { maxRooms: 1, plainCost: 1, swampCost: 1 }
        );
        if (path.incomplete) return;
        roads.push(...path.path);
      });
      roads.forEach((point) => {
        const result = room.createConstructionSite(point.x, point.y, STRUCTURE_ROAD);
        if (result == OK) {
          console.log("placing road at x:" + String(point.x) + ", y:" + String(point.y));
        } else if (result != ERR_INVALID_TARGET) {
          console.log("construction placement error: " + result.toString());
        }
      });
    } else {
      console.log("not enough level");
    }
    // spawning
    const spawns = room.find(FIND_MY_SPAWNS);
    spawns.forEach((spawn) => {
      const cost = get_body_cost(BASIC_HARVESTER_BODY);
      if (spawn.spawning) {
        return;
      }
      if (spawn.store.energy < cost) {
        return;
      }
      const needed_harvesters = get_ideal_harvester_count(room, BASIC_HARVESTER_BODY);
      // log(needed_harvesters.toString() + " harvesters needed");
      if (values(Game.creeps).length >= needed_harvesters) {
        return;
      }
      const result = spawn.spawnCreep(BASIC_HARVESTER_BODY, assemble_creep_name());
      if (result != OK) {
        console.log("couldn't spawn harvester: " + result.toString());
      }
    });
    const idle_creeps = values(Game.creeps).filter((creep) => {
      return !creep.spawning && !harvesting_creeps[creep.id];
    });
    function suitable_harvesting_sources(creep: Creep): Source[] {
      const sources = room.find(FIND_SOURCES);
      const source_now = harvesting_creeps[creep.id];
      delete harvesting_creeps[creep.id];
      const available_sources = sources.filter((source) => {
        const ideal = get_ideal_harvester_count_of_source(source, BASIC_HARVESTER_BODY);
        const actual = count_harvesters_assigned_to_source(source);
        // console.log("source ideally wants " + ideal.toString() + " harvesters, but only has " + actual.toString());
        return ideal > actual;
      });
      if (available_sources.length == 0) {
        // this shouldn't ever happen
        log(creep.name + " can not harvest");
        return [];
      }
      const sorted = _.sortBy(
        available_sources,
        (source) =>
          get_ideal_harvester_count_of_source(source, BASIC_HARVESTER_BODY) -
          count_harvesters_assigned_to_source(source)
      );
      let top = "0";
      for (const i in sorted) {
        const source = sorted[i];
        if (
          get_ideal_harvester_count_of_source(source, BASIC_HARVESTER_BODY) !=
          get_ideal_harvester_count_of_source(sorted[0], BASIC_HARVESTER_BODY)
        ) {
          break;
        }
        top = i;
      }
      const n = parseInt(top);
      const finalists = slice(sorted, 0, n + 1);
      // picks at random from sources with the same amount of creeps missing
      harvesting_creeps[creep.id] = source_now;
      return finalists;
    }
    function pick_suitable_harvesting_source(creep: Creep) {
      // it just returns a random candidate
      const candidates = suitable_harvesting_sources(creep);
      return candidates[_.random(0, candidates.length - 1)];
    }
    idle_creeps.forEach((creep) => {
      // console.log("making creep harvest stuff: " + creep.name);
      const source = pick_suitable_harvesting_source(creep);
      if (source === null) {
        return;
      }
      // console.log(source.id);
      harvesting_creeps[creep.id] = source.id;
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

      const path_to_deposit = PathFinder.search(creep.pos, { pos: assigned_depositable.pos, range: 1 });
      const travel_cost = path_to_deposit.cost;
      const creep_dying = travel_cost >= ttl;
      // move to deposit, creep is dying
      if (creep_dying) {
        // console.log(
        //   "creep " +
        //     creep.name +
        //     " is dying, ttl is " +
        //     ttl.toString() +
        //     " while travel cost to deposit is " +
        //     travel_cost.toString()
        // );
        creeps_depositing[creep_id] = assigned_depositable.id;
      }
      // harvesting phase exit condition
      if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        creeps_depositing[creep_id] = assigned_depositable.id;
      }
      if (values(Game.creeps).length == 1) {
        const creep = values(Game.creeps)[0];
        const LOWER_ASSISTANCE_AMOUNT_LIMIT = 20;
        const demanded: number = get_body_cost(BASIC_HARVESTER_BODY);
        const closest_spawn =
          _.sortBy(room.find(FIND_MY_SPAWNS), (spawn) =>
            PathFinder.search(creep.pos, { pos: spawn.pos, range: 1 })
          )[0] ?? panic();
        const spawn_e = closest_spawn.store.getUsedCapacity(RESOURCE_ENERGY);
        const creep_e = creep.store.getUsedCapacity(RESOURCE_ENERGY);
        const can_assist_spawning =
          creep.store.energy > LOWER_ASSISTANCE_AMOUNT_LIMIT &&
          PathFinder.search(creep.pos, { pos: closest_spawn.pos, range: 1 }).cost + spawn_e + creep_e >= demanded;
        if (can_assist_spawning) creeps_depositing[creep.id] = closest_spawn.id;
      }
      // depositing phase exit condition
      if (creeps_depositing[creep_id] && creep.store.getUsedCapacity(RESOURCE_ENERGY) == 0 && !creep_dying) {
        delete creeps_depositing[creep_id];
        const source = pick_suitable_harvesting_source(creep);
        if (!source) {
          console.log("this creep is not needed anymore, but that's weird");
          delete harvesting_creeps[creep_id];
          delete creeps_depositing[creep_id];
          return;
        }
      }
      // else {
      //   const available = pick_suitable_harvesting_source(creep);
      //   const actual = harvesting_creeps[creep_id];
      // }

      // creep is dead
      if (ttl <= 0) {
        // TODO: test for 0
        delete harvesting_creeps[creep_id];
      }

      // intents
      const assigned_source = byId(harvesting_creeps[creep.id]) ?? panic();
      // console.log(assigned_source);
      if (creeps_depositing[creep_id]) {
        const result =
          assigned_depositable.structureType == STRUCTURE_CONTROLLER
            ? creep.upgradeController(assigned_depositable)
            : creep.transfer(assigned_depositable, RESOURCE_ENERGY);
        if (result == OK) {
          delete harvesting_creeps[creep_id];
          delete creeps_depositing[creep_id];
        } else if (result == ERR_NOT_IN_RANGE) {
          creep.moveTo(assigned_depositable);
        } else {
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
