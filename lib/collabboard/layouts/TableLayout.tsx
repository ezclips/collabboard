// lib/collabboard/layouts/TableLayout.tsx

import React, { useState } from 'react';
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
  Table,
  ArrowUp,
  ArrowDown,
  Filter,
  Search
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

export interface TableConfig {
  // Current settings
  newPostsAtTop: boolean;

  // Table-specific settings
  columns: number;
  rows: number;
  showHeaders: boolean;
  showRowNumbers: boolean;
  showColumnLetters: boolean;
  alternateRowColors: boolean;
  enableSorting: boolean;
  enableFiltering: boolean;
  enableSearch: boolean;

  // Cell settings
  cellPadding: 'tight' | 'normal' | 'loose';
  cellAlignment: 'left' | 'center' | 'right';
  cellVerticalAlignment: 'top' | 'middle' | 'bottom';
  uniformCellSize: boolean;
  minCellWidth: number;
  minCellHeight: number;

  // Visual settings
  borderStyle: 'none' | 'light' | 'medium' | 'heavy';
  borderColor: string;
  headerBackground: string;
  evenRowBackground: string;
  oddRowBackground: string;
  selectedCellBackground: string;

  // Interaction settings
  editMode: 'click' | 'doubleClick' | 'focus';
  selectMode: 'cell' | 'row' | 'column' | 'range';
  allowRowReorder: boolean;
  allowColumnReorder: boolean;
  allowResize: boolean;

  // Data settings
  autoNumberRows: boolean;
  showTotals: boolean;
  dataTypes: { [columnIndex: number]: 'text' | 'number' | 'date' | 'boolean' };
  sortOrder: { column: number; direction: 'asc' | 'desc' }[];

  // Performance settings
  virtualScrolling: boolean;
  lazyLoading: boolean;
  pageSize: number;

  // Export settings
  exportFormats: ('csv' | 'excel' | 'pdf')[];
  printOptimized: boolean;

  // Access control
  viewPermissions: 'public' | 'restricted' | 'private';
  editPermissions: 'owner' | 'collaborators' | 'anyone';
  lockCells: { [key: string]: boolean };
}

export interface Padlet {
  id: string;
  title: string;
  content: string;
  board_id?: string;
  created_at?: string;
  author_id?: string;
  table_row?: number;
  table_column?: number;
  data_type?: 'text' | 'number' | 'date' | 'boolean';
  tags?: string[];
}

export interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

export interface TablePreviewProps {
  columns: ColumnData[];
  config: Partial<TableConfig>;
  onEditItem: (padlet: Padlet, columnId?: string) => void;
  onAddPost: (columnId: string) => void;
  onDeleteItem?: (padletId: string, columnId: string) => void;
}

export interface TableLiveCanvasProps extends TablePreviewProps {
  canvasId: string;
  isEditable: boolean;
  collaborators?: any[];
  onSave?: (padlets: Padlet[]) => void;
}

export interface TableSettingsProps {
  config: TableConfig;
  onChange: (config: Partial<TableConfig>) => void;
  onSave: () => void;
}

// ============================================================================
// POSITIONING CALCULATION FUNCTION
// ============================================================================

/**
 * Table Layout - Arranges padlets in a structured table/spreadsheet format
 * Creates a grid with consistent rows and columns
 */
export function calculateTablePositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number,
  config: Partial<TableConfig> = {}
): PadletPosition[] {
  if (count === 0) return [];

  const {
    columns: tableCols = 4,
    rows: tableRows = Math.ceil(count / 4),
    showHeaders = true,
    showRowNumbers = true,
    cellPadding = 'normal'
  } = config;

  const positions: PadletPosition[] = [];
  const padding = 20;
  const headerHeight = showHeaders ? 40 : 0;
  const rowNumberWidth = showRowNumbers ? 40 : 0;

  // Calculate cell dimensions
  const availableWidth = canvasWidth - (2 * padding) - rowNumberWidth;
  const availableHeight = (canvasHeight || 600) - (2 * padding) - headerHeight;

  const cellWidth = availableWidth / tableCols;
  const cellHeight = availableHeight / tableRows;

  // Padding adjustments
  const paddingMap = { tight: 4, normal: 8, loose: 16 };
  const innerPadding = paddingMap[cellPadding];

  // Create table positions
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / tableCols);
    const col = i % tableCols;

    const x = padding + rowNumberWidth + (col * cellWidth) + innerPadding;
    const y = padding + headerHeight + (row * cellHeight) + innerPadding;

    positions.push({
      top: y,
      left: x,
      width: cellWidth - (2 * innerPadding),
      height: cellHeight - (2 * innerPadding)
    });
  }

  return positions;
}

