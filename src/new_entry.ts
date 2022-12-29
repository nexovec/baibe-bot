import { spawn } from "child_process";
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
log("WY U DU DIZ");

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
class Simulated_State {
  timestamp: Tick;
  sources_store: { [source: Id<Source>]: number };
  spawn_store: { [spawn: Id<StructureSpawn>]: number };
  creep_store: { [creep: Id<Creep>]: number };
  room: string;
  constructor(room: Room) {
    this.timestamp = Game.time;
    this.room = room.name;
    this.sources_store = {};
    room.find(FIND_SOURCES).forEach((source) => (this.sources_store[source.id] = source.energy));
    this.creep_store = {};
    room.find(FIND_MY_CREEPS).forEach((creep) => (this.creep_store[creep.id] = creep.store.energy));
    this.spawn_store = {};
    room.find(FIND_MY_SPAWNS).forEach((spawn) => (this.spawn_store[spawn.id] = spawn.store.energy));
  }
  verify(): boolean {
    let result = true;
    assert(this.timestamp === Game.time);
    const room = Game.rooms[this.room] ?? panic();
    const sources = room.find(FIND_SOURCES);
    result = result && sources.length == values(this.sources_store).length;
    result = result && _.all(sources.map((source) => this.sources_store[source.id] == source.energy));
    const spawns = room.find(FIND_MY_SPAWNS);
    result = result && spawns.length == values(this.spawn_store).length;
    result = result && _.all(spawns.map((spawn) => spawn.store.energy == this.spawn_store[spawn.id]));
    const creeps = room.find(FIND_CREEPS);
    result = result && creeps.length == values(this.creep_store).length;
    result = result && _.all(creeps.map((creep) => creep.store.energy == this.creep_store[creep.id]));
    return result;
  }
  copy(): Simulated_State {
    return { ...this };
  }
  apply_tick() {
    this.timestamp += 1;
    for (const key in this.sources_store) {
      const id = key as Id<Source>;
      // TODO: regenerate sources
    }
    for (const key in this.spawn_store) {
      const id = key as Id<StructureSpawn>;
      const n = this.spawn_store[id];
      if (n < 300) {
        this.spawn_store[id] = n + 1;
      }
    }
  }
}
type Intent = () => void;
type Scheduled_Intents = { [time: Tick]: Array<Intent> };
const scheduled_intents: Scheduled_Intents = {};
function init(): void {
  console.log("-----INITIALIZING-----");
  const room_state = new Simulated_State(Game.spawns.Spawn1.room);
  assert(room_state.verify());
  // only relies on auto-regen of the spawn
  function spawn_creep_asap() {
    const demanded_energy = 300;
    const state = room_state.copy();
    while (true) {
      const [highest_id, highest] = entries(state.spawn_store).reduce(
        ([highest_id, highest_amount], [id, amount], i, arr): [string, number] => {
          if (amount > highest_amount) {
            return [id, amount];
          }
          return [highest_id, highest_amount];
        },
        ["", -Infinity]
      );
      assert(highest != -Infinity); // that would probably mean there are no spawns in this room
      const bodypart_list = [WORK, CARRY, MOVE, CARRY, MOVE];
      if (highest >= demanded_energy) {
        scheduled_intents[state.timestamp] = scheduled_intents[state.timestamp] ?? [];
        scheduled_intents[state.timestamp].push(() =>
          (Game.getObjectById(highest_id as Id<StructureSpawn>) as StructureSpawn).spawnCreep(
            bodypart_list,
            assemble_creep_name()
          )
        );
        return;
      }
      state.apply_tick();
    }
  }
  // my aim is to produce 7 harvesters and put them to work
  // this should predict when the last one gets produced
  spawn_creep_asap();
  spawn_creep_asap();
}
function tick() {
  //   console.log("wtf");
  const intents_to_run = scheduled_intents[Game.time] ?? [];
  values(intents_to_run).forEach((i) => i());
}
export { init, tick };
