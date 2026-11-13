/**
 * Host permission port. The extension implementation wraps
 * chrome.permissions; tests inject an in-memory fake.
 *
 * `origin` is always a match pattern such as `https://example.org/*`.
 */
export interface HostPermissions {
  contains(originPattern: string): Promise<boolean>;
  /** Must be called synchronously from a user gesture handler. */
  request(originPattern: string): Promise<boolean>;
  remove(originPattern: string): Promise<boolean>;
  /** Optional origins currently granted to the extension. */
  listGranted(): Promise<string[]>;
}

export const chromeHostPermissions: HostPermissions = {
  contains: (o) => chrome.permissions.contains({ origins: [o] }),
  request: (o) => chrome.permissions.request({ origins: [o] }),
  remove: (o) => chrome.permissions.remove({ origins: [o] }),
  listGranted: async () => (await chrome.permissions.getAll()).origins ?? [],
};

/** In-memory implementation for tests and non-extension previews. */
export function memoryHostPermissions(
  initial: string[] = [],
  grantOnRequest = true,
): HostPermissions & { granted: Set<string> } {
  const granted = new Set(initial);
  return {
    granted,
    contains: async (o) => granted.has(o),
    request: async (o) => {
      if (grantOnRequest) granted.add(o);
      return granted.has(o);
    },
    remove: async (o) => granted.delete(o),
    listGranted: async () => [...granted],
  };
}

/** Revokes every optional host permission (used by "delete all data"). */
export async function revokeAllHostPermissions(p: HostPermissions): Promise<number> {
  const origins = await p.listGranted();
  let revoked = 0;
  for (const o of origins) if (await p.remove(o).catch(() => false)) revoked++;
  return revoked;
}
