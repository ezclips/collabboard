// lib/collabboard/layouts/MapLayout.tsx

import React, { useState, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreVertical,
  Edit2,
  Plus,
  Trash2,
  Map,
  MapPin,
  Navigation,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Link,
  Unlink
} from "lucide-react";
import SafeHtmlContent from "@/components/collabboard/SafeHtmlContent";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PadletPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface MapConnection {
  from: string;
  to: string;
  type: 'line' | 'arrow' | 'curve';
  color: string;
  width: number;
  label?: string;
}

export interface MapConfig {
  // Current settings
  newPostsAtTop: boolean;

  // Map-specific settings
  mapType: 'mindmap' | 'flowchart' | 'network' | 'concept' | 'geographic';
  centerNode: string | null;
  enableConnections: boolean;
  showConnectionLabels: boolean;
  autoLayout: boolean;
  layoutAlgorithm: 'force' | 'hierarchical' | 'circular' | 'grid' | 'manual';

  // Node settings
  nodeShape: 'rectangle' | 'circle' | 'ellipse' | 'diamond' | 'hexagon';
  nodeSize: 'auto' | 'small' | 'medium' | 'large' | 'custom';
  showNodeIcons: boolean;
  showNodeNumbers: boolean;
  nodeSpacing: number;

  // Connection settings
  connectionStyle: 'straight' | 'curved' | 'orthogonal';
  connectionColor: string;
  connectionWidth: number;
  arrowStyle: 'none' | 'simple' | 'filled' | 'hollow';
  showDirection: boolean;

  // Visual settings
  backgroundColor: string;
  nodeBackground: string;
  selectedNodeColor: string;
  connectionPreview: boolean;
  showMinimap: boolean;
  showGrid: boolean;
  gridSize: number;

  // Interaction settings
  enableDragNodes: boolean;
  enableZoom: boolean;
  enablePan: boolean;
  multiSelect: boolean;
  snapToNodes: boolean;
  magneticConnections: boolean;

  // Layout behavior
  preventOverlap: boolean;
  maintainAspectRatio: boolean;
  centerOnLoad: boolean;
  fitToCanvas: boolean;
  animateTransitions: boolean;

  // Collaboration settings
  showUserCursors: boolean;
  lockConnections: boolean;
  realTimeSync: boolean;

  // Export settings
  exportConnections: boolean;
  includeMetadata: boolean;

  // Access control
  viewPermissions: 'public' | 'restricted' | 'private';
  editPermissions: 'owner' | 'collaborators' | 'anyone';
}

