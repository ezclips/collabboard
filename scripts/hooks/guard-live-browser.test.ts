import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decide } from './guard-live-browser.mjs';

const CWD = process.platform === 'win32' ? 'C:\\proj' : '/proj';

const FORBIDDEN = [
  'setViewportSize(',
  'setViewport(',
  'setDeviceMetricsOverride',
  'browser.close(',
  'context.close(',
  'browser.contexts()[0].close(',
];

const BROWSER_MARKERS = ['http://127.0.0.1:9333', 'connectOverCDP', "scripts/live/kit"];

function browserText(body: string): string {
  return `// a live script\nconst url = 'http://127.0.0.1:9333';\n${body}`;
}

function fileReader(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    const key = path.replace(/\\/g, '/').split('/').pop() ?? path;
    if (!(key in files)) throw new Error(`ENOENT: ${path}`);
    return files[key];
  };
}

const allow = { block: false } as const;

describe('guard hook decide: browser scripts with forbidden patterns', () => {
  for (const pattern of FORBIDDEN) {
    it(`blocks Write content containing "${pattern}"`, async () => {
      const result = await decide(
        { tool_name: 'Write', tool_input: { file_path: 'x.mjs', content: browserText(`await page.${pattern});`) }, cwd: CWD },
        { readFile: fileReader({}) },
      );
      expect(result).toMatchObject({ block: true });
      expect(result.block && result.reason).toContain(pattern);
      expect(result.block && result.reason).toContain('TESTING.md');
    });

    it(`blocks Edit new_string containing "${pattern}"`, async () => {
      const result = await decide(
        { tool_name: 'Edit', tool_input: { file_path: 'x.mjs', old_string: 'a', new_string: browserText(`await page.${pattern});`) }, cwd: CWD },
        { readFile: fileReader({ 'x.mjs': '// plain file\n' }) },
      );
      expect(result).toMatchObject({ block: true });
      expect(result.block && result.reason).toContain(pattern);
    });

    it(`blocks a node file containing "${pattern}"`, async () => {
      const result = await decide(
        { tool_name: 'Bash', tool_input: { command: 'node scripts/live/foo.mjs' }, cwd: CWD },
        { readFile: fileReader({ 'foo.mjs': browserText(`await page.${pattern});`) }) },
      );
      expect(result).toMatchObject({ block: true });
      expect(result.block && result.reason).toContain(pattern);
    });

    it(`blocks "timeout 600 node file" containing "${pattern}"`, async () => {
      const result = await decide(
        { tool_name: 'Bash', tool_input: { command: 'timeout 600 node scripts/live/foo.mjs' }, cwd: CWD },
        { readFile: fileReader({ 'foo.mjs': browserText(`await page.${pattern});`) }) },
      );
      expect(result).toMatchObject({ block: true });
      expect(result.block && result.reason).toContain(pattern);
    });

    it(`blocks node -e inline text containing "${pattern}"`, async () => {
      const result = await decide(
        { tool_name: 'Bash', tool_input: { command: `node -e "const u='http://127.0.0.1:9333'; page.${pattern});"` }, cwd: CWD },
        { readFile: fileReader({}) },
      );
      expect(result).toMatchObject({ block: true });
      expect(result.block && result.reason).toContain(pattern);
    });
  }

  it('allows the same forbidden pattern when nothing marks the text as a browser script', async () => {
    for (const pattern of FORBIDDEN) {
      const write = await decide(
        { tool_name: 'Write', tool_input: { file_path: 'x.mjs', content: `await page.${pattern});` }, cwd: CWD },
        { readFile: fileReader({}) },
      );
      expect(write).toEqual(allow);

      const node = await decide(
        { tool_name: 'Bash', tool_input: { command: 'node scripts/live/foo.mjs' }, cwd: CWD },
        { readFile: fileReader({ 'foo.mjs': `await page.${pattern});` }) },
      );
      expect(node).toEqual(allow);
    }
  });

  it('accepts any of the three browser-script markers', async () => {
    for (const marker of BROWSER_MARKERS) {
      const result = await decide(
        { tool_name: 'Write', tool_input: { file_path: 'x.mjs', content: `// ${marker}\nsetViewportSize(` }, cwd: CWD },
        { readFile: fileReader({}) },
      );
      expect(result).toMatchObject({ block: true });
    }
  });

  it('lets the unlock recipe use setDeviceMetricsOverride but nothing else', async () => {
    const recipe = '// live-guard: unlock-recipe\n// http://127.0.0.1:9333\nawait cdp.setDeviceMetricsOverride({});';
    const allowed = await decide(
      { tool_name: 'Write', tool_input: { file_path: 'unlock.mjs', content: recipe }, cwd: CWD },
      { readFile: fileReader({}) },
    );
    expect(allowed).toEqual(allow);

    const other = await decide(
      { tool_name: 'Write', tool_input: { file_path: 'unlock.mjs', content: recipe + '\nawait page.setViewportSize({ width: 1 });' }, cwd: CWD },
      { readFile: fileReader({}) },
    );
    expect(other).toMatchObject({ block: true });
    expect(other.block && other.reason).toContain('setViewportSize(');
  });
});

