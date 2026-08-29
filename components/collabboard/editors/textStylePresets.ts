/**
 * KNI-R3/R3A. Single authority for the text/highlight color swatches shared
 * by ColorPickerContent's own default palette, TextStylePopup, and
 * SelectedTextContextMenu (the selected-text right-click menu). Re-exports
 * ColorPicker.tsx's own SIMPLE_PALETTE rather than duplicating it, so every
 * surface's palette stays byte-identical to the one source.
 */
import { SIMPLE_PALETTE } from '../ColorPicker';

export const TEXT_COLOR_PRESETS: string[] = SIMPLE_PALETTE;

/**
 * The same swatches, with "transparent" prepended -- the only way to clear a
 * highlight back to none. `'transparent'` is what SelectedTextContextMenu's
 * Clear swatch selects and what `unsetHighlight()`-based handlers key off.
 */
export const HIGHLIGHT_COLOR_PRESETS: string[] = ['transparent', ...TEXT_COLOR_PRESETS];
