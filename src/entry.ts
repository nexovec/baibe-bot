import * as _ from "lodash";
import { range } from "lodash";
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
type Depositable = StructureContainer | StructureSpawn | StructureExtension | StructureController;
type Depositable_ID = Id<Depositable>;
const creep_blocking: { [id: Id<Creep>]: Creep_Block } = {};

enum Harvesting_Stage {
  APPROACHING = "approaching",
  HARVESTING = "harvesting",
  WAITING = "waiting",
  DEPOSITING = "depositing"
}
class Basic_Harvesting_Task {
  source: Id<Source>;
  dest: Depositable_ID;
  subject: Id<Creep>;
  block: Creep_Block;
  stage: Harvesting_Stage;
  amount: number;

  constructor(subject: Creep, source: Source, dest: Depositable) {
    this.source = source.id;
    this.dest = dest.id;
    this.subject = subject.id;
    this.stage = Harvesting_Stage.HARVESTING;
    console.log("Creep" + String(byId(this.subject)?.name) + "is now a harvester");
    if (this.subject in creep_blocking) {
      throw Error("Creep" + String(byId(this.subject)?.name) + " is already blocked.");
    }
    this.amount = subject.body.filter((p) => p.type == CARRY).length * CARRY_CAPACITY;
    const est = this.estimate();
    this.block = new Creep_Block(est);
    creep_blocking[this.subject] = this.block;
  }
  estimate_stage_duration(stage: Harvesting_Stage): number {
    const creep = (byId(this.subject) as Creep) ?? panic();
    const source = (byId(this.source) as Source) ?? panic();
    const dest = (byId(this.dest) as Depositable) ?? panic();
    switch (stage) {
      case Harvesting_Stage.APPROACHING:
        const path_from_dest = PathFinder.search(source.pos, dest.pos);
        const parking_spot = path_from_dest.path[0] ?? panic();
        return PathFinder.search(creep.pos, parking_spot).cost;
      case Harvesting_Stage.HARVESTING:
        const capacity = creep.body.map((t) => t.type).filter((t) => t == CARRY).length * CARRY_CAPACITY;
        const speed = creep.body.map((t) => t.type).filter((t) => t == WORK).length * HARVEST_POWER;
        return Math.ceil(capacity / speed);
      case Harvesting_Stage.DEPOSITING:
        const travel_cost = PathFinder.search(dest.pos, source.pos).cost;
        return travel_cost;
      case Harvesting_Stage.WAITING:
        return 0;
      default:
        Error("Unreachable");
    }
    return -1;
  }
  estimate_stage_end(stage: Harvesting_Stage): number {
    let total = 0;
    switch (this.stage) {
      case Harvesting_Stage.APPROACHING:
        total += this.estimate_stage_duration(Harvesting_Stage.APPROACHING);
      case Harvesting_Stage.HARVESTING:
        total += this.estimate_stage_duration(Harvesting_Stage.HARVESTING);
      case Harvesting_Stage.DEPOSITING:
        total += this.estimate_stage_duration(Harvesting_Stage.DEPOSITING);
      case Harvesting_Stage.WAITING:
        // console.log("You shouldn't wait, really");
        break;
      default:
        Unreachable();
    }
    return total;
  }
  // returns expected number of ticks to finish the job
  estimate(): number {
    return 0;
  }
  estimate_old(): number {
    if (this.stage !== Harvesting_Stage.HARVESTING) {
      Not_Implemented();
    }
    const creep = (byId(this.subject) as Creep) ?? panic();
    const source = (byId(this.source) as Source) ?? panic();
    const dest = (byId(this.dest) as Depositable) ?? panic();
    const ttl =
      (creep.ticksToLive as number) ?? panic("creep doesn't have ticks to live, that means it has despawned.");
    const path_source_parking = PathFinder.search(source.pos, dest.pos);

    {
      const l = path_source_parking.path.length;
      (path_source_parking.path[l] ?? undefined) == undefined ? OK : panic("path from a to b contains both a and b");
      path_source_parking.path[0].x === source.pos.x && path_source_parking.path[0].y === source.pos.y
        ? OK
        : panic("path from a to b contains a");
      path_source_parking.path[l - 1].x === source.pos.x && path_source_parking.path[l - 1].y === source.pos.y
        ? OK
        : panic("path from a to b contains b");
    }

    const source_post = path_source_parking.path[0] ?? Error(path_source_parking.path.length.toString());
    const path_to_source_now = PathFinder.search(source_post, creep.pos);
    const DYING_DEPOSIT_RESERVE = 2;
    if (ttl <= path_to_source_now.cost + path_source_parking.cost + DYING_DEPOSIT_RESERVE) {
      return 0;
    }
    this.stage = Harvesting_Stage.WAITING;
    log("Creep" + String(byId(this.subject)?.name) + "is now a DEPOSITING harvester");
    const HARVEST_SPEED_PER_WORK_PART = 20;
    const num_of_work_parts = creep.body.filter((p) => p.type == WORK).length;
    const num_of_carry_parts = creep.body.filter((p) => p.type == CARRY).length;
    const num_of_move_parts = creep.body.filter((p) => p.type == MOVE).length;
    // TODO: compute slowdown to fatigue

    const ticks_to_fill_up = HARVEST_SPEED_PER_WORK_PART * num_of_work_parts;
    const ideal_cycle_time =
      path_to_source_now.cost + // don't add this if you're already at the source or depositing
      Math.ceil(creep.store.getFreeCapacity() / ticks_to_fill_up) +
      path_source_parking.cost +
      DYING_DEPOSIT_RESERVE;
    return Math.min(ttl, ideal_cycle_time);
  }
  work() {
    const creep = (byId(this.subject) as Creep) ?? undefined;
    if (creep === undefined) {
      throw Error("Can't find creep subject to task, you will have to abort the task.");
    }
    const source = (byId(this.source) as Source) ?? panic();
    const dest = (byId(this.dest) as Depositable) ?? panic();
    const ttl = (creep.ticksToLive as number) ?? panic();
    {
      ttl > 1 ? OK : Error();
    }

    // TODO: handle ttl
    // deposit if source empty
    if (source.energy == 0) {
      log("Creep" + String(byId(this.subject)?.name) + "is now a DEPOSITING harvester");
      this.stage = Harvesting_Stage.DEPOSITING;
    }
    // deposit if full
    creep.store ?? Error();
    if (this.stage != Harvesting_Stage.DEPOSITING && creep.store.getFreeCapacity(RESOURCE_ENERGY) == 0) {
      log("Creep" + String(byId(this.subject)?.name) + "is now a DEPOSITING harvester");
      this.stage = Harvesting_Stage.DEPOSITING;
    }
    // wait after depositing
    if (this.stage === Harvesting_Stage.DEPOSITING && creep.store.getUsedCapacity(RESOURCE_ENERGY) == 0) {
      log("Creep" + String(byId(this.subject)?.name) + "is now a WAITING harvester");
      this.stage = Harvesting_Stage.WAITING;
    }

    // perform actions
    if (this.stage === Harvesting_Stage.HARVESTING) {
      const result = creep.harvest(source);
      if (result == OK) {
      } else if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(source.pos);
      } else {
        Unexpected_Screeps_Return(result);
      }
    } else if (this.stage === Harvesting_Stage.DEPOSITING) {
      let result = creep.transfer(dest, RESOURCE_ENERGY);
      if (result == ERR_INVALID_TARGET) {
        result = creep.upgradeController(dest as StructureController);
      }
      if (result == OK) {
        this.stage = Harvesting_Stage.HARVESTING; // TODO: replace
      } else if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(dest.pos);
      } else if (result == ERR_FULL) {
        log("you should redirect creep to another storage");
        this.stage = Harvesting_Stage.WAITING;
      } else {
        console.log("creep " + String(creep.name) + " got a harvesting error " + result.toString());
      }
    } else {
      Unreachable();
    }
    if (this.stage === Harvesting_Stage.WAITING) {
      log("disengaging creep now");
      delete creeps_harvesting[this.subject];
    }
  }
}
const MAXIMUM_STORED_FOR_BONUS = 300;
const BONUS_AMOUNT = 1;
class Spawn_Energy_Amount_Predictor {
  spawn: Id<StructureSpawn>;
  capacity = 300;
  predicted_income: { [time: number]: number } = {};
  actual_income: { [time: number]: number } = {};
  predicted_spending: { [time: number]: number } = {};
  actual_spending: { [time: number]: number } = {};
  constructor(spawn: StructureSpawn) {
    this.spawn = spawn.id;
  }
  // returns the tick when balance is above amount BEFORE the tick
  predict_above(amount: number, after?: number): number | null {
    const MAXIMUM_LOOKAHEAD = 1000;
    let start = Game.time;
    if (after) {
      console.log("this is happening");
      start = after + 1;
    }
    for (let i = start + 1; i < start + MAXIMUM_LOOKAHEAD; i++) {
      if (this.prediction_before(i) >= amount) {
        return i - 1;
      }
    }
    return null;
  }
  // ticks are the actual tick you're asking for, not a delta from this tick.
  prediction_before(tick: number) {
    const income_amount = 0;
    const spending_amount = 0;
    let balance = (byId(this.spawn) ?? panic()).store.energy;
    for (let i = Game.time; i < tick; i++) {
      const income_at_i = _.sum(
        entries(this.predicted_income)
          .filter(([val, key]) => key == i)
          .map(([val, key]) => val)
      );
      const spending_at_i = _.sum(
        entries(this.predicted_spending)
          .filter(([val, key]) => key == i)
          .map(([val, key]) => val)
      );
      // ordering of these is unclear, so I assume you get bonus the last
      balance -= spending_at_i;
      balance += income_at_i;
      if (balance < MAXIMUM_STORED_FOR_BONUS) {
        balance += BONUS_AMOUNT;
      }
      if (balance > this.capacity) {
        balance = this.capacity;
      }
    }
    return balance;
  }
  payment_incoming(tick: number, amount: number) {
    this.predicted_income[tick] += amount;
  }
  payment_outgoing(tick: number, amount: number) {
    this.predicted_spending[tick] += amount;
  }
}
const creeps_harvesting: { [id: Id<Creep>]: Basic_Harvesting_Task } = {};
const spawn_predictors: { [id: Id<StructureSpawn>]: Spawn_Energy_Amount_Predictor } = {};