describe('guard hook decide: production builds', () => {
  const blocked = ['npm run build', 'npx next build', 'next build', 'npm run build --foo'];
  const permitted = [
    'npm run build:fork',
    'npm run sync:excalidraw-assets',
    'npx vitest run scripts/hooks',
    'npm run build:e2e',
  ];

  for (const command of blocked) {
    it(`blocks "${command}"`, async () => {
      const result = await decide(
        { tool_name: 'Bash', tool_input: { command }, cwd: CWD },
        { readFile: fileReader({}) },
      );
      expect(result).toMatchObject({ block: true });
      expect(result.block && result.reason).toContain('No production build while the dev server runs');
    });
  }

  for (const command of permitted) {
    it(`allows "${command}"`, async () => {
      const result = await decide(
        { tool_name: 'Bash', tool_input: { command }, cwd: CWD },
        { readFile: fileReader({}) },
      );
      expect(result).toEqual(allow);
    });
  }
});

describe('guard hook decide: the build rule only matches a command actually run', () => {
  it('allows a heredoc whose body puts the build command on its own line', async () => {
    const command = "cat > note.md <<'EOF'\nnpm run build\nEOF";
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command }, cwd: CWD },
      { readFile: fileReader({}) },
    );
    expect(result).toEqual(allow);
  });

  it('allows echo and printf payloads that mention the build command', async () => {
    for (const command of ['echo "npm run build"', "printf 'next build\\n'"]) {
      const result = await decide(
        { tool_name: 'Bash', tool_input: { command }, cwd: CWD },
        { readFile: fileReader({}) },
      );
      expect(result).toEqual(allow);
    }
  });

  it('allows a grep pattern that mentions the build command', async () => {
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command: 'grep -n "next build" file' }, cwd: CWD },
      { readFile: fileReader({}) },
    );
    expect(result).toEqual(allow);
  });

  it('still blocks the build command when it is actually run', async () => {
    for (const command of ['cd x && npm run build', 'timeout 900 npx next build']) {
      const result = await decide(
        { tool_name: 'Bash', tool_input: { command }, cwd: CWD },
        { readFile: fileReader({}) },
      );
      expect(result).toMatchObject({ block: true });
      expect(result.block && result.reason).toContain('No production build while the dev server runs');
    }
  });

  it('blocks an env-assignment-prefixed build and a PowerShell build', async () => {
    for (const [tool_name, command] of [['Bash', 'FOO=1 npm run build'], ['PowerShell', 'npm run build']] as const) {
      const result = await decide(
        { tool_name, tool_input: { command }, cwd: CWD },
        { readFile: fileReader({}) },
      );
      expect(result).toMatchObject({ block: true });
    }
  });
});

describe('guard hook decide: failure modes and PowerShell', () => {
  it('allows when the node file cannot be read', async () => {
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command: 'node scripts/live/missing.mjs' }, cwd: CWD },
      { readFile: fileReader({}) },
    );
    expect(result).toEqual(allow);
  });

  it('allows when the Edit target file cannot be read and new_string is not a browser script', async () => {
    const result = await decide(
      { tool_name: 'Edit', tool_input: { file_path: 'missing.mjs', old_string: 'a', new_string: 'setViewportSize(' }, cwd: CWD },
      { readFile: fileReader({}) },
    );
    expect(result).toEqual(allow);
  });

  it('treats PowerShell like Bash for the build rule', async () => {
    const result = await decide(
      { tool_name: 'PowerShell', tool_input: { command: 'npm run build' }, cwd: CWD },
      { readFile: fileReader({}) },
    );
    expect(result).toMatchObject({ block: true });
  });

  it('treats PowerShell like Bash for node files', async () => {
    const result = await decide(
      { tool_name: 'PowerShell', tool_input: { command: 'node scripts/live/foo.mjs' }, cwd: CWD },
      { readFile: fileReader({ 'foo.mjs': browserText('connectOverCDP(); setViewportSize(') }) },
    );
    expect(result).toMatchObject({ block: true });
  });
});