// ============================================================================
// TABLE CELL COMPONENT
// ============================================================================

const TableCell: React.FC<{
  padlet: Padlet;
  position: PadletPosition;
  config: Partial<TableConfig>;
  rowIndex: number;
  colIndex: number;
  isSelected: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
}> = ({ padlet, position, config, rowIndex, colIndex, isSelected, onEdit, onDelete, onSelect }) => {
  const {
    borderStyle = 'light',
    cellAlignment = 'left',
    cellVerticalAlignment = 'top',
    alternateRowColors = true,
    evenRowBackground = '#f8fafc',
    oddRowBackground = '#ffffff'
  } = config;

  const getBorderClasses = () => {
    switch (borderStyle) {
      case 'none': return 'border-0';
      case 'medium': return 'border-2 border-gray-300';
      case 'heavy': return 'border-4 border-gray-400';
      default: return 'border border-gray-200';
    }
  };

  const getAlignmentClasses = () => {
    const horizontal = {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right'
    }[cellAlignment];

    const vertical = {
      top: 'items-start',
      middle: 'items-center',
      bottom: 'items-end'
    }[cellVerticalAlignment];

    return `${horizontal} ${vertical}`;
  };

  const backgroundColor = alternateRowColors
    ? (rowIndex % 2 === 0 ? evenRowBackground : oddRowBackground)
    : '#ffffff';

  return (
    <div
      className={`absolute cursor-pointer transition-all duration-200 hover:shadow-md group ${getBorderClasses()} ${isSelected ? 'ring-2 ring-blue-500 z-10' : 'hover:border-blue-300'
        }`}
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        height: position.height,
        backgroundColor: isSelected ? config.selectedCellBackground || '#dbeafe' : backgroundColor
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      <div className={`w-full h-full p-2 flex flex-col ${getAlignmentClasses()}`}>
        {/* Cell Actions */}
        <div className="flex justify-end mb-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onEdit}>
                <Edit2 className="mr-2 h-3 w-3" />
                Edit cell
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Clear cell
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Cell Content */}
        <div className="flex-1 flex flex-col justify-center">
          {padlet.title && (
            <div className="font-medium text-xs text-gray-800 mb-1 line-clamp-1">
              {padlet.title}
            </div>
          )}
          <SafeHtmlContent
            content={padlet.content}
            className="text-xs text-gray-600 line-clamp-2"
          />
        </div>

        {/* Cell Coordinates */}
        <div className="absolute -top-6 -left-1 text-xs text-gray-400 font-mono opacity-0 group-hover:opacity-100">
          {String.fromCharCode(65 + colIndex)}{rowIndex + 1}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// TABLE PREVIEW COMPONENT (For Canvas Setup)
// ============================================================================

export const TablePreview: React.FC<TablePreviewProps> = ({
  columns,
  config = {},
  onEditItem,
  onAddPost,
  onDeleteItem
}) => {
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ column: number; direction: 'asc' | 'desc' } | null>(null);

  const {
    columns: tableCols = 4,
    rows: tableRows = 4,
    showHeaders = true,
    showRowNumbers = true,
    showColumnLetters = true,
    enableSorting = true
  } = config;

  // Get all padlets and organize into table structure
  const allPadlets = columns.flatMap(col => col.items);

  // Create table data structure
  const tableData: (Padlet | null)[][] = [];
  for (let row = 0; row < tableRows; row++) {
    tableData[row] = [];
    for (let col = 0; col < tableCols; col++) {
      const padletIndex = row * tableCols + col;
      tableData[row][col] = allPadlets[padletIndex] || null;
    }
  }

  if (allPadlets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
        <div className="text-center">
          <Table className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p>Add some content to see the Table layout preview</p>
          <p className="text-sm mt-2">Data will be organized in rows and columns</p>
        </div>
      </div>
    );
  }

  const handleSort = (columnIndex: number) => {
    if (!enableSorting) return;

    const newDirection = sortConfig?.column === columnIndex && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ column: columnIndex, direction: newDirection });

    // TODO: Implement actual sorting logic
  };

  return (
    <div className="relative w-full min-h-[600px] p-4 bg-gray-50 rounded-lg border overflow-auto">
      <div className="relative bg-white rounded-lg" style={{ width: '1200px', height: '600px' }}>

        {/* Column Headers */}
        {showHeaders && (
          <div className="absolute top-0 left-0 right-0 h-10 bg-gray-100 border-b border-gray-300 flex">
            {/* Row number header */}
            {showRowNumbers && (
              <div className="w-10 h-10 border-r border-gray-300 flex items-center justify-center">
                <span className="text-xs font-medium text-gray-600">#</span>
              </div>
            )}

            {/* Column headers */}
            {Array.from({ length: tableCols }).map((_, colIndex) => (
              <div
                key={colIndex}
                className="flex-1 h-10 border-r border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors"
                onClick={() => handleSort(colIndex)}
              >
                <span className="text-xs font-medium text-gray-700">
                  {showColumnLetters ? String.fromCharCode(65 + colIndex) : `Col ${colIndex + 1}`}
                </span>
                {enableSorting && sortConfig?.column === colIndex && (
                  <div className="ml-1">
                    {sortConfig.direction === 'asc' ?
                      <ArrowUp className="h-3 w-3" /> :
                      <ArrowDown className="h-3 w-3" />
                    }
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Table Rows */}
        <div className="absolute inset-0" style={{ top: showHeaders ? '40px' : '0' }}>
          {tableData.map((row, rowIndex) => (
            <div key={rowIndex} className="flex h-32 border-b border-gray-200 last:border-b-0">
              {/* Row number */}
              {showRowNumbers && (
                <div className="w-10 bg-gray-50 border-r border-gray-300 flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-600">{rowIndex + 1}</span>
                </div>
              )}

              {/* Row cells */}
              {row.map((padlet, colIndex) => (
                <div key={colIndex} className="flex-1 border-r border-gray-200 last:border-r-0 relative">
                  {padlet ? (
                    <TableCell
                      padlet={padlet}
                      position={{ top: 4, left: 4, width: 0, height: 0 }} // Relative positioning within container
                      config={config}
                      rowIndex={rowIndex}
                      colIndex={colIndex}
                      isSelected={selectedCell === padlet.id}
                      onSelect={() => setSelectedCell(padlet.id)}
                      onEdit={() => {
                        const sourceColumn = columns.find(col =>
                          col.items.some(item => item.id === padlet.id)
                        );
                        onEditItem(padlet, sourceColumn?.id);
                      }}
                      onDelete={() => {
                        if (window.confirm(`Clear "${padlet.title}"?`)) {
                          const sourceColumn = columns.find(col =>
                            col.items.some(item => item.id === padlet.id)
                          );
                          if (sourceColumn && onDeleteItem) {
                            onDeleteItem(padlet.id, sourceColumn.id);
                          }
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-gray-400 hover:bg-gray-50 cursor-pointer border-2 border-dashed border-transparent hover:border-gray-300 transition-all"
                      onClick={() => {
                        if (columns.length > 0) {
                          onAddPost(columns[0].id);
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Table Info */}
        <div className="absolute bottom-4 left-4 bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
          <div className="text-xs text-gray-600 space-y-1">
            <div>Table: {tableCols} columns × {tableRows} rows</div>
            <div>Filled: {allPadlets.length} / {tableCols * tableRows} cells</div>
            {selectedCell && <div>Selected: {selectedCell}</div>}
          </div>
        </div>

        {/* Table Controls */}
        <div className="absolute top-4 right-4 flex space-x-2">
          {config.enableSearch && (
            <Button variant="outline" size="sm">
              <Search className="h-4 w-4" />
            </Button>
          )}
          {config.enableFiltering && (
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (columns.length > 0) {
                onAddPost(columns[0].id);
              }
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Data
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// TABLE LIVE CANVAS COMPONENT (Future Implementation)
// ============================================================================

export const TableLiveCanvas: React.FC<TableLiveCanvasProps> = ({
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
          <h3 className="text-lg font-semibold mb-2">Table Live Canvas</h3>
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
// TABLE SETTINGS COMPONENT (Future Implementation)
// ============================================================================

export const TableSettings: React.FC<TableSettingsProps> = ({
  config,
  onChange,
  onSave
}) => {
  return (
    <div className="space-y-6 p-4">
      <h3 className="text-lg font-semibold">Table Settings</h3>

      <div className="text-gray-500">
        <p>Table-specific settings will include:</p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Table dimensions and cell sizing</li>
          <li>Headers and row/column labels</li>
          <li>Sorting and filtering options</li>
          <li>Data types and validation</li>
          <li>Visual styling and borders</li>
          <li>Export and print formatting</li>
          <li>Cell locking and permissions</li>
        </ul>
        <p className="text-sm mt-4">Coming soon...</p>
      </div>
    </div>
  );
};

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const defaultTableConfig: TableConfig = {
  // Current settings
  newPostsAtTop: false,

  // Table layout
  columns: 4,
  rows: 4,
  showHeaders: true,
  showRowNumbers: true,
  showColumnLetters: true,
  alternateRowColors: true,
  enableSorting: true,
  enableFiltering: false,
  enableSearch: false,

  // Cell settings
  cellPadding: 'normal',
  cellAlignment: 'left',
  cellVerticalAlignment: 'top',
  uniformCellSize: true,
  minCellWidth: 100,
  minCellHeight: 80,

  // Visual settings
  borderStyle: 'light',
  borderColor: '#e5e7eb',
  headerBackground: '#f3f4f6',
  evenRowBackground: '#ffffff',
  oddRowBackground: '#f8fafc',
  selectedCellBackground: '#dbeafe',

  // Interaction settings
  editMode: 'doubleClick',
  selectMode: 'cell',
  allowRowReorder: false,
  allowColumnReorder: false,
  allowResize: true,

  // Data settings
  autoNumberRows: true,
  showTotals: false,
  dataTypes: {},
  sortOrder: [],

  // Performance settings
  virtualScrolling: false,
  lazyLoading: false,
  pageSize: 100,

  // Export settings
  exportFormats: ['csv', 'excel'],
  printOptimized: true,

  // Access control
  viewPermissions: 'public',
  editPermissions: 'collaborators',
  lockCells: {}
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const getCellAddress = (row: number, col: number): string => {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
};

export const parseCellAddress = (address: string): { row: number; col: number } | null => {
  const match = address.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;

  const colStr = match[1];
  const rowStr = match[2];

  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  col -= 1; // Convert to 0-based

  const row = parseInt(rowStr) - 1; // Convert to 0-based

  return { row, col };
};

export const sortTableData = (
  data: (Padlet | null)[][],
  columnIndex: number,
  direction: 'asc' | 'desc'
): (Padlet | null)[][] => {
  const sortedData = [...data];

  sortedData.sort((rowA, rowB) => {
    const cellA = rowA[columnIndex];
    const cellB = rowB[columnIndex];

    if (!cellA && !cellB) return 0;
    if (!cellA) return 1;
    if (!cellB) return -1;

    const valueA = cellA.content || cellA.title || '';
    const valueB = cellB.content || cellB.title || '';

    const comparison = valueA.localeCompare(valueB);
    return direction === 'asc' ? comparison : -comparison;
  });

  return sortedData;
};

export const exportTableToCSV = (data: (Padlet | null)[][]): string => {
  const csvRows: string[] = [];

  data.forEach(row => {
    const csvRow = row.map(cell => {
      if (!cell) return '';
      const content = cell.content || cell.title || '';
      // Escape quotes and wrap in quotes if contains comma
      return content.includes(',') ? `"${content.replace(/"/g, '""')}"` : content;
    });
    csvRows.push(csvRow.join(','));
  });

  return csvRows.join('\n');
};

export const validateTableConfig = (config: Partial<TableConfig>): boolean => {
  if (config.columns && config.columns < 1) return false;
  if (config.rows && config.rows < 1) return false;
  if (config.minCellWidth && config.minCellWidth < 50) return false;
  if (config.minCellHeight && config.minCellHeight < 30) return false;
  return true;
};

export const getTableStatistics = (data: (Padlet | null)[][]): {
  totalCells: number;
  filledCells: number;
  emptyCells: number;
  fillPercentage: number;
} => {
  const totalCells = data.length * (data[0]?.length || 0);
  const filledCells = data.flat().filter(cell => cell !== null).length;
  const emptyCells = totalCells - filledCells;
  const fillPercentage = totalCells > 0 ? (filledCells / totalCells) * 100 : 0;

  return {
    totalCells,
    filledCells,
    emptyCells,
    fillPercentage: Math.round(fillPercentage * 100) / 100
  };
};