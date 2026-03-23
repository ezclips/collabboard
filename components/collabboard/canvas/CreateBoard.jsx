import React, { useState } from "react";
import { supabase } from "../supabaseClient";

export default function CreateBoard() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [layout, setLayout] = useState("wall");
  const [sortOrder, setSortOrder] = useState("drag");
  const [backgroundType, setBackgroundType] = useState("color");
  const [backgroundValue, setBackgroundValue] = useState("#ffffff");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(false);
  const [thumbnail, setThumbnail] = useState("📝");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const fileName = `${Date.now()}-${file.name}`;

    const { data, error } = await supabase
      .storage
      .from('board-backgrounds')
      .upload(fileName, file);

    if (error) {
      setError("Upload failed: " + error.message);
    } else {
      const { data: publicUrl } = supabase
        .storage
        .from('board-backgrounds')
        .getPublicUrl(fileName);

      setBackgroundType("image");
      setBackgroundValue(publicUrl.publicUrl);
    }

    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error } = await supabase
        .from("boards")
        .insert([
          {
            title,
            description,
            layout,
            sort_order: sortOrder,
            background_type: backgroundType,
            background_value: backgroundValue,
            comments_enabled: commentsEnabled,
            reactions_enabled: reactionsEnabled,
            thumbnail
          }
        ])
        .select();

      if (error) {
        setError(error.message);
      } else {
        // Add creator as board member (required for RLS on comments/votes)
        if (data && data[0]) {
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.id) {
            await supabase.from('kanban_board_members').upsert({
              canvas_id: data[0].id,
              user_id: authData.user.id,
              role: 'owner',
              permission_level: 'admin',
            }, { onConflict: 'canvas_id,user_id' });
          }
        }
        setSuccess(`Board "${title}" created!`);
        setTitle("");
        setDescription("");
        setLayout("wall");
        setSortOrder("drag");
        setBackgroundType("color");
        setBackgroundValue("#ffffff");
        setCommentsEnabled(true);
        setReactionsEnabled(false);
        setThumbnail("📝");
      }
    } catch (err) {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded shadow space-y-6">
      <h1 className="text-2xl font-bold">Create a New Board</h1>

      {success && <div className="p-2 bg-green-100 text-green-700 rounded">{success}</div>}
      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header */}
        <div>
          <label className="block text-sm font-medium">Thumbnail</label>
          <input
            type="text"
            value={thumbnail}
            onChange={(e) => setThumbnail(e.target.value)}
            className="w-16 border text-center text-xl"
          />
        </div>

        <div>
          <label className="block text-sm">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        {/* Appearance */}
        <div>
          <h2 className="font-semibold mt-4 mb-1">Background</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBackgroundType("color")}
              className={`px-3 py-1 rounded ${
                backgroundType === "color" ? "bg-pink-500 text-white" : "bg-gray-200"
              }`}
            >
              Color
            </button>
            <button
              type="button"
              onClick={() => setBackgroundType("gradient")}
              className={`px-3 py-1 rounded ${
                backgroundType === "gradient" ? "bg-pink-500 text-white" : "bg-gray-200"
              }`}
            >
              Gradient
            </button>
            <button
              type="button"
              onClick={() => setBackgroundType("image")}
              className={`px-3 py-1 rounded ${
                backgroundType === "image" ? "bg-pink-500 text-white" : "bg-gray-200"
              }`}
            >
              Upload Image
            </button>
          </div>

          {backgroundType === "color" && (
            <input
              type="color"
              value={backgroundValue}
              onChange={(e) => setBackgroundValue(e.target.value)}
              className="mt-2 w-16 h-10"
            />
          )}

          {backgroundType === "gradient" && (
            <select
              value={backgroundValue}
              onChange={(e) => setBackgroundValue(e.target.value)}
              className="mt-2 w-full border rounded px-3 py-2"
            >
              <option value="gradient-1">Gradient 1</option>
              <option value="gradient-2">Gradient 2</option>
              <option value="gradient-3">Gradient 3</option>
            </select>
          )}

          {backgroundType === "image" && (
            <div className="mt-2">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploading}
              />
              {uploading && <p className="text-sm text-gray-500 mt-1">Uploading...</p>}
              {backgroundValue && (
                <img src={backgroundValue} alt="Uploaded" className="mt-2 w-full rounded" />
              )}
            </div>
          )}
        </div>

        {/* Layout */}
        <div>
          <h2 className="font-semibold mt-4 mb-1">Layout</h2>
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            className="w-full border px-3 py-2 rounded mb-2"
          >
            <option value="wall">Wall</option>
            <option value="grid">Grid</option>
            <option value="stream">Stream</option>
            <option value="timeline">Timeline</option>
            <option value="freeform">Freeform</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="drag">Drag and drop</option>
            <option value="date">Date published</option>
            <option value="subject">Post subject</option>
            <option value="random">Random</option>
          </select>
        </div>

        {/* Engagement */}
        <div>
          <h2 className="font-semibold mt-4 mb-1">Engagement</h2>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={commentsEnabled}
              onChange={(e) => setCommentsEnabled(e.target.checked)}
            />
            Enable Comments
          </label>
          <label className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={reactionsEnabled}
              onChange={(e) => setReactionsEnabled(e.target.checked)}
            />
            Enable Reactions
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-pink-600 text-white py-2 rounded hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Board"}
        </button>
      </form>
    </div>
  );
}
