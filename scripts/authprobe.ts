import { authenticate } from "../src/lib/auth/accounts";
import { getUserByUsername } from "../src/lib/db/users";

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];
  const user = await getUserByUsername(username);
  console.log("record:", user ? { id: user.id, role: user.role, status: user.status, hashPrefix: user.passwordHash.slice(0, 7) } : null);
  console.log("outcome:", JSON.stringify(await authenticate(username, password)));
}

main();
