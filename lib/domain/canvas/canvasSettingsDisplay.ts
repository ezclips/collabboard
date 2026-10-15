/**
 * PATCH-376. The Canvas settings window's display vocabulary: what to CALL a
 * board's icon and its wallpaper.
 *
 * Pure and separate, so the window only lays these out and the naming can be
 * checked on its own. Both exist because the window used to print the stored
 * value verbatim -- a `lucide:layout` board read "lucide:layout".
 */

/**
 * A readable name for a board icon. `lucide:book-open` reads "Book open", a URL
 * "Image", an emoji "Emoji"; null only when there is no icon at all, which is
 * the caller's cue to invite a choice instead.
 */
export function iconDisplayName(icon: string): string | null {
  if (icon.startsWith('lucide:')) {
    const name = icon.slice('lucide:'.length).replace(/-/g, ' ').trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Icon';
  }
  if (icon.startsWith('http') || icon.startsWith('data:')) return 'Image';
  return icon ? 'Emoji' : null;
}

/**
 * What the wallpaper swatch says -- a kind, never a raw value.
 *
 * `#f3f4f6` reads "Default" because it IS the settings window's own fallback: a
 * board that never chose a wallpaper is stored as exactly that value, so it is
 * the only honest name for it (and the palette's `#ffffff` is the explicit
 * white).
 */
export function wallpaperLabel(type: string | null | undefined, value: string | null | undefined): string {
  if (!type || !value) return 'Default';
  if (type === 'image') return 'Image';
  if (type === 'gradient') return 'Gradient';
  const hex = value.toLowerCase();
  if (hex === '#ffffff') return 'White';
  if (hex === '#f3f4f6') return 'Default';
  return 'Colour';
}
