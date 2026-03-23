// Server-side preview card generation for imported documents.
// Uses @vercel/og (Satori-based) to render a branded PNG card.
//
// PREREQUISITE: npm install @vercel/og
// This is separate from the Next.js image optimisation — it runs in a
// Node.js route handler, not an edge function.

import type { ImportProvider, ImportKind } from './types';

export interface PreviewCardOptions {
  fileName: string;
  mimeType: string;
  provider: ImportProvider;
  kind: ImportKind;
}

function providerLabel(provider: ImportProvider): string {
  return provider === 'google-drive' ? 'Google Drive' : 'Microsoft OneDrive';
}

function kindLabel(mimeType: string): string {
  const map: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
    'application/pdf': 'PDF',
  };
  return map[mimeType] || 'Document';
}

function providerColor(provider: ImportProvider): string {
  return provider === 'google-drive' ? '#4285F4' : '#0078D4';
}

/**
 * Generate a preview PNG for a document using @vercel/og.
 * Returns the raw PNG buffer.
 *
 * Falls back to a simple SVG buffer if @vercel/og is not installed.
 */
export async function generatePreviewPng(options: PreviewCardOptions): Promise<Buffer> {
  const { fileName, mimeType, provider } = options;
  const label = kindLabel(mimeType);
  const pLabel = providerLabel(provider);
  const color = providerColor(provider);

  try {
    // Dynamic import so the build does not fail if @vercel/og is absent
    const { ImageResponse } = await import('@vercel/og');

    const response = new ImageResponse(
      ({
        type: 'div',
        props: {
          style: {
            width: '600px',
            height: '400px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '40px',
            fontFamily: 'sans-serif',
          },
          children: [
            {
              type: 'div',
              props: {
                style: {
                  width: '64px',
                  height: '64px',
                  backgroundColor: color,
                  borderRadius: '12px',
                  marginBottom: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                children: {
                  type: 'span',
                  props: { style: { color: '#fff', fontSize: '32px' }, children: '📄' },
                },
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  fontSize: '22px',
                  fontWeight: '700',
                  color: '#111827',
                  textAlign: 'center',
                  marginBottom: '12px',
                  maxWidth: '500px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
                children: fileName,
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  gap: '12px',
                  marginTop: '8px',
                },
                children: [
                  {
                    type: 'span',
                    props: {
                      style: {
                        padding: '4px 12px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '9999px',
                        fontSize: '14px',
                        color: '#374151',
                      },
                      children: label,
                    },
                  },
                  {
                    type: 'span',
                    props: {
                      style: {
                        padding: '4px 12px',
                        backgroundColor: color + '1a',
                        borderRadius: '9999px',
                        fontSize: '14px',
                        color,
                      },
                      children: pLabel,
                    },
                  },
                ],
              },
            },
          ],
        },
      }) as any,
      { width: 600, height: 400 }
    );

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    // Fallback: return a minimal SVG as PNG-ish placeholder
    return generateFallbackSvg({ fileName, label, pLabel, color });
  }
}

function generateFallbackSvg(opts: {
  fileName: string;
  label: string;
  pLabel: string;
  color: string;
}): Buffer {
  const { fileName, label, pLabel, color } = opts;
  const safeName = fileName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" rx="12" fill="#ffffff" stroke="#e5e7eb"/>
  <rect x="268" y="60" width="64" height="64" rx="12" fill="${color}"/>
  <text x="300" y="102" font-family="sans-serif" font-size="32" fill="#fff" text-anchor="middle" dominant-baseline="middle">📄</text>
  <text x="300" y="175" font-family="sans-serif" font-size="20" font-weight="700" fill="#111827" text-anchor="middle">${safeName.substring(0, 40)}</text>
  <rect x="190" y="210" width="${label.length * 9 + 24}" height="28" rx="14" fill="#f3f4f6"/>
  <text x="${190 + label.length * 4.5 + 12}" y="228" font-family="sans-serif" font-size="13" fill="#374151" text-anchor="middle" dominant-baseline="middle">${label}</text>
  <rect x="${190 + label.length * 9 + 36}" y="210" width="${pLabel.length * 9 + 24}" height="28" rx="14" fill="${color}1a"/>
  <text x="${190 + label.length * 9 + 36 + pLabel.length * 4.5 + 12}" y="228" font-family="sans-serif" font-size="13" fill="${color}" text-anchor="middle" dominant-baseline="middle">${pLabel}</text>
</svg>`;
  return Buffer.from(svg);
}
