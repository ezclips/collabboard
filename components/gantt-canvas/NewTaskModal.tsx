'use client';

import { memo, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useKanbanData, useKanbanPersistence } from '@/components/kanban-canvas/store';
import type { Card } from '@/types/kanban-canvas';
import { buildLocalDate, formatLocalDate, getLocalDateParts, getStartOfLocalDay } from './dateUtils';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentTaskId?: string;
}

export const NewTaskModal = memo(function NewTaskModal({ isOpen, onClose, parentTaskId }: NewTaskModalProps) {
  const data = useKanbanData();
  const actions = useKanbanPersistence();
  const initialDateParts = getLocalDateParts(new Date());

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [selectedType, setSelectedType] = useState<'Feature' | 'Task' | 'Milestone'>('Feature');
  const [selectedDay, setSelectedDay] = useState(initialDateParts.day);
  const [selectedMonth, setSelectedMonth] = useState(initialDateParts.month);
  const [selectedYear, setSelectedYear] = useState(initialDateParts.year);
  const [showStageDropdown, setShowStageDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const sortedColumns = [...data.columns].sort((a, b) => (a.order || 0) - (b.order || 0));

  useEffect(() => {
    if (!isOpen) return;

    const today = getLocalDateParts(new Date());
    setLabel('');
    setDescription('');
    setSelectedType('Feature');
    setSelectedDay(today.day);
    setSelectedMonth(today.month);
    setSelectedYear(today.year);
    setSelectedStage(sortedColumns[0]?.id || '');
    setShowStageDropdown(false);
    setShowTypeDropdown(false);
  }, [isOpen, sortedColumns]);

  const handleSave = async () => {
    if (!label.trim()) return;

    const firstRow = [...data.rows].sort((a, b) => (a.order || 0) - (b.order || 0))[0];

    const startDate = getStartOfLocalDay(new Date());
    const selectedEndDate = getStartOfLocalDay(
      buildLocalDate({ day: selectedDay, month: selectedMonth, year: selectedYear })
    );
    const endDate = selectedEndDate < startDate ? startDate : selectedEndDate;
    const startDateValue = selectedType === 'Milestone'
      ? formatLocalDate(endDate)
      : formatLocalDate(startDate);
    const endDateValue = formatLocalDate(endDate);

    // Calculate order to place card at the bottom of the selected column
    const cardsInColumn = data.cards.filter(card => card.columnId === selectedStage);
    const maxOrder = cardsInColumn.length > 0
      ? Math.max(...cardsInColumn.map(c => c.order || 0))
      : 0;

    const newCard: Card = {
      id: crypto.randomUUID(),
      label: label.trim(),
      description: description.trim() || undefined,
      task_type: selectedType,
      columnId: selectedStage,
      rowId: firstRow?.id,
      start_date: startDateValue,
      end_date: endDateValue,
      priority: 'medium',
      progress: 0,
      order: maxOrder + 1,
    };

    // If there's a parent task, set parent-child relationship for Gantt hierarchy
    // This creates the expandable tree structure with the black arrow pointer
    if (parentTaskId) {
      newCard.parent = parentTaskId;
    }

    await actions.addCard(newCard);

    onClose();
  };

  const handleDelete = () => {
    onClose();
  };

  const calculateDaysDisplay = () => {
    const start = getStartOfLocalDay(new Date());
    const selectedEnd = getStartOfLocalDay(
      buildLocalDate({ day: selectedDay, month: selectedMonth, year: selectedYear })
    );
    const end = selectedEnd < start ? start : selectedEnd;

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const endDateStr = end.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

    return `Days ${diffDays} ${endDateStr}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">New task</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="New task"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              placeholder=""
            />
          </div>

          {/* Stage */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stage
            </label>
            <button
              type="button"
              onClick={() => setShowStageDropdown(!showStageDropdown)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-left bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
            >
              <span className="text-gray-900">
                {sortedColumns.find((col) => col.id === selectedStage)?.label || 'Select stage'}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showStageDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {sortedColumns.map((column) => (
                  <button
                    key={column.id}
                    type="button"
                    onClick={() => {
                      setSelectedStage(column.id);
                      setShowStageDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-blue-50 ${selectedStage === column.id ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                      }`}
                  >
                    {column.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Type */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <button
              type="button"
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-left bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
            >
              <span className="text-gray-900">{selectedType}</span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTypeDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
                {(['Feature', 'Task', 'Milestone'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setSelectedType(type);
                      setShowTypeDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-blue-50 ${selectedType === type ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                      }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Time period */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time period
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={selectedDay}
                onChange={(e) => setSelectedDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
                max="31"
              />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {monthNames.map((month, index) => (
                  <option key={index} value={index}>
                    {month}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={selectedYear}
                onChange={(e) => {
                  const nextYear = parseInt(e.target.value, 10);
                  if (!Number.isNaN(nextYear)) setSelectedYear(nextYear);
                }}
                className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="2020"
                max="2100"
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedDay(Math.max(1, selectedDay - 1))}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium"
              >
                −
              </button>
              <span className="text-sm text-gray-600">{calculateDaysDisplay()}</span>
              <button
                type="button"
                onClick={() => setSelectedDay(Math.min(31, selectedDay + 1))}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white z-10">
          <button
            onClick={handleDelete}
            className="text-red-600 hover:text-red-700 font-medium"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
              disabled={!label.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
