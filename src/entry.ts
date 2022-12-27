import { spawn } from "child_process";
import { close } from "fs";
import * as _ from "lodash";
import * as names_file from "./creepNames.json";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const o = Object;
const creep_names = o.values(names_file)[0];
console.log(creep_names);
let found_creep_ids: Array<Creep>;

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
  // assert(end == Math.round(end));
  // assert(start == Math.round(start));
  return Math.floor(Math.random() * end) + start;
}

function assemble_creep_name(): string {
  const [first_names, last_names] = creep_names;
  const first_i = rand_int(first_names.length - 1);
  const second_i = rand_int(last_names.length - 1);
  const postfix = rand_int(99);
  console.log([first_i.toString(), second_i.toString()].join(","));
  return first_names[first_i] + " " + last_names[second_i] + postfix.toString();
}

function init(): void {
  found_creep_ids = [];
  console.log("-----INITIALIZING-----");
  for (const creep of o.values(Game.creeps)) {
    const foreign_creeps = creep.room.find(FIND_CREEPS).filter((creep) => !creep.my);
    found_creep_ids.push(...foreign_creeps);
  }
}

function tick(): void {
  // spawn the biggest harvesters you can.
  for (const spawn of o.values(Game.spawns)) {
    console.log(spawn.toString());
    const universal_worker_parts: BodyPartConstant[] = [WORK, CARRY, MOVE];
    function compute_body_cost(parts: BodyPartConstant[]): number {
      return parts.reduce((cumulant: number, part: BodyPartConstant) => cumulant + BODYPART_COST[part], 0);
    }
    const count = Math.floor(
      (spawn.store.getFreeCapacity(RESOURCE_ENERGY) + spawn.store.getUsedCapacity(RESOURCE_ENERGY)) /
        compute_body_cost(universal_worker_parts)
    );
    const largest_produceable_worker: BodyPartConstant[] = _.flatten(
      _.times(count, _.constant(universal_worker_parts))
    );
    spawn.spawnCreep(largest_produceable_worker, assemble_creep_name());
  }
  for (const creep of o.values(Game.creeps)) {
    // transfer energy
    const spawns_in_room = o.values(Game.spawns).filter((spawn) => spawn.room == creep.room);
    // TODO: reroute to closest spawn outside the room
    const closest_spawn = creep.pos.findClosestByPath(spawns_in_room);
    if (closest_spawn == null) {
      console.log("Creep is lost!: " + creep.room.name.toString());
      continue;
    }
    let result = creep.transfer(closest_spawn, RESOURCE_ENERGY);
    const m = Memory.creeps[creep.name];
    if (result == OK) {
    } else if (result == ERR_NOT_ENOUGH_ENERGY) {
      m.transfering = false;
    } else if (result == ERR_FULL) {
    } else if (result == ERR_NOT_IN_RANGE && m.transfering) {
      creep.moveTo(closest_spawn);
      continue;
    } else if (result == ERR_NOT_IN_RANGE) {
    } else {
      throw Error("Unreachable" + String(result));
    }
    // harvest
    // NOTE: harvests energy source closest to the closest spawn
    const sources = closest_spawn.room.find(FIND_SOURCES);
    const closest_source = creep.pos.findClosestByRange(sources);
    if (!closest_source) {
      console.log("there are no sources in room: " + creep.room.name.toString());
      continue;
    }
    result = creep.harvest(closest_source);
    if (result == ERR_NOT_IN_RANGE && !m.transfering) {
      creep.moveTo(closest_source);
      continue;
    } else if (result == OK && creep.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
      m.transfering = true;
    }
  }
}

export { init, tick };
