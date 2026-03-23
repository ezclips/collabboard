"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DebugDBPage() {
  const [boards, setBoards] = useState<any[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [padlets, setPadlets] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all boards
  useEffect(() => {
    const fetchBoards = async () => {
      const { data, error } = await supabase
        .from("boards")
        .select("id, title, layout")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        setError("Failed to fetch boards: " + error.message);
      } else {
        setBoards(data || []);
      }
      setLoading(false);
    };
    fetchBoards();
  }, []);

  // Fetch padlets and sections when board selected
  useEffect(() => {
    if (!selectedBoard) return;

    const fetchBoardData = async () => {
      setLoading(true);

      const [padletRes, sectionRes] = await Promise.all([
        supabase
          .from("padlets")
          .select("*")
          .eq("board_id", selectedBoard),
        supabase
          .from("board_sections")
          .select("*")
          .eq("board_id", selectedBoard),
      ]);

      setPadlets(padletRes.data || []);
      setSections(sectionRes.data || []);
      setError(
        padletRes.error?.message || sectionRes.error?.message || null
      );
      setLoading(false);
    };

    fetchBoardData();
  }, [selectedBoard]);

  if (loading && !selectedBoard) {
    return <div className="p-8">Loading boards...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Database Debug Tool</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Board selector */}
      <div className="mb-6">
        <label className="block font-medium mb-2">Select Board:</label>
        <select
          className="border rounded px-3 py-2 w-full max-w-md"
          value={selectedBoard || ""}
          onChange={(e) => setSelectedBoard(e.target.value || null)}
        >
          <option value="">-- Select a board --</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.title} ({board.layout}) - {board.id}
            </option>
          ))}
        </select>
      </div>

      {selectedBoard && (
        <div className="grid grid-cols-2 gap-6">
          {/* Sections */}
          <div>
            <h2 className="text-xl font-bold mb-2">
              Sections ({sections.length})
            </h2>
            {sections.length === 0 ? (
              <p className="text-gray-500">No sections found</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {sections.map((s) => (
                  <div
                    key={s.id}
                    className="bg-gray-100 p-3 rounded text-sm"
                  >
                    <div><strong>ID:</strong> {s.id}</div>
                    <div><strong>Title:</strong> {s.title}</div>
                    <div><strong>Position:</strong> {s.position}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Padlets */}
          <div>
            <h2 className="text-xl font-bold mb-2">
              Padlets ({padlets.length})
            </h2>
            {padlets.length === 0 ? (
              <p className="text-gray-500">No padlets found</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {padlets.map((p) => (
                  <div
                    key={p.id}
                    className="bg-blue-50 p-3 rounded text-sm"
                  >
                    <div><strong>ID:</strong> {p.id}</div>
                    <div><strong>Type:</strong> {p.type}</div>
                    <div><strong>Title:</strong> {p.title || "(no title)"}</div>
                    <div>
                      <strong>Metadata:</strong>
                      <pre className="text-xs mt-1 bg-white p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(p.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raw padlet types summary */}
      {selectedBoard && padlets.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-bold mb-2">Padlet Summary</h2>
          <div className="bg-gray-100 p-4 rounded">
            <p>
              <strong>Containers:</strong>{" "}
              {padlets.filter((p) => p.type === "container" || p.metadata?.kind === "container").length}
            </p>
            <p>
              <strong>With sectionId:</strong>{" "}
              {padlets.filter((p) => p.metadata?.sectionId).length}
            </p>
            <p>
              <strong>With parentId:</strong>{" "}
              {padlets.filter((p) => p.metadata?.parentId).length}
            </p>
            <p>
              <strong>Types:</strong>{" "}
              {[...new Set(padlets.map((p) => p.type))].join(", ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
