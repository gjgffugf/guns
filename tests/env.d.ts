/**
 * 最小化声明：不依赖 @types/node（沙盒里装包很慢）。
 * 只声明测试实际用到的部分。
 */
declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function test(fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
}
declare module 'node:assert' {
  export function ok(v: unknown, msg?: string): void;
  export function equal(a: unknown, b: unknown, msg?: string): void;
  export function strictEqual(a: unknown, b: unknown, msg?: string): void;
  export function deepStrictEqual(a: unknown, b: unknown, msg?: string): void;
  export function deepEqual(a: unknown, b: unknown, msg?: string): void;
  export function throws(fn: () => unknown, msg?: string): void;
  export function fail(msg?: string): never;
  export const strict: {
    equal(a: unknown, b: unknown, msg?: string): void;
    ok(v: unknown, msg?: string): void;
  };
}
