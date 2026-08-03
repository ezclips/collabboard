export function isElementBeingLaidOut(node: HTMLElement): boolean {
  if (!node.isConnected) return false;

  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    if (getComputedStyle(el).display === "none") return false;
  }

  if (node.offsetParent === null && getComputedStyle(node).position !== "fixed") {
    return false;
  }

  const rect = node.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}
