/**
 * PATCH-296 Addendum 2. The viewer-location helpers moved out of MapCanvas so
 * its pin-bounds change grows it by no lines. They are only consulted when a
 * Map board has no pins to frame.
 */

export async function getBrowserCoords(): Promise<{ lng: number; lat: number } | null> {
  if (typeof window === 'undefined' || !navigator.geolocation) return null;
  return await new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), 3500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeout);
        resolve({ lng: position.coords.longitude, lat: position.coords.latitude });
      },
      () => {
        window.clearTimeout(timeout);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
    );
  });
}

export async function getIpCoords(): Promise<{ lng: number; lat: number } | null> {
  try {
    const ipResponse = await fetch('https://ipapi.co/json/');
    const ipJson = (await ipResponse.json()) as { longitude?: number; latitude?: number };
    if (typeof ipJson.longitude === 'number' && typeof ipJson.latitude === 'number') {
      return { lng: ipJson.longitude, lat: ipJson.latitude };
    }
  } catch {
    // ignore
  }
  return null;
}
