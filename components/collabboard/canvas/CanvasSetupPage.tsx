"use client"

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  ArrowLeft,
  Loader2,
  Plus,
  Edit2,
  Trash2,
  MoveLeft,
  MoveRight,
  MoreVertical,
  ArrowRight,
  PenTool,
  Layers3,      // For Wall layout
  Columns3,     // For Columns layout
  Grid3X3,      // For Grid layout
  Clock,        // For Timeline layout
  Sparkles,     // For Freeform layout
  Map,          // For Map layout
  Kanban,       // For Kanban layout
  GanttChart,   // For Gantt layout
  CalendarDays  // For Scheduler layout
} from "lucide-react";

// Imports
import IconSelector from "@/components/collabboard/canvas/IconSelector";
import WallpaperSelector from "@/components/collabboard/canvas/WallpaperSelector";
import type { LayoutType } from "@/components/collabboard/settings/types";
import { supabaseBrowser } from '@/lib/supabase/browser';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';
import {
  canCreateBoardForEntitlements,
  getWorkspaceEntitlements,
} from '@/lib/auth/permissions';
// import { TimelinePreview } from '@/lib/collabboard/layouts/TimelineLayout';
// import { TablePreview } from '@/lib/collabboard/layouts/TableLayout';
// import { ColumnsPreview } from '@/lib/collabboard/layouts/ColumnsLayout';
// import { GridPreview } from '@/lib/collabboard/layouts/GridLayout';
// import { WallPreview } from '@/lib/collabboard/layouts/WallLayout';
// import { StreamPreview } from '@/lib/collabboard/layouts/StreamLayout';
// import { FreeformPreview } from '@/lib/collabboard/layouts/FreeformLayout';
// import { MapPreview } from '@/lib/collabboard/layouts/MapLayout';


// Types
interface WallpaperSelection {
  type: 'color' | 'gradient' | 'image';
  value: string;
}

interface Padlet {
  id: string;
  title: string;
  content: string;
  board_id?: string;
}

interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

