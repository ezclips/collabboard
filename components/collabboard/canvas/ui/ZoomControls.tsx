"use client";

interface ZoomControlsProps {
  canvasZoom: number;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
  handleZoomIn: () => void;
  className?: string;
}

export default function ZoomControls({
  canvasZoom,
  handleZoomOut,
  handleZoomReset,
  handleZoomIn,
  className,
}: ZoomControlsProps) {
  return (
    <div className={className ?? "absolute bottom-6 right-6 z-50 flex items-center bg-white rounded-lg shadow-md border border-gray-200 pointer-events-auto"}>
      <button
        onClick={handleZoomOut}
        className="p-2 hover:bg-gray-100 text-gray-600 rounded-l-lg transition-colors border-r border-gray-100"
        title="Zoom out"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button
        onClick={handleZoomReset}
        className="px-3 py-2 hover:bg-gray-100 text-gray-600 font-mono text-xs font-medium transition-colors min-w-[3rem] text-center"
        title="Reset zoom"
      >
        {Math.round(canvasZoom * 100)}%
      </button>
      <button
        onClick={handleZoomIn}
        className="p-2 hover:bg-gray-100 text-gray-600 rounded-r-lg transition-colors border-l border-gray-100"
        title="Zoom in"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    </div>
  );
}
