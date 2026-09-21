'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import { BookOpen, Download, X } from 'lucide-react';

import {
  applyProposalToDraft,
  boardWikiDraftFromPage,
  boardWikiDraftIsDirty,
  boardWikiDraftWithContent,
  boardWikiDraftWithTitle,
  boardWikiProposalWarnings,
  boardWikiSaveRequestFromDraft,
  boardWikiTitleIsUsable,
  type BoardWikiDraft,
  type BoardWikiPage,
  type BoardWikiProposal,
} from '@/lib/domain/wiki/boardWikiEditing';
import {
  boardWikiDiffIsEmpty,
  boardWikiTextDiff,
} from '@/lib/domain/wiki/boardWikiTextDiff';
import {
  boardWikiExportFilename,
  parseBoardWikiExportBundle,
} from '@/lib/domain/wiki/boardWikiExportBundle';
import type {
  BoardWikiPageSource,
  BoardWikiSourceState,
} from '@/lib/domain/wiki/boardWikiPageSources';
import type { BoardAiCitationItem } from '@/lib/domain/ai/boardAiChatCitation';
import { KNOWLEDGE_TRANSCRIPT_DISCLOSURE } from '@/lib/domain/knowledge/knowledgeTranscriptCitation';

/**
 * The board wiki's page surface.
 *
 * ===========================================================================
 * THE SOURCES CHAIN IS NOT A DISCLOSURE PANEL
 * ===========================================================================
 *
 * P1 accepted lexical retrieval NOW, on the condition that the compiled input
 * set is visible with the page. That is the mitigation for compiling from a
 * retrieval that cannot separate q05's intro from its answer -- so the chain
 * renders beside the content, expanded, on every page, and there is no control
 * that collapses it. A collapsed chain is a chain nobody reads, and then the
 * page is an unsourced assertion with a reassuring affordance next to it.
 *
 * ===========================================================================
 * NOTHING HERE WRITES A PROPOSAL TO THE SERVER
 * ===========================================================================
 *
 * A proposal can only be applied into the DRAFT the user is looking at, which
 * leaves the page unsaved and the Save button lit. The save path sends the
 * draft, so compile output reaches storage only after a person applied it and
 * then saved it -- two deliberate acts, and the second one is the only one that
 * writes. See lib/domain/wiki/boardWikiEditing.ts, where the absence of a
 * proposal-to-save-request function is asserted rather than described.
 */

interface BoardWikiSourceStatusView {
  readonly item: BoardAiCitationItem;
  readonly version: BoardWikiPageSource['version'];
  readonly state: BoardWikiSourceState;
  /** Absent means NOT a transcript. The response is untrusted input. */
  readonly isTranscript?: boolean;
}

interface BoardWikiPageResponse {
  readonly page: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
    readonly content: string;
    readonly compiledAt: string | null;
    readonly updatedAt: string;
  };
  readonly sources: readonly BoardWikiSourceStatusView[];
  readonly freshness: 'current' | 'stale' | 'sources-gone';
}

export interface BoardWikiPageSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly sourceCount: number;
}

export interface BoardWikiDrawerProps {
  readonly boardId: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** Owner or editor. A viewer reads the page and its chain and saves nothing. */
  readonly canEdit: boolean;
  readonly blockingEditorOpen?: boolean;
  /**
   * Same shape the chat drawer's citation click uses, deliberately: a KNOWLEDGE
   * source opens in the reader, and a board post does not (the chat path opens
   * neither, and inventing a second navigation contract here would put the same
   * rule in two places). A post chip therefore renders as text.
   */
  readonly onOpenCitation?: (request: {
    readonly knowledgeDocumentId: string;
    readonly pageNumber?: number;
  }) => void;
  /**
   * Unit 3 supplies this. While it is undefined the Refresh control is not
   * rendered at all -- rather than rendered and inert, which is how a surface
   * ends up promising something no code does.
   */
  readonly onRequestRecompile?: (
    pageId: string,
    topic: string,
  ) => Promise<BoardWikiProposal | null>;
}

