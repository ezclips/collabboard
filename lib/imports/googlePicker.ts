// PATCH-214. Google Picker helpers.
//
// The Picker needs the Google Cloud project NUMBER as its `appId`, not the
// OAuth client id. The project number is the leading run of digits of the Drive
// client id (`123456789012-abc.apps.googleusercontent.com` -> `123456789012`).

/**
 * The Google Cloud project number embedded in an OAuth client id, or `null`
 * when it cannot be read.
 *
 * Some client ids are not project-prefixed (they are all-letters), and a
 * missing/empty id is a configuration gap, not a value to guess at -- so this
 * returns `null` for anything whose leading segment is not entirely digits.
 */
export function googleAppIdFromClientId(clientId: string | null | undefined): string | null {
  if (typeof clientId !== 'string' || clientId.length === 0) return null;
  const leading = clientId.split('-')[0];
  if (!/^\d+$/.test(leading)) return null;
  return leading;
}
