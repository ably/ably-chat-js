/**
 * Represents any valid JSON value including primitives, objects, and arrays.
 */
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

/**
 * Represents a JSON object with string keys and JSON values.
 */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * Represents a JSON array containing JSON values.
 */
export type JsonArray = JsonValue[];
