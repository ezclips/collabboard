'use client';

import React, { useState, useCallback } from 'react';
import {
  Type, Hash, Palette, AlignLeft, Plus, Grid, ArrowLeft,
  MessageSquare, ChevronRight, Check, Bold, Italic, Underline,
  AlignCenter, AlignRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Padlet } from '@/types/collabboard';

interface SpreadsheetEditorProps {
  padletToEdit: Padlet;
  isEditModalOpen: boolean;
  setIsEditModalOpen: (open: boolean) => void;
  confirmEditPadlet: (updates: Partial<Padlet>) => void;
}

// Cell types for the submenu
const CELL_TYPES = [
  { id: 'auto', label: 'Auto', icon: 'A' },
  { id: 'number', label: 'Number', icon: '123', hasSubmenu: true },
  { id: 'currency', label: 'Currency', icon: '$', hasSubmenu: true },
  { id: 'percentage', label: 'Percentage', icon: '%' },
  { id: 'text', label: 'Text', icon: 'ABC' },
  { id: 'date', label: 'Date & Time', icon: '📅' },
  { id: 'checkbox', label: 'Checkbox', icon: '☑' },
];

// Color palette matching other editors
const CELL_COLORS = [
  '#ffffff', '#fee2e2', '#ffedd5', '#fef3c7', '#dcfce7',
  '#dbeafe', '#e0e7ff', '#f3e8ff', '#fce7f3', '#ffe4e6',
  '#f87171', '#fb923c', '#fbbf24', '#34d399', '#60a5fa',
  '#818cf8', '#a78bfa', '#f472b6', '#fb7185', '#94a3b8',
];

// Formula options
const FORMULAS = ['SUM', 'IF', 'MIN', 'MAX', 'COUNT', 'AVERAGE'];

