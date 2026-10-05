/**
 * PATCH-283 Addendum 2, fix 3. Chooses between the first repair and the auditor's
 * repair. The auditor can delete content: a candidate that lost more than half of
 * the first attempt's text is rejected outright. Otherwise missing labels are the
 * first concern, then the remaining issues, and a tie keeps the first attempt.
 */

import type { DrawnPicture, DrawnElement } from './format';
import type { RepairResult } from './repair';

type Issue = RepairResult['issues'][number];

export function textElementCount(picture: DrawnPicture): number {
  return picture.elements.filter((element: DrawnElement) => element.type === 'text').length;
}

function score(issues: Issue[]): [number, number] {
  const missing = issues.filter((issue) => issue.type === 'missing-label').length;
  return [missing, issues.length - missing];
}

function better(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}

export function preferredAttempt(first: RepairResult, second: RepairResult): RepairResult {
  if (textElementCount(second.picture) < textElementCount(first.picture) / 2) return first;
  return better(score(second.issues), score(first.issues)) ? second : first;
}