// Padlet Editor Modal
const PadletEditorModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; content: string }) => void;
  padlet: Padlet | null;
}> = ({ isOpen, onClose, onSave, padlet }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (padlet) {
      setTitle(padlet.title);
      setContent(padlet.content);
    } else {
      setTitle('');
      setContent('');
    }
  }, [padlet]);

  const handleSave = () => {
    if (title.trim() || content.trim()) {
      onSave({ title: title.trim(), content: content.trim() });
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-xl">
        <DialogHeader className="bg-white/90 rounded-t-lg p-4">
          <DialogTitle className="text-gray-900">{padlet ? 'Edit Post' : 'Create New Post'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-4 bg-white/90">
          <div>
            <Label htmlFor="padlet-title" className="text-gray-900">Title</Label>
            <Input
              id="padlet-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title"
              onKeyDown={handleKeyDown}
              className="bg-white border-gray-300"
            />
          </div>
          <div>
            <Label htmlFor="padlet-content" className="text-gray-900">Content</Label>
            <textarea
              id="padlet-content"
              className="w-full p-2 border border-gray-300 rounded-md resize-none h-24 bg-white"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter content"
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!title.trim() && !content.trim()}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// VISUAL KANBAN PREVIEW COMPONENT
// ============================================================================
// A lightweight structural representation of a Kanban board for the format selection preview
// We use generic layout blocks and don't import DHTMLX to keep this page fast.
const KanbanPreview: React.FC = () => {
  return (
    <div className="w-full h-full min-h-[500px] bg-slate-100 p-6 rounded-lg overflow-x-auto overflow-y-hidden flex gap-4">
      {/* Column 1: To Do */}
      <div className="w-72 flex-shrink-0 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col h-full max-h-full">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">To Do</h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">3</span>
        </div>
        <div className="p-3 flex-1 overflow-y-auto space-y-3">
          <div className="bg-white border text-center border-slate-200 p-3 rounded shadow-sm hover:shadow transition-shadow cursor-pointer">
            <div className="w-10 h-1 bg-red-400 rounded-full mb-2"></div>
            <p className="text-sm font-medium text-slate-800">Draft Project Proposal</p>
            <p className="text-xs text-slate-500 mt-1 mt-2">Due tomorrow</p>
          </div>
          <div className="bg-white border text-center border-slate-200 p-3 rounded shadow-sm hover:shadow transition-shadow cursor-pointer">
            <div className="w-10 h-1 bg-yellow-400 rounded-full mb-2"></div>
            <p className="text-sm font-medium text-slate-800">Review Budget Estimates</p>
            <p className="text-xs text-slate-500 mt-1 mt-2">3 comments</p>
          </div>
          <div className="bg-white border text-center border-slate-200 p-3 rounded shadow-sm hover:shadow transition-shadow cursor-pointer">
            <div className="w-10 h-1 bg-blue-400 rounded-full mb-2"></div>
            <p className="text-sm font-medium text-slate-800">Client Kickoff Meeting Setup</p>
          </div>
        </div>
      </div>

      {/* Column 2: In Progress */}
      <div className="w-72 flex-shrink-0 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col h-full max-h-full">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">In Progress</h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">2</span>
        </div>
        <div className="p-3 flex-1 overflow-y-auto space-y-3">
          <div className="bg-white border text-center border-slate-200 p-3 rounded shadow-sm hover:shadow-md ring-2 ring-blue-400 transition-all cursor-grab relative -rotate-2 scale-105 z-10 z-10">
            <div className="w-10 h-1 bg-green-400 rounded-full mb-2"></div>
            <p className="text-sm font-medium text-slate-800">Design System Architecture</p>
            <p className="text-xs text-slate-500 mt-1 mt-2">In progress • 60%</p>
          </div>
          <div className="bg-white border text-center border-slate-200 p-3 rounded shadow-sm hover:shadow transition-shadow cursor-pointer">
            <div className="w-10 h-1 bg-purple-400 rounded-full mb-2"></div>
            <p className="text-sm font-medium text-slate-800">Create Initial Wireframes</p>
          </div>
        </div>
      </div>

      {/* Column 3: Review */}
      <div className="w-72 flex-shrink-0 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col h-full max-h-full opacity-70">
        <div className="p-3 flex items-center justify-between border-b border-slate-200 border-dashed">
          <h3 className="font-semibold text-slate-500">Review (Drop Target)</h3>
        </div>
        <div className="p-3 flex-1 border-2 border-dashed border-blue-200 bg-blue-50/50 m-2 rounded-lg flex items-center justify-center">
          <span className="text-sm text-blue-400 font-medium">Drop card here</span>
        </div>
      </div>

      {/* Column 4: Done */}
      <div className="w-72 flex-shrink-0 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col h-full max-h-full">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">Done</h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">1</span>
        </div>
        <div className="p-3 flex-1 overflow-y-auto space-y-3">
          <div className="bg-slate-50 border text-center border-slate-200 p-3 rounded shadow-sm cursor-default">
            <div className="w-10 h-1 bg-slate-400 rounded-full mb-2"></div>
            <p className="text-sm font-medium text-slate-500 line-through">Project Discovery Phase</p>
          </div>
        </div>
      </div>

      {/* Add Column Button */}
      <div className="w-16 flex-shrink-0 bg-slate-200/50 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors h-16 mt-0">
        <Plus className="text-slate-400 w-6 h-6" />
      </div>

    </div>
  );
};

// ============================================================================
// VISUAL GANTT PREVIEW COMPONENT
// ============================================================================
// A lightweight structural representation of a Gantt chart for the format selection preview
const GanttPreview: React.FC = () => {
  return (
    <div className="w-full h-full min-h-[500px] bg-slate-50 p-6 rounded-lg overflow-x-auto flex flex-col gap-0 border border-slate-200 shadow-inner overflow-hidden">

      {/* Header Row (Timeline months/weeks) */}
      <div className="flex border-b border-slate-300 bg-slate-100 flex-shrink-0">
        <div className="w-64 flex-shrink-0 border-r border-slate-300 p-3 font-semibold text-slate-600 text-sm flex items-end">
          Task Name
        </div>
        <div className="flex-1 flex min-w-[600px]">
          {/* Month/Week Headers */}
          {['May', 'June', 'July', 'August'].map((month, i) => (
            <div key={i} className="flex-1 border-r border-slate-200">
              <div className="text-center text-xs font-semibold text-slate-500 p-1 border-b border-slate-200 bg-slate-200/50">{month}</div>
              <div className="flex text-[10px] text-slate-400">
                <div className="flex-1 text-center p-1 border-r border-slate-100">W1</div>
                <div className="flex-1 text-center p-1 border-r border-slate-100">W2</div>
                <div className="flex-1 text-center p-1 border-r border-slate-100">W3</div>
                <div className="flex-1 text-center p-1">W4</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid Area with Tasks */}
      <div className="flex-1 flex overflow-y-auto relative bg-white">

        {/* Left Column: Task Names */}
        <div className="w-64 flex-shrink-0 border-r border-slate-300 bg-white z-10 flex flex-col">
          <div className="h-12 border-b border-slate-100 p-3 text-sm text-slate-800 font-medium flex items-center hover:bg-slate-50">1. Project Kickoff</div>
          <div className="h-12 border-b border-slate-100 p-3 text-sm text-slate-600 pl-8 flex items-center hover:bg-slate-50">1.1 Requirements Gathering</div>
          <div className="h-12 border-b border-slate-100 p-3 text-sm text-slate-600 pl-8 flex items-center hover:bg-slate-50">1.2 Design Architecture</div>
          <div className="h-12 border-b border-slate-100 p-3 text-sm text-slate-800 font-medium flex items-center hover:bg-slate-50">2. Development Phase</div>
          <div className="h-12 border-b border-slate-100 p-3 text-sm text-slate-600 pl-8 flex items-center hover:bg-slate-50">2.1 Frontend Implementation</div>
          <div className="h-12 border-b border-slate-100 p-3 text-sm text-slate-600 pl-8 flex items-center hover:bg-slate-50">2.2 Backend API</div>
          <div className="h-12 border-b border-slate-100 p-3 text-sm text-slate-800 font-medium flex items-center hover:bg-slate-50">3. Testing & QA</div>
        </div>

        {/* Right Column: The Gantt Grid and Bars */}
        <div className="flex-1 min-w-[600px] relative bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNSUiIGhlaWdodD0iMTAwJSI+PGxpbmUgeDE9IjAlIiB5MT0iMCIgeDI9IjAlIiB5Mj0iMTAwJSIgc3Ryb2tlPSIjZTJlOGYwIiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4=')]">

          {/* Row 1: Project Kickoff (Milestone/Parent) */}
          <div className="h-12 border-b border-slate-100 relative group">
            <div className="absolute left-[5%] right-[70%] top-[30%] bottom-[30%] bg-blue-500/20 border-b border-t border-blue-500"></div>
            {/* Parent bracket aesthetics */}
            <div className="absolute left-[5%] top-[70%] bottom-[10%] w-1 bg-blue-500"></div>
            <div className="absolute right-[70%] top-[70%] bottom-[10%] w-1 bg-blue-500"></div>
          </div>

          {/* Row 2: Requirements */}
          <div className="h-12 border-b border-slate-100 relative group">
            <div className="absolute left-[5%] right-[85%] top-[20%] bottom-[20%] bg-blue-400 rounded cursor-pointer shadow-sm hover:bg-blue-500 transition-colors flex items-center px-2">
              <span className="text-[10px] text-white font-medium truncate">Reqs</span>
            </div>
          </div>

          {/* Row 3: Architecture */}
          <div className="h-12 border-b border-slate-100 relative group">
            <div className="absolute left-[15%] right-[70%] top-[20%] bottom-[20%] bg-blue-400 rounded cursor-pointer shadow-sm hover:bg-blue-500 transition-colors flex items-center px-2">
              <span className="text-[10px] text-white font-medium truncate">Arch</span>
            </div>
            {/* Dependency line from Row 2 to Row 3 */}
            <svg className="absolute top-[-24px] left-[15%] w-6 h-12 overflow-visible" style={{ pointerEvents: 'none' }}>
              <path d="M -5 6 L 5 6 L 5 30 L 10 30" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
              <polygon points="10,27 15,30 10,33" fill="#94a3b8" />
            </svg>
          </div>

          {/* Row 4: Development Phase */}
          <div className="h-12 border-b border-slate-100 relative group">
            <div className="absolute left-[30%] right-[20%] top-[30%] bottom-[30%] bg-purple-500/20 border-b border-t border-purple-500"></div>
            <div className="absolute left-[30%] top-[70%] bottom-[10%] w-1 bg-purple-500"></div>
            <div className="absolute right-[20%] top-[70%] bottom-[10%] w-1 bg-purple-500"></div>
          </div>

          {/* Row 5: Frontend */}
          <div className="h-12 border-b border-slate-100 relative group">
            <div className="absolute left-[30%] right-[40%] top-[20%] bottom-[20%] bg-purple-400 rounded cursor-pointer shadow-sm hover:bg-purple-500 transition-colors flex items-center px-2">
              <div className="h-full bg-purple-600 rounded-l absolute left-0 top-0 bottom-0 w-[40%] opacity-50"></div>
              <span className="text-[10px] text-white font-medium truncate z-10">40%</span>
            </div>
          </div>

          {/* Row 6: Backend */}
          <div className="h-12 border-b border-slate-100 relative group">
            <div className="absolute left-[30%] right-[30%] top-[20%] bottom-[20%] bg-purple-400 rounded cursor-pointer shadow-sm hover:bg-purple-500 transition-colors flex items-center px-2">
              <div className="h-full bg-purple-600 rounded-l absolute left-0 top-0 bottom-0 w-[80%] opacity-50"></div>
              <span className="text-[10px] text-white font-medium truncate z-10">80%</span>
            </div>
          </div>

          {/* Row 7: Testing */}
          <div className="h-12 border-b border-slate-100 relative group">
            {/* Milestone Diamond */}
            <div className="absolute left-[80%] top-[25%] w-6 h-6 bg-red-500 rotate-45 cursor-pointer hover:bg-red-600 transition-colors shadow"></div>
            {/* Dependency line from Row 6 to Milestone */}
            <svg className="absolute top-[-24px] left-[70%] w-[10%] h-12 overflow-visible" style={{ pointerEvents: 'none' }}>
              <path d="M 0 6 L 10 6 L 10 42 L 30 42" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
              <polygon points="30,39 35,42 30,45" fill="#94a3b8" />
            </svg>
          </div>

          {/* Today Line */}
          <div className="absolute top-0 bottom-0 left-[45%] w-px bg-red-400 z-0">
            <div className="absolute top-0 -left-2 bg-red-400 text-white text-[8px] px-1 rounded-sm">Today</div>
          </div>
        </div>
      </div>

    </div>
  );
};

// ============================================================================
// VISUAL COLUMNS PREVIEW COMPONENT
// ============================================================================
// A lightweight structural representation of a Columns board for the format selection preview
const ColumnsPreview: React.FC = () => {
  return (
    <div className="w-full h-full min-h-[500px] bg-slate-50 p-6 rounded-lg overflow-x-auto overflow-y-hidden flex gap-4">

      {/* Column 1 */}
      <div className="w-80 flex-shrink-0 bg-slate-200/50 rounded-lg flex flex-col h-full max-h-full">
        <div className="p-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm">Attachment</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">1</span>
            <MoreVertical className="w-4 h-4 text-slate-500" />
          </div>
        </div>
        <div className="px-2 pb-2 flex-1 overflow-y-auto space-y-2">
          {/* Padlet Card */}
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200">
            <h4 className="font-medium text-sm text-slate-800 mb-2">Map of Berlin</h4>
            <div className="h-16 border rounded bg-slate-50 flex items-center justify-center border-l-4 border-l-orange-500 text-xs text-slate-500">
              Image of a map
            </div>
          </div>
        </div>
        {/* Add Post Button Placeholder */}
        <div className="p-2 flex justify-center text-slate-400 hover:text-slate-600 cursor-pointer">
          <Plus className="w-5 h-5" />
        </div>
      </div>

      {/* Column 2 */}
      <div className="w-80 flex-shrink-0 bg-slate-200/50 rounded-lg flex flex-col h-full max-h-full">
        <div className="p-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm">Body</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">1</span>
            <MoreVertical className="w-4 h-4 text-slate-500" />
          </div>
        </div>
        <div className="px-2 pb-2 flex-1 overflow-y-auto space-y-2">
          {/* Padlet Card */}
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200">
            <h4 className="font-medium text-sm text-slate-800 mb-2">xcfasdcacasca</h4>
            <div className="h-16 border rounded bg-slate-50 flex items-center justify-center border-l-4 border-l-orange-500 text-xs text-slate-500">
              Some details here.
            </div>
          </div>
        </div>
        <div className="p-2 flex justify-center text-slate-400 hover:text-slate-600 cursor-pointer">
          <Plus className="w-5 h-5" />
        </div>
      </div>

      {/* Column 3 */}
      <div className="w-80 flex-shrink-0 bg-slate-200/50 rounded-lg flex flex-col h-full max-h-full">
        <div className="p-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-700 text-sm">Testing</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">1</span>
            <MoreVertical className="w-4 h-4 text-slate-500" />
          </div>
        </div>
        <div className="px-2 pb-2 flex-1 overflow-y-auto space-y-2">
          {/* Padlet Card */}
          <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200">
            <h4 className="font-medium text-sm text-slate-800 mb-2">sdsdsdsd</h4>
            <div className="h-16 border rounded bg-slate-50 flex items-center justify-center border-l-4 border-l-orange-500 text-xs text-slate-500">
              More details.
            </div>
          </div>
        </div>
        <div className="p-2 flex justify-center text-slate-400 hover:text-slate-600 cursor-pointer">
          <Plus className="w-5 h-5" />
        </div>
      </div>

      {/* Add Column Button */}
      <div className="w-80 flex-shrink-0 rounded-lg flex items-center justify-center cursor-pointer h-32 self-center border-2 border-dashed border-slate-300 text-slate-500 hover:text-blue-500 hover:border-blue-300 transition-colors">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Plus className="w-4 h-4" /> Add Column
        </div>
      </div>

    </div>
  );
};


// ============================================================================
// VISUAL TABLE PREVIEW COMPONENT
// ============================================================================
const TablePreview: React.FC = () => (
  <div className="w-full h-full min-h-[500px] bg-white p-6 rounded-lg border border-slate-200 overflow-hidden shadow-sm">
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-4 bg-slate-50 border-b border-slate-200 font-medium text-sm text-slate-600">
        <div className="p-3 border-r border-slate-200">Task Name</div>
        <div className="p-3 border-r border-slate-200">Status</div>
        <div className="p-3 border-r border-slate-200">Assignee</div>
        <div className="p-3">Due Date</div>
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="grid grid-cols-4 border-b border-slate-100 hover:bg-slate-50">
          <div className="p-3 border-r border-slate-100 text-sm text-slate-800">Task {i} Description</div>
          <div className="p-3 border-r border-slate-100 text-sm"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-[10px] font-medium">In Progress</span></div>
          <div className="p-3 border-r border-slate-100 text-sm flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-slate-200"></div> User {i}</div>
          <div className="p-3 text-sm text-slate-500">Oct {i + 10}, 2023</div>
        </div>
      ))}
    </div>
  </div>
);

// ============================================================================
// VISUAL DRAWING PREVIEW COMPONENT
// ============================================================================
const DrawingPreview: React.FC = () => (
  <div className="w-full h-full min-h-[500px] bg-slate-50 p-6 rounded-lg border border-slate-200 shadow-inner relative overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]">
    {/* A faux "drawing" representation */}
    {/* Drawn rectangle */}
    <div className="absolute top-[20%] left-[20%] w-32 h-24 border-2 border-indigo-500 rounded-sm bg-indigo-50/50 shadow-sm flex items-center justify-center font-hand text-indigo-700 transform -rotate-2">
      Wireframe
    </div>
    {/* Drawn circle */}
    <div className="absolute top-[50%] right-[30%] w-24 h-24 border-2 border-green-500 rounded-full bg-green-50/50 shadow-sm flex items-center justify-center font-hand text-green-700 transform rotate-3">
      Idea
    </div>
    {/* Drawn Arrow (SVG) */}
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none stroke-slate-400 stroke-2" fill="none">
        <path d="M 270 170 Q 400 150 500 250" strokeDasharray="5,5" />
        <polygon points="500,250 490,240 495,255" fill="#94a3b8" />
    </svg>
    {/* Toolbar Mockup */}
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-md border border-slate-200 px-4 py-2 flex gap-3">
        <div className="w-6 h-6 rounded bg-slate-200 cursor-pointer hover:bg-slate-300"></div>
        <div className="w-6 h-6 rounded bg-blue-100 cursor-pointer hover:bg-blue-200 border border-blue-300"></div>
        <div className="w-6 h-6 rounded bg-slate-200 cursor-pointer hover:bg-slate-300"></div>
        <div className="w-px h-6 bg-slate-200 mx-1"></div>
        <div className="w-4 h-4 rounded-full bg-red-500 self-center"></div>
        <div className="w-4 h-4 rounded-full bg-blue-500 self-center"></div>
        <div className="w-4 h-4 rounded-full bg-emerald-500 self-center"></div>
    </div>
  </div>
);

// ============================================================================
// VISUAL GRID PREVIEW COMPONENT
// ============================================================================
const GridPreview: React.FC = () => (
  <div className="w-full h-full min-h-[500px] bg-slate-100 p-6 rounded-lg overflow-auto shadow-inner">
    <div className="grid grid-cols-3 gap-4">
      {[...Array(9)].map((_, i) => (
        <div key={i} className="bg-white aspect-square rounded-lg border border-slate-200 shadow-sm p-4 flex flex-col items-center justify-center gap-3 hover:shadow-md transition-shadow cursor-default">
          <div className={`w-16 h-16 rounded-lg ${['bg-blue-100', 'bg-green-100', 'bg-purple-100', 'bg-red-100', 'bg-orange-100', 'bg-yellow-100', 'bg-teal-100', 'bg-cyan-100', 'bg-indigo-100'][i]}`}></div>
          <div className="h-2 w-16 bg-slate-200 rounded"></div>
          <div className="h-2 w-24 bg-slate-100 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

// ============================================================================
// VISUAL WALL PREVIEW COMPONENT
// ============================================================================
const WallPreview: React.FC = () => (
  <div className="w-full h-full min-h-[500px] bg-slate-100 p-6 rounded-lg overflow-auto shadow-inner">
    <div className="columns-3 gap-4 space-y-4">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 break-inside-avoid hover:-translate-y-1 transition-transform cursor-pointer">
          <div className={`w-full rounded bg-slate-100 mb-3`} style={{ height: `${100 + (i % 3) * 60}px` }}></div>
          <div className="h-3 w-3/4 bg-slate-200 rounded mb-2"></div>
          <div className="h-2 w-full bg-slate-100 rounded mb-1"></div>
          <div className="h-2 w-5/6 bg-slate-100 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

// ============================================================================
// VISUAL TIMELINE PREVIEW COMPONENT
// ============================================================================
const TimelinePreview: React.FC = () => (
  <div className="w-full h-full min-h-[500px] bg-slate-50 p-12 rounded-lg overflow-x-auto flex items-center shadow-inner relative">
    <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-300 -translate-y-1/2"></div>
    <div className="flex gap-16 relative z-10 w-full min-w-max px-12">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={`flex flex-col items-center w-64 ${i % 2 === 0 ? 'mt-32' : '-mt-32'}`}>
          {i % 2 !== 0 && (
            <div className="bg-white p-4 rounded-lg shadow-md border border-slate-200 mb-4 w-full">
              <div className="text-xs text-blue-500 font-bold mb-1">2023 Q{i}</div>
              <div className="h-3 w-3/4 bg-slate-200 rounded mb-2"></div>
              <div className="h-2 w-full bg-slate-100 rounded"></div>
            </div>
          )}
          <div className="w-6 h-6 rounded-full bg-slate-400 border-4 border-slate-50 shadow-sm z-10"></div>
          {i % 2 === 0 && (
            <div className="bg-white p-4 rounded-lg shadow-md border border-slate-200 mt-4 w-full">
              <div className="text-xs text-blue-500 font-bold mb-1">2023 Q{i}</div>
              <div className="h-3 w-3/4 bg-slate-200 rounded mb-2"></div>
              <div className="h-2 w-full bg-slate-100 rounded"></div>
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

// ============================================================================
// VISUAL FREEFORM PREVIEW COMPONENT
// ============================================================================
const FreeformPreview: React.FC = () => (
  <div className="w-full h-full min-h-[500px] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiNlMmU4ZjAiLz48L3N2Zz4=')] bg-slate-50 p-6 rounded-lg overflow-hidden shadow-inner relative">
    <div className="absolute top-[20%] left-[10%] bg-yellow-50 p-4 rounded shadow-md border border-yellow-200 rotate-[-3deg] w-48 cursor-grab">
      <div className="h-3 w-2/3 bg-yellow-200 rounded mb-2"></div>
      <div className="h-2 w-full bg-yellow-100 rounded mb-1"></div>
      <div className="h-2 w-4/5 bg-yellow-100 rounded"></div>
    </div>
    <div className="absolute top-[40%] left-[40%] bg-blue-50 p-4 rounded-lg shadow-md border border-blue-200 w-64 hover:shadow-lg transition-shadow">
      <div className="w-full h-32 bg-blue-100/50 rounded mb-3 flex items-center justify-center text-blue-300">Image Element</div>
      <div className="h-3 w-1/2 bg-blue-200 rounded mb-2"></div>
    </div>
    <div className="absolute top-[15%] right-[20%] bg-white p-4 rounded-2xl shadow-lg border border-slate-200 w-56 rotate-[2deg] hover:scale-105 transition-transform">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-purple-100"></div>
        <div className="h-3 w-24 bg-slate-200 rounded"></div>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded mb-1"></div>
      <div className="h-2 w-full bg-slate-100 rounded mb-1"></div>
      <div className="h-2 w-3/4 bg-slate-100 rounded"></div>
    </div>
  </div>
);

// ============================================================================
// VISUAL MAP PREVIEW COMPONENT
// ============================================================================
const MapPreview: React.FC = () => (
  <div className="w-full h-full min-h-[500px] bg-slate-50 p-6 rounded-lg overflow-hidden shadow-inner relative flex items-center justify-center">
    {/* SVG Connections */}
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
      <path d="M 50% 50% Q 30% 30% 25% 25%" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M 50% 50% Q 70% 30% 75% 25%" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M 50% 50% Q 30% 70% 25% 75%" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M 50% 50% Q 70% 70% 75% 75%" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" />
    </svg>
    {/* Central Node */}
    <div className="absolute z-10 bg-white border-2 border-indigo-400 rounded-full w-32 h-32 flex items-center justify-center shadow-lg font-bold text-slate-700 hover:scale-105 transition-transform cursor-pointer">Central Idea</div>
    {/* Child Nodes */}
    <div className="absolute top-[15%] left-[15%] z-10 bg-white border border-slate-200 rounded-lg p-3 shadow-md w-32 text-center text-sm font-medium text-slate-600 hover:border-indigo-300 transition-colors cursor-pointer">Subtopic 1</div>
    <div className="absolute top-[15%] right-[15%] z-10 bg-white border border-slate-200 rounded-lg p-3 shadow-md w-32 text-center text-sm font-medium text-slate-600 hover:border-indigo-300 transition-colors cursor-pointer">Subtopic 2</div>
    <div className="absolute bottom-[15%] left-[15%] z-10 bg-white border border-slate-200 rounded-lg p-3 shadow-md w-32 text-center text-sm font-medium text-slate-600 hover:border-indigo-300 transition-colors cursor-pointer">Subtopic 3</div>
    <div className="absolute bottom-[15%] right-[15%] z-10 bg-white border border-slate-200 rounded-lg p-3 shadow-md w-32 text-center text-sm font-medium text-slate-600 hover:border-indigo-300 transition-colors cursor-pointer">Subtopic 4</div>
  </div>
);


// Layout Selection Modal Component
const LayoutSelectionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  selectedLayout: LayoutType;
  onSelect: (layout: LayoutType) => void;
  columns: ColumnData[];
  newPostsAtTop: boolean;
  onPreviewEdit: (padlet: Padlet | null, columnId?: string) => void;
  onPreviewAddPost: (columnId: string) => void;
  onPreviewRename: (columnId: string, newTitle: string) => void;
  onPreviewDelete: (columnId: string) => void;
  onPreviewMove: (columnId: string, direction: 'left' | 'right') => void;
  onPreviewAddSection: (baseColumnId?: string, direction?: 'left' | 'right') => void;
  layoutTypes: any[];
}> = ({
  isOpen,
  onClose,
  selectedLayout,
  onSelect,
  columns,
  newPostsAtTop,
  onPreviewEdit,
  onPreviewAddPost,
  onPreviewRename,
  onPreviewDelete,
  onPreviewMove,
  onPreviewAddSection,
  layoutTypes
}) => {
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [previewingLayout, setPreviewingLayout] = useState<LayoutType | null>(null);

    const handlePreview = (layoutType: LayoutType) => {
      setPreviewingLayout(layoutType);
      setPreviewModalOpen(true);
    };

    const handleSelectFromPreview = (layoutType: LayoutType) => {
      onSelect(layoutType);
      setPreviewModalOpen(false);
      onClose();
    };

    return (
      <>
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="!max-w-[85vw] !w-[1200px] max-h-[95vh] bg-white/95 backdrop-blur-md border border-gray-200 shadow-xl" style={{ maxWidth: '85vw', width: '1200px' }}>
            <DialogHeader className="bg-white/90 rounded-t-lg p-6">
              <DialogTitle className="text-gray-900 text-xl">Choose a format</DialogTitle>
              <DialogDescription className="text-gray-600 text-base">
                Select the layout that best fits your content organization needs. Click Preview to see how it works.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-4 gap-4 p-6 bg-white/90 max-h-[70vh] overflow-y-auto">
              {layoutTypes.map((layoutOption) => {
                const IconComponent = layoutOption.icon;
                if (!IconComponent) {
                  console.error(`Icon is missing for layout type: ${layoutOption.id}`);
                  return null; // or a placeholder component
                }
                const isSelected = selectedLayout === layoutOption.id;

                return (
                  <div
                    key={layoutOption.id}
                    className="border rounded-lg p-4 space-y-3 transition-all bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-center text-3xl mb-3">
                      <IconComponent size={40} className="text-gray-600" />
                    </div>

                    <div className="text-center">
                      <h3 className="font-semibold text-base mb-2 text-gray-900">{layoutOption.name}</h3>
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{layoutOption.description}</p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 h-8 text-sm"
                        onClick={() => {
                          onSelect(layoutOption.id);
                          onClose();
                        }}
                      >
                        Select
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 h-8 text-sm"
                        onClick={() => handlePreview(layoutOption.id)}
                      >
                        Preview
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        {/* Preview Modal */}
        <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
          <DialogContent className="!max-w-[99vw] !w-[1800px] max-h-[99vh] overflow-hidden bg-white/95 backdrop-blur-md flex flex-col" style={{ maxWidth: '99vw', width: '1800px' }}>
            {/* Fixed Header */}
            <DialogHeader className="flex-shrink-0 p-6 border-b bg-white/90">
              <div>
                <DialogTitle className="text-gray-900 text-2xl">
                  Preview: {layoutTypes.find(l => l.id === previewingLayout)?.name || 'Layout'}
                </DialogTitle>
                <p className="text-gray-600 text-base mt-2">
                  {layoutTypes.find(l => l.id === previewingLayout)?.description}
                </p>
              </div>
            </DialogHeader>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-auto p-6 bg-gray-50 min-h-0">
              {previewingLayout === 'columns' ? (
                <ColumnsPreview />
              ) : (previewingLayout as string) === 'drawing' ? (
                <DrawingPreview />
              ) : previewingLayout === 'timeline' ? (
                <TimelinePreview />
              ) : previewingLayout === 'grid' ? (
                <GridPreview />
              ) : previewingLayout === 'wall' ? (
                <WallPreview />
              ) : previewingLayout === 'freeform' ? (
                <FreeformPreview />
              ) : previewingLayout === 'map' ? (
                <MapPreview />
              ) : previewingLayout === 'kanban' ? (
                <KanbanPreview />
              ) : previewingLayout === 'gantt' ? (
                <GanttPreview />
              ) : previewingLayout && (previewingLayout as string) !== 'columns' && (previewingLayout as string) !== 'timeline' && (previewingLayout as string) !== 'drawing' && (previewingLayout as string) !== 'grid' && (previewingLayout as string) !== 'wall' && (previewingLayout as string) !== 'stream' && (previewingLayout as string) !== 'freeform' && (previewingLayout as string) !== 'map' && (previewingLayout as string) !== 'kanban' && (previewingLayout as string) !== 'gantt' ? (
                <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
                  This layout does not have a specific preview.
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
                  Preview for {layoutTypes.find(l => l.id === previewingLayout)?.name} layout
                </div>
              )}
            </div>

            {/* Fixed Footer */}
            <div className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 border-t border-gray-200 bg-white">
              <div className="text-gray-600 flex-1 min-w-0">
                <p className="text-base font-medium text-gray-900 truncate">
                  {previewingLayout && layoutTypes.find(l => l.id === previewingLayout)?.name} Layout
                </p>
                <p className="text-sm mt-1 text-gray-600">
                  {previewingLayout === 'columns'
                    ? 'Interactive preview - click items to edit and use dropdown menus.'
                    : previewingLayout === 'timeline'
                      ? 'Interactive timeline - click items to edit and arrange chronologically.'
                      : 'Preview shows how content will be arranged with this layout.'
                  }
                </p>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <Button variant="outline" size="lg" onClick={() => setPreviewModalOpen(false)}>
                  Back to Selection
                </Button>
                <Button size="lg" onClick={() => previewingLayout && handleSelectFromPreview(previewingLayout)}>
                  Select This Layout
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  };

// Layout Section Component
const LayoutSection: React.FC<{
  selectedLayout: LayoutType;
  newPostsAtTop: boolean;
  setNewPostsAtTop: (value: boolean) => void;
  onOpenLayoutModal: () => void;
  layoutTypes: any[];
}> = ({ selectedLayout, newPostsAtTop, setNewPostsAtTop, onOpenLayoutModal, layoutTypes }) => {
  const selectedLayoutInfo = layoutTypes.find(l => l.id === selectedLayout);

  return (
    <Card className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg" suppressHydrationWarning>
      <CardHeader className="bg-white/90">
        <CardTitle className="text-gray-900">Layout</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 bg-white/90" suppressHydrationWarning>
        <div>
          <Label className="text-sm font-medium text-gray-900">Format</Label>
          <Button
            variant="outline"
            onClick={onOpenLayoutModal}
            className="w-full justify-between mt-2 h-12 bg-white border-gray-300"
          >
            <div className="flex items-center gap-3">
              {selectedLayoutInfo && selectedLayoutInfo.icon && React.createElement(selectedLayoutInfo.icon, { size: 20 })}
              <span className="text-gray-600">{selectedLayoutInfo?.name}</span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium text-gray-900">New Posts at Top</Label>
              <p className="text-xs text-gray-500">Place newest posts at the beginning</p>
            </div>
            <Switch checked={newPostsAtTop} onCheckedChange={setNewPostsAtTop} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Main Canvas Setup Component
interface CanvasSetupPageProps {
  onSave?: (canvasData: any) => Promise<void>;
  isCreating?: boolean;
  loadingProp?: boolean;
  initialData?: any;
}

const CanvasSetupPage: React.FC<CanvasSetupPageProps> = ({ onSave, isCreating, loadingProp, initialData }) => {
  const router = useRouter();
  // Cookie-authenticated client — see useCanvasData.ts for why this must match
  // supabaseBrowser() rather than the plain lib/supabase.ts singleton.
  const supabase = useMemo(() => supabaseBrowser(), []);

  // Authentication & Loading State
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [createBlockedMessage, setCreateBlockedMessage] = useState<string | null>(null);

  // Canvas Settings
  const [title, setTitle] = useState("My Canvas");
  const [description, setDescription] = useState("A collaborative workspace");
  const [selectedIcon, setSelectedIcon] = useState("🎨");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [selectedWallpaper, setSelectedWallpaper] = useState<WallpaperSelection>({
    type: 'color',
    value: '#ffffff'
  });
  const [newPostsAtTop, setNewPostsAtTop] = useState(true);
  const [layout, setLayout] = useState<LayoutType>('wall');

  // Modal States
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [wallpaperDialogOpen, setWallpaperDialogOpen] = useState(false);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPadlet, setEditingPadlet] = useState<Padlet | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null);

  // Create single deduplicated layoutTypes array
  const layoutTypes = useMemo(() => {
    const layouts = [
      {
        id: 'wall',
        name: 'Wall',
        description: 'Pinterest-style masonry layout',
        icon: Layers3
      },
      {
        id: 'columns',
        name: 'Columns',
        description: 'Kanban-style columns',
        icon: Columns3
      },
      {
        id: 'kanban',
        name: 'Kanban',
        description: 'Task management with drag-and-drop cards',
        icon: Kanban
      },
      {
        id: 'gantt',
        name: 'Gantt',
        description: 'Visualize tasks on a timeline with dependencies',
        icon: GanttChart
      },
      {
        id: 'scheduler',
        name: 'Scheduler',
        description: 'Interactive calendar and event scheduling layout',
        icon: CalendarDays
      },
      {
        id: 'grid',
        name: 'Grid',
        description: 'Uniform grid layout',
        icon: Grid3X3
      },
      {
        id: 'drawing',
        name: 'Drawing',
        description: 'Infinite whiteboard for freehand drawing',
        icon: PenTool
      },
      {
        id: 'timeline',
        name: 'Timeline',
        description: 'Chronological timeline',
        icon: Clock
      },
      {
        id: 'freeform',
        name: 'Freeform',
        description: 'Free positioning layout',
        icon: Sparkles
      },
      {
        id: 'map',
        name: 'Map',
        description: 'Mind map layout',
        icon: Map
      }
    ];
    console.log('Available layouts:', layouts.map(l => l.id)); // Debug log
    return layouts;
  }, []);

  // Sample data for preview and columns
  const [columns, setColumns] = useState<ColumnData[]>([
    {
      id: 'column-1',
      title: 'Attachment',
      items: [
        { id: 'item-1', title: 'Map of Berlin', content: 'Image of a map.' },
      ]
    },
    {
      id: 'column-2',
      title: 'Body',
      items: [
        { id: 'item-3', title: 'xcfasdcacasca', content: 'Some details here.' }
      ]
    },
    {
      id: 'column-3',
      title: 'Testing',
      items: [
        { id: 'item-4', title: 'sdsdsdsd', content: 'More details.' }
      ]
    }
  ]);

  // Get current user on mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Plan-limit check only matters when creating a new board; editing an
          // existing one shouldn't get blocked by an unrelated board-count limit.
          if (isCreating) {
            const workspaceContext = await resolveCurrentWorkspace(supabase, session.user);
            const entitlements = await getWorkspaceEntitlements(
              supabase,
              workspaceContext?.workspaceId,
            );
            let boardCountQuery = supabase
              .from('boards')
              .select('*', { count: 'exact', head: true });

            boardCountQuery = workspaceContext
              ? boardCountQuery.eq('workspace_id', workspaceContext.workspaceId)
              : boardCountQuery.eq('user_id', session.user.id);

            const { count: boardCount } = await boardCountQuery.is('deleted_at', null);
            if (!canCreateBoardForEntitlements(entitlements, boardCount ?? 0)) {
              setCreateBlockedMessage('Free plan allows up to 3 active boards. Upgrade to Pro to create more.');
            } else {
              setCreateBlockedMessage(null);
            }
          }

          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();

          setUser(profile || session.user);
        }
      } catch (error) {
        console.error('Error getting user:', error);
      }
    };

    getCurrentUser();
    setIsMounted(true);
  }, [isCreating]);

  // Prefill from initialData when editing an existing canvas
  useEffect(() => {
    if (!initialData) return;
    setTitle(initialData.title || 'My Canvas');
    setDescription(initialData.description || '');
    setSelectedIcon(initialData.thumbnail || '🎨');
    setCommentsEnabled(initialData.comments_enabled ?? true);
    setSelectedWallpaper({
      type: (initialData.background_type as WallpaperSelection['type']) || 'color',
      value: initialData.background_value || '#ffffff',
    });
    setNewPostsAtTop(initialData.new_posts_at_top ?? true);
    if (initialData.layout) setLayout(initialData.layout as LayoutType);
  }, [initialData]);

  // Supabase Save Function
  const handleSaveCanvas = async () => {
    setError(null);

    // Edit mode: delegate to the caller's boards-backed update instead of the
    // create-only insert flow below (which always inserts a brand-new board).
    if (!isCreating && onSave) {
      try {
        setLoading(true);
        await onSave({
          title: title.trim(),
          description: description.trim(),
          layout,
          background_type: selectedWallpaper.type,
          background_value: selectedWallpaper.value,
          comments_enabled: commentsEnabled,
          new_posts_at_top: newPostsAtTop,
          thumbnail: selectedIcon,
        });
      } catch (err: any) {
        console.error('Error updating canvas:', err);
        setError('Error: ' + (err?.message || 'Unknown error occurred'));
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      // 1. Check user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('🔍 User check:', { user, userError });

      if (userError) {
        console.error('❌ User error:', userError);
        setError('Authentication error: ' + userError.message);
        setLoading(false);
        return;
      }

      if (!user) {
        console.error('❌ No user found');
        setError('You must be logged in to save a canvas.');
        setLoading(false);
        return;
      }
      const workspaceContext = await resolveCurrentWorkspace(supabase, user);
      const entitlements = await getWorkspaceEntitlements(
        supabase,
        workspaceContext?.workspaceId,
      );

      let boardCountQuery = supabase
        .from('boards')
        .select('*', { count: 'exact', head: true });

      boardCountQuery = workspaceContext
        ? boardCountQuery.eq('workspace_id', workspaceContext.workspaceId)
        : boardCountQuery.eq('user_id', user.id);

      const { count: boardCount, error: boardCountError } = await boardCountQuery.is('deleted_at', null);
      if (boardCountError) {
        console.error('❌ Board count error:', boardCountError);
        setError('Failed to validate your current board limit.');
        setLoading(false);
        return;
      }

      if (!canCreateBoardForEntitlements(entitlements, boardCount ?? 0)) {
        setError('Free plan allows up to 3 active boards. Upgrade to Pro to create more.');
        setLoading(false);
        return;
      }

      // 2. Prepare canvas data
      const canvasData = {
        title: title.trim(),
        description: description.trim(),
        layout: layout,
        background_type: selectedWallpaper.type,
        background_value: selectedWallpaper.value,
        comments_enabled: commentsEnabled,
        new_posts_at_top: newPostsAtTop,
        reactions_enabled: true,
        user_id: user.id,
        workspace_id: workspaceContext?.workspaceId ?? null,
        thumbnail: selectedIcon,
      };

      console.log('🔍 Saving canvas:', canvasData);
      // 3. Insert canvas
      const { data, error: canvasError } = await supabase
        .from('boards')
        .insert(canvasData)
        .select()
        .single();
      console.log('🔍 Insert result:', { data, error: canvasError });
      if (canvasError) {
        console.error('❌ Canvas error:', canvasError);
        setError('Database error: ' + canvasError.message);
        setLoading(false);
        return;
      }
      if (!data) {
        console.error('❌ No data returned');
        setError('No data returned from save operation');
        setLoading(false);
        return;
      }
      console.log('✅ Canvas saved:', data);
      // 3b. Add creator as board member (required for RLS on comments/votes)
      await supabase.from('kanban_board_members').upsert({
        canvas_id: data.id,
        user_id: user.id,
        role: 'owner',
        permission_level: 'admin',
      }, { onConflict: 'canvas_id,user_id' });

      // 4a. For Gantt layout, seed default kanban columns so tasks can be assigned to stages
      if (layout === 'gantt') {
        const defaultStages = [
          { id: crypto.randomUUID(), name: 'To Do', order_index: 0 },
          { id: crypto.randomUUID(), name: 'In Progress', order_index: 1 },
          { id: crypto.randomUUID(), name: 'Done', order_index: 2 },
        ];
        const { error: stagesError } = await supabase.from('kanban_columns').insert(
          defaultStages.map((s) => ({
            id: s.id,
            canvas_id: data.id,
            name: s.name,
            order_index: s.order_index,
            task_limit: 0,
            is_collapsed: false,
          }))
        );
        if (stagesError) {
          console.error('❌ Gantt stages error:', stagesError);
          // Non-fatal — board is still usable without default stages
        } else {
          console.log('✅ Default stages created');
        }
      }

      // 4. Create sections if needed
      if (layout === 'columns' || layout === 'table') {
        console.log('🔍 Creating sections...');
        const sectionsToInsert = columns.map((column, index) => ({
          board_id: data.id,
          title: column.title,
          description: `Column ${index + 1}`,
          position: index + 1,
        }));
        const { error: sectionsError } = await supabase
          .from('board_sections')
          .insert(sectionsToInsert);
        if (sectionsError) {
          console.error('❌ Sections error:', sectionsError);
          setError('Error creating sections: ' + sectionsError.message);
          setLoading(false);
          return;
        }
        console.log('✅ Sections created');
      }
      console.log('✅ Canvas created successfully with ID:', data.id);
      router.push('/dashboard'); // Go back to dashboard instead
    } catch (err: any) {
      console.error('❌ Unexpected error:', err);
      setError('Error: ' + (err?.message || 'Unknown error occurred'));
    } finally {
      setLoading(false);
    }
  };

  // Event Handlers
  const handleWallpaperUpdate = (type: string, value: string) => {
    setSelectedWallpaper({
      type: type as WallpaperSelection['type'],
      value
    });
    setWallpaperDialogOpen(false);
  };

  const getCurrentBackground = (): React.CSSProperties => {
    if (selectedWallpaper.type === 'color') {
      return { backgroundColor: selectedWallpaper.value };
    }
    if (selectedWallpaper.type === 'gradient') {
      return { background: selectedWallpaper.value };
    }
    if (selectedWallpaper.value && selectedWallpaper.type === 'image') {
      return {
        backgroundImage: `url("${selectedWallpaper.value}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      };
    }
    return { backgroundColor: '#f3f4f6' };
  };

  // Column management functions
  const addColumn = (baseColumnId?: string, direction: 'left' | 'right' = 'right') => {
    const newColumn: ColumnData = {
      id: `col-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: "New Field",
      items: []
    };

    if (baseColumnId) {
      const baseIndex = columns.findIndex(col => col.id === baseColumnId);
      if (baseIndex === -1) return;

      const newIndex = direction === 'left' ? baseIndex : baseIndex + 1;
      const newColumns = [...columns];
      newColumns.splice(newIndex, 0, newColumn);
      setColumns(newColumns);
    } else {
      setColumns([...columns, newColumn]);
    }
  };

  const deleteColumn = (columnId: string) => {
    setColumns(columns.filter(col => col.id !== columnId));
  };

  const renameColumn = (columnId: string, newTitle: string) => {
    setColumns(columns.map(col =>
      col.id === columnId ? { ...col, title: newTitle } : col
    ));
  };

  const moveColumn = (columnId: string, direction: 'left' | 'right') => {
    const index = columns.findIndex(col => col.id === columnId);
    if (index === -1) return;

    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= columns.length) return;

    const newColumns = [...columns];
    const [removed] = newColumns.splice(index, 1);
    newColumns.splice(newIndex, 0, removed);
    setColumns(newColumns);
  };

  const handleOpenEditor = (padlet: Padlet | null, columnId?: string) => {
    setEditingPadlet(padlet);
    setTargetColumnId(columnId || null);
    setIsEditorOpen(true);
  };

  const handleAddPost = (columnId: string, rowIndex?: number) => {
    setEditingPadlet(null);
    setTargetColumnId(columnId);
    // We can pass rowIndex to the editor if needed in the future
    setIsEditorOpen(true);
  };

  const handleSavePadlet = (padletData: { title: string; content: string }) => {
    if (editingPadlet && targetColumnId) {
      // Editing an existing padlet
      setColumns(columns.map(column => {
        if (column.id !== targetColumnId) return column;
        return {
          ...column,
          items: column.items.map(item =>
            item.id === editingPadlet.id ? { ...item, ...padletData } : item
          )
        }
      }));
    } else if (targetColumnId) {
      // Adding a new padlet
      const newPost: Padlet = {
        id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ...padletData
      };
      setColumns(columns.map(column => {
        if (column.id !== targetColumnId) return column;

        const newItems = [...column.items];
        // For table, we might need to insert at a specific index, but for now, append.
        newItems.push(newPost);

        return { ...column, items: newItems };
      }));
    }
  };

  const handleOpenLayoutModal = () => {
    setShowLayoutModal(true);
  };

  const handleSelectLayout = (layoutId: LayoutType) => {
    setLayout(layoutId);
    setShowLayoutModal(false);
  };

  // Don't render until mounted to prevent hydration mismatch
  if (!isMounted) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Saving canvas...</span>
      </div>
    );
  }

  return (
    <div style={getCurrentBackground()} className="p-4 transition-all duration-300 min-h-screen" suppressHydrationWarning>
      <div className="max-w-2xl mx-auto space-y-4" suppressHydrationWarning>

        {/* Canvas Settings */}
        <Card className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg" suppressHydrationWarning>
          <CardHeader className="bg-white/90">
            <CardTitle className="text-gray-900">Canvas Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 bg-white/90" suppressHydrationWarning>
            <div>
              <Label htmlFor="title" className="text-gray-900">Title</Label>
              <Input
                id="title"
                placeholder="Canvas title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-white border-gray-300"
              />
            </div>
            <div>
              <Label htmlFor="description" className="text-gray-900">Description</Label>
              <Input
                id="description"
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-white border-gray-300"
              />
            </div>
            <div>
              <Label className="text-gray-900">Icon</Label>
              <Button
                variant="outline"
                onClick={() => setIconDialogOpen(true)}
                className="w-full justify-start bg-white border-gray-300"
              >
                {selectedIcon} Select Icon
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg" suppressHydrationWarning>
          <CardHeader className="bg-white/90">
            <CardTitle className="text-gray-900">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="bg-white/90" suppressHydrationWarning>
            <Label className="text-sm font-medium text-gray-900">Wallpaper</Label>
            <Button
              variant="outline"
              onClick={() => setWallpaperDialogOpen(true)}
              className="w-full justify-between mt-2 h-12 bg-white border-gray-300"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded border"
                  style={(() => {
                    if (selectedWallpaper.type === 'image') {
                      return {
                        backgroundImage: `url("${selectedWallpaper.value}")`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      };
                    } else if (selectedWallpaper.type === 'gradient') {
                      return {
                        background: selectedWallpaper.value
                      };
                    } else {
                      return {
                        backgroundColor: selectedWallpaper.value || '#ffffff'
                      };
                    }
                  })()}
                />
                <span className="text-gray-600">Current wallpaper</span>
              </div>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Layout Section */}
        <LayoutSection
          selectedLayout={layout}
          newPostsAtTop={newPostsAtTop}
          setNewPostsAtTop={setNewPostsAtTop}
          onOpenLayoutModal={handleOpenLayoutModal}
          layoutTypes={layoutTypes}
        />

        {/* Engagement */}
        <Card className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-lg" suppressHydrationWarning>
          <CardHeader className="bg-white/90">
            <CardTitle className="text-gray-900">Engagement</CardTitle>
          </CardHeader>
          <CardContent className="bg-white/90" suppressHydrationWarning>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-gray-900">Comments</Label>
                <p className="text-xs text-gray-500">Allow users to comment on posts</p>
              </div>
              <Switch
                checked={commentsEnabled}
                onCheckedChange={setCommentsEnabled}
              />
            </div>
          </CardContent>
        </Card>

        <div className="pt-4" suppressHydrationWarning>
          {error && (
            <div className="p-3 mb-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400" role="alert">
              <span className="font-medium">Error:</span> {error}
            </div>
          )}
          {createBlockedMessage && (
            <div className="p-3 mb-4 text-sm text-amber-900 rounded-lg bg-amber-50 border border-amber-200" role="alert">
              <span className="font-medium">Plan limit:</span> {createBlockedMessage}
            </div>
          )}
          <Button
            onClick={handleSaveCanvas}
            className="w-full"
            size="lg"
            disabled={loading || !user || !!createBlockedMessage}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              createBlockedMessage
                ? 'Upgrade to Create More Canvases'
                : `Save Canvas${!user ? ' (Login Required)' : ''}`
            )}
          </Button>
        </div>
      </div>

      {/* Layout Selection Modal */}
      <LayoutSelectionModal
        isOpen={showLayoutModal}
        onClose={() => setShowLayoutModal(false)}
        selectedLayout={layout}
        onSelect={handleSelectLayout}
        columns={columns}
        newPostsAtTop={newPostsAtTop}
        onPreviewEdit={handleOpenEditor}
        onPreviewAddPost={handleAddPost}
        onPreviewRename={renameColumn}
        onPreviewDelete={deleteColumn}
        onPreviewMove={moveColumn}
        onPreviewAddSection={addColumn}
        layoutTypes={layoutTypes}
      />

      {/* Padlet Editor Modal */}
      <PadletEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSavePadlet}
        padlet={editingPadlet}
      />

      {/* Wallpaper Selector */}
      <WallpaperSelector
        isOpen={wallpaperDialogOpen}
        onClose={() => setWallpaperDialogOpen(false)}
        currentSelection={selectedWallpaper}
        onSelect={handleWallpaperUpdate}
      />

      {/* Icon Selector */}
      <IconSelector
        isOpen={iconDialogOpen}
        onClose={() => setIconDialogOpen(false)}
        selectedIcon={selectedIcon}
        onSelect={setSelectedIcon}
      />
    </div>
  );
};
export default CanvasSetupPage;