describe('guard hook decide: cd tracking and Git-Bash drive paths', () => {
  function exactReader(files: Record<string, string>, calls: string[]) {
    return async (path: string): Promise<string> => {
      calls.push(path);
      const normalized = path.replace(/\\/g, '/');
      if (Object.prototype.hasOwnProperty.call(files, normalized)) return files[normalized];
      throw new Error(`ENOENT: ${path}`);
    };
  }

  const FORBIDDEN_BODY = browserText('setViewportSize(');
  const CLEAN = 'console.log("ok");';
  const cdPipeShape = 'cd "/c/proj/sub" && timeout 600 node script.mjs 2>&1 | grep -v x';

  it('resolves the node file after a cd and blocks the forbidden script', async () => {
    const calls: string[] = [];
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command: cdPipeShape }, cwd: 'C:\\proj' },
      { readFile: exactReader({ 'C:/proj/sub/script.mjs': FORBIDDEN_BODY }, calls) },
    );
    expect(result).toMatchObject({ block: true });
    expect(calls[0].replace(/\\/g, '/')).toBe('C:/proj/sub/script.mjs');
  });

  it('allows a clean script reached through the cd-and-pipe shape', async () => {
    const calls: string[] = [];
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command: cdPipeShape }, cwd: 'C:\\proj' },
      { readFile: exactReader({ 'C:/proj/sub/script.mjs': CLEAN }, calls) },
    );
    expect(result).toEqual(allow);
    expect(calls[0].replace(/\\/g, '/')).toBe('C:/proj/sub/script.mjs');
  });

  it('resolves a cd into a relative subfolder against the previous directory', async () => {
    const calls: string[] = [];
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command: 'cd sub && node script.mjs' }, cwd: 'C:/proj' },
      { readFile: exactReader({ 'C:/proj/sub/script.mjs': FORBIDDEN_BODY }, calls) },
    );
    expect(result).toMatchObject({ block: true });
    expect(calls[0].replace(/\\/g, '/')).toBe('C:/proj/sub/script.mjs');
  });

  it('tracks chained relative cd commands', async () => {
    const calls: string[] = [];
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command: 'cd a && cd b && node x.mjs' }, cwd: 'C:/proj' },
      { readFile: exactReader({ 'C:/proj/a/b/x.mjs': FORBIDDEN_BODY }, calls) },
    );
    expect(result).toMatchObject({ block: true });
    expect(calls[0].replace(/\\/g, '/')).toBe('C:/proj/a/b/x.mjs');
  });

  it('treats a PowerShell Set-Location as a cd', async () => {
    const calls: string[] = [];
    const result = await decide(
      { tool_name: 'PowerShell', tool_input: { command: "Set-Location 'C:\\x'; node y.mjs" }, cwd: 'C:/proj' },
      { readFile: exactReader({ 'C:/x/y.mjs': FORBIDDEN_BODY }, calls) },
    );
    expect(result).toMatchObject({ block: true });
    expect(calls[0].replace(/\\/g, '/')).toBe('C:/x/y.mjs');
  });

  it('normalizes a Git-Bash cwd to a drive path', async () => {
    const calls: string[] = [];
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command: 'node script.mjs' }, cwd: '/c/proj' },
      { readFile: exactReader({ 'C:/proj/script.mjs': FORBIDDEN_BODY }, calls) },
    );
    expect(result).toMatchObject({ block: true });
    expect(calls[0].replace(/\\/g, '/')).toBe('C:/proj/script.mjs');
  });

  it('normalizes a Git-Bash file argument to a drive path', async () => {
    const calls: string[] = [];
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command: 'node /c/Windows/foo.mjs' }, cwd: 'C:/proj' },
      { readFile: exactReader({ 'C:/Windows/foo.mjs': FORBIDDEN_BODY }, calls) },
    );
    expect(result).toMatchObject({ block: true });
    expect(calls[0].replace(/\\/g, '/')).toBe('C:/Windows/foo.mjs');
  });

  it('normalizes a Git-Bash cd target to a drive path', async () => {
    const calls: string[] = [];
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command: 'cd /c/Windows && node foo.mjs' }, cwd: 'C:/proj' },
      { readFile: exactReader({ 'C:/Windows/foo.mjs': FORBIDDEN_BODY }, calls) },
    );
    expect(result).toMatchObject({ block: true });
    expect(calls[0].replace(/\\/g, '/')).toBe('C:/Windows/foo.mjs');
  });

  it('allows a clean script reached through a Git-Bash path', async () => {
    const calls: string[] = [];
    const result = await decide(
      { tool_name: 'Bash', tool_input: { command: 'node /c/proj/clean.mjs' }, cwd: 'C:/proj' },
      { readFile: exactReader({ 'C:/proj/clean.mjs': CLEAN }, calls) },
    );
    expect(result).toEqual(allow);
  });
});

describe('guard hook CLI', () => {
  const hookPath = fileURLToPath(new URL('./guard-live-browser.mjs', import.meta.url));
  const run = (input: string) =>
    spawnSync(process.execPath, [hookPath], { input, encoding: 'utf8' });

  it('exits 2 and prints the reason on stderr for a blocking payload', () => {
    const payload = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: 'x.mjs', content: browserText('setViewportSize(') },
      cwd: CWD,
    });
    const result = run(payload);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('setViewportSize(');
    expect(result.stderr).toContain('TESTING.md');
  });

  it('exits 0 for an allowing payload', () => {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm run build:fork' }, cwd: CWD });
    const result = run(payload);
    expect(result.status).toBe(0);
  });

  it('exits 0 with a warning on bad JSON (never blocks)', () => {
    const result = run('{ this is not json');
    expect(result.status).toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
