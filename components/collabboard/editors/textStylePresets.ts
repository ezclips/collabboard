/**
 * KNI-R3. Single authority for the text/highlight color swatches shared by
 * TextStylePopup (the Text style panel) and SelectedTextContextMenu (the
 * selected-text right-click menu). One list here is what keeps the two
 * surfaces' palettes from drifting apart.
 */

export interface TextColorPreset {
  readonly color: string;
  readonly label: string;
}

export const TEXT_COLOR_PRESETS: readonly TextColorPreset[] = [
  { color: '#1f2937', label: 'Default' },
  { color: '#dc2626', label: 'Red' },
  { color: '#16a34a', label: 'Green' },
  { color: '#2563eb', label: 'Blue' },
  { color: '#ea580c', label: 'Orange' },
  { color: '#9333ea', label: 'Purple' },
];

/**
 * Same palette ColorPickerContent falls back to on its own (SIMPLE_PALETTE in
 * ColorPicker.tsx, not exported), with "transparent" prepended -- the only
 * way to clear a highlight back to none. `'transparent'` is what
 * SelectedTextContextMenu's Clear swatch selects and what
 * `unsetHighlight()`-based handlers key off.
 */
export const HIGHLIGHT_COLOR_PRESETS: string[] = [
  'transparent', '#ffffff', '#f8f9fa', '#e9ecef', '#868e96', '#212529',
  '#fa5252', '#e64980', '#be4bdb', '#7950f2', '#4c6ef5',
  '#228be6', '#15aabf', '#12b886', '#40c057', '#82c91e',
  '#fab005', '#fd7e14',
];
