// 📄 app/collabboard/canvas/[id]/page.tsx

'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@supabase/auth-helpers-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  Plus, 
  Save, 
  Share2, 
  Users, 
  MessageSquare, 
  Download,
  Settings,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Hand,
  MousePointer,
  Type,
  Image,
  Video,
  FileText,
  Link,
  Palette,
  Square,
  Circle,
  Triangle,
  StickyNote,
  Trash2,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  RotateCw,
  Move,
  Layers
} from 'lucide-react';

interface Canvas {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  status: 'draft' | 'active' | 'archived';
  settings: Record<string, any>;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_public: boolean;
  tags: string[];
  created_by_profile: {
    id: string;
    email: string;
    raw_user_meta_data: { name?: string; avatar_url?: string };
  };
}

interface CanvasSection {
  id: string;
  canvas_id: string;
  title: string;
  description: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'link' | 'drawing' | 'sticky_note' | 'shape';
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  background_color: string;
  border_color: string;
  border_width: number;
  border_radius: number;
  opacity: number;
  is_locked: boolean;
  settings: Record<string, any>;
  created_by: string;
  created_at: string;
  updated_at: string;
  created_by_profile: {
    id: string;
    email: string;
    raw_user_meta_data: { name?: string; avatar_url?: string };
  };
  items: CanvasItem[];
}

interface CanvasItem {
  id: string;
  section_id: string;
  canvas_id: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'link' | 'drawing' | 'sticky_note' | 'shape' | 'comment';
  content: Record<string, any>;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  rotation: number;
  scale_x: number;
  scale_y: number;
  opacity: number;
  is_locked: boolean;
  style_properties: Record<string, any>;
  created_by: string;
  created_at: string;
  updated_at: string;
  created_by_profile: {
    id: string;
    email: string;
    raw_user_meta_data: { name?: string; avatar_url?: string };
  };
}

interface Collaborator {
  id: string;
  canvas_id: string;
  user_id: string;
  permission_level: 'view' | 'comment' | 'edit' | 'admin';
  invited_by: string;
  invited_at: string;
  accepted_at: string;
  last_accessed_at: string;
  user_profile: {
    id: string;
    email: string;
    raw_user_meta_data: { name?: string; avatar_url?: string };
  };
}

type Tool = 'select' | 'pan' | 'text' | 'image' | 'video' | 'file' | 'link' | 'drawing' | 'sticky_note' | 'shape';

type AccessRequirement = 'LOGIN_REQUIRED' | 'PASSWORD_REQUIRED' | null;

