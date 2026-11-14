import { redisKeys, redis } from "../src/lib/db/redis";

async function main() {
  const keys = await redisKeys("aomi:*", 5000);
  console.log("count", keys.length);
  console.log(keys.slice(0, 12).join("\n"));
  const users = await redis<string[]>("SMEMBERS", "aomi:users");
  console.log("users set size", users?.length);
}
main();
