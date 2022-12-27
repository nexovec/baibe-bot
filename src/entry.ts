import * as ld from "lodash";
import * as names_file from "./creepNames.json";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const o = Object;
const creep_names = o.values(names_file)[0];
console.log(creep_names);
let found_creep_ids: Array<Creep>;

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
  return Math.round(Math.random() * (end + 1) - 1 / 2) + end;
}

function assemble_creep_name(): string {
  const [first_names, last_names] = creep_names;
  const first_i = rand_int(first_names.length);
  const second_i = rand_int(last_names.length);
  const postfix = rand_int(99);
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
    spawn.spawnCreep([WORK, CARRY, MOVE], assemble_creep_name());
  }
}

export { init, tick };
