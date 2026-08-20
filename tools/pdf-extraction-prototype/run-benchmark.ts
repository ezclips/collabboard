import fs from 'node:fs';
import path from 'node:path';
import { checkCommand, runNativeBenchmark } from './benchmarkHarness';

function optionValue(argv: string[], name: string, fallback?: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function numberOption(argv: string[], name: string, fallback: number): number {
  const value = Number(optionValue(argv, name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const argv = process.argv.slice(2);
const fixtureDir = path.resolve(optionValue(argv, '--fixtures', 'tools/pdf-extraction-prototype/.artifacts/fixtures')!);
const artifactDir = path.resolve(optionValue(argv, '--out', 'tools/pdf-extraction-prototype/.artifacts/benchmark')!);
const jarPath = path.resolve(optionValue(argv, '--jar', process.env.OPENDATALOADER_PDF_JAR ?? '')!);
const javaCommand = optionValue(argv, '--java', process.env.JAVA ?? 'java')!;
const repeat = numberOption(argv, '--repeat', 2);

const reasons: string[] = [];
const java = checkCommand(javaCommand);
if (!java.available) reasons.push(`Java 11+ executable '${javaCommand}' is unavailable: ${java.detail}`);
if (!fs.existsSync(jarPath)) reasons.push(`OpenDataLoader CLI JAR is unavailable at '${jarPath}'. Supply --jar; no download is performed.`);
if (!fs.existsSync(fixtureDir)) reasons.push(`Fixture directory is unavailable at '${fixtureDir}'. Generate it with generate-fixtures.mjs.`);

if (reasons.length > 0) {
  console.error('BLOCKED: native OpenDataLoader benchmark cannot run in this environment.');
  reasons.forEach((reason) => console.error(`- ${reason}`));
  console.error('Minimal requirement: Java 11+ plus a locally supplied opendataloader-pdf-cli.jar.');
  process.exit(2);
} else {
  const report = runNativeBenchmark({ fixtureDir, artifactDir, jarPath, javaCommand, repeat });
  console.log(JSON.stringify(report, null, 2));
}
