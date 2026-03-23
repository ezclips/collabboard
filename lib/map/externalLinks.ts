export function getGoogleMapsUrl(lng: number, lat: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function getOpenStreetMapUrl(lng: number, lat: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
