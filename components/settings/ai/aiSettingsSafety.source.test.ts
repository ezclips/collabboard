import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guarantees for the BYOK Settings UI.
 *
 * These are structural on purpose: "the UI never stores a key in the browser"
 * and "there is no reveal control" are properties of the source, and a
 * behavioural test can only ever sample the paths it happens to exercise.
 */

const ROOT = path.resolve(__dirname, '../../..');

const UI_FILES = [
  'app/dashboard/settings/ai/page.tsx',
  'components/settings/ai/AIRoleSettings.tsx',
  'components/settings/ai/AIProviderList.tsx',
  'components/settings/ai/AIProviderDialog.tsx',
  'components/settings/ai/aiSettingsClient.ts',
];

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

const sources = UI_FILES.map((file) => ({ file, source: read(file) }));

describe('BYOK settings UI safety', () => {
  it('1. stores nothing in localStorage, sessionStorage or IndexedDB', () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toContain('localStorage');
      expect(source, file).not.toContain('sessionStorage');
      expect(source, file).not.toContain('indexedDB');
    }
  });

  it('2. has no saved-key reveal affordance anywhere', () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toContain('showApiKey');
      expect(source, file).not.toMatch(/\bEyeOff\b/);
      expect(source, file).not.toMatch(/\bEye\b/);
    }
  });

  it('3. never imports server-only modules into the client bundle', () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toContain('@/lib/server');
      expect(source, file).not.toContain('lib/server/');
    }
  });

  it('4. the only API-key input is a password field', () => {
    const dialog = read('components/settings/ai/AIProviderDialog.tsx');
    // One key input exists, and every `type=` in the dialog is password or text
    // -- nothing that would render a key in the clear.
    expect(dialog).toContain("'API key' : 'New API key'");
    expect(dialog).toContain('type="password"');
    const inputTypes = [...dialog.matchAll(/<input[\s\S]*?type="(\w+)"/g)].map((match) => match[1]);
    expect(inputTypes).toContain('password');
    expect(inputTypes.filter((type) => type === 'password')).toHaveLength(1);
    expect(new Set(inputTypes)).toEqual(new Set(['password', 'text']));
  });

  it('5. the replaced mockup leaves no fake-settings behaviour behind', () => {
    const page = read('app/dashboard/settings/ai/page.tsx');
    expect(page).not.toContain('usageLimit');
    expect(page).not.toContain('currentUsage');
    expect(page).not.toContain('In a real app');
    expect(page).not.toContain('imageGeneration');
  });

  it('6. renders verification history as "Last verified", never a bare badge', () => {
    const list = read('components/settings/ai/AIProviderList.tsx');
    expect(list).toContain('Last verified');
    // A transient per-session result is a different string entirely.
    expect(list).toContain('Connection verified');
    expect(list).toContain('Test failed');
  });

  it('7. never logs a request body', () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toMatch(/console\.(log|debug|info)\(/);
      expect(source, file).not.toContain('JSON.stringify(body)');
    }
  });

  it('8. offers no custom provider or user-supplied base URL', () => {
    for (const { file, source } of sources) {
      expect(source, file).not.toContain('base_url');
      expect(source, file).not.toContain('baseUrl');
    }
    const dialog = read('components/settings/ai/AIProviderDialog.tsx');
    expect(dialog).not.toContain('deepseek');
  });
});
