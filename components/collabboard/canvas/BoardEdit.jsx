import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";

export default function EditBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchBoard() {
      const { data, error } = await supabase
        .from("boards")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error fetching board:", error);
        setError("Could not load board.");
      } else {
        setBoard(data);
      }
      setLoading(false);
    }

    fetchBoard();
  }, [id]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { error } = await supabase
      .from("boards")
      .update({
        title: board.title,
        description: board.description,
        background_value: board.background_value,
      })
      .eq("id", id);

    if (error) {
      console.error("Save error:", error);
      setError("Failed to save changes.");
    } else {
      navigate("/dashboard");
    }

    setSaving(false);
  }

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!board) return null;

  return (
    <div className="max-w-xl mx-auto mt-10 p-4">
      <h1 className="text-xl font-bold mb-4">Edit Board</h1>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Title</label>
          <input
            type="text"
            value={board.title}
            onChange={(e) => setBoard({ ...board, title: e.target.value })}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea
            value={board.description}
            onChange={(e) => setBoard({ ...board, description: e.target.value })}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
            rows="3"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Background</label>
          <input
            type="text"
            value={board.background_value || ""}
            onChange={(e) =>
              setBoard({ ...board, background_value: e.target.value })
            }
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2"
            placeholder="#ffffff or gradient or image URL"
          />
        </div>
        {error && (
          <div className="text-red-600">{error}</div>
        )}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}
