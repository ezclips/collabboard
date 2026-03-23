"use client";

import React, { useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { ChevronDown, Download, FileText, FileType2, ScrollText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ExportFormat = "pdf" | "docx" | "markdown" | "text";

function sanitizeFilename(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ai-post";
}

function parseHTML(code: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(code, "text/html");
  doc.querySelectorAll("script, noscript, style, link[rel='stylesheet'], meta, title").forEach((node) => node.remove());
  return doc;
}

function getPlainTextFromHTML(code: string) {
  const doc = parseHTML(code);
  const text = (doc.body.textContent || "").replace(/\r/g, "");
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function getMarkdownFromHTML(code: string) {
  const doc = parseHTML(code);
  const { default: TurndownService } = await import("turndown");
  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  return turndownService.turndown(doc.body.innerHTML).trim();
}

async function exportAsText(fileBase: string, code: string) {
  const blob = new Blob([getPlainTextFromHTML(code)], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `${fileBase}.txt`);
}

async function exportAsMarkdown(fileBase: string, code: string) {
  const markdown = await getMarkdownFromHTML(code);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `${fileBase}.md`);
}

async function exportAsDocx(fileBase: string, title: string, code: string) {
  const markdown = await getMarkdownFromHTML(code);
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [];
  const lines = markdown.split(/\r?\n/);

  if (title.trim()) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun(title.trim())],
      })
    );
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      children.push(new Paragraph({}));
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 6);
      const headingMap = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      } as const;
      children.push(
        new Paragraph({
          heading: headingMap[level as keyof typeof headingMap],
          children: [new TextRun(headingMatch[2])],
        })
      );
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bulletMatch) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun(bulletMatch[1])],
        })
      );
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      children.push(
        new Paragraph({
          children: [new TextRun(trimmed)],
        })
      );
      continue;
    }

    children.push(
      new Paragraph({
        children: [new TextRun(trimmed)],
      })
    );
  }

  const doc = new Document({
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileBase}.docx`);
}

// Polls until the structured diagram inside targetElement reports a non-loading
// render state, or until the timeout elapses. This prevents exporting a blank
// loading placeholder when Mermaid has not yet finished rendering.
function waitForDiagramRender(targetElement: HTMLElement, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const el = targetElement.querySelector("[data-ai-render-state]");
      if (!el || el.getAttribute("data-ai-render-state") !== "loading" || Date.now() >= deadline) {
        resolve();
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

async function exportAsPDF(fileBase: string, targetElement: HTMLElement) {
  await waitForDiagramRender(targetElement);

  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(targetElement, {
    backgroundColor: "#ffffff",
    useCORS: true,
    scale: Math.max(2, window.devicePixelRatio || 1),
    logging: false,
  });

  const imageData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const usableWidth = pageWidth - margin * 2;
  const renderedHeight = (canvas.height * usableWidth) / canvas.width;
  let remainingHeight = renderedHeight;
  let offsetY = 0;

  pdf.addImage(imageData, "PNG", margin, margin, usableWidth, renderedHeight);
  remainingHeight -= pageHeight - margin * 2;

  while (remainingHeight > 0) {
    offsetY -= pageHeight - margin * 2;
    pdf.addPage();
    pdf.addImage(imageData, "PNG", margin, margin + offsetY, usableWidth, renderedHeight);
    remainingHeight -= pageHeight - margin * 2;
  }

  pdf.save(`${fileBase}.pdf`);
}

export default function AIComponentExportMenu({
  title,
  code,
  getTargetElement,
}: {
  title?: string;
  code: string;
  getTargetElement: () => HTMLElement | null;
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const fileBase = useMemo(() => sanitizeFilename(title || "ai-post"), [title]);

  const runExport = async (format: ExportFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      if (format === "pdf") {
        const targetElement = getTargetElement();
        if (!targetElement) throw new Error("AI post content is not mounted");
        await exportAsPDF(fileBase, targetElement);
      } else if (format === "docx") {
        await exportAsDocx(fileBase, title || "AI Post", code);
      } else if (format === "markdown") {
        await exportAsMarkdown(fileBase, code);
      } else {
        await exportAsText(fileBase, code);
      }
    } catch (error) {
      console.error(`AI export failed for ${format}:`, error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-no-drag="true"
          onPointerDown={(e) => e.stopPropagation()}
          className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-medium hover:bg-black/10"
          title="Export"
          aria-label="Export"
        >
          <Download className="h-3 w-3" />
          <span>Export</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
        <DropdownMenuLabel className="px-2 py-2 text-sm font-semibold text-gray-800">
          Export as…
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => runExport("pdf")} disabled={!!busy} className="gap-3 rounded-lg px-3 py-2.5">
          <FileText className="h-4 w-4 text-gray-500" />
          <span>{busy === "pdf" ? "Exporting PDF…" : "PDF"}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => runExport("docx")} disabled={!!busy} className="gap-3 rounded-lg px-3 py-2.5">
          <FileType2 className="h-4 w-4 text-gray-500" />
          <span>{busy === "docx" ? "Exporting Word…" : "Word document"}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => runExport("markdown")} disabled={!!busy} className="gap-3 rounded-lg px-3 py-2.5">
          <ScrollText className="h-4 w-4 text-gray-500" />
          <span>{busy === "markdown" ? "Exporting Markdown…" : "Markdown"}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => runExport("text")} disabled={!!busy} className="gap-3 rounded-lg px-3 py-2.5">
          <ScrollText className="h-4 w-4 text-gray-500" />
          <span>{busy === "text" ? "Exporting text…" : "Plain text"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
