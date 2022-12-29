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

function find_danger() {
  found_creep_ids = [];
  for (const creep of values(Game.creeps)) {
    const foreign_creeps = creep.room.find(FIND_CREEPS).filter((creep) => !creep.my);
    found_creep_ids.push(...foreign_creeps);
  }
}

type Blockable<T> = {
  identity: T;
  blocked_by: Blockable<T> | null;
};
enum CONDITION_TYPE {
  SPAWN_HARVESTER = 0,
  SPAWN_HAS_ENERGY
}
type Tick = number;
type Task = {
  type: CONDITION_TYPE;
};

// these are like a cursor pointing before the last blocked tick:
let energy_blocked_until = Game.time; // exclusive of the upper bound

const spawn_energy_changes: { [tick: Tick]: number } = {}; // changes BEFORE tick
const STARTING_ENERGY = 300;
spawn_energy_changes[Game.time] = STARTING_ENERGY;
const SAMPLE_REQUIRED_ENERGY_AMOUNT = 300;
let root_blocked_task: Blockable<Task> | null = null;
function append_cond_spawn_has_energy(): Blockable<Task> {
  const task = { identity: { type: CONDITION_TYPE.SPAWN_HAS_ENERGY }, blocked_by: root_blocked_task };
  const estimate = naive_task_estimate(task, energy_blocked_until) ?? panic();
  const unblocked_at = energy_blocked_until;
  energy_blocked_until = unblocked_at + estimate;
  // auto-regen
  for (let i = unblocked_at; i < energy_blocked_until; i++) {
    spawn_energy_changes[i] += 1;
  }
  log(
    "this much energy after a spawn has energy condition: " +
      get_spawn_energy_stored_at_time(energy_blocked_until).toString()
  );
  return task;
}
const SAMPLE_CREEP_COST = 300;
function append_cond_produce_harvester(name: string) {
  const dependency = append_cond_spawn_has_energy();
  const task = { identity: { type: CONDITION_TYPE.SPAWN_HARVESTER }, blocked_by: dependency };
  root_blocked_task = task;
  energy_blocked_until = energy_blocked_until + CREEP_SPAWN_TIME;
  spawn_energy_changes[energy_blocked_until] -= SAMPLE_CREEP_COST;
  return task;
}
function get_spawn_energy_stored_at_time(tick: Tick): number {
  const relevant = entries(spawn_energy_changes).filter(([val, key]) => key > Game.time && key < tick);
  const [vals, keys] = _.unzip(relevant);
  const sum = _.sum(vals);
  return sum;
}
const MAX_REGEN_THRESHOLD = 300;
const SAMPLE_SPAWN_NAME = "Spawn1";

// returns the delta, NOT the tick
function naive_task_estimate(task: Blockable<Task>, start: Tick): number | null {
  switch (task.identity.type) {
    case CONDITION_TYPE.SPAWN_HAS_ENERGY:
      // only assumes self-regeneration for now
      const amount_after_unblock = get_spawn_energy_stored_at_time(start);
      const spawn = Game.spawns[SAMPLE_SPAWN_NAME];
      // assumes store cap not changing
      const upper_bound = Math.max(MAX_REGEN_THRESHOLD, spawn.store.getCapacity(RESOURCE_ENERGY));
      const recoverable_amount = upper_bound - amount_after_unblock;
      return recoverable_amount;
    case CONDITION_TYPE.SPAWN_HARVESTER:
      return CREEP_SPAWN_TIME;
    default:
      panic();
      return null;
  }
}
function predict_done(task: Blockable<Task>): Tick {
  if (!task.blocked_by) {
    const this_estimate = naive_task_estimate(task, Game.time) ?? panic();
    return this_estimate;
  }
  const blocked_until = predict_done(task.blocked_by);
  const this_estimate = naive_task_estimate(task, blocked_until) ?? panic();
  return blocked_until + this_estimate;
}
function init(): void {
  console.log("-----INITIALIZING-----");

  // my aim is to produce 7 harvesters and put them to work
  // this should predict when the last one gets produced
  for (const i of _.range(7)) {
    append_cond_produce_harvester(assemble_creep_name());
  }
  const prediction = predict_done(root_blocked_task ?? panic());
  log(prediction);
}
function tick() {}
export { init, tick };
