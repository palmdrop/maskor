import { z } from "zod";

// Recursively makes all fields optional on a ZodObject schema, including nested objects.
// Note: the return type reflects only the top-level optionality; nested fields are also made
// optional at runtime but TypeScript's inference does not track the recursion depth.
export function deepPartial(schema: z.ZodObject<z.ZodRawShape>): z.ZodObject<z.ZodRawShape> {
  const newShape: Record<string, z.ZodTypeAny> = {};
  const shape = schema.shape as unknown as Record<string, z.ZodTypeAny>;
  for (const key of Object.keys(shape)) {
    const field = shape[key]!;
    if ("shape" in field && field.shape !== null && typeof field.shape === "object") {
      newShape[key] = deepPartial(field as z.ZodObject<z.ZodRawShape>).optional();
    } else {
      newShape[key] = field.optional();
    }
  }
  return z.object(newShape);
}

type SafeParseResult<O> =
  | { success: true; data: O }
  | { success: false; error: z.ZodError };

// Returns a parse helper that applies defaults before parsing with the given schema.
// Useful when reading partial data from disk that should fall back to known safe values.
export function withDefaults<T extends z.ZodObject<any>>(
  schema: T,
  defaults: Partial<z.input<T>>,
) {
  const merge = (input: unknown): object => {
    const base = typeof input === "object" && input !== null ? (input as object) : {};
    return { ...(defaults as object), ...base };
  };
  return {
    parse(input: unknown): z.output<T> {
      return schema.parse(merge(input));
    },
    safeParse(input: unknown): SafeParseResult<z.output<T>> {
      return schema.safeParse(merge(input)) as SafeParseResult<z.output<T>>;
    },
  };
}
