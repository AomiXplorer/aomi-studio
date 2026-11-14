/**
 * Password hashing for accounts created in the app.
 *
 * bcrypt (cost 12) is used for every managed user; the pre-existing owner record keeps
 * its scrypt hash, which `verifyPassword` still understands, so rotating the owner
 * password never breaks a live deployment. New secrets are always bcrypt.
 */
import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function bcryptHash(password: string): Promise<string> {
  return bcrypt.hash(password.normalize("NFKC"), ROUNDS);
}

export function bcryptVerify(password: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("$2")) return Promise.resolve(false);
  return bcrypt.compare(password.normalize("NFKC"), hash);
}

export function isBcryptHash(hash: string): boolean {
  return hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
}

/** Password policy used by every write path (web panel and Telegram). */
export function passwordProblem(password: string): string | null {
  if (typeof password !== "string" || password.length < 8) return "Password minimal 8 karakter.";
  if (password.length > 200) return "Password maksimal 200 karakter.";
  if (!/[A-Za-z]/.test(password)) return "Password harus memuat huruf.";
  if (!/[0-9]/.test(password) && !/[^A-Za-z0-9]/.test(password)) return "Password harus memuat angka atau simbol.";
  return null;
}

export function usernameProblem(username: string): string | null {
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username || "")) {
    return "Username 3-32 karakter: huruf, angka, titik, garis bawah atau strip.";
  }
  return null;
}