export default function SpreadsheetEditor({
  padletToEdit,
  isEditModalOpen,
  setIsEditModalOpen,
  confirmEditPadlet
}: SpreadsheetEditorProps) {
  // Table state
  const [title, setTitle] = useState(padletToEdit?.title || 'New Table');
  const [caption, setCaption] = useState('');
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [showCaptionInput, setShowCaptionInput] = useState(false);

  // Selection state - determines toolbar mode
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);

  // Submenu states
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  // Initialize table data
  const [columns, setColumns] = useState(['A', 'B', 'C']);
  const [rows, setRows] = useState<string[][]>(() => {
    try {
      if (padletToEdit?.content) {
        const parsed = JSON.parse(padletToEdit.content);
        if (parsed.rows) return parsed.rows;
      }
    } catch (e) {
      console.log('Using default table data');
    }
    return Array(4).fill(null).map(() => Array(3).fill(''));
  });

  // Handle cell click
  const handleCellClick = (rowIndex: number, colIndex: number) => {
    setSelectedCell({ row: rowIndex, col: colIndex });
    setActiveSubmenu(null);
  };

  // Handle cell change
  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = rows.map((row, r) =>
      r === rowIndex
        ? row.map((cell, c) => (c === colIndex ? value : cell))
        : row
    );
    setRows(newRows);
  };

  // Add row
  const addRow = useCallback(() => {
    setRows(prev => [...prev, Array(columns.length).fill('')]);
  }, [columns.length]);

  // Add column
  const addColumn = useCallback(() => {
    const nextCol = String.fromCharCode(65 + columns.length);
    setColumns(prev => [...prev, nextCol]);
    setRows(prev => prev.map(row => [...row, '']));
  }, [columns.length]);

  // Handle save
  const handleSave = useCallback(() => {
    confirmEditPadlet({
      title,
      content: JSON.stringify({ rows, columns, caption })
    });
    setIsEditModalOpen(false);
  }, [title, rows, columns, caption, confirmEditPadlet, setIsEditModalOpen]);

  // Toggle submenu
  const toggleSubmenu = (submenu: string) => {
    setActiveSubmenu(activeSubmenu === submenu ? null : submenu);
  };

  // Toolbar items based on selection state
  const isInsideTable = selectedCell !== null;

  // Outside table toolbar (Title, Caption, Comment)
  const outsideToolbar = [
    { id: 'title', icon: Type, label: 'Title', active: showTitleInput },
    { id: 'caption', icon: AlignLeft, label: 'Caption', active: showCaptionInput },
    { id: 'comment', icon: MessageSquare, label: 'Comment' },
  ];

  // Inside table toolbar
  const insideToolbar = [
    { id: 'textStyle', icon: Type, label: 'Text style', submenu: 'textStyle' },
    { id: 'cellType', icon: Hash, label: 'Cell type', submenu: 'cellType' },
    { id: 'cellColor', icon: Palette, label: 'Cell color', submenu: 'cellColor' },
    { id: 'formula', icon: Hash, label: 'Formula', submenu: 'formula' },
    { id: 'alignment', icon: AlignLeft, label: 'Alignment', submenu: 'alignment' },
    { id: 'addColumn', icon: Grid, label: 'Add column' },
    { id: 'addRow', icon: Plus, label: 'Add row' },
  ];

  const handleToolClick = (toolId: string) => {
    switch (toolId) {
      case 'title':
        setShowTitleInput(!showTitleInput);
        break;
      case 'caption':
        setShowCaptionInput(!showCaptionInput);
        break;
      case 'addColumn':
        addColumn();
        break;
      case 'addRow':
        addRow();
        break;
      default:
        break;
    }
  };

  const currentToolbar = isInsideTable ? insideToolbar : outsideToolbar;

  if (!isEditModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-white flex">
      {/* Sidebar Toolbar */}
      <div className="w-20 bg-gray-50 border-r flex flex-col items-center py-4 gap-2 overflow-y-auto">
        {/* Back button */}
        <button
          onClick={() => setIsEditModalOpen(false)}
          className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded-lg mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {currentToolbar.map((tool) => {
          const IconComponent = tool.icon;
          const hasSubmenu = 'submenu' in tool && tool.submenu;
          const isActive = ('active' in tool && tool.active) || (hasSubmenu && activeSubmenu === tool.submenu);

          return (
            <div key={tool.id} className="relative flex flex-col items-center">
              <button
                onClick={() => {
                  if (hasSubmenu) {
                    toggleSubmenu(tool.submenu as string);
                  } else {
                    handleToolClick(tool.id);
                  }
                }}
                className={`w-10 h-10 border rounded-lg flex items-center justify-center transition-colors ${isActive
                    ? 'bg-blue-100 border-blue-300 text-blue-600'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <IconComponent className="w-5 h-5" />
              </button>
              <span className="text-[9px] text-gray-500 text-center mt-1 max-w-[60px]">{tool.label}</span>

              {/* Submenus */}
              {hasSubmenu && activeSubmenu === tool.submenu && (
                <div className="absolute left-full ml-2 top-0 bg-white rounded-xl shadow-lg border border-gray-200 z-50 min-w-[200px]">
                  {tool.submenu === 'cellType' && (
                    <div className="py-2">
                      {CELL_TYPES.map((type) => (
                        <button
                          key={type.id}
                          className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-100 text-left"
                          onClick={() => setActiveSubmenu(null)}
                        >
                          <span className="w-6 text-center text-gray-500">{type.icon}</span>
                          <span className="flex-1">{type.label}</span>
                          {type.hasSubmenu && <ChevronRight className="w-4 h-4 text-gray-400" />}
                          {type.id === 'auto' && <Check className="w-4 h-4 text-gray-600" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {tool.submenu === 'cellColor' && (
                    <div className="p-4">
                      <div className="flex flex-wrap gap-2" style={{ width: 230 }}>
                        {CELL_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setActiveSubmenu(null)}
                            style={{
                              width: 40,
                              height: 40,
                              backgroundColor: color,
                              borderRadius: 8,
                              border: '2px solid #e5e7eb',
                              cursor: 'pointer',
                            }}
                            className="hover:scale-110 transition-transform"
                          />
                        ))}
                      </div>
                      <button className="mt-3 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800">
                        <span className="w-6 h-6 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500" />
                        Custom color...
                      </button>
                    </div>
                  )}

                  {tool.submenu === 'formula' && (
                    <div className="py-2">
                      {FORMULAS.map((formula) => (
                        <button
                          key={formula}
                          className="w-full px-4 py-2 text-left hover:bg-gray-100"
                          onClick={() => setActiveSubmenu(null)}
                        >
                          {formula}
                        </button>
                      ))}
                      <div className="border-t mt-2 pt-2 px-4">
                        <button className="text-sm text-blue-600 flex items-center gap-1">
                          View formula help <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {tool.submenu === 'textStyle' && (
                    <div className="p-3 flex gap-2">
                      <button className="w-10 h-10 border rounded-lg flex items-center justify-center hover:bg-gray-100">
                        <Bold className="w-4 h-4" />
                      </button>
                      <button className="w-10 h-10 border rounded-lg flex items-center justify-center hover:bg-gray-100">
                        <Italic className="w-4 h-4" />
                      </button>
                      <button className="w-10 h-10 border rounded-lg flex items-center justify-center hover:bg-gray-100">
                        <Underline className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {tool.submenu === 'alignment' && (
                    <div className="p-3 flex gap-2">
                      <button className="w-10 h-10 border rounded-lg flex items-center justify-center hover:bg-gray-100">
                        <AlignLeft className="w-4 h-4" />
                      </button>
                      <button className="w-10 h-10 border rounded-lg flex items-center justify-center hover:bg-gray-100">
                        <AlignCenter className="w-4 h-4" />
                      </button>
                      <button className="w-10 h-10 border rounded-lg flex items-center justify-center hover:bg-gray-100">
                        <AlignRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-16 bg-white border-b flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center">
              <Grid className="w-4 h-4 text-purple-600" />
            </div>
            {showTitleInput ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setShowTitleInput(false)}
                className="text-xl font-semibold border-b border-blue-500 outline-none"
                autoFocus
              />
            ) : (
              <h2 className="text-xl font-semibold">{title || 'Untitled Table'}</h2>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>

        {/* Caption */}
        {showCaptionInput && (
          <div className="px-6 py-2 bg-gray-50 border-b">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption..."
              className="w-full text-sm text-gray-600 bg-transparent outline-none"
            />
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto p-6 bg-gray-100">
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden inline-block">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="w-12 h-8 bg-gray-100 border border-gray-300 text-xs"></th>
                  {columns.map((col, i) => (
                    <th
                      key={i}
                      className={`min-w-[120px] h-8 border border-gray-300 text-xs font-medium text-center ${selectedCell?.col === i ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                        }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <td className="w-12 h-8 bg-gray-100 border border-gray-300 text-xs text-center text-gray-500 font-medium">
                      {rowIndex + 1}
                    </td>
                    {row.map((cell, colIndex) => (
                      <td
                        key={colIndex}
                        className={`min-w-[120px] h-8 border border-gray-300 p-0 relative ${selectedCell?.row === rowIndex && selectedCell?.col === colIndex
                            ? 'ring-2 ring-blue-500 ring-inset bg-blue-50'
                            : 'hover:bg-gray-50'
                          }`}
                        onClick={() => handleCellClick(rowIndex, colIndex)}
                      >
                        <input
                          type="text"
                          value={cell}
                          onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                          className="w-full h-full px-2 text-sm bg-transparent border-none outline-none"
                          onFocus={() => handleCellClick(rowIndex, colIndex)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer - Cell reference */}
        <div className="h-10 bg-white border-t flex items-center px-6 text-sm text-gray-500">
          {selectedCell ? `${columns[selectedCell.col]}${selectedCell.row + 1}` : 'Click a cell to edit'}
        </div>
      </div>
    </div>
  );
}
