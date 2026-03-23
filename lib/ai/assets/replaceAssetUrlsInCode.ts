export function replaceAssetUrlsInCode(
  code: string,
  replacements: { from: string; to: string }[]
): string {
  let output = code;
  for (const { from, to } of replacements) {
    output = output.split(from).join(to);
  }
  return output;
}