export interface Padlet {
  id: string;
  title: string;
  content: string;
  board_id?: string;
  created_at?: string;
  author_id?: string;
  map_x?: number;
  map_y?: number;
  map_connections?: string[]; // Array of connected padlet IDs
  node_type?: 'root' | 'branch' | 'leaf' | 'cluster';
  node_level?: number;
  tags?: string[];
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

export interface MapPreviewProps {
  columns: ColumnData[];
  config: Partial<MapConfig>;
  onEditItem: (padlet: Padlet, columnId?: string) => void;
  onAddPost: (columnId: string) => void;
  onDeleteItem?: (padletId: string, columnId: string) => void;
  onConnectNodes?: (fromId: string, toId: string) => void;
}

export interface MapLiveCanvasProps extends MapPreviewProps {
  canvasId: string;
  isEditable: boolean;
  collaborators?: any[];
  onSave?: (padlets: Padlet[]) => void;
}

export interface MapSettingsProps {
  config: MapConfig;
  onChange: (config: Partial<MapConfig>) => void;
  onSave: () => void;
}

// ============================================================================
// POSITIONING CALCULATION FUNCTION
// ============================================================================

/**
 * Map Layout - Arranges padlets in a mind map or network diagram
 * Creates connected nodes with hierarchical or force-directed positioning
 */
export function calculateMapPositions(
  padlets: Padlet[],
  canvasWidth: number,
  canvasHeight?: number,
  config: Partial<MapConfig> = {}
): PadletPosition[] {
  if (padlets.length === 0) return [];

  const {
    layoutAlgorithm = 'force',
    nodeSpacing = 150,
    centerNode
  } = config;

  const positions: PadletPosition[] = [];
  const centerX = canvasWidth / 2;
  const centerY = (canvasHeight || 600) / 2;

  switch (layoutAlgorithm) {
    case 'hierarchical':
      return calculateHierarchicalLayout(padlets, centerX, centerY, nodeSpacing, centerNode);
    case 'circular':
      return calculateCircularLayout(padlets, centerX, centerY, nodeSpacing);
    case 'grid':
      return calculateGridMapLayout(padlets, canvasWidth, canvasHeight || 600, nodeSpacing);
    case 'force':
    default:
      return calculateForceDirectedLayout(padlets, centerX, centerY, nodeSpacing);
  }
}

function calculateHierarchicalLayout(
  padlets: Padlet[],
  centerX: number,
  centerY: number,
  spacing: number,
  rootId?: string | null
): PadletPosition[] {
  const positions: PadletPosition[] = [];

  // Find root node or use first padlet
  const rootIndex = rootId ? padlets.findIndex(p => p.id === rootId) : 0;
  const levels: Padlet[][] = [[]];

  // Place root at center
  if (padlets[rootIndex]) {
    levels[0].push(padlets[rootIndex]);
    positions[rootIndex] = {
      top: centerY - 50,
      left: centerX - 75,
      width: 150,
      height: 100
    };
  }

  // Arrange other nodes in levels
  const remaining = padlets.filter((_, i) => i !== rootIndex);
  const nodesPerLevel = Math.ceil(Math.sqrt(remaining.length));

  for (let i = 0; i < remaining.length; i++) {
    const level = Math.floor(i / nodesPerLevel) + 1;
    const posInLevel = i % nodesPerLevel;

    if (!levels[level]) levels[level] = [];
    levels[level].push(remaining[i]);

    const levelY = centerY + (level * spacing) - 50;
    const levelWidth = (nodesPerLevel - 1) * spacing;
    const startX = centerX - levelWidth / 2;
    const nodeX = startX + (posInLevel * spacing) - 75;

    const originalIndex = padlets.findIndex(p => p.id === remaining[i].id);
    positions[originalIndex] = {
      top: levelY,
      left: nodeX,
      width: 150,
      height: 100
    };
  }

  return positions;
}

function calculateCircularLayout(
  padlets: Padlet[],
  centerX: number,
  centerY: number,
  spacing: number
): PadletPosition[] {
  const positions: PadletPosition[] = [];
  const radius = Math.min(spacing * padlets.length / (2 * Math.PI), 200);

  padlets.forEach((padlet, index) => {
    const angle = (2 * Math.PI * index) / padlets.length;
    const x = centerX + radius * Math.cos(angle) - 75;
    const y = centerY + radius * Math.sin(angle) - 50;

    positions[index] = {
      top: y,
      left: x,
      width: 150,
      height: 100
    };
  });

  return positions;
}

function calculateGridMapLayout(
  padlets: Padlet[],
  canvasWidth: number,
  canvasHeight: number,
  spacing: number
): PadletPosition[] {
  const positions: PadletPosition[] = [];
  const cols = Math.ceil(Math.sqrt(padlets.length));
  const rows = Math.ceil(padlets.length / cols);

  const startX = (canvasWidth - (cols - 1) * spacing) / 2 - 75;
  const startY = (canvasHeight - (rows - 1) * spacing) / 2 - 50;

  padlets.forEach((padlet, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;

    positions[index] = {
      top: startY + row * spacing,
      left: startX + col * spacing,
      width: 150,
      height: 100
    };
  });

  return positions;
}

function calculateForceDirectedLayout(
  padlets: Padlet[],
  centerX: number,
  centerY: number,
  spacing: number
): PadletPosition[] {
  const positions: PadletPosition[] = [];

  // Simple force-directed simulation
  padlets.forEach((padlet, index) => {
    const angle = (2 * Math.PI * index) / padlets.length;
    const distance = 80 + Math.random() * 120;

    const x = centerX + distance * Math.cos(angle) - 75;
    const y = centerY + distance * Math.sin(angle) - 50;

    positions[index] = {
      top: Math.max(20, Math.min(y, 500)),
      left: Math.max(20, Math.min(x, 1000)),
      width: 150,
      height: 100
    };
  });

  return positions;
}

// ============================================================================
// MAP NODE COMPONENT
// ============================================================================

const MapNode: React.FC<{
  padlet: Padlet;
  position: PadletPosition;
  config: Partial<MapConfig>;
  isSelected: boolean;
  isConnecting: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStartConnection: () => void;
  onEndConnection: () => void;
}> = ({
  padlet,
  position,
  config,
  isSelected,
  isConnecting,
  onSelect,
  onEdit,
  onDelete,
  onStartConnection,
  onEndConnection
}) => {
    const {
      nodeShape = 'rectangle',
      nodeBackground = '#ffffff',
      selectedNodeColor = '#3b82f6',
      showNodeNumbers = false
    } = config;

    const getShapeClasses = () => {
      switch (nodeShape) {
        case 'circle': return 'rounded-full';
        case 'ellipse': return 'rounded-full';
        case 'diamond': return 'transform rotate-45';
        case 'hexagon': return 'clip-path-hexagon';
        default: return 'rounded-lg';
      }
    };

    const getNodeTypeColor = () => {
      switch (padlet.node_type) {
        case 'root': return 'border-purple-500 bg-purple-50';
        case 'branch': return 'border-blue-500 bg-blue-50';
        case 'leaf': return 'border-green-500 bg-green-50';
        case 'cluster': return 'border-orange-500 bg-orange-50';
        default: return 'border-gray-300 bg-white';
      }
    };

    return (
      <div
        className={`absolute cursor-pointer transition-all duration-200 hover:shadow-lg group ${getShapeClasses()} ${isSelected ? 'ring-2 ring-blue-500 z-20' : 'hover:scale-105'
          } ${isConnecting ? 'ring-2 ring-green-500 animate-pulse' : ''}`}
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
          height: position.height,
          backgroundColor: isSelected ? selectedNodeColor : nodeBackground
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isConnecting) {
            onEndConnection();
          } else {
            onSelect();
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <div className={`w-full h-full p-3 flex flex-col border-2 ${getNodeTypeColor()} ${getShapeClasses()}`}>
          {/* Node Header */}
          <div className="flex justify-between items-start mb-2">
            {showNodeNumbers && padlet.node_level && (
              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                L{padlet.node_level}
              </span>
            )}

            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onEdit}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit node
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onStartConnection}>
                  <Link className="mr-2 h-4 w-4" />
                  Connect to...
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete node
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Node Content */}
          <div className="flex-1 flex flex-col justify-center text-center">
            <h4 className="font-semibold text-sm mb-1 line-clamp-2">
              {padlet.title}
            </h4>
            {padlet.content}
            <SafeHtmlContent
              content={padlet.content}
              className="text-xs text-gray-600 line-clamp-2"
            />
          </div>

          {/* Node Type Indicator */}
          {padlet.node_type && (
            <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center">
              <MapPin className="h-2 w-2 text-white" />
            </div>
          )}

          {/* Priority Indicator */}
          {padlet.priority && padlet.priority !== 'low' && (
            <div className={`absolute -top-1 -left-1 w-3 h-3 rounded-full ${padlet.priority === 'urgent' ? 'bg-red-500' :
                padlet.priority === 'high' ? 'bg-orange-500' :
                  'bg-yellow-500'
              }`} />
          )}
        </div>
      </div>
    );
  };

