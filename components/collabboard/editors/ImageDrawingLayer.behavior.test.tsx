// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ImageDrawingLayer from './ImageDrawingLayer';

const exportImage = vi.fn(async () => 'data:image/png;base64,stub');
const exportPaths = vi.fn(async () => []);
const eraseMode = vi.fn();
const undo = vi.fn();
const redo = vi.fn();
const loadPaths = vi.fn();

vi.mock('react-sketch-canvas', async () => {
  const React = (await import('react')) as typeof import('react');
  return {
    ReactSketchCanvas: React.forwardRef((_props, ref) => {
      React.useImperativeHandle(ref, () => ({
        exportImage,
        exportPaths,
        eraseMode,
        undo,
        redo,
        loadPaths,
      }));
      return <div data-testid="sketch-canvas" />;
    }),
  };
});

const imageUrl = 'data:image/png;base64,stub';

function mockCanvasMetrics() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 12 }),
  }) as unknown as CanvasRenderingContext2D);
}

function renderLayer() {
  return render(
    <ImageDrawingLayer
      imageUrl={imageUrl}
      initialTextElements={[
        {
          id: 'text-1',
          x: 40,
          y: 40,
          content: 'Hello',
          fontSize: 24,
          color: '#ffffff',
          borderColor: undefined,
          bgOpacity: 40,
        },
      ]}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

function openTextToolbar() {
  fireEvent.click(screen.getByTitle('Add Text'));
}

async function clickBodyButtonByText(text: string) {
  await waitFor(() => {
    const buttons = Array.from(document.body.querySelectorAll('button')).filter((button) => button.textContent?.trim() === text);
    expect(buttons.length, `missing button text ${text}`).toBeGreaterThan(0);
  });
  const buttons = Array.from(document.body.querySelectorAll('button')).filter((button) => button.textContent?.trim() === text);
  fireEvent.click(buttons[buttons.length - 1] as HTMLButtonElement);
}

function selectSwatch(color: string) {
  const button = Array.from(document.body.querySelectorAll('button')).find((candidate) => {
    return getComputedStyle(candidate).backgroundColor === color;
  }) as HTMLButtonElement | undefined;
  expect(button, `missing color swatch ${color}`).toBeTruthy();
  fireEvent.click(button!);
}

function selectBorderSwatch(color: string) {
  const panels = Array.from(document.body.querySelectorAll('div')).filter((candidate) => candidate.textContent?.includes('None'));
  const panel = panels[panels.length - 1] as HTMLElement | undefined;
  expect(panel, 'missing border color panel').toBeTruthy();
  const button = Array.from(panel!.querySelectorAll('button')).find((candidate) => getComputedStyle(candidate).backgroundColor === color) as HTMLButtonElement | undefined;
  expect(button, `missing border swatch ${color}`).toBeTruthy();
  fireEvent.click(button!);
}

beforeEach(() => {
  mockCanvasMetrics();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ImageDrawingLayer', () => {
  it('auto-grows wrapped text so the second line stays visible while editing', async () => {
    renderLayer();

    openTextToolbar();

    const textarea = screen.getByPlaceholderText('Type here...') as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    fireEvent.input(textarea, { target: { value: 'Hello World' } });

    await waitFor(() => {
      expect(parseFloat(textarea.style.height)).toBeGreaterThan(70);
    });
    expect(textarea.style.whiteSpace).toBe('pre-wrap');
  });

  it('keeps the selected annotation live when using Medium, A, border color, and opacity controls', async () => {
    renderLayer();

    openTextToolbar();

    const textarea = screen.getByPlaceholderText('Type here...') as HTMLTextAreaElement;
    fireEvent.focus(textarea);

    expect(screen.getByTitle('Font Size').textContent).toContain('Medium');
    fireEvent.click(screen.getByTitle('Font Size'));
    await clickBodyButtonByText('Large');
    await waitFor(() => expect(textarea.style.fontSize).toBe('32px'));

    fireEvent.click(screen.getByTitle('Text Color'));
    selectSwatch('rgb(239, 68, 68)');
    await waitFor(() => expect(textarea.style.color).toBe('rgb(239, 68, 68)'));

    fireEvent.click(screen.getByTitle('Box Border Color'));
    selectBorderSwatch('rgb(34, 197, 94)');
    await waitFor(() => expect(textarea.style.borderColor).toBe('rgb(34, 197, 94)'));

    fireEvent.click(screen.getByTitle('Background Opacity'));
    const slider = document.body.querySelector('input[type="range"]') as HTMLInputElement | null;
    expect(slider).not.toBeNull();
    fireEvent.change(slider!, { target: { value: '80' } });
    await waitFor(() => expect(textarea.style.backgroundColor).toContain('0.8'));
  });
});