const stateLabel: Record<BoardWikiSourceState, string> = {
  current: '',
  stale: '(changed)',
  gone: '(deleted)',
};

const stateClass: Record<BoardWikiSourceState, string> = {
  current: 'border-gray-200 bg-white text-gray-700',
  stale: 'border-amber-300 bg-amber-50 text-amber-800',
  gone: 'border-gray-200 bg-gray-100 text-gray-400 line-through',
};

export default function BoardWikiDrawer({
  boardId,
  isOpen,
  onClose,
  canEdit,
  blockingEditorOpen = false,
  onOpenCitation,
  onRequestRecompile,
}: BoardWikiDrawerProps) {
  const [pages, setPages] = useState<readonly BoardWikiPageSummary[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [page, setPage] = useState<BoardWikiPage | null>(null);
  const [sources, setSources] = useState<readonly BoardWikiSourceStatusView[]>([]);
  const [freshness, setFreshness] = useState<BoardWikiPageResponse['freshness']>('current');
  const [draft, setDraft] = useState<BoardWikiDraft | null>(null);
  const [proposal, setProposal] = useState<BoardWikiProposal | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const loadPages = useCallback(async () => {
    try {
      const response = await fetch(`/api/boards/${boardId}/wiki`);
      if (!response.ok) {
        setStatus('The board wiki could not be loaded.');
        return;
      }
      const body = await response.json();
      setPages(Array.isArray(body.pages) ? body.pages : []);
    } catch {
      setStatus('The board wiki could not be loaded.');
    }
  }, [boardId]);

  const loadPage = useCallback(async (pageId: string) => {
    try {
      const response = await fetch(`/api/boards/${boardId}/wiki/${pageId}`);
      if (!response.ok) {
        setStatus('That page could not be loaded.');
        return;
      }
      const body: BoardWikiPageResponse = await response.json();
      // The chain is copied faithfully into the draft -- item AND recorded
      // version -- so comparing drafts is comparing the real thing. The STATE
      // beside each entry belongs to this moment rather than to the page, so it
      // is held separately and never saved.
      const loaded: BoardWikiPage = {
        id: body.page.id,
        slug: body.page.slug,
        title: body.page.title,
        content: body.page.content,
        sources: body.sources.map((status) => ({ item: status.item, version: status.version })),
        compiledAt: body.page.compiledAt,
        updatedAt: body.page.updatedAt,
      };
      setPage(loaded);
      setSources(body.sources);
      setFreshness(body.freshness);
      setDraft(boardWikiDraftFromPage(loaded));
      setProposal(null);
      // A confirmation is about ONE page. Carrying it across a selection change
      // would arm the second click over a page the user never asked about.
      setConfirmingDelete(false);
      setStatus(null);
    } catch {
      setStatus('That page could not be loaded.');
    }
  }, [boardId]);

  useEffect(() => {
    if (!isOpen) return;
    void loadPages();
  }, [isOpen, loadPages]);

  useEffect(() => {
    if (!isOpen || selectedPageId === null) return;
    void loadPage(selectedPageId);
  }, [isOpen, selectedPageId, loadPage]);

  const dirty = draft !== null && boardWikiDraftIsDirty(draft);

  const warnings = useMemo(
    () => (page && draft && proposal ? boardWikiProposalWarnings(page, draft, proposal) : []),
    [page, draft, proposal],
  );

  const diff = useMemo(
    () => (draft && proposal ? boardWikiTextDiff(draft.content, proposal.content) : []),
    [draft, proposal],
  );

  const createPage = useCallback(async () => {
    if (!boardWikiTitleIsUsable(newTitle)) {
      setStatus('A page needs a title.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/boards/${boardId}/wiki`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (response.status === 409) {
        setStatus('A page with this name already exists.');
        return;
      }
      if (!response.ok) {
        setStatus('That page could not be created.');
        return;
      }
      const body = await response.json();
      setNewTitle('');
      await loadPages();
      setSelectedPageId(String(body.page?.id ?? ''));
    } finally {
      setBusy(false);
    }
  }, [boardId, newTitle, loadPages]);

  const save = useCallback(async () => {
    if (!draft || selectedPageId === null) return;
    if (!boardWikiTitleIsUsable(draft.title)) {
      setStatus('A page needs a title.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/boards/${boardId}/wiki/${selectedPageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(boardWikiSaveRequestFromDraft(draft)),
      });
      if (response.status === 409) {
        // NOT a retry and NOT a merge. The user is told, their text stays in
        // front of them, and reloading is their decision -- an automatic
        // reload here would discard exactly the work the conflict is about.
        setStatus('This page changed while you were editing it. Your text is still here; reload the page to see theirs.');
        return;
      }
      if (!response.ok) {
        setStatus('That page could not be saved.');
        return;
      }
      await loadPage(selectedPageId);
      setStatus('Saved.');
    } finally {
      setBusy(false);
    }
  }, [boardId, draft, selectedPageId, loadPage]);

  const deletePage = useCallback(async () => {
    if (selectedPageId === null) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/boards/${boardId}/wiki/${selectedPageId}`, { method: 'DELETE' });
      if (!response.ok) {
        setStatus('That page could not be deleted.');
        return;
      }
      // Back to nothing selected, deliberately: leaving the editor on screen
      // over a page that no longer exists invites a save that would 404, and
      // re-selecting the next page would be the surface choosing for the user.
      setConfirmingDelete(false);
      setSelectedPageId(null);
      setPage(null);
      setDraft(null);
      setSources([]);
      setProposal(null);
      await loadPages();
      setStatus('Page deleted.');
    } finally {
      setBusy(false);
    }
  }, [boardId, selectedPageId, loadPages]);

  const requestRecompile = useCallback(async () => {
    if (!onRequestRecompile || selectedPageId === null || draft === null) return;
    setBusy(true);
    setStatus('Compiling from this board…');
    try {
      // THE TOPIC IS THE PAGE'S TITLE, which is the one thing on the page a
      // person definitely wrote. Using the CONTENT would feed a compilation its
      // own previous output and drift a page away from the board over
      // successive refreshes.
      const compiled = await onRequestRecompile(selectedPageId, draft.title);
      setProposal(compiled);
      // TWO DIFFERENT ANSWERS, SAID DIFFERENTLY. A rejected compilation is
      // worth another go; a board with nothing to say on the topic is not, and
      // telling someone to retry that wastes their time and a provider call.
      setStatus(compiled === null ? 'This board has nothing on that topic yet.' : null);
    } catch {
      setStatus('That compilation came back unusable. Try again.');
    } finally {
      setBusy(false);
    }
  }, [onRequestRecompile, selectedPageId, draft]);

  /**
   * The whole corpus as an Open Knowledge Format bundle, archived in the
   * browser.
   *
   * THE ROUTE IS NOT ASKED TO PRODUCE THE ARCHIVE. It returns `{ files }`,
   * which IS the OKF representation and is what a programmatic consumer wants;
   * the .zip is a delivery convenience for a person pressing a button. Building
   * it here leaves that contract whole, so the route's own tests keep asserting
   * a bundle rather than a binary blob they would have to unzip to read.
   *
   * NOT GATED ON `canEdit`. Reading the corpus is a read, the same rule that
   * gives a viewer the page and its sources chain -- and the bundle contains
   * exactly the pages the caller's own RLS client returned, so a viewer's
   * export is a viewer's view.
   */
  const exportBundle = useCallback(async () => {
    setBusy(true);
    setStatus('Preparing the export…');
    try {
      const response = await fetch(`/api/boards/${boardId}/wiki/export`);
      if (!response.ok) throw new Error('export refused');

      const files = parseBoardWikiExportBundle(await response.json());
      if (files === null) throw new Error('unreadable bundle');

      // Loaded on demand: the archiver is export-only weight and this drawer
      // mounts on every canvas, the same reason the AI component export menu
      // defers turndown and docx rather than importing them at module scope.
      //
      // FILE-SAVER IS IMPORTED STATICALLY AND THAT IS NOT AN OVERSIGHT. It is
      // CommonJS with no `module` entry, so under the bundler a dynamic
      // `import('file-saver')` resolves the module onto `.default` and the
      // named `saveAs` destructures to undefined -- an export that fails only
      // in a browser, which is precisely how this shipped past a green suite
      // the first time. The static form is what the AI component export menu
      // already uses, and it is two kilobytes.
      const { default: JSZip } = await import('jszip');

      const zip = new JSZip();
      for (const file of files) zip.file(file.name, file.content);
      saveAs(
        await zip.generateAsync({ type: 'blob' }),
        boardWikiExportFilename(new Date()),
      );
      setStatus(null);
    } catch {
      // One message for every failure, and it says what did NOT happen. A
      // half-written archive is the outcome worth ruling out in words: the
      // parse refuses a partial bundle, so there is nothing on disk to doubt.
      setStatus('The export failed. Nothing was downloaded.');
    } finally {
      setBusy(false);
    }
  }, [boardId]);

  if (!isOpen || blockingEditorOpen) return null;

  return (
    <div
      data-board-wiki-drawer="true"
      className="fixed bottom-0 right-0 top-0 z-[1200] flex w-[min(720px,100vw)] flex-col border-l border-gray-200 bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Board wiki
        </div>
        <div className="flex items-center gap-1">
          {/* Board-scoped, so it sits in the header rather than beside Save and
              Delete, which act on the one page in view. Disabled rather than
              hidden while the corpus is empty: the capability is wired either
              way, and hiding it would say the product cannot export when it
              can -- there is simply nothing yet to put in the archive. */}
          <button
            type="button"
            data-board-wiki-export="true"
            disabled={busy || pages.length === 0}
            onClick={() => void exportBundle()}
            title={pages.length === 0
              ? 'No pages to export yet'
              : 'Download every page as an Open Knowledge Format bundle'}
            className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export
          </button>
          <button type="button" aria-label="Close board wiki" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="w-52 shrink-0 overflow-y-auto border-r border-gray-200 p-2" aria-label="Wiki pages">
          {pages.length === 0 && <p className="px-2 py-3 text-xs text-gray-500">No pages yet.</p>}
          {pages.map((summary) => (
            <button
              key={summary.id}
              type="button"
              data-board-wiki-page-item={summary.id}
              onClick={() => {
                // Disarmed on ANY selection click, not only on a load:
                // re-clicking the page you are already on would otherwise leave
                // the confirmation armed, and the next click deletes.
                setConfirmingDelete(false);
                setSelectedPageId(summary.id);
              }}
              className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs ${
                summary.id === selectedPageId ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {summary.title}
            </button>
          ))}

          {canEdit && (
            <div className="mt-3 border-t border-gray-200 pt-3">
              <input
                type="text"
                value={newTitle}
                data-board-wiki-new-title="true"
                placeholder="New page title"
                onChange={(event) => setNewTitle(event.target.value)}
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
              />
              <button
                type="button"
                data-board-wiki-create="true"
                disabled={busy}
                onClick={() => void createPage()}
                className="mt-1 w-full rounded bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-50"
              >
                Create page
              </button>
            </div>
          )}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          {status && <p data-board-wiki-status="true" className="mb-3 rounded bg-gray-50 px-3 py-2 text-xs text-gray-700">{status}</p>}

          {draft === null && <p className="text-xs text-gray-500">Select a page.</p>}

          {draft !== null && (
            <>
              {freshness !== 'current' && (
                <p
                  data-board-wiki-freshness={freshness}
                  className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                >
                  {freshness === 'sources-gone'
                    /* Gone outranks stale because they call for different
                       things: a stale page can be refreshed from its sources,
                       and this one cannot be fully refreshed at all. */
                    ? 'A source this page used no longer exists. Some of what it says cannot be checked against anything.'
                    : 'A source this page used has changed since the page was compiled.'}
                </p>
              )}

              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500" htmlFor="board-wiki-title">
                Title
              </label>
              <input
                id="board-wiki-title"
                data-board-wiki-title="true"
                type="text"
                value={draft.title}
                readOnly={!canEdit}
                onChange={(event) => setDraft(boardWikiDraftWithTitle(draft, event.target.value))}
                className="mb-3 w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
              />

              <textarea
                data-board-wiki-content="true"
                value={draft.content}
                readOnly={!canEdit}
                rows={14}
                onChange={(event) => setDraft(boardWikiDraftWithContent(draft, event.target.value))}
                /* HEIGHT IS CAPPED, and that is the chain's requirement rather
                   than a style choice: a `flex-1` editor grew to fill the
                   drawer and pushed "Compiled from" to the very bottom of the
                   scroll area, where on any shorter window it is below the
                   fold. P1's condition is that the compiled input set is
                   visible WITH the page, and a chain you have to scroll to find
                   is most of the way to a collapsed one. */
                className="w-full max-h-[40vh] rounded border border-gray-200 p-3 font-mono text-xs"
              />

              {canEdit && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    data-board-wiki-save="true"
                    disabled={busy || !dirty}
                    onClick={() => void save()}
                    className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                  {dirty && <span data-board-wiki-dirty="true" className="text-xs text-amber-700">Unsaved changes</span>}
                  {onRequestRecompile && (
                    <button
                      type="button"
                      data-board-wiki-refresh="true"
                      disabled={busy}
                      onClick={() => void requestRecompile()}
                      className="ml-auto rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 disabled:opacity-50"
                    >
                      Refresh from sources
                    </button>
                  )}
                  <button
                    type="button"
                    data-board-wiki-delete="true"
                    disabled={busy}
                    onClick={() => setConfirmingDelete(true)}
                    className={`${onRequestRecompile ? '' : 'ml-auto '}rounded border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50`}
                  >
                    Delete page
                  </button>
                </div>
              )}

              {/* THE CONFIRMATION SAYS WHAT IS LOST, IN THE ROLLBACK'S WORDS.
                  There is no trash and no undo -- both are real infrastructure
                  built on a guess that someone will want them -- so the only
                  honest protection is telling the truth BEFORE the click, and
                  the truth is the one the rollback header already states: a
                  page is not derived data, and recompilation is not even
                  idempotent, so nothing can put back what it said. */}
              {canEdit && confirmingDelete && (
                <div data-board-wiki-delete-confirm="true" className="mt-3 rounded border border-red-200 bg-red-50/50 p-3">
                  <p className="text-xs font-medium text-red-900">
                    Delete “{draft.title}” permanently?
                  </p>
                  <p className="mt-1 text-xs text-red-900">
                    This cannot be undone. A wiki page is not derived data: what is on it is what a
                    person last wrote, and there is no source it can be recompiled from — a
                    recompilation does not produce the same page twice. Its record of what it was
                    compiled from goes with it.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      data-board-wiki-delete-confirmed="true"
                      disabled={busy}
                      onClick={() => void deletePage()}
                      className="rounded bg-red-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    >
                      Delete permanently
                    </button>
                    <button
                      type="button"
                      data-board-wiki-delete-cancel="true"
                      onClick={() => setConfirmingDelete(false)}
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* THE CHAIN. Always here, never collapsed -- see the header. */}
              <section data-board-wiki-sources="true" className="mt-4 border-t border-gray-200 pt-3">
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Compiled from
                </h3>
                {sources.length === 0 && (
                  <p className="text-xs text-gray-500">
                    Nothing — this page was written by hand.
                  </p>
                )}
                <ul className="flex flex-wrap gap-1.5">
                  {sources.map((status, index) => {
                    const documentId = (status.item as { knowledgeDocumentId?: unknown }).knowledgeDocumentId;
                    // A GONE source is never clickable. It resolves to nothing,
                    // and a chip that navigates nowhere reads as a broken page
                    // rather than as a deleted source -- the distinction item 15
                    // settled for citations, kept here.
                    const openable = onOpenCitation !== undefined
                      && status.state !== 'gone'
                      && typeof documentId === 'string';
                    return (
                    <li key={`${status.item.label}-${index}`}>
                      {!openable ? (
                        <span
                          data-board-wiki-source={status.state}
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${stateClass[status.state]}`}
                        >
                          <span className="truncate">{status.item.label}</span>
                          {stateLabel[status.state] && (
                            <span className="shrink-0 no-underline">{stateLabel[status.state]}</span>
                          )}
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-board-wiki-source={status.state}
                          onClick={() => onOpenCitation?.({
                            knowledgeDocumentId: String(documentId),
                            ...(typeof (status.item as { pageNumber?: unknown }).pageNumber === 'number'
                              ? { pageNumber: (status.item as { pageNumber: number }).pageNumber }
                              : {}),
                          })}
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-gray-50 ${stateClass[status.state]}`}
                        >
                          <span className="truncate">{status.item.label}</span>
                          {stateLabel[status.state] && <span className="shrink-0">{stateLabel[status.state]}</span>}
                        </button>
                      )}
                    </li>
                    );
                  })}
                </ul>
                {sources.some((status) => status.isTranscript === true) && (
                  <p
                    data-board-wiki-transcript-disclosure="true"
                    className="mt-2 text-[11px] leading-snug text-amber-800"
                  >
                    {KNOWLEDGE_TRANSCRIPT_DISCLOSURE}
                  </p>
                )}
              </section>

              {proposal !== null && (
                <section data-board-wiki-proposal="true" className="mt-4 rounded border border-blue-200 bg-blue-50/40 p-3">
                  <h3 className="text-xs font-medium text-gray-800">A refreshed version is proposed</h3>

                  {warnings.includes('unsaved-edits') && (
                    <p data-board-wiki-proposal-warning="unsaved-edits" className="mt-2 text-xs text-amber-800">
                      You have unsaved changes. Applying this replaces them, and they are not stored anywhere else.
                    </p>
                  )}
                  {warnings.includes('page-moved') && (
                    <p data-board-wiki-proposal-warning="page-moved" className="mt-2 text-xs text-amber-800">
                      This page was saved by someone after this version was compiled. Applying this replaces their text.
                    </p>
                  )}

                  {boardWikiDiffIsEmpty(diff) ? (
                    <p className="mt-2 text-xs text-gray-600">It is identical to what is on screen.</p>
                  ) : (
                    <pre data-board-wiki-diff="true" className="mt-2 max-h-64 overflow-auto rounded bg-white p-2 font-mono text-[11px]">
                      {diff.map((line, index) => (
                        <div
                          key={index}
                          data-board-wiki-diff-line={line.kind}
                          className={
                            line.kind === 'added' ? 'text-green-700'
                              : line.kind === 'removed' ? 'text-red-700'
                                : 'text-gray-500'
                          }
                        >
                          {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}{line.text}
                        </div>
                      ))}
                    </pre>
                  )}

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      data-board-wiki-proposal-apply="true"
                      onClick={() => {
                        // Into the DRAFT. Nothing is stored here -- the user is
                        // left with an unsaved page and a Save button.
                        setDraft(applyProposalToDraft(draft, proposal));
                        setProposal(null);
                      }}
                      className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white"
                    >
                      Apply to draft
                    </button>
                    <button
                      type="button"
                      data-board-wiki-proposal-discard="true"
                      onClick={() => setProposal(null)}
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700"
                    >
                      Discard
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