// ============================================================================
// CONNECTION COMPONENT
// ============================================================================

const ConnectionLine: React.FC<{
  from: PadletPosition;
  to: PadletPosition;
  config: Partial<MapConfig>;
}> = ({ from, to, config }) => {
  const {
    connectionStyle = 'straight',
    connectionColor = '#6b7280',
    connectionWidth = 2,
    showDirection = true
  } = config;

  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  const toX = to.left + to.width / 2;
  const toY = to.top + to.height / 2;

  const getPath = () => {
    switch (connectionStyle) {
      case 'curved':
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        const controlOffset = 50;
        return `M ${fromX} ${fromY} Q ${midX} ${midY - controlOffset} ${toX} ${toY}`;
      case 'orthogonal':
        const midXOrtho = (fromX + toX) / 2;
        return `M ${fromX} ${fromY} L ${midXOrtho} ${fromY} L ${midXOrtho} ${toY} L ${toX} ${toY}`;
      default:
        return `M ${fromX} ${fromY} L ${toX} ${toY}`;
    }
  };

  return (
    <svg className="absolute inset-0 pointer-events-none z-0" style={{ width: '100%', height: '100%' }}>
      <path
        d={getPath()}
        stroke={connectionColor}
        strokeWidth={connectionWidth}
        fill="none"
        markerEnd={showDirection ? "url(#arrowhead)" : undefined}
      />
      {showDirection && (
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill={connectionColor}
            />
          </marker>
        </defs>
      )}
    </svg>
  );
};

