"use client";

import JSZip from "jszip";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type BoardRow = {
  id: string;
  title: string;
  layout: string;
};

type PadletRow = {
  id: string;
  board_id: string;
  type: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ZipManifest = {
  exportedAt: string;
  exportedFromWorkspaceId: string;
  exportedFromWorkspaceName: string;
};

type ZipBoardRow = {
  localId: string;
  title: string;
  layout: string;
};

type ZipPadletRow = {
  localId: string;
  boardRef: string;
  type: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
  originalCreatedAt?: string;
  originalUpdatedAt?: string;
};

type ComparablePadletBase = {
  id: string;
  type: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  isAllDay: boolean;
  parentId: string | null;
  childPadletIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

type SchedulerComparablePadlet = ComparablePadletBase & {
  parentDescriptor: string | null;
  childDescriptors: string[];
};

type ComparisonResult = {
  leftCount: number;
  rightCount: number;
  layoutMatches: boolean;
  mismatches: Array<{
    label: string;
    leftCount: number;
    rightCount: number;
    signature: Record<string, unknown>;
  }>;
};

type ParsedZipBundle = {
  manifest: ZipManifest | null;
  boards: ZipBoardRow[];
  padlets: ZipPadletRow[];
};

type UploadedZipInfo = {
  fileName: string;
  fileSize: number;
  lastModified: string;
  sha256: string;
};

function readMetadataStrings(
  metadata: Record<string, unknown> | null
): {
  startDate: string | null;
  endDate: string | null;
  isAllDay: boolean;
  parentId: string | null;
  childPadletIds: string[];
} {
  const safeMetadata = (metadata || {}) as Record<string, unknown>;
  const childPadletIds = Array.isArray(safeMetadata.childPadletIds)
    ? safeMetadata.childPadletIds.filter((value): value is string => typeof value === "string")
    : [];

  return {
    startDate: typeof safeMetadata.start_date === "string" ? safeMetadata.start_date : null,
    endDate: typeof safeMetadata.end_date === "string" ? safeMetadata.end_date : null,
    isAllDay: safeMetadata.isAllDay === true,
    parentId: typeof safeMetadata.parentId === "string" ? safeMetadata.parentId : null,
    childPadletIds,
  };
}

function normalizeLivePadlet(padlet: PadletRow): ComparablePadletBase {
  const metadata = readMetadataStrings(padlet.metadata);
  return {
    id: padlet.id,
    type: padlet.type || "",
    title: padlet.title || "",
    ...metadata,
    createdAt: padlet.created_at || null,
    updatedAt: padlet.updated_at || null,
  };
}

function normalizeZipPadlet(padlet: ZipPadletRow): ComparablePadletBase {
  const metadata = readMetadataStrings(padlet.metadata);
  return {
    id: padlet.localId,
    type: padlet.type || "",
    title: padlet.title || "",
    ...metadata,
    createdAt: padlet.originalCreatedAt || null,
    updatedAt: padlet.originalUpdatedAt || null,
  };
}

function baseDescriptor(padlet: ComparablePadletBase): string {
  return JSON.stringify({
    type: padlet.type,
    title: padlet.title,
    startDate: padlet.startDate,
    endDate: padlet.endDate,
    isAllDay: padlet.isAllDay,
  });
}

function enrichPadlets(padlets: ComparablePadletBase[]): SchedulerComparablePadlet[] {
  const descriptorById = new Map<string, string>();
  for (const padlet of padlets) {
    descriptorById.set(padlet.id, baseDescriptor(padlet));
  }

  return padlets.map((padlet) => ({
    ...padlet,
    parentDescriptor: padlet.parentId ? (descriptorById.get(padlet.parentId) || "unresolved-parent") : null,
    childDescriptors: [...padlet.childPadletIds]
      .map((childId) => descriptorById.get(childId) || "unresolved-child")
      .sort(),
  }));
}

function schedulerSignature(padlet: SchedulerComparablePadlet): string {
  return JSON.stringify({
    type: padlet.type,
    title: padlet.title,
    startDate: padlet.startDate,
    endDate: padlet.endDate,
    isAllDay: padlet.isAllDay,
    parentDescriptor: padlet.parentDescriptor,
    childDescriptors: padlet.childDescriptors,
  });
}

function getPadletKey(padlet: SchedulerComparablePadlet): string {
  return [
    padlet.type,
    padlet.title,
    padlet.startDate || "",
    padlet.endDate || "",
    padlet.isAllDay ? "allDay" : "timed",
    padlet.parentDescriptor ? "child" : "root",
  ].join("|");
}

function countBySignature(padlets: SchedulerComparablePadlet[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const padlet of padlets) {
    const key = `${getPadletKey(padlet)}::${schedulerSignature(padlet)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function compareDatasets(
  leftPadlets: SchedulerComparablePadlet[],
  rightPadlets: SchedulerComparablePadlet[],
  leftLayout: string | null,
  rightLayout: string | null
): ComparisonResult {
  const leftCounts = countBySignature(leftPadlets);
  const rightCounts = countBySignature(rightPadlets);
  const keys = new Set([...leftCounts.keys(), ...rightCounts.keys()]);

  const mismatches = Array.from(keys)
    .map((key) => {
      const leftCount = leftCounts.get(key) || 0;
      const rightCount = rightCounts.get(key) || 0;
      if (leftCount === rightCount) return null;

      const [label, signature] = key.split("::");
      return {
        label,
        leftCount,
        rightCount,
        signature: JSON.parse(signature) as Record<string, unknown>,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  return {
    leftCount: leftPadlets.length,
    rightCount: rightPadlets.length,
    layoutMatches: leftLayout === rightLayout,
    mismatches,
  };
}

function isSchedulerRelevant(padlet: ComparablePadletBase): boolean {
  return Boolean(padlet.startDate || padlet.endDate || padlet.type === "container");
}

function padletSummaryRows(padlets: SchedulerComparablePadlet[]) {
  return [...padlets]
    .sort((a, b) => {
      const left = [a.startDate || "", a.endDate || "", a.title, a.type, a.id].join("|");
      const right = [b.startDate || "", b.endDate || "", b.title, b.type, b.id].join("|");
      return left.localeCompare(right);
    })
    .map((padlet) => ({
      id: padlet.id,
      type: padlet.type,
      title: padlet.title,
      startDate: padlet.startDate,
      endDate: padlet.endDate,
      isAllDay: padlet.isAllDay,
      parentDescriptor: padlet.parentDescriptor,
      childDescriptorCount: padlet.childDescriptors.length,
      createdAt: padlet.createdAt,
      updatedAt: padlet.updatedAt,
    }));
}

function getMismatchMatches(
  padlets: SchedulerComparablePadlet[],
  mismatch: ComparisonResult["mismatches"][number]
) {
  const signature = JSON.stringify(mismatch.signature);
  return padlets.filter((padlet) => schedulerSignature(padlet) === signature);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function ComparisonSection({
  title,
  leftLabel,
  rightLabel,
  leftBoardId,
  rightBoardId,
  leftLayout,
  rightLayout,
  comparison,
  leftPadlets,
  rightPadlets,
  leftMeta,
  rightMeta,
}: {
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftBoardId?: string | null;
  rightBoardId?: string | null;
  leftLayout: string | null;
  rightLayout: string | null;
  comparison: ComparisonResult;
  leftPadlets: SchedulerComparablePadlet[];
  rightPadlets: SchedulerComparablePadlet[];
  leftMeta?: React.ReactNode;
  rightMeta?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded p-4">
          <div className="text-sm text-gray-500">Board Layout</div>
          <div className="mt-2 font-medium">{leftLabel}: {leftLayout || "(none)"}</div>
          <div className="font-medium">{rightLabel}: {rightLayout || "(none)"}</div>
          {leftBoardId && <div className="mt-2 text-xs text-gray-500">{leftLabel} id: {leftBoardId}</div>}
          {rightBoardId && <div className="text-xs text-gray-500">{rightLabel} id: {rightBoardId}</div>}
          {leftMeta}
          {rightMeta}
          <div className={`mt-2 text-sm ${comparison.layoutMatches ? "text-green-700" : "text-red-700"}`}>
            {comparison.layoutMatches ? "Layouts match" : "Layouts differ"}
          </div>
        </div>

        <div className="bg-white border rounded p-4">
          <div className="text-sm text-gray-500">Scheduler Padlets</div>
          <div className="mt-2 font-medium">{leftLabel}: {comparison.leftCount}</div>
          <div className="font-medium">{rightLabel}: {comparison.rightCount}</div>
        </div>

        <div className="bg-white border rounded p-4">
          <div className="text-sm text-gray-500">Mismatch Count</div>
          <div className="mt-2 text-2xl font-bold">{comparison.mismatches.length}</div>
          <div className={`mt-2 text-sm ${comparison.mismatches.length === 0 ? "text-green-700" : "text-red-700"}`}>
            {comparison.mismatches.length === 0 ? "Scheduler data matches" : "Scheduler data differs"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border rounded p-4">
          <h2 className="text-lg font-semibold mb-3">{leftLabel} Scheduler Padlets</h2>
          <div className="space-y-3 max-h-[36rem] overflow-auto">
            {padletSummaryRows(leftPadlets).map((padlet) => (
              <div key={padlet.id} className="bg-slate-50 p-3 rounded text-sm">
                <div><strong>ID:</strong> {padlet.id}</div>
                <div><strong>Type:</strong> {padlet.type}</div>
                <div><strong>Title:</strong> {padlet.title || "(no title)"}</div>
                <div><strong>start_date:</strong> {padlet.startDate || "(none)"}</div>
                <div><strong>end_date:</strong> {padlet.endDate || "(none)"}</div>
                <div><strong>isAllDay:</strong> {String(padlet.isAllDay)}</div>
                <div><strong>Parent shape:</strong> {padlet.parentDescriptor || "(root)"}</div>
                <div><strong>Child count:</strong> {padlet.childDescriptorCount}</div>
                <div><strong>created_at:</strong> {padlet.createdAt || "(none)"}</div>
                <div><strong>updated_at:</strong> {padlet.updatedAt || "(none)"}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border rounded p-4">
          <h2 className="text-lg font-semibold mb-3">{rightLabel} Scheduler Padlets</h2>
          <div className="space-y-3 max-h-[36rem] overflow-auto">
            {padletSummaryRows(rightPadlets).map((padlet) => (
              <div key={padlet.id} className="bg-blue-50 p-3 rounded text-sm">
                <div><strong>ID:</strong> {padlet.id}</div>
                <div><strong>Type:</strong> {padlet.type}</div>
                <div><strong>Title:</strong> {padlet.title || "(no title)"}</div>
                <div><strong>start_date:</strong> {padlet.startDate || "(none)"}</div>
                <div><strong>end_date:</strong> {padlet.endDate || "(none)"}</div>
                <div><strong>isAllDay:</strong> {String(padlet.isAllDay)}</div>
                <div><strong>Parent shape:</strong> {padlet.parentDescriptor || "(root)"}</div>
                <div><strong>Child count:</strong> {padlet.childDescriptorCount}</div>
                <div><strong>created_at:</strong> {padlet.createdAt || "(none)"}</div>
                <div><strong>updated_at:</strong> {padlet.updatedAt || "(none)"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded p-4">
        <h2 className="text-lg font-semibold mb-3">{title} Mismatch Summary</h2>
        {comparison.mismatches.length === 0 ? (
          <p className="text-green-700 text-sm">No scheduler-relevant differences detected.</p>
        ) : (
          <div className="space-y-3 max-h-[28rem] overflow-auto">
            {comparison.mismatches.map((mismatch, index) => (
              <div key={`${mismatch.label}-${index}`} className="bg-red-50 border border-red-200 p-3 rounded text-sm">
                <div><strong>Key:</strong> {mismatch.label}</div>
                <div><strong>{leftLabel} count:</strong> {mismatch.leftCount}</div>
                <div><strong>{rightLabel} count:</strong> {mismatch.rightCount}</div>
                <pre className="mt-2 bg-white p-2 rounded overflow-auto text-xs">
                  {JSON.stringify(mismatch.signature, null, 2)}
                </pre>
                <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <div className="bg-white rounded p-2">
                    <div className="font-medium mb-2">{leftLabel} matching rows</div>
                    <div className="space-y-2">
                      {getMismatchMatches(leftPadlets, mismatch).map((padlet) => (
                        <div key={`${leftLabel}-${padlet.id}`} className="rounded border p-2 text-xs">
                          <div><strong>ID:</strong> {padlet.id}</div>
                          <div><strong>created_at:</strong> {padlet.createdAt || "(none)"}</div>
                          <div><strong>updated_at:</strong> {padlet.updatedAt || "(none)"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded p-2">
                    <div className="font-medium mb-2">{rightLabel} matching rows</div>
                    <div className="space-y-2">
                      {getMismatchMatches(rightPadlets, mismatch).map((padlet) => (
                        <div key={`${rightLabel}-${padlet.id}`} className="rounded border p-2 text-xs">
                          <div><strong>ID:</strong> {padlet.id}</div>
                          <div><strong>created_at:</strong> {padlet.createdAt || "(none)"}</div>
                          <div><strong>updated_at:</strong> {padlet.updatedAt || "(none)"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DebugDBPage() {
  const searchParams = useSearchParams();
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [sourceBoardId, setSourceBoardId] = useState<string>("");
  const [importedBoardId, setImportedBoardId] = useState<string>("");
  const [sourcePadlets, setSourcePadlets] = useState<PadletRow[]>([]);
  const [importedPadlets, setImportedPadlets] = useState<PadletRow[]>([]);
  const [zipBundle, setZipBundle] = useState<ParsedZipBundle | null>(null);
  const [uploadedZipInfo, setUploadedZipInfo] = useState<UploadedZipInfo | null>(null);
  const [zipBoardId, setZipBoardId] = useState<string>("");
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingImported, setLoadingImported] = useState(false);
  const [loadingZip, setLoadingZip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSourceBoardId(searchParams.get("sourceBoardId") || "");
    setImportedBoardId(searchParams.get("importedBoardId") || "");
    setZipBoardId(searchParams.get("zipBoardId") || "");
  }, [searchParams]);

  useEffect(() => {
    const fetchBoards = async () => {
      setLoadingBoards(true);
      const { data, error: boardsError } = await supabase
        .from("boards")
        .select("id, title, layout")
        .order("created_at", { ascending: false })
        .limit(50);

      if (boardsError) {
        setError(`Failed to fetch boards: ${boardsError.message}`);
      } else {
        setBoards((data || []) as BoardRow[]);
      }
      setLoadingBoards(false);
    };

    fetchBoards();
  }, []);

  useEffect(() => {
    if (!sourceBoardId) {
      setSourcePadlets([]);
      return;
    }

    const fetchSourcePadlets = async () => {
      setLoadingSource(true);
      const { data, error: padletsError } = await supabase
        .from("padlets")
        .select("id, board_id, type, title, metadata, created_at, updated_at")
        .eq("board_id", sourceBoardId);

      if (padletsError) {
        setError(`Failed to fetch source board padlets: ${padletsError.message}`);
        setSourcePadlets([]);
      } else {
        setSourcePadlets((data || []) as PadletRow[]);
      }
      setLoadingSource(false);
    };

    fetchSourcePadlets();
  }, [sourceBoardId]);

  useEffect(() => {
    if (!importedBoardId) {
      setImportedPadlets([]);
      return;
    }

    const fetchImportedPadlets = async () => {
      setLoadingImported(true);
      const { data, error: padletsError } = await supabase
        .from("padlets")
        .select("id, board_id, type, title, metadata, created_at, updated_at")
        .eq("board_id", importedBoardId);

      if (padletsError) {
        setError(`Failed to fetch imported board padlets: ${padletsError.message}`);
        setImportedPadlets([]);
      } else {
        setImportedPadlets((data || []) as PadletRow[]);
      }
      setLoadingImported(false);
    };

    fetchImportedPadlets();
  }, [importedBoardId]);

  const sourceBoard = useMemo(
    () => boards.find((board) => board.id === sourceBoardId) || null,
    [boards, sourceBoardId]
  );

  const importedBoard = useMemo(
    () => boards.find((board) => board.id === importedBoardId) || null,
    [boards, importedBoardId]
  );

  const zipBoard = useMemo(
    () => zipBundle?.boards.find((board) => board.localId === zipBoardId) || null,
    [zipBoardId, zipBundle]
  );

  const sourceSchedulerPadlets = useMemo(
    () => enrichPadlets(sourcePadlets.map(normalizeLivePadlet).filter(isSchedulerRelevant)),
    [sourcePadlets]
  );

  const importedSchedulerPadlets = useMemo(
    () => enrichPadlets(importedPadlets.map(normalizeLivePadlet).filter(isSchedulerRelevant)),
    [importedPadlets]
  );

  const zipSchedulerPadlets = useMemo(() => {
    if (!zipBundle || !zipBoardId) return [];
    return enrichPadlets(
      zipBundle.padlets
        .filter((padlet) => padlet.boardRef === zipBoardId)
        .map(normalizeZipPadlet)
        .filter(isSchedulerRelevant)
    );
  }, [zipBoardId, zipBundle]);

  const liveComparison = useMemo(() => {
    if (!sourceBoard || !importedBoard) return null;
    return compareDatasets(
      sourceSchedulerPadlets,
      importedSchedulerPadlets,
      sourceBoard.layout,
      importedBoard.layout
    );
  }, [importedBoard, importedSchedulerPadlets, sourceBoard, sourceSchedulerPadlets]);

  const zipComparison = useMemo(() => {
    if (!zipBoard || !importedBoard) return null;
    return compareDatasets(
      zipSchedulerPadlets,
      importedSchedulerPadlets,
      zipBoard.layout,
      importedBoard.layout
    );
  }, [importedBoard, importedSchedulerPadlets, zipBoard, zipSchedulerPadlets]);

  async function handleZipUpload(file: File) {
    setLoadingZip(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const manifestFile = zip.file("manifest.json");
      const dataFile = zip.file("data.json");
      if (!manifestFile || !dataFile) {
        throw new Error("Zip is missing manifest.json or data.json");
      }

      const manifestRaw = await manifestFile.async("string");
      const raw = await dataFile.async("string");
      const manifestParsed = JSON.parse(manifestRaw) as ZipManifest;
      const parsed = JSON.parse(raw) as {
        boards?: ZipBoardRow[];
        padlets?: ZipPadletRow[];
      };

      const nextBundle: ParsedZipBundle = {
        manifest: manifestParsed,
        boards: parsed.boards || [],
        padlets: parsed.padlets || [],
      };

      const sha256 = await sha256Hex(arrayBuffer);
      setUploadedZipInfo({
        fileName: file.name,
        fileSize: file.size,
        lastModified: new Date(file.lastModified).toISOString(),
        sha256,
      });
      setZipBundle(nextBundle);
      setZipBoardId(nextBundle.boards[0]?.localId || "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read export zip";
      setError(message);
      setZipBundle(null);
      setUploadedZipInfo(null);
      setZipBoardId("");
    } finally {
      setLoadingZip(false);
    }
  }

  if (loadingBoards) {
    return <div className="p-8">Loading boards...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Scheduler Import Debug</h1>
        <p className="text-sm text-gray-600 mt-1">
          Compare scheduler-relevant board and padlet fields between live boards, or compare an export zip directly against a live imported board.
        </p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-white border rounded p-4 space-y-4">
        <h2 className="text-lg font-semibold">Live Board vs Live Board</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-medium mb-2">Source Board</label>
            <input
              className="border rounded px-3 py-2 w-full mb-2 font-mono text-sm"
              placeholder="Paste source board id"
              value={sourceBoardId}
              onChange={(e) => setSourceBoardId(e.target.value.trim())}
            />
            <select
              className="border rounded px-3 py-2 w-full"
              value={sourceBoardId}
              onChange={(e) => setSourceBoardId(e.target.value)}
            >
              <option value="">-- Select source board --</option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.title} ({board.layout}) - {board.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium mb-2">Imported Board</label>
            <input
              className="border rounded px-3 py-2 w-full mb-2 font-mono text-sm"
              placeholder="Paste imported board id"
              value={importedBoardId}
              onChange={(e) => setImportedBoardId(e.target.value.trim())}
            />
            <select
              className="border rounded px-3 py-2 w-full"
              value={importedBoardId}
              onChange={(e) => setImportedBoardId(e.target.value)}
            >
              <option value="">-- Select imported board --</option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.title} ({board.layout}) - {board.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(loadingSource || loadingImported) && (
          <div className="text-sm text-gray-600">Loading live board data...</div>
        )}

        {sourceBoard && importedBoard && liveComparison && (
          <ComparisonSection
            title="Live vs Live"
            leftLabel="Source"
            rightLabel="Imported"
            leftBoardId={sourceBoard.id}
            rightBoardId={importedBoard.id}
            leftLayout={sourceBoard.layout}
            rightLayout={importedBoard.layout}
            comparison={liveComparison}
            leftPadlets={sourceSchedulerPadlets}
            rightPadlets={importedSchedulerPadlets}
          />
        )}
      </div>

      <div className="bg-white border rounded p-4 space-y-4">
        <h2 className="text-lg font-semibold">Export Zip vs Live Imported Board</h2>
        <div>
          <label className="block font-medium mb-2">Export Zip</label>
          <input
            type="file"
            accept=".zip"
            className="block w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleZipUpload(file);
            }}
          />
          <p className="text-xs text-gray-500 mt-2">
            Upload the exported workspace zip here. This compares the bundle contents directly against a live imported board.
          </p>
        </div>

        {zipBundle && (
          <div className="space-y-4">
            {uploadedZipInfo && (
              <div className="rounded border bg-slate-50 p-3 text-sm">
                <div><strong>Zip file:</strong> {uploadedZipInfo.fileName}</div>
                <div><strong>Size:</strong> {uploadedZipInfo.fileSize} bytes</div>
                <div><strong>Last modified:</strong> {uploadedZipInfo.lastModified}</div>
                <div><strong>SHA-256:</strong> <span className="font-mono text-xs break-all">{uploadedZipInfo.sha256}</span></div>
                <div><strong>manifest.exportedAt:</strong> {zipBundle.manifest?.exportedAt || "(none)"}</div>
                <div><strong>manifest.workspace:</strong> {zipBundle.manifest?.exportedFromWorkspaceName || "(none)"}</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium mb-2">Zip Board</label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={zipBoardId}
                onChange={(e) => setZipBoardId(e.target.value)}
              >
                <option value="">-- Select zip board --</option>
                {zipBundle.boards.map((board) => (
                  <option key={board.localId} value={board.localId}>
                    {board.title} ({board.layout}) - {board.localId}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium mb-2">Imported Live Board</label>
              <input
                className="border rounded px-3 py-2 w-full mb-2 font-mono text-sm"
                placeholder="Paste imported board id"
                value={importedBoardId}
                onChange={(e) => setImportedBoardId(e.target.value.trim())}
              />
              <select
                className="border rounded px-3 py-2 w-full"
                value={importedBoardId}
                onChange={(e) => setImportedBoardId(e.target.value)}
              >
                <option value="">-- Select imported board --</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.title} ({board.layout}) - {board.id}
                  </option>
                ))}
              </select>
            </div>
            </div>
          </div>
        )}

        {loadingZip && (
          <div className="text-sm text-gray-600">Loading export zip...</div>
        )}

        {zipBoard && importedBoard && zipComparison && (
          <ComparisonSection
            title="Zip vs Live"
            leftLabel="Zip"
            rightLabel="Imported"
            leftBoardId={zipBoard.localId}
            rightBoardId={importedBoard.id}
            leftLayout={zipBoard.layout}
            rightLayout={importedBoard.layout}
            comparison={zipComparison}
            leftPadlets={zipSchedulerPadlets}
            rightPadlets={importedSchedulerPadlets}
            leftMeta={zipBundle?.manifest?.exportedAt ? (
              <div className="mt-2 text-xs text-gray-500">Zip exportedAt: {zipBundle.manifest.exportedAt}</div>
            ) : undefined}
          />
        )}
      </div>
    </div>
  );
}
