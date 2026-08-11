// Shared by every surface that renders saved comment HTML as raw markup
// (CommentPopup, CommentPost, CommentRow, CommentEditor): TipTap's Link mark
// is configured with only a class name, which overrides its own default
// target="_blank" rel="noopener noreferrer" attributes, so a saved link
// would otherwise navigate away in the same tab -- inside a canvas editor
// that means losing unsaved work. This intercepts clicks on rendered
// anchors and opens them safely instead.
export function handleSafeCommentLinkClick(event: React.MouseEvent<HTMLElement>): boolean {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return false;

    event.preventDefault();
    event.stopPropagation();

    let url: URL;
    try {
        url = new URL(anchor.getAttribute('href') || '', window.location.href);
    } catch {
        return true;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return true;
    }

    window.open(url.href, '_blank', 'noopener,noreferrer');
    return true;
}
