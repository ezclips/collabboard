// 📄 components/collabboard/canvas/CanvasSetupPage.tsx
'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas, CreateCanvasRequest, CanvasSection } from '../../../lib/collabboard/types';
import ContentForm from './ContentForm';

interface CanvasSetupPageProps {
  onSave: (canvasData: CreateCanvasRequest) => void;
  isCreating: boolean;
  loading: boolean;
  initialData?: Canvas;
}

export default function CanvasSetupPage({ 
  onSave, 
  isCreating, 
  loading, 
  initialData 
}: CanvasSetupPageProps) {
  const [canvasName, setCanvasName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sections, setSections] = useState<CanvasSection[]>([]);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const router = useRouter();

  // Canvas categories
  const categories = [
    'Business Model Canvas',
    'Lean Canvas',
    'Value Proposition Canvas',
    'SWOT Analysis',
    'Project Planning',
    'Retrospective',
    'Brainstorming',
    'Custom'
  ];

  // Initialize form with existing data if editing
  useEffect(() => {
    if (initialData && !isCreating) {
      setCanvasName(initialData.name);
      setSelectedCategory(initialData.category);
      setSections(initialData.sections || []);
    }
  }, [initialData, isCreating]);

  // Default sections based on category
  const getDefaultSections = (category: string): CanvasSection[] => {
    switch (category) {
      case 'Business Model Canvas':
        return [
          { id: '1', title: 'Key Partners', description: 'Who are our key partners and suppliers?', items: [], position: 1 },
          { id: '2', title: 'Key Activities', description: 'What key activities does our value proposition require?', items: [], position: 2 },
          { id: '3', title: 'Key Resources', description: 'What key resources does our value proposition require?', items: [], position: 3 },
          { id: '4', title: 'Value Propositions', description: 'What value do we deliver to the customer?', items: [], position: 4 },
          { id: '5', title: 'Customer Relationships', description: 'What type of relationship does each customer segment expect?', items: [], position: 5 },
          { id: '6', title: 'Channels', description: 'Through which channels do we reach our customers?', items: [], position: 6 },
          { id: '7', title: 'Customer Segments', description: 'For whom are we creating value?', items: [], position: 7 },
          { id: '8', title: 'Cost Structure', description: 'What are the most important costs in our business model?', items: [], position: 8 },
          { id: '9', title: 'Revenue Streams', description: 'For what value are our customers willing to pay?', items: [], position: 9 }
        ];
      case 'Lean Canvas':
        return [
          { id: '1', title: 'Problem', description: 'Top 3 problems you are solving', items: [], position: 1 },
          { id: '2', title: 'Solution', description: 'Top 3 features that solve the problems', items: [], position: 2 },
          { id: '3', title: 'Key Metrics', description: 'Key activities you measure', items: [], position: 3 },
          { id: '4', title: 'Unique Value Proposition', description: 'Single, clear, compelling message', items: [], position: 4 },
          { id: '5', title: 'Unfair Advantage', description: 'Something that cannot be easily copied', items: [], position: 5 },
          { id: '6', title: 'Channels', description: 'Path to customers', items: [], position: 6 },
          { id: '7', title: 'Customer Segments', description: 'Target customers', items: [], position: 7 },
          { id: '8', title: 'Cost Structure', description: 'Customer acquisition cost, hosting, people', items: [], position: 8 },
          { id: '9', title: 'Revenue Streams', description: 'Revenue model, lifetime value, revenue', items: [], position: 9 }
        ];
      case 'Value Proposition Canvas':
        return [
          { id: '1', title: 'Customer Jobs', description: 'What jobs is your customer trying to get done?', items: [], position: 1 },
          { id: '2', title: 'Pains', description: 'What pains does your customer experience?', items: [], position: 2 },
          { id: '3', title: 'Gains', description: 'What gains does your customer want to achieve?', items: [], position: 3 },
          { id: '4', title: 'Products & Services', description: 'What products and services do you offer?', items: [], position: 4 },
          { id: '5', title: 'Pain Relievers', description: 'How do you relieve customer pains?', items: [], position: 5 },
          { id: '6', title: 'Gain Creators', description: 'How do you create customer gains?', items: [], position: 6 }
        ];
      case 'SWOT Analysis':
        return [
          { id: '1', title: 'Strengths', description: 'Internal positive factors', items: [], position: 1 },
          { id: '2', title: 'Weaknesses', description: 'Internal negative factors', items: [], position: 2 },
          { id: '3', title: 'Opportunities', description: 'External positive factors', items: [], position: 3 },
          { id: '4', title: 'Threats', description: 'External negative factors', items: [], position: 4 }
        ];
      case 'Project Planning':
        return [
          { id: '1', title: 'Objectives', description: 'What are the project goals?', items: [], position: 1 },
          { id: '2', title: 'Tasks', description: 'What needs to be done?', items: [], position: 2 },
          { id: '3', title: 'Resources', description: 'What resources are needed?', items: [], position: 3 },
          { id: '4', title: 'Timeline', description: 'When should things be completed?', items: [], position: 4 },
          { id: '5', title: 'Risks', description: 'What could go wrong?', items: [], position: 5 },
          { id: '6', title: 'Success Metrics', description: 'How will success be measured?', items: [], position: 6 }
        ];
      case 'Retrospective':
        return [
          { id: '1', title: 'What went well?', description: 'Positive aspects of the sprint/project', items: [], position: 1 },
          { id: '2', title: 'What could be improved?', description: 'Areas for improvement', items: [], position: 2 },
          { id: '3', title: 'Action items', description: 'Concrete steps to take', items: [], position: 3 },
          { id: '4', title: 'Lessons learned', description: 'Key takeaways for future', items: [], position: 4 }
        ];
      case 'Brainstorming':
        return [
          { id: '1', title: 'Ideas', description: 'All ideas, no matter how crazy', items: [], position: 1 },
          { id: '2', title: 'Promising Ideas', description: 'Ideas worth exploring further', items: [], position: 2 },
          { id: '3', title: 'Action Items', description: 'Next steps to take', items: [], position: 3 }
        ];
      default:
        return [
          { id: '1', title: 'Section 1', description: 'Add your description here', items: [], position: 1 },
          { id: '2', title: 'Section 2', description: 'Add your description here', items: [], position: 2 },
          { id: '3', title: 'Section 3', description: 'Add your description here', items: [], position: 3 }
        ];
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    
    if (!canvasName.trim()) {
      newErrors.canvasName = 'Canvas name is required';
    }
    
    if (!selectedCategory) {
      newErrors.category = 'Please select a category';
    }
    
    if (sections.length === 0) {
      newErrors.sections = 'At least one section is required';
    }
    
    // Validate sections
    sections.forEach((section, index) => {
      if (!section.title.trim()) {
        newErrors[`section_${section.id}_title`] = `Section ${index + 1} title is required`;
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setErrors(prev => ({ ...prev, category: '' }));
    
    // Only set default sections if creating a new canvas
    if (isCreating) {
      setSections(getDefaultSections(category));
    }
  };

  const handleSectionUpdate = (sectionId: string, field: string, value: any) => {
    setSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, [field]: value }
        : section
    ));
    
    // Clear validation error for this field
    setErrors(prev => ({
      ...prev,
      [`section_${sectionId}_${field}`]: ''
    }));
  };

  const addSection = () => {
    const newSection: CanvasSection = {
      id: Date.now().toString(),
      title: 'New Section',
      description: 'Add your description here',
      items: [],
      position: sections.length + 1
    };
    setSections(prev => [...prev, newSection]);
    setErrors(prev => ({ ...prev, sections: '' }));
  };

  const removeSection = (sectionId: string) => {
    setSections(prev => {
      const filtered = prev.filter(section => section.id !== sectionId);
      // Reorder positions
      return filtered.map((section, index) => ({
        ...section,
        position: index + 1
      }));
    });
  };

  const moveSectionUp = (sectionId: string) => {
    setSections(prev => {
      const index = prev.findIndex(s => s.id === sectionId);
      if (index > 0) {
        const newSections = [...prev];
        [newSections[index - 1], newSections[index]] = [newSections[index], newSections[index - 1]];
        return newSections.map((section, i) => ({
          ...section,
          position: i + 1
        }));
      }
      return prev;
    });
  };

  const moveSectionDown = (sectionId: string) => {
    setSections(prev => {
      const index = prev.findIndex(s => s.id === sectionId);
      if (index < prev.length - 1) {
        const newSections = [...prev];
        [newSections[index], newSections[index + 1]] = [newSections[index + 1], newSections[index]];
        return newSections.map((section, i) => ({
          ...section,
          position: i + 1
        }));
      }
      return prev;
    });
  };

  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    const canvasData: CreateCanvasRequest = {
      name: canvasName.trim(),
      category: selectedCategory,
      sections: sections
    };

    onSave(canvasData);
  };

  const handleCancel = () => {
    if (isCreating) {
      router.push('/collabboard');
    } else {
      router.back();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            {isCreating ? 'Create New Canvas' : 'Edit Canvas'}
          </h1>
          
          {/* Canvas Name */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Canvas Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={canvasName}
              onChange={(e) => {
                setCanvasName(e.target.value);
                setErrors(prev => ({ ...prev, canvasName: '' }));
              }}
              placeholder="Enter canvas name"
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.canvasName ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {errors.canvasName && (
              <p className="mt-1 text-sm text-red-600">{errors.canvasName}</p>
            )}
          </div>

          {/* Category Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.category ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={loading}
            >
              <option value="">Select a category</option>
              {categories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="mt-1 text-sm text-red-600">{errors.category}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={handleSave}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              {loading ? 'Saving...' : (isCreating ? 'Create Canvas' : 'Save Changes')}
            </button>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-800 px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Sections Configuration */}
        {selectedCategory && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Canvas Sections
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({sections.length} sections)
                </span>
              </h2>
              <button
                onClick={addSection}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <span>+</span>
                <span>Add Section</span>
              </button>
            </div>

            {errors.sections && (
              <p className="mb-4 text-sm text-red-600">{errors.sections}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sections.map((section, index) => (
                <div key={section.id} className="border rounded-lg p-4 relative">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) => handleSectionUpdate(section.id, 'title', e.target.value)}
                        className={`w-full font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-1 ${
                          errors[`section_${section.id}_title`] ? 'border-red-500' : ''
                        }`}
                        placeholder="Section title"
                        disabled={loading}
                      />
                      {errors[`section_${section.id}_title`] && (
                        <p className="mt-1 text-xs text-red-600">{errors[`section_${section.id}_title`]}</p>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-1 ml-2">
                      {/* Move buttons */}
                      <button
                        onClick={() => moveSectionUp(section.id)}
                        disabled={loading || index === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:text-gray-300 p-1"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveSectionDown(section.id)}
                        disabled={loading || index === sections.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:text-gray-300 p-1"
                        title="Move down"
                      >
                        ↓
                      </button>
                      
                      {/* Delete button */}
                      <button
                        onClick={() => removeSection(section.id)}
                        disabled={loading}
                        className="text-red-500 hover:text-red-700 disabled:text-red-300 p-1"
                        title="Delete section"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  
                  <textarea
                    value={section.description}
                    onChange={(e) => handleSectionUpdate(section.id, 'description', e.target.value)}
                    placeholder="Section description"
                    className="w-full text-gray-600 text-sm mb-3 p-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={3}
                    disabled={loading}
                  />
                  
                  <div className="text-xs text-gray-400">
                    Position: {section.position}
                  </div>
                </div>
              ))}
            </div>

            {sections.length === 0 && selectedCategory && (
              <div className="text-center py-8 text-gray-500">
                <p className="mb-4">No sections added yet.</p>
                <button
                  onClick={addSection}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Add Your First Section
                </button>
              </div>
            )}
          </div>
        )}

        {/* Preview */}
        {selectedCategory && sections.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-center mb-4">
                <h4 className="text-xl font-bold text-gray-900">{canvasName || 'Canvas Name'}</h4>
                <p className="text-gray-600">{selectedCategory}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sections.map((section) => (
                  <div key={section.id} className="bg-white rounded border p-3">
                    <h5 className="font-medium text-gray-900 mb-2">{section.title}</h5>
                    <p className="text-sm text-gray-600">{section.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}