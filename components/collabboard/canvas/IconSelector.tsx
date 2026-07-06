"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Link as LinkIcon, Search, Loader2, Image as ImageIcon } from "lucide-react";
import ImportsDialog from "@/components/collabboard/imports/ImportsDialog";
import { toast } from "sonner";
import type { ImportProvider, ResolvedImportItem } from "@/lib/imports/types";
import EmojiPicker, { EmojiStyle } from "emoji-picker-react";

interface IconSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIcon: string;
  onSelect: (icon: string) => void;
}

interface PexelsPhoto {
  id: number;
  photographer: string;
  src: { medium: string; large: string };
  alt: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: { fixed_width: { url: string }; original: { url: string } };
}

type CustomView = "menu" | "search" | "gif";

const IconSelector: React.FC<IconSelectorProps> = ({
  isOpen,
  onClose,
  selectedIcon,
  onSelect,
}) => {
  const [customView, setCustomView] = useState<CustomView>("menu");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [importProviderOpen, setImportProviderOpen] = useState<ImportProvider | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PexelsPhoto[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<GiphyGif[]>([]);
  const [gifLoading, setGifLoading] = useState(false);

  const resetCustomState = () => {
    setCustomView("menu");
    setSearchQuery("");
    setSearchResults([]);
    setGifQuery("");
    setGifResults([]);
  };

  const handleIconSelect = (icon: string) => {
    onSelect(icon);
    onClose();
    resetCustomState();
  };

  const handleDialogClose = () => {
    onClose();
    resetCustomState();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      handleIconSelect(result);
    };
    reader.readAsDataURL(file);
  };

  const handleLinkSubmit = () => {
    if (linkUrl.trim()) {
      handleIconSelect(linkUrl.trim());
      setLinkUrl("");
      setLinkDialogOpen(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/pexels?query=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.photos || []);
    } catch (error) {
      console.error("Icon photo search failed", error);
      toast.error("Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleGifSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!gifQuery.trim()) return;
    setGifLoading(true);
    try {
      const res = await fetch(`/api/giphy?query=${encodeURIComponent(gifQuery)}`);
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        setGifResults([]);
      } else {
        setGifResults(data.data || []);
      }
    } catch (error) {
      console.error("Icon GIF search failed", error);
      toast.error("GIF search failed");
    } finally {
      setGifLoading(false);
    }
  };

  const handleImportedIcon = (resolved: ResolvedImportItem) => {
    if (resolved.kind !== "image") {
      toast.error("Only image files can be used as an icon");
      return;
    }
    setImportProviderOpen(null);
    handleIconSelect(resolved.previewImageUrl);
  };

  return (
    <>
      {/* modal={false}: this Dialog stays open while the Google/OneDrive import
          picker (ImportsDialog/ConnectionRequiredDialog) renders on top of it,
          portaled to document.body. Radix's default modal lock would mark
          that portaled picker as inert since it's outside this Dialog's own
          content, freezing its buttons. Mirrors WallpaperSelector.tsx. */}
      <Dialog open={isOpen} onOpenChange={handleDialogClose} modal={false}>
        <DialogContent
          className="z-[4150] overflow-y-auto"
          style={{ maxWidth: '42rem', minHeight: '650px', maxHeight: '90vh' }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Select Icon</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Emojis</h3>
              <div className="w-full">
                <EmojiPicker
                  onEmojiClick={(emojiData) => handleIconSelect(emojiData.emoji)}
                  emojiStyle={EmojiStyle.TWITTER}
                  width="100%"
                  height={350}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Custom</h3>

              {customView === "menu" && (
                <div className="grid grid-cols-3 gap-2 p-2">
                  <label
                    htmlFor="icon-file-upload"
                    className="cursor-pointer flex flex-col items-center gap-2 rounded-lg border-2 border-gray-200 p-3 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  >
                    <Upload className="w-5 h-5" />
                    Upload
                    <input
                      id="icon-file-upload"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleFileChange}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setLinkDialogOpen(true)}
                    className="flex flex-col items-center gap-2 rounded-lg border-2 border-gray-200 p-3 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  >
                    <LinkIcon className="w-5 h-5" />
                    Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomView("search")}
                    className="flex flex-col items-center gap-2 rounded-lg border-2 border-gray-200 p-3 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  >
                    <Search className="w-5 h-5" />
                    Search
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomView("gif")}
                    className="flex flex-col items-center gap-2 rounded-lg border-2 border-gray-200 p-3 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  >
                    <ImageIcon className="w-5 h-5" />
                    GIF
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportProviderOpen("google-drive")}
                    className="flex flex-col items-center gap-2 rounded-lg border-2 border-gray-200 p-3 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 52H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
                      <path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 47.5A9 9 0 000 52h27.5z" fill="#00ac47" />
                      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.65 9.2z" fill="#ea4335" />
                      <path d="M43.65 25L57.4 0H29.9z" fill="#00832d" />
                      <path d="M59.8 52h27.5L73.55 28c-.8-1.4-1.95-2.5-3.3-3.3L57.4 0 43.65 25z" fill="#2684fc" />
                      <path d="M27.5 52L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L59.8 52z" fill="#ffba00" />
                    </svg>
                    Google Drive
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportProviderOpen("microsoft-onedrive")}
                    className="flex flex-col items-center gap-2 rounded-lg border-2 border-gray-200 p-3 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M10.5 18.5v-13l3 1.5v10z" fill="#0364B8" />
                      <path d="M14.5 7 20 10v7l-5.5-3.5z" fill="#0078D4" />
                      <path d="M4 10l6.5-3 3 1.5L7 12z" fill="#1490DF" />
                      <path d="M4 10v7l6.5 1.5V11.5z" fill="#28A8E8" />
                    </svg>
                    OneDrive
                  </button>
                </div>
              )}

              {customView === "search" && (
                <div className="flex flex-col gap-3 p-2">
                  <form onSubmit={handleSearch} className="flex gap-2">
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search free photos..."
                      className="flex-1"
                    />
                    <Button type="submit" disabled={searchLoading}>
                      {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                    </Button>
                  </form>
                  <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                    {searchResults.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => handleIconSelect(photo.src.medium)}
                        className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-purple-400"
                      >
                        <img src={photo.src.medium} alt={photo.alt} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <Button type="button" variant="outline" onClick={() => setCustomView("menu")}>
                    Back
                  </Button>
                </div>
              )}

              {customView === "gif" && (
                <div className="flex flex-col gap-3 p-2">
                  <form onSubmit={handleGifSearch} className="flex gap-2">
                    <Input
                      value={gifQuery}
                      onChange={(e) => setGifQuery(e.target.value)}
                      placeholder="Search GIFs..."
                      className="flex-1"
                    />
                    <Button type="submit" disabled={gifLoading}>
                      {gifLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                    </Button>
                  </form>
                  <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                    {gifResults.map((gif) => (
                      <button
                        key={gif.id}
                        type="button"
                        onClick={() => handleIconSelect(gif.images.original.url)}
                        className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-purple-400"
                      >
                        <img src={gif.images.fixed_width.url} alt={gif.title} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <Button type="button" variant="outline" onClick={() => setCustomView("menu")}>
                    Back
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link entry dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="z-[4160]">
          <DialogHeader>
            <DialogTitle>Enter image link</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Paste image link here"
              onKeyDown={(e) => e.key === "Enter" && handleLinkSubmit()}
            />
            <Button onClick={handleLinkSubmit} disabled={!linkUrl.trim()}>
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImportsDialog
        isOpen={importProviderOpen !== null}
        initialProvider={importProviderOpen}
        onClose={() => setImportProviderOpen(null)}
        onImportResolved={handleImportedIcon}
      />
    </>
  );
};

export default IconSelector;
