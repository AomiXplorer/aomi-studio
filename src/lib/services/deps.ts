export interface ResolvedDependency {
  name: string;
  requested: string;
  version: string | null;
  exists: boolean;
  description: string | null;
}

const NAME_PATTERN = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

/**
 * Validates dependency names against the public npm registry and resolves the
 * latest published version. Binaries are not installed on the server (serverless
 * functions have no persistent node_modules); resolution happens on the build
 * host that unpacks the exported ZIP.
 */
export async function resolveDependencies(names: string[]): Promise<ResolvedDependency[]> {
  const unique = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean))).slice(0, 25);
  return Promise.all(
    unique.map(async (name) => {
      if (!NAME_PATTERN.test(name)) {
        return { name, requested: "latest", version: null, exists: false, description: "Nama paket tidak valid." };
      }
      try {
        const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, {
          headers: { Accept: "application/vnd.npm.install-v1+json" },
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        });
        if (!res.ok) {
          return { name, requested: "latest", version: null, exists: false, description: res.status === 404 ? "Paket tidak ada di npm." : `Registry ${res.status}` };
        }
        const body = (await res.json()) as { "dist-tags"?: { latest?: string }; description?: string };
        return {
          name,
          requested: "latest",
          version: body["dist-tags"]?.latest ?? null,
          exists: Boolean(body["dist-tags"]?.latest),
          description: body.description?.slice(0, 140) ?? null,
        };
      } catch (error) {
        return { name, requested: "latest", version: null, exists: false, description: (error as Error).message.slice(0, 120) };
      }
    }),
  );
}
