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
  copy(): Simulated_State {
    const state = _.cloneDeep(this);
    Object.setPrototypeOf(state, Object.getPrototypeOf(this));
    return state;
  }
  get_most_energetic_spawn(): Id<StructureSpawn> {
    let most_energetic_spawn_id: Id<StructureSpawn> | null = null;
    for (const key in this.spawn_store) {
      const id = key as Id<StructureSpawn>;
      if (!most_energetic_spawn_id || this.spawn_store[id] > this.spawn_store[most_energetic_spawn_id]) {
        most_energetic_spawn_id = id;
      }
    }
    // failing means there is no spawn
    return most_energetic_spawn_id ?? panic();
  }
  // passes live simulated room state to fn until it returns true
  until(fn: (room_state: Simulated_State) => boolean): Simulated_State {
    const rolling_state = this.copy();
    while (true) {
      if (fn(rolling_state)) return rolling_state;
      rolling_state.apply_tick();
    }
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
type Intent_Result = ScreepsReturnCode;
function push_intent(intent: () => Intent_Result, when: Tick) {
  scheduled_intents[when] = scheduled_intents[when] ?? [];
  scheduled_intents[when].push(intent);
}
function init(): void {
  console.log("-----INITIALIZING-----");
  const room_state = new Simulated_State(Game.spawns.Spawn1.room);
  assert(room_state.verify());
  // only relies on auto-regen of the spawn
  function spawn_creep_asap(state: Simulated_State): boolean {
    const DEMANDED_ENERGY = 300;
    const intent_fn = () =>
      (Game.getObjectById(most_energetic_spawn_id ?? panic()) as StructureSpawn).spawnCreep(
        bodypart_list,
        assemble_creep_name()
      );
    const most_energetic_spawn_id = state.get_most_energetic_spawn();
    const bodypart_list = [WORK, CARRY, MOVE, CARRY, MOVE];
    if (state.spawn_store[most_energetic_spawn_id ?? panic()] >= DEMANDED_ENERGY) {
      push_intent(intent_fn, state.timestamp);
      return true;
    }
    return false;
  }
  function send_spawning_creeps_to_harvest(state: Simulated_State) {
    return true;
  }
  // my aim is to produce 7 harvesters and put them to work
  // this should predict when the last one gets produced
  const state_after_spawn = room_state.until(spawn_creep_asap);
  const state_after_starting_harvest = state_after_spawn.until(send_spawning_creeps_to_harvest);
  const state_after_spawn_2 = spawn_creep_asap(state_after_starting_harvest);
}
function tick() {
  const intents_to_run = scheduled_intents[Game.time] ?? [];
  values(intents_to_run).forEach((i) => i());
}
export { init, tick };
