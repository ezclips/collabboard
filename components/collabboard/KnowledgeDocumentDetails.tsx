"use client";

import React from 'react';

export interface KnowledgeDocumentDetailPage {
  pageNumber: number;
  text: string;
}

export interface KnowledgeDocumentDetailsProps {
  originalFilename: string;
  pageCount: number | null;
  pages: readonly KnowledgeDocumentDetailPage[];
  loading: boolean;
  error: boolean;
  onBack: () => void;
}

export default function KnowledgeDocumentDetails({
  originalFilename,
  pageCount,
  pages,
  loading,
  error,
  onBack,
}: KnowledgeDocumentDetailsProps) {
  return (
    <div className="min-w-0">
      <button
        type="button"
        className="mb-3 text-xs font-medium text-blue-700 hover:text-blue-900"
        onClick={onBack}
      >
        ← Back to PDFs
      </button>
      <div className="mb-3 border-b border-gray-100 pb-2">
        <h2 className="truncate text-sm font-medium text-gray-800" title={originalFilename}>
          {originalFilename}
        </h2>
        <p className="text-[11px] text-gray-500">
          {pageCount === 1 ? '1 page' : `${pageCount ?? pages.length} pages`}
        </p>
      </div>

      {loading ? (
        <p className="text-[11px] text-gray-500">Loading extracted text…</p>
      ) : error ? (
        <p className="text-[11px] text-gray-500">Extracted text unavailable.</p>
      ) : pages.length === 0 ? (
        <p className="text-[11px] text-gray-500">No extracted text available.</p>
      ) : (
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {pages.map((page) => (
            <section key={page.pageNumber}>
              <h3 className="mb-1 text-[11px] font-semibold text-gray-500">Page {page.pageNumber}</h3>
              <p className="select-text whitespace-pre-wrap text-xs leading-5 text-gray-700">{page.text}</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
