'use client';

import React from 'react';
import { createPortal } from 'react-dom';

import { AntvElementPanel, type AntvElementPanelProps } from './AntvElementPanel';

/**
 * PATCH-275. Renders the element panel into the docked host, or nothing when
 * there is no open panel / no host. Split out of `AntvElementEditor` so that
 * file stays under the 700-line ceiling.
 */
export function renderAntvElementPanel(
  open: boolean,
  host: HTMLElement | null,
  props: Omit<AntvElementPanelProps, 'onClose'> & { onClose: () => void },
): React.ReactNode {
  if (!open || !host) return null;
  return createPortal(React.createElement(AntvElementPanel, props), host);
}
