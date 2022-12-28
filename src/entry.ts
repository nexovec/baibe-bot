import { spawn } from "child_process";
import { close } from "fs";
import * as _ from "lodash";
import { getEnabledCategories } from "trace_events";
import * as names_file from "./creepNames.json";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const values = Object.values;
const entries = Object.entries;
const keys = Object.keys;
const assign = Object.assign;

const creep_names = values(names_file)[0];
// console.log(creep_names);
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
  console.log("creep name: " + [first_i.toString(), second_i.toString()].join(","));
  return first_names[first_i] + " " + last_names[second_i] + postfix.toString();
}

function init(): void {
  found_creep_ids = [];
  console.log("-----INITIALIZING-----");
  for (const creep of values(Game.creeps)) {
    const foreign_creeps = creep.room.find(FIND_CREEPS).filter((creep) => !creep.my);
    found_creep_ids.push(...foreign_creeps);
  }
}

class Creep_Block {
  dirty: boolean;
  start: number;
  estimated_duration: number;
  end: number | null;

  constructor(estimated_duration: number) {
    this.dirty = false; // is unused rn
    this.start = Game.time;
    this.estimated_duration = estimated_duration;
    this.end = null;
  }
}
type Depositable = StructureContainer | StructureSpawn | StructureExtension;
type Depositable_ID = Id<Depositable>;
const creep_blocking: { [id: Id<Creep>]: Creep_Block } = {};

enum Harvesting_Stage {
  DEPOSITING = "depositing",
  WAITING = "waiting",
  HARVESTING = "harvesting"
}
class Basic_Harvesting_Task {
  source: Id<Source>;
  dest: Depositable_ID;
  subject: Id<Creep>;
  block: Creep_Block;
  stage: Harvesting_Stage;

  constructor(subject: Creep, source: Source, dest: Depositable) {
    this.source = source.id;
    this.dest = dest.id;
    this.subject = subject.id;
    this.stage = Harvesting_Stage.HARVESTING;
    if (this.subject in creep_blocking) {
      throw Error("Creep" + String(Game.getObjectById(this.subject)?.name) + " is already blocked.");
    }
    const est = this.estimate();
    this.block = new Creep_Block(est);
    creep_blocking[this.subject] = this.block;
  }
  // returns expected number of ticks to finish the job
  estimate(): number {
    if (this.stage !== Harvesting_Stage.HARVESTING) {
      throw Error("Not implemented.");
    }
    const creep = Game.getObjectById(this.subject);
    const source = Game.getObjectById(this.source);
    const dest = Game.getObjectById(this.dest) as Depositable;
    if (creep == null) {
      throw Error("creep in a harvesting task is not there.");
    }
    if (source == null) {
      throw Error("source subject to a harvesting task is not there.");
    }
    const ttl = creep.ticksToLive;
    if (ttl == undefined) {
      throw Error("creep doesn't have ticks to live, I don't know what that means.");
    }
    const path_source_dest = PathFinder.search(source.pos, dest.pos);
    const path_to_source_now = PathFinder.search(path_source_dest.path[-1], creep.pos);
    const DYING_DEPOSIT_RESERVE = 2;
    if (ttl <= path_to_source_now.cost + path_source_dest.cost + DYING_DEPOSIT_RESERVE) {
      return 0;
    }
    const HARVEST_SPEED_PER_WORK_PART = 20;
    const num_of_work_parts = creep.body.filter((p) => p.type == WORK).length;
    const num_of_carry_parts = creep.body.filter((p) => p.type == CARRY).length;
    const num_of_move_parts = creep.body.filter((p) => p.type == MOVE).length;
    // TODO: compute slowdown to fatigue

    const ticks_to_fill_up = HARVEST_SPEED_PER_WORK_PART * num_of_work_parts;
    const ideal_cycle_time =
      path_to_source_now.cost +
      Math.ceil(creep.store.getFreeCapacity() / ticks_to_fill_up) +
      path_source_dest.cost +
      DYING_DEPOSIT_RESERVE;
    return Math.min(ttl, ideal_cycle_time);
  }
  work() {
    const creep = Game.getObjectById(this.subject);
    const source = Game.getObjectById(this.source);
    const dest = Game.getObjectById(this.dest) as Depositable;
    if (creep == null) {
      throw Error("creep in a harvesting task is not there.");
    }
    if (source == null) {
      throw Error("source subject to a harvesting task is not there.");
    }
    const ttl = creep.ticksToLive;
    if (ttl == undefined) {
      throw Error("creep doesn't have ticks to live, I don't know what that means.");
    }

    // deposit if ttl not enough
    const path_source_dest = PathFinder.search(source.pos, dest.pos);
    const path_to_source_now = PathFinder.search(path_source_dest.path[-1], creep.pos);
    const DYING_DEPOSIT_RESERVE = 2;
    if (this.estimate() < ttl) {
      this.stage = Harvesting_Stage.DEPOSITING;
    }
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
      // deposit if full
      this.stage = Harvesting_Stage.DEPOSITING;
    }
    if (this.stage === Harvesting_Stage.DEPOSITING && creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
      this.stage = Harvesting_Stage.WAITING;
    }

