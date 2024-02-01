export function addToArrayWithLimit<T>(array: T[], element: T, limit: number): T[] {
  if (array.length > limit - 1) {
    return [...array.slice(1), element];
  } else {
    return [...array, element];
  }
}
