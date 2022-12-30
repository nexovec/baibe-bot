import * as names_file from "./creepNames.json";
export function assert(thing: unknown): void {
  if (thing) {
  } else {
    throw Error("assert");
  }
}
export const values = Object.values;
export const entries = Object.entries;
export const keys = Object.keys;
export const assign = Object.assign;
export const log = console.log;
export const LAST_INIT_TIME = Game.time;

export const creep_names = values(names_file)[0];
if (creep_names == undefined) {
  throw Error();
}

export const Not_Implemented = () => panic("Not yet implemented");
export const Unreachable = () => panic("Unreachable");
export const Unexpected_Screeps_Return = (result: ScreepsReturnCode) =>
  Error("Unexpected intent result: " + result.toString());
export function byId<T extends _HasId>(id: Id<T> | undefined) {
  return id ? Game.getObjectById(id) ?? undefined : undefined;
}

// excludes the upper bound
export function rand_int(): number;
export function rand_int(end: number): number;
export function rand_int(start: number, end: number): number;
export function rand_int(start?: number, end?: number): number {
  if (end == undefined && start == undefined) {
    return rand_int(0, Number.MAX_SAFE_INTEGER);
  } else if (end == undefined) {
    return rand_int(0, start as number);
  } else if (start == undefined) {
    throw Error();
  }
  return Math.floor(Math.random() * end) + start;
}

export function assemble_creep_name(): string {
  const [first_names, last_names] = creep_names;
  const first_i = rand_int(first_names.length - 1);
  const second_i = rand_int(last_names.length - 1);
  const postfix = rand_int(99);
  return first_names[first_i] + " " + last_names[second_i] + postfix.toString();
}
export function panic(x?: string): never {
  throw Error(x);
}
