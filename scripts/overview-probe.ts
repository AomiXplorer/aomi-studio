import { listUsers } from "../src/lib/db/users";
import { listApiKeys } from "../src/lib/db/apikeys";
import { listAudit } from "../src/lib/db/audit";
import { systemCounters } from "../src/lib/db/projects";
import { readSettings } from "../src/lib/db/settings";

async function main() {
  for (const [name, fn] of Object.entries({ listUsers, listApiKeys, listAudit, systemCounters, readSettings })) {
    try {
      const value = await (fn as (arg?: unknown) => Promise<unknown>)(40);
      console.log(name, "ok", JSON.stringify(value)?.slice(0, 120));
    } catch (error) {
      console.log(name, "FAILED", error instanceof Error ? error.message : error);
    }
  }
}
main();