export default function CanvasViewer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const user = useUser();
  const supabase = createClientComponentClient();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);

  // Canvas state
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [sections, setSections] = useState<CanvasSection[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<'view' | 'comment' | 'edit' | 'admin' | null>(null);
  const [accessRequirement, setAccessRequirement] = useState<AccessRequirement>(null);
  const [canvasPassword, setCanvasPassword] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  
  // UI state
  const [selectedTool, setSelectedTool] = useState<Tool>('select');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Canvas interaction state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragTarget, setDragTarget] = useState<{ type: 'section' | 'item'; id: string } | null>(null);

  // Auto-save state
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient) {
      fetchCanvasData();
    }
  }, [isClient, id, user?.id]);

  useEffect(() => {
    if (canvas && user) {
      // Set up real-time subscriptions
      const channel = supabase
        .channel(`canvas:${canvas.id}`)
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'canvas_sections', filter: `canvas_id=eq.${canvas.id}` },
          handleSectionChange
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'canvas_items', filter: `canvas_id=eq.${canvas.id}` },
          handleItemChange
        )
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'canvas_presence', filter: `canvas_id=eq.${canvas.id}` },
          handlePresenceChange
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [canvas, user]);

  const fetchCanvasData = async (passwordOverride?: string) => {
    try {
      setLoading(true);
      setError(null);
      const activePassword = passwordOverride ?? canvasPassword;
      const accessHeaders = activePassword
        ? { 'x-canvas-password': activePassword }
        : undefined;

      // Fetch canvas details
      const canvasResponse = await fetch(`/api/collabboard/canvases/${id}`, {
        headers: accessHeaders,
      });
      if (!canvasResponse.ok) {
        const failure = await canvasResponse.json().catch(() => null);
        const nextRequirement = failure?.code === 'LOGIN_REQUIRED' || failure?.code === 'PASSWORD_REQUIRED'
          ? failure.code as AccessRequirement
          : null;

        setAccessRequirement(nextRequirement);
        setCanvas(null);
        setSections([]);
        setPermission(null);
        throw new Error(failure?.error || 'Failed to fetch canvas');
      }
      const canvasData = await canvasResponse.json();
      setCanvas(canvasData.canvas);
      setPermission(canvasData.permission);
      setAccessRequirement(null);
      if (activePassword) {
        setCanvasPassword(activePassword);
      }

      // Fetch canvas sections
      const sectionsResponse = await fetch(`/api/collabboard/canvases/${id}/sections`, {
        headers: accessHeaders,
      });
      if (!sectionsResponse.ok) {
        const failure = await sectionsResponse.json().catch(() => null);
        const nextRequirement = failure?.code === 'LOGIN_REQUIRED' || failure?.code === 'PASSWORD_REQUIRED'
          ? failure.code as AccessRequirement
          : null;

        setAccessRequirement(nextRequirement);
        throw new Error(failure?.error || 'Failed to fetch sections');
      }
      const sectionsData = await sectionsResponse.json();
      setSections(sectionsData.sections);

      // Fetch collaborators
      const collaboratorsResponse = user
        ? await fetch(`/api/collabboard/canvases/${id}/collaborators`)
        : null;
      if (collaboratorsResponse?.ok) {
        const collaboratorsData = await collaboratorsResponse.json();
        setCollaborators(collaboratorsData.collaborators);
      } else if (!user) {
        setCollaborators([]);
      }

      // Update canvas access
      if (user?.id) {
        await supabase.rpc('update_canvas_access', {
          canvas_uuid: id,
          user_uuid: user.id
        });
      }

    } catch (error) {
      console.error('Error fetching canvas data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load canvas');
    } finally {
      setLoading(false);
    }
  };

  const handleSectionChange = useCallback((payload: any) => {
    if (payload.eventType === 'INSERT') {
      setSections(prev => [...prev, payload.new]);
    } else if (payload.eventType === 'UPDATE') {
      setSections(prev => prev.map(section => 
        section.id === payload.new.id ? { ...section, ...payload.new } : section
      ));
    } else if (payload.eventType === 'DELETE') {
      setSections(prev => prev.filter(section => section.id !== payload.old.id));
    }
  }, []);

  const handleItemChange = useCallback((payload: any) => {
    if (payload.eventType === 'INSERT') {
      setSections(prev => prev.map(section => 
        section.id === payload.new.section_id 
          ? { ...section, items: [...(section.items || []), payload.new] }
          : section
      ));
    } else if (payload.eventType === 'UPDATE') {
      setSections(prev => prev.map(section => ({
        ...section,
        items: section.items?.map(item => 
          item.id === payload.new.id ? { ...item, ...payload.new } : item
        ) || []
      })));
    } else if (payload.eventType === 'DELETE') {
      setSections(prev => prev.map(section => ({
        ...section,
        items: section.items?.filter(item => item.id !== payload.old.id) || []
      })));
    }
  }, []);

  const handlePresenceChange = useCallback((payload: any) => {
    // Handle real-time presence updates for collaborative cursors
    console.log('Presence change:', payload);
  }, []);

  const createSection = async (type: CanvasSection['type']) => {
    if (!canvas || !permission || !['edit', 'admin'].includes(permission)) {
      return;
    }

    try {
      const response = await fetch(`/api/collabboard/canvases/${canvas.id}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `New ${type} section`,
          description: '',
          type,
          position_x: 100 + Math.random() * 200,
          position_y: 100 + Math.random() * 200,
          width: 300,
          height: 200
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create section');
      }

      const data = await response.json();
      setSections(prev => [...prev, data.section]);
      setHasUnsavedChanges(true);
    } catch (error) {
      console.error('Error creating section:', error);
    }
  };

  const updateSection = async (sectionId: string, updates: Partial<CanvasSection>) => {
    if (!canvas || !permission || !['edit', 'admin'].includes(permission)) {
      return;
    }

    try {
      const response = await fetch(`/api/collabboard/canvases/${canvas.id}/sections/${sectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error('Failed to update section');
      }

      const data = await response.json();
      setSections(prev => prev.map(section => 
        section.id === sectionId ? data.section : section
      ));
      setHasUnsavedChanges(true);
    } catch (error) {
      console.error('Error updating section:', error);
    }
  };

  const deleteSection = async (sectionId: string) => {
    if (!canvas || !permission || !['edit', 'admin'].includes(permission)) {
      return;
    }

    if (!confirm('Are you sure you want to delete this section?')) {
      return;
    }

    try {
      const response = await fetch(`/api/collabboard/canvases/${canvas.id}/sections/${sectionId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete section');
      }

      setSections(prev => prev.filter(section => section.id !== sectionId));
      setHasUnsavedChanges(true);
    } catch (error) {
      console.error('Error deleting section:', error);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (selectedTool === 'pan') {
      setIsPanning(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && selectedTool === 'pan') {
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsDragging(false);
    setDragTarget(null);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev * 0.8, 0.1));
  };

  const handleSave = async () => {
    if (!canvas || !hasUnsavedChanges) return;

    try {
      // Save canvas changes
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      // Additional save logic here
    } catch (error) {
      console.error('Error saving canvas:', error);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const getToolIcon = (tool: Tool) => {
    const icons = {
      select: MousePointer,
      pan: Hand,
      text: Type,
      image: Image,
      video: Video,
      file: FileText,
      link: Link,
      drawing: Palette,
      sticky_note: StickyNote,
      shape: Square
    };
    return icons[tool] || MousePointer;
  };

  if (!isClient) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (accessRequirement === 'LOGIN_REQUIRED') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h2 className="mb-3 text-2xl font-bold text-gray-900">Login required</h2>
          <p className="mb-6 text-sm text-gray-600">
            This board only allows signed-in visitors.
          </p>
          <button
            onClick={() => router.push(`/auth?redirect=${encodeURIComponent(`/collabboard/canvas/${id}`)}`)}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            Continue to sign in
          </button>
        </div>
      </div>
    );
  }

  if (accessRequirement === 'PASSWORD_REQUIRED') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h2 className="mb-3 text-2xl font-bold text-gray-900">Password protected</h2>
            <p className="text-sm text-gray-600">
              Enter the board password to continue.
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              fetchCanvasData(passwordDraft);
            }}
          >
            <input
              type="password"
              value={passwordDraft}
              onChange={(event) => setPasswordDraft(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none ring-0 focus:border-blue-500"
              placeholder="Board password"
              autoFocus
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              Unlock board
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/collabboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!canvas) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Canvas not found</h2>
          <button
            onClick={() => router.push('/collabboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-semibold text-gray-800">{canvas.title}</h1>
          <div className="flex items-center space-x-2">
            {hasUnsavedChanges && (
              <span className="text-yellow-600 text-sm">Unsaved changes</span>
            )}
            {lastSaved && (
              <span className="text-gray-500 text-sm">
                Last saved: {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            <span>Save</span>
          </button>

          <button
            onClick={() => setShowCollaborators(!showCollaborators)}
            className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            <Users className="h-4 w-4" />
            <span>{collaborators.length}</span>
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Comments</span>
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Toolbar */}
        <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 space-y-2">
          {(['select', 'pan', 'text', 'image', 'video', 'file', 'link', 'drawing', 'sticky_note', 'shape'] as Tool[]).map((tool) => {
            const Icon = getToolIcon(tool);
            return (
              <button
                key={tool}
                onClick={() => setSelectedTool(tool)}
                className={`p-2 rounded transition-colors ${
                  selectedTool === tool 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title={tool.charAt(0).toUpperCase() + tool.slice(1)}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}

          <div className="border-t border-gray-200 w-full my-2"></div>

          <button
            onClick={handleZoomIn}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded"
            title="Zoom In"
          >
            <ZoomIn className="h-5 w-5" />
          </button>

          <button
            onClick={handleZoomOut}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded"
            title="Zoom Out"
          >
            <ZoomOut className="h-5 w-5" />
          </button>

          <div className="text-xs text-gray-500">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 relative overflow-hidden">
          <div
            ref={canvasRef}
            className="w-full h-full bg-gray-100 cursor-crosshair"
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: '0 0'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* Grid background */}
            <div 
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)
                `,
                backgroundSize: '20px 20px'
              }}
            />

            {/* Render sections */}
            {sections.map((section) => (
              <div
                key={section.id}
                className={`absolute border-2 cursor-move ${
                  selectedSection === section.id ? 'border-blue-500' : 'border-gray-300'
                } ${section.is_locked ? 'opacity-50' : ''}`}
                style={{
                  left: section.position_x,
                  top: section.position_y,
                  width: section.width,
                  height: section.height,
                  backgroundColor: section.background_color,
                  borderColor: section.border_color,
                  borderWidth: section.border_width,
                  borderRadius: section.border_radius,
                  opacity: section.opacity,
                  zIndex: section.z_index
                }}
                onClick={() => setSelectedSection(section.id)}
              >
                {/* Section header */}
                <div className="p-2 bg-white bg-opacity-90 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{section.title}</span>
                  <div className="flex items-center space-x-1">
                    {section.is_locked && <Lock className="h-3 w-3 text-gray-400" />}
                    {permission && ['edit', 'admin'].includes(permission) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSection(section.id);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Section content */}
                <div className="p-2 h-full overflow-auto">
                  {section.items?.map((item) => (
                    <div
                      key={item.id}
                      className={`absolute ${
                        selectedItem === item.id ? 'ring-2 ring-blue-500' : ''
                      }`}
                      style={{
                        left: item.position_x,
                        top: item.position_y,
                        width: item.width,
                        height: item.height,
                        transform: `rotate(${item.rotation}deg) scale(${item.scale_x}, ${item.scale_y})`,
                        opacity: item.opacity,
                        zIndex: item.z_index
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItem(item.id);
                      }}
                    >
                      {/* Render item content based on type */}
                      {item.type === 'text' && (
                        <div 
                          className="w-full h-full p-2 text-sm"
                          style={item.style_properties}
                        >
                          {item.content.text || 'Enter text...'}
                        </div>
                      )}
                      {item.type === 'sticky_note' && (
                        <div 
                          className="w-full h-full p-2 text-sm bg-yellow-200 shadow-md"
                          style={item.style_properties}
                        >
                          {item.content.text || 'Add note...'}
                        </div>
                      )}
                      {/* Add more item type renderers as needed */}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Properties Panel */}
        {(selectedSection || selectedItem) && (
          <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Properties</h3>
            {selectedSection && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={sections.find(s => s.id === selectedSection)?.title || ''}
                    onChange={(e) => updateSection(selectedSection, { title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Background Color
                  </label>
                  <input
                    type="color"
                    className="w-full h-10 border border-gray-300 rounded-md"
                    value={sections.find(s => s.id === selectedSection)?.background_color || '#ffffff'}
                    onChange={(e) => updateSection(selectedSection, { background_color: e.target.value })}
                  />
                </div>
                {/* Add more section properties */}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Section Menu */}
      {permission && ['edit', 'admin'].includes(permission) && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex space-x-2">
            <button
              onClick={() => createSection('text')}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              <span>Add Text</span>
            </button>
            <button
              onClick={() => createSection('sticky_note')}
              className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              <StickyNote className="h-4 w-4" />
              <span>Note</span>
            </button>
            <button
              onClick={() => createSection('image')}
              className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              <Image className="h-4 w-4" />
              <span>Image</span>
            </button>
            <button
              onClick={() => createSection('shape')}
              className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              <Square className="h-4 w-4" />
              <span>Shape</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}