// ============================================================================
// MAP PREVIEW COMPONENT (For Canvas Setup)
// ============================================================================

export const MapPreview: React.FC<MapPreviewProps> = ({
  columns,
  config = {},
  onEditItem,
  onAddPost,
  onDeleteItem,
  onConnectNodes
}) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const { layoutAlgorithm = 'force', enableConnections = true } = config;

  // Get all padlets with map positions
  const allPadlets = columns.flatMap(col => col.items);

  // Generate positions if not set
  const padletsWithPositions = allPadlets.map(padlet => ({
    ...padlet,
    map_x: padlet.map_x ?? undefined,
    map_y: padlet.map_y ?? undefined
  }));

  if (padletsWithPositions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
        <div className="text-center">
          <Map className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p>Add some content to see the Map layout preview</p>
          <p className="text-sm mt-2">Items will be connected in a mind map or network</p>
        </div>
      </div>
    );
  }

  // Calculate positions
  const positions = calculateMapPositions(
    padletsWithPositions,
    1200, // Canvas width
    800,  // Canvas height
    config
  );

  const handleStartConnection = (nodeId: string) => {
    setConnectingFrom(nodeId);
  };

  const handleEndConnection = (nodeId: string) => {
    if (connectingFrom && connectingFrom !== nodeId && onConnectNodes) {
      onConnectNodes(connectingFrom, nodeId);
    }
    setConnectingFrom(null);
  };

  return (
    <div className="relative w-full min-h-[600px] p-4 bg-gray-50 rounded-lg border overflow-auto">
      {/* Map Controls */}
      <div className="absolute top-4 left-4 z-30 flex flex-col space-y-2 bg-white rounded-lg shadow-lg p-2">
        <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.min(z * 1.2, 3))}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.max(z * 0.8, 0.3))}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setZoom(1)}>
          <Navigation className="h-4 w-4" />
        </Button>
      </div>

      {/* Layout Algorithm Indicator */}
      <div className="absolute top-4 right-4 z-30 bg-white rounded-lg shadow-lg p-3">
        <div className="text-xs text-gray-600 mb-1">Layout: {layoutAlgorithm}</div>
        <div className="text-xs text-gray-500">Zoom: {Math.round(zoom * 100)}%</div>
        {connectingFrom && (
          <div className="text-xs text-green-600 mt-1">
            Connecting from node... Click target
          </div>
        )}
      </div>

      <div
        className="relative bg-white rounded-lg"
        style={{
          width: '1200px',
          height: '800px',
          transform: `scale(${zoom})`,
          transformOrigin: 'top left'
        }}
        onClick={() => {
          setSelectedNode(null);
          setConnectingFrom(null);
        }}
      >
        {/* Connections */}
        {enableConnections && (
          <div className="absolute inset-0 z-0">
            {padletsWithPositions.map((padlet, index) => {
              if (!padlet.map_connections) return null;

              return padlet.map_connections.map(targetId => {
                const targetIndex = padletsWithPositions.findIndex(p => p.id === targetId);
                if (targetIndex === -1 || !positions[index] || !positions[targetIndex]) return null;

                return (
                  <ConnectionLine
                    key={`${padlet.id}-${targetId}`}
                    from={positions[index]}
                    to={positions[targetIndex]}
                    config={config}
                  />
                );
              });
            })}

            {/* Connection Preview */}
            {connectingFrom && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-ping absolute"
                  style={{
                    left: positions[padletsWithPositions.findIndex(p => p.id === connectingFrom)]?.left + 75,
                    top: positions[padletsWithPositions.findIndex(p => p.id === connectingFrom)]?.top + 50
                  }} />
              </div>
            )}
          </div>
        )}

        {/* Map Nodes */}
        {padletsWithPositions.map((padlet, index) => {
          const position = positions[index];
          if (!position) return null;

          return (
            <MapNode
              key={padlet.id}
              padlet={padlet}
              position={position}
              config={config}
              isSelected={selectedNode === padlet.id}
              isConnecting={connectingFrom !== null && connectingFrom !== padlet.id}
              onSelect={() => setSelectedNode(padlet.id)}
              onEdit={() => {
                const sourceColumn = columns.find(col =>
                  col.items.some(item => item.id === padlet.id)
                );
                onEditItem(padlet, sourceColumn?.id);
              }}
              onDelete={() => {
                if (window.confirm(`Delete "${padlet.title}"?`)) {
                  const sourceColumn = columns.find(col =>
                    col.items.some(item => item.id === padlet.id)
                  );
                  if (sourceColumn && onDeleteItem) {
                    onDeleteItem(padlet.id, sourceColumn.id);
                  }
                }
              }}
              onStartConnection={() => handleStartConnection(padlet.id)}
              onEndConnection={() => handleEndConnection(padlet.id)}
            />
          );
        })}

        {/* Add Node Button */}
        <div
          className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-20"
        >
          <Button
            variant="outline"
            className="flex items-center gap-2 px-6 py-3 border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 shadow-lg"
            onClick={() => {
              if (columns.length > 0) {
                onAddPost(columns[0].id);
              }
            }}
          >
            <Plus size={18} />
            Add Node
          </Button>
        </div>

        {/* Map Legend */}
        <div className="absolute bottom-4 left-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
          <h4 className="font-medium mb-2">Map Legend</h4>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-200 border border-purple-500 rounded"></div>
              <span>Root Node</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-200 border border-blue-500 rounded"></div>
              <span>Branch Node</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-200 border border-green-500 rounded"></div>
              <span>Leaf Node</span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="absolute top-20 left-4 bg-blue-50 border border-blue-200 rounded-lg p-3 max-w-xs">
          <h4 className="font-medium text-blue-900 mb-1">Map Canvas</h4>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• Click nodes to select them</li>
            <li>• Double-click to edit content</li>
            <li>• Use "Connect to..." to link nodes</li>
            <li>• Zoom and pan to navigate</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAP LIVE CANVAS COMPONENT (Future Implementation)
