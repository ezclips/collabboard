/**
 * PATCH-287 Addendum 1. The "Edit values" button and panel styles, split out of
 * `AntvChartValuesControl.tsx` to keep the component under the 300-line ceiling.
 */

import type { CSSProperties } from 'react';

export const editButtonStyle: CSSProperties = {
  position: 'absolute',
  top: 64,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 10,
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 600,
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  cursor: 'pointer',
};

// PATCH-288. Apply and Cancel now read as real buttons: a filled primary and an
// outlined secondary, sitting together in the panel footer.
export const primaryButtonStyle: CSSProperties = {
  background: '#2563eb',
  color: '#ffffff',
  border: '1px solid #2563eb',
  borderRadius: 6,
  padding: '6px 14px',
  fontWeight: 600,
  cursor: 'pointer',
};

export const secondaryButtonStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '6px 14px',
  color: '#374151',
  cursor: 'pointer',
};

export const panelStyle: CSSProperties = {
  position: 'absolute',
  top: 64,
  right: 8,
  zIndex: 10,
  width: 300,
  maxHeight: '70%',
  overflowY: 'auto',
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: 10,
  fontSize: 12,
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
};

export const rowStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  padding: '6px 0',
  borderTop: '1px solid #f3f4f6',
};

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
};

// PATCH-289. The "Transparent background" checkbox row, above the footer.
export const checkboxRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 8,
  cursor: 'pointer',
};
