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
