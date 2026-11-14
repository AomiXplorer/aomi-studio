import { createBackup, restoreBackup, listBackupFiles } from "../src/lib/db/backup";
import { redisKeys } from "../src/lib/db/redis";

async function main() {
  console.log("keys visible before backup:", (await redisKeys("aomi:*", 5000)).length);
  const created = await createBackup("probe");
  console.log("backup:", JSON.stringify(created).slice(0, 200));
  if (!created.meta) return;
  const dry = await restoreBackup(created.meta.path, true);
  console.log("restore keys:", dry.keys?.length, dry.keys?.slice(0, 20));
  console.log("files:", (await listBackupFiles()).length);
}
main();
