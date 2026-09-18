/**
 * Shareable keeper-list links: ?league=…&keepers=id1,id2,…
 *
 * One person (usually the commissioner) enters the previous season's keepers
 * and copies a link; anyone opening it gets the same effective keeper list,
 * regardless of what their own auto-detection or local edits said.
 */

const MAX_SHARED_KEEPERS = 400

export function encodeKeepers(keepers: Iterable<string>): string {
  return [...new Set(keepers)].join(',')
}

export function decodeKeepers(param: string): string[] {
  const ids = param
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '')
  return [...new Set(ids)].slice(0, MAX_SHARED_KEEPERS)
}

/**
 * Derives add/remove edits so that (auto ∪ add) − remove equals the shared
 * effective keeper set on the recipient's machine.
 */
export function editsFromEffective(
  effective: ReadonlySet<string>,
  autoDetected: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  return {
    add: [...effective].filter((id) => !autoDetected.has(id)),
    remove: [...autoDetected].filter((id) => !effective.has(id)),
  }
}