// ============================================================================

export const MapLiveCanvas: React.FC<MapLiveCanvasProps> = ({
  canvasId,
  isEditable,
  columns,
  config = {},
  collaborators = [],
  onEditItem,
  onAddPost,
  onDeleteItem,
  onSave
}) => {
  // TODO: Implement live canvas functionality
  return (
    <div className="relative w-full h-full">
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Map Live Canvas</h3>
          <p>Canvas ID: {canvasId}</p>
          <p>Editable: {isEditable ? 'Yes' : 'No'}</p>
          <p>Collaborators: {collaborators.length}</p>
          <p className="text-sm text-gray-400 mt-2">Coming soon...</p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAP SETTINGS COMPONENT (Future Implementation)
// ============================================================================

export const MapSettings: React.FC<MapSettingsProps> = ({
  config,
  onChange,
  onSave
}) => {
  return (
    <div className="space-y-6 p-4">
      <h3 className="text-lg font-semibold">Map Settings</h3>

      <div className="text-gray-500">
        <p>Map-specific settings will include:</p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Layout algorithms (force-directed, hierarchical, circular)</li>
          <li>Node shapes and styling options</li>
          <li>Connection types and arrow styles</li>
          <li>Auto-layout and manual positioning</li>
          <li>Zoom, pan, and navigation controls</li>
          <li>Node grouping and clustering</li>
          <li>Real-time collaboration features</li>
        </ul>
        <p className="text-sm mt-4">Coming soon...</p>
      </div>
    </div>
  );
};

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const defaultMapConfig: MapConfig = {
  // Current settings
  newPostsAtTop: false,

  // Map layout
  mapType: 'mindmap',
  centerNode: null,
  enableConnections: true,
  showConnectionLabels: false,
  autoLayout: true,
  layoutAlgorithm: 'force',

  // Node settings
  nodeShape: 'rectangle',
  nodeSize: 'medium',
  showNodeIcons: false,
  showNodeNumbers: false,
  nodeSpacing: 150,

  // Connection settings
  connectionStyle: 'straight',
  connectionColor: '#6b7280',
  connectionWidth: 2,
  arrowStyle: 'simple',
  showDirection: true,

  // Visual settings
  backgroundColor: '#f8fafc',
  nodeBackground: '#ffffff',
  selectedNodeColor: '#3b82f6',
  connectionPreview: true,
  showMinimap: false,
  showGrid: false,
  gridSize: 50,

  // Interaction settings
  enableDragNodes: true,
  enableZoom: true,
  enablePan: true,
  multiSelect: false,
  snapToNodes: true,
  magneticConnections: true,

  // Layout behavior
  preventOverlap: true,
  maintainAspectRatio: false,
  centerOnLoad: true,
  fitToCanvas: false,
  animateTransitions: true,

  // Collaboration settings
  showUserCursors: false,
  lockConnections: false,
  realTimeSync: true,

  // Export settings
  exportConnections: true,
  includeMetadata: true,

  // Access control
  viewPermissions: 'public',
  editPermissions: 'collaborators'
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const calculateDistance = (
  point1: { x: number; y: number },
  point2: { x: number; y: number }
): number => {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const findOptimalNodePosition = (
  existingNodes: Array<{ x: number; y: number }>,
  canvasWidth: number,
  canvasHeight: number,
  minDistance: number = 150
): { x: number; y: number } => {
  const maxAttempts = 100;

  for (let i = 0; i < maxAttempts; i++) {
    const x = Math.random() * (canvasWidth - 150) + 75;
    const y = Math.random() * (canvasHeight - 100) + 50;

    const tooClose = existingNodes.some(node =>
      calculateDistance({ x, y }, { x: node.x, y: node.y }) < minDistance
    );

    if (!tooClose) {
      return { x, y };
    }
  }

  // Fallback to a random position
  return {
    x: Math.random() * (canvasWidth - 150) + 75,
    y: Math.random() * (canvasHeight - 100) + 50
  };
};

export const detectNodeConnection = (
  nodeId: string,
  allNodes: Padlet[]
): string[] => {
  const node = allNodes.find(n => n.id === nodeId);
  return node?.map_connections || [];
};

export const addConnection = (
  fromNodeId: string,
  toNodeId: string,
  nodes: Padlet[]
): Padlet[] => {
  return nodes.map(node => {
    if (node.id === fromNodeId) {
      const connections = node.map_connections || [];
      if (!connections.includes(toNodeId)) {
        return {
          ...node,
          map_connections: [...connections, toNodeId]
        };
      }
    }
    return node;
  });
};

export const removeConnection = (
  fromNodeId: string,
  toNodeId: string,
  nodes: Padlet[]
): Padlet[] => {
  return nodes.map(node => {
    if (node.id === fromNodeId && node.map_connections) {
      return {
        ...node,
        map_connections: node.map_connections.filter(id => id !== toNodeId)
      };
    }
    return node;
  });
};

export const validateMapConfig = (config: Partial<MapConfig>): boolean => {
  if (config.nodeSpacing && config.nodeSpacing < 50) return false;
  if (config.connectionWidth && config.connectionWidth < 1) return false;
  if (config.gridSize && config.gridSize < 10) return false;
  return true;
};

export const exportMapToGraphML = (nodes: Padlet[]): string => {
  const connections = nodes.flatMap(node =>
    (node.map_connections || []).map(targetId => ({ from: node.id, to: targetId }))
  );

  let graphML = '<?xml version="1.0" encoding="UTF-8"?>\n';
  graphML += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n';
  graphML += '  <graph id="map" edgedefault="directed">\n';

  // Add nodes
  nodes.forEach(node => {
    graphML += `    <node id="${node.id}">\n`;
    graphML += `      <data key="title">${node.title}</data>\n`;
    graphML += `      <data key="content">${node.content}</data>\n`;
    graphML += '    </node>\n';
  });

  // Add edges
  connections.forEach((conn, index) => {
    graphML += `    <edge id="e${index}" source="${conn.from}" target="${conn.to}"/>\n`;
  });

  graphML += '  </graph>\n';
  graphML += '</graphml>';

  return graphML;
};