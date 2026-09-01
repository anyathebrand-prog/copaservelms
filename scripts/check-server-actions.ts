/**
 * Guard: a "use server" file may only export async functions.
 *
 * Exporting anything else from one is legal TypeScript, passes lint, and
 * compiles. It fails at request time, when Next tries to turn each export into
 * a callable server reference and finds a string:
 *
 *   A "use server" file can only export async functions, found string.
 *
 * That is worth a dedicated check because of where it surfaces. The module is
 * only loaded when an action is invoked, so the page still renders and only
 * the submission breaks — a GET returns 200 while every POST returns 500. It
 * shipped to production exactly that way, and the first thing to notice was a
 * person clicking a button.
 *
 *   npx tsx scripts/check-server-actions.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const problems: string[] = [];
let checked = 0;

function walk(dir: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "generated" || entry.startsWith(".")) continue;

    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }

  return out;
}

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");

    // Only whole-file directives count. An inline "use server" inside a
    // function body marks that function alone and does not constrain the
    // module's other exports.
    const head = source.slice(0, 200);
    if (!/^\s*(["'])use server\1/m.test(head)) continue;

    checked += 1;

    for (const [index, line] of source.split("\n").entries()) {
      const at = `${file}:${index + 1}`;

      // export const X = ... , export let, export var — never a server action.
      const declaration = line.match(/^export\s+(const|let|var)\s+(\w+)/);
      if (declaration) {
        // An arrow function assigned to a const is still a function, and is
        // allowed as long as it is async.
        if (!/=\s*async\s*(\(|function)/.test(line)) {
          problems.push(`${at}  export ${declaration[1]} ${declaration[2]} — not an async function`);
        }
        continue;
      }

      // export { X } / export { X, Y } — re-exports, which is how this bit us.
      const named = line.match(/^export\s*\{([^}]*)\}/);
      if (named) {
        problems.push(`${at}  export { ${named[1]!.trim()} } — re-exports are not server actions`);
        continue;
      }

      // export function without async.
      const fn = line.match(/^export\s+function\s+(\w+)/);
      if (fn) problems.push(`${at}  export function ${fn[1]} — must be async`);

      // export default of anything but an async function.
      if (/^export\s+default\s+/.test(line) && !/^export\s+default\s+async\s+function/.test(line)) {
        problems.push(`${at}  export default — must be an async function`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`Found ${problems.length} illegal export(s) in "use server" files:\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nMove the value into a plain module and import it from there.');
  process.exit(1);
}

console.log(`${checked} "use server" files checked, all exports are async functions`);
