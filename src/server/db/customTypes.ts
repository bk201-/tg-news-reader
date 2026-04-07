import { customType } from 'drizzle-orm/sqlite-core';

/**
 * SQLite TEXT column that auto-serializes/deserializes a JSON string array.
 * Stored as TEXT ('["a","b"]'), returned as string[].
 */
export const jsonStringArray = customType<{ data: string[]; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value: string[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): string[] {
    return typeof value === 'string' ? (JSON.parse(value) as string[]) : (value as unknown as string[]);
  },
});

/**
 * SQLite TEXT column that auto-serializes/deserializes a JSON number array.
 * Stored as TEXT ('[1,2,3]'), returned as number[].
 */
export const jsonNumberArray = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    return typeof value === 'string' ? (JSON.parse(value) as number[]) : (value as unknown as number[]);
  },
});