const first_spawn = Game.spawns.Spawn1;
spawn_predictors[first_spawn.id] = new Spawn_Energy_Amount_Predictor(first_spawn);

function tick(): void {
  // spawn the biggest harvesters you can.
  const creeps = Game.creeps;
  const POPULATION_CAP = 7;
  function compute_body_cost(parts: BodyPartConstant[]): number {
    return parts.reduce((cumulant: number, part: BodyPartConstant) => cumulant + BODYPART_COST[part], 0);
  }
  function largest_available_harvester_body(spawn: StructureSpawn) {
    const universal_worker_parts: BodyPartConstant[] = [WORK, CARRY, CARRY, MOVE, MOVE];
    const count = Math.floor(
      (spawn.store.getFreeCapacity(RESOURCE_ENERGY) + spawn.store.getUsedCapacity(RESOURCE_ENERGY)) /
        compute_body_cost(universal_worker_parts)
    );
    const largest_produceable_worker: BodyPartConstant[] = _.flatten(
      _.times(count, _.constant(universal_worker_parts))
    );
    return largest_produceable_worker;
  }
  const spawn = Game.spawns.Spawn1 ?? panic();
  // assert(first_spawn.id === spawn.id);
  const spawn_predictor = spawn_predictors[spawn.id];
  const desired = largest_available_harvester_body(spawn);
  const cost = compute_body_cost(desired);
  const available_at = spawn_predictor.predict_above(cost);
  if (available_at === null) {
    panic("You can never make it, too bad");
  } else if (available_at <= Game.time && !spawn.spawning && values(creeps).length < POPULATION_CAP) {
    console.log("spawning in");
    spawn.spawnCreep(desired, assemble_creep_name());
  } else {
    // log("Creep should spawn in " + (available_at - Game.time).toString() + " ticks");
  }

  const idle_creeps: Creep[] = values(creeps).filter((creep) => !(creep.id in creep_blocking) && !creep.spawning);

  // is for one-time use only
  class Creep_Bodypart_Restrictions {
    constructor(creep: Creep) {
      this.can_do_basic_harvesting = Creep_Bodypart_Restrictions.can_basic_harvest(creep);
      this.can_upgrade = Creep_Bodypart_Restrictions.can_upgrade(creep);
    }
    static can_basic_harvest(creep: Creep): boolean {
      const creep_body = creep.body.map((b) => b.type);
      return (
        creep_body.some((val) => val == WORK) &&
        creep_body.some((val) => val == CARRY) &&
        creep_body.some((val) => val == MOVE)
      );
    }
    static can_upgrade(creep: Creep): boolean {
      const creep_body = creep.body.map((b) => b.type);
      return creep_body.some((p) => p == MOVE) && creep_body.some((p) => p == CARRY);
    }
    can_do_basic_harvesting: boolean;
    can_upgrade: boolean;
  }
  const FIXED_MAX_HARVESTERS = 7;
  const harvester_count = values(creeps).filter((creep) => creep.id in creeps_harvesting).length;
  for (const creep of idle_creeps) {
    console.log("Creep " + creep.name + " is idle");
    const creep_availability = new Creep_Bodypart_Restrictions(creep);
    if (creep_availability.can_do_basic_harvesting && harvester_count < FIXED_MAX_HARVESTERS) {
      const sample_destination = Game.spawns["Spawn1"] ?? panic();
      const sample_source = sample_destination.room.find(FIND_SOURCES)[0] ?? panic();
      let task = new Basic_Harvesting_Task(creep, sample_source, sample_destination);

      const predicted_arrival = task.estimate_stage_end(Harvesting_Stage.DEPOSITING);
      const predictor = spawn_predictors[task.dest as Id<StructureSpawn>] ?? panic();
      const prediction_on_arrival = predictor.prediction_before(predicted_arrival);
      if (prediction_on_arrival === spawn.store.getCapacity(RESOURCE_ENERGY)) {
        const controller = spawn.room.controller ?? panic();
        delete creep_blocking[creep.id];
        task = new Basic_Harvesting_Task(creep, sample_source, controller);
      } else {
        predictor.payment_incoming(predicted_arrival, task.amount);
      }
      creeps_harvesting[creep.id] = task;
    }
  }
  values(creeps_harvesting).forEach((task) => {
    // this function body is for aborting harvesting of incapacitated creeps

    // creep is dead
    if ((byId(task.subject) ?? undefined) == undefined) {
      console.log("aborting task for " + task.subject);
      delete creeps_harvesting[task.subject];
    }
    task.work();
  });
}

export { init, tick };
