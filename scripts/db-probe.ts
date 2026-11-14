/**
 * Direct module probe used by the upgrade test suite.
 *
 * It exercises the persistence module itself (not through HTTP), which is the only way to
 * prove that the writer and the reader agree before a chat turn ever runs.
 */
import { mirrorMessage, getMessages, registerProject, deleteProject, systemCounters } from "../src/lib/db/projects";
import { createBackup, restoreBackup } from "../src/lib/db/backup";

const [, , command, ...args] = process.argv;

async function main() {
  if (command === "mirror") {
    const [projectId, ownerId] = args;
    await registerProject({ id: projectId, ownerId, name: "probe project" });
    await mirrorMessage(projectId, ownerId, { id: `${projectId}-u1`, role: "user", content: "halo dari probe" });
    const first = await mirrorMessage(projectId, ownerId, { id: `${projectId}-a1`, role: "assistant", content: "balasan pertama" });
    // A continuation slice extends the same answer: the id is identical on purpose.
    await mirrorMessage(projectId, ownerId, { id: `${projectId}-a1`, role: "assistant", content: "balasan pertama, disambung" });
    const messages = await getMessages(projectId, 10);
    console.log(JSON.stringify({ first, count: messages.length, messages }, null, 2));
    return;
  }
  if (command === "read") {
    const [projectId] = args;
    const messages = await getMessages(projectId, 10);
    console.log(JSON.stringify({ count: messages.length, messages }, null, 2));
    return;
  }
  if (command === "cleanup") {
    const [projectId, ownerId] = args;
    await deleteProject(projectId, ownerId);
    console.log(JSON.stringify({ ok: true }));
    return;
  }
  if (command === "counters") {
    console.log(JSON.stringify(await systemCounters()));
    return;
  }
  if (command === "backup") {
    console.log(JSON.stringify(await createBackup("probe")));
    return;
  }
  if (command === "restore-dry") {
    const [path] = args;
    const dry = await restoreBackup(path, true);
    console.log(JSON.stringify(dry));
    return;
  }
  console.error("unknown command");
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
