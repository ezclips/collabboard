// 📄 app/collabboard/page.tsx
'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Canvas, CanvasListResponse } from '../../lib/collabboard/types';

export default function CollabboardDashboard() {
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const router = useRouter();

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

  // Fetch canvases
  const fetchCanvases = async (resetPage = false) => {
    try {
      setLoading(true);
      const currentPage = resetPage ? 1 : page;
      
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '12'
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory) params.append('category', selectedCategory);

      const response = await fetch(`/api/collabboard/canvases?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch canvases');
      }

      const data: CanvasListResponse = await response.json();
      setCanvases(data.canvases);
      setTotalPages(data.total_pages);
      if (resetPage) setPage(1);
      
    } catch (error) {
      console.error('Error fetching canvases:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch canvases');
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchCanvases();
  }, [page]);

  // Search/filter effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchCanvases(true);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, selectedCategory]);

  const handleDeleteCanvas = async (canvasId: string, canvasName: string) => {
    if (!confirm(`Are you sure you want to delete "${canvasName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/collabboard/canvases/${canvasId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete canvas');
      }

      // Refresh the list
      fetchCanvases(true);
      
    } catch (error) {
      console.error('Error deleting canvas:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete canvas');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Canvases</h1>
            <p className="text-gray-600 mt-1">Create and manage your collaborative boards</p>
          </div>
          <Link
            href="/collabboard/canvas/create"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <span>+</span>
            <span>New Canvas</span>
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search canvases..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            {/* Category Filter */}
            <div className="md:w-64">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading canvases...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <div className="text-red-500 text-xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Canvases</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => fetchCanvases(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : canvases.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-xl mb-4">🎨</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {searchTerm || selectedCategory ? 'No canvases found' : 'No canvases yet'}
            </h2>
            <p className="text-gray-600 mb-4">
              {searchTerm || selectedCategory 
                ? 'Try adjusting your search or filters'
                : 'Create your first canvas to get started'
              }
            </p>
            <Link
              href="/collabboard/canvas/create"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors inline-block"
            >
              Create Canvas
            </Link>
          </div>
        ) : (
          <>
            {/* Canvas Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              {canvases.map((canvas) => (
                <div key={canvas.id} className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-lg font-semibold text-gray-900 truncate pr-2">
                        {canvas.name}
                      </h3>
                      <div className="flex items-center space-x-1">
                        <Link
                          href={`/collabboard/canvas/${canvas.id}/settings`}
                          className="text-gray-400 hover:text-gray-600 p-1"
                          title="Settings"
                        >
                          ⚙️
                        </Link>
                        <button
                          onClick={() => handleDeleteCanvas(canvas.id, canvas.name)}
                          className="text-gray-400 hover:text-red-600 p-1"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-sm text-blue-600 mb-2">{canvas.category}</p>
                    
                    {canvas.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                        {canvas.description}
                      </p>
                    )}
                    
                    <div className="text-xs text-gray-500 mb-4">
                      <div>Created: {formatDate(canvas.created_at)}</div>
                      <div>Updated: {formatDate(canvas.updated_at)}</div>
                      <div>{canvas.sections?.length || 0} sections</div>
                    </div>
                    
                    <Link
                      href={`/collabboard/canvas/${canvas.id}`}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors block text-center"
                    >
                      Open Canvas
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center space-x-2">
                <button
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400 hover:bg-gray-50"
                >
                  Previous
                </button>
                
                <span className="px-4 py-2 text-gray-600">
                  Page {page} of {totalPages}
                </span>
                
                <button
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}