    // perform actions
    if (this.stage === Harvesting_Stage.HARVESTING) {
      const result = creep.harvest(source);
      if (result == OK) {
      } else if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(source.pos);
      } else {
        console.log("creep " + String(creep.name) + " got a harvesting error " + result.toString());
      }
    } else if (this.stage === Harvesting_Stage.DEPOSITING) {
      const result = creep.transfer(dest, RESOURCE_ENERGY);
      if (result == OK) {
      } else if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(dest.pos);
      } else {
        console.log("creep " + String(creep.name) + " got a harvesting error " + result.toString());
      }
    } else if (this.stage === Harvesting_Stage.WAITING) {
      throw Error("Unreachable");
    }
  }
}
const creeps_harvesting: { [id: Id<Creep>]: Basic_Harvesting_Task } = {};
function tick(): void {
  // spawn the biggest harvesters you can.
  const creeps = Game.creeps;
  const POPULATION_CAP = 8;
  for (const spawn of values(Game.spawns)) {
    // console.log(spawn.toString());
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
    console.log("there are " + values(creeps).length.toString() + " creeps");
    if (values(creeps).length >= POPULATION_CAP) {
      break;
    }
    if (spawn.spawning) {
      continue;
    }
    spawn.spawnCreep(largest_produceable_worker, assemble_creep_name());
  }

  const idle_creeps: Creep[] = values(creeps).filter((creep) => creep.id in creep_blocking);

  // is for one-time use only
  class Creep_Bodypart_Restrictions {
    constructor(creep_body: Creep | BodyPartConstant[]) {
      if (creep_body instanceof Creep) {
        // eslint-disable-next-line no-param-reassign
        creep_body = creep_body.body.map((part) => part.type);
      }
      this.can_do_basic_harvesting = Creep_Bodypart_Restrictions.can_basic_harvest(creep_body);
      this.can_upgrade = Creep_Bodypart_Restrictions.can_upgrade(creep_body);
    }
    static can_basic_harvest(creep_body: Creep | BodyPartConstant[]): boolean {
      if (creep_body instanceof Creep) {
        return this.can_basic_harvest(creep_body.body.map((b) => b.type));
      }
      return WORK in creep_body && CARRY in creep_body && MOVE in creep_body;
    }
    static can_upgrade(creep_body: BodyPartConstant[]): boolean {
      return creep_body.some((p) => p == MOVE) && creep_body.some((p) => p == CARRY);
    }
    can_do_basic_harvesting: boolean;
    can_upgrade: boolean;
  }
  const FIXED_MAX_HARVESTERS = 8;
  const harvester_count = values(creeps).filter((creep) => creep.id in creeps_harvesting).length;
  for (const creep of idle_creeps) {
    const creep_availability = new Creep_Bodypart_Restrictions(creep);
    if (creep_availability.can_do_basic_harvesting && harvester_count < FIXED_MAX_HARVESTERS) {
      const sample_destination = Game.spawns["Spawn1"];
      const sample_source = sample_destination.room.find(FIND_SOURCES)[0];
      creeps_harvesting[creep.id] = new Basic_Harvesting_Task(creep, sample_source, sample_destination);
    }

    // upgrade
    if (creep_availability.can_upgrade) {
    }
  }
}

export { init, tick };
