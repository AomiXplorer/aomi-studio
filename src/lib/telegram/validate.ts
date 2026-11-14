/** Input checks shared by the bot flows and the web panel. */
import { bcryptHash, passwordProblem, usernameProblem } from "@/lib/auth/bcrypt";

export { passwordProblem, usernameProblem };

/** Hashes a password typed into a chat before the flow state keeps anything. */
export function hashPasswordForFlow(password: string): Promise<string> {
  return bcryptHash(password);
}
