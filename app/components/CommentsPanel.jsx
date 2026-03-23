import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Icon from './AppIcon';

const CommentsPanel = ({ boardId, isOpen, onClose }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(null);

  const supabase = createClient(
    'https://atkgocwwqbjjhitpavei.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0a2dvY3d3cWJqamhpdHBhdmVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMTQ1ODYsImV4cCI6MjA2Njc5MDU4Nn0.KawI-tDGiD3nWXY86WpA9KoPh00ThUVgzD7uK72fzbs'
  );

  useEffect(() => {
    if (isOpen && boardId) {
      getAuthToken();
      loadComments();
    }
  }, [isOpen, boardId]);

  const getAuthToken = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setToken(session.access_token);
      }
    } catch (error) {
      console.error('Error getting auth token:', error);
    }
  };

  const loadComments = async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/collabboard/canvases/${boardId}/comments`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
      }
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const createComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !token) return;

    try {
      const response = await fetch(`/api/collabboard/canvases/${boardId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: newComment,
          position_x: Math.random() * 100,
          position_y: Math.random() * 100
        })
      });

      if (response.ok) {
        const newCommentData = await response.json();
        setComments(prev => [newCommentData, ...prev]);
        setNewComment('');
      }
    } catch (error) {
      console.error('Error creating comment:', error);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end">
      <div className="w-96 bg-white h-full shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center">
            <Icon name="MessageSquare" size={20} className="mr-2" />
            Comments
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Icon name="Loader2" size={24} className="animate-spin" />
            </div>
          ) : comments.length > 0 ? (
            comments.map((comment) => (
              <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      U
                    </div>
                    <div>
                      <p className="text-sm font-medium">User</p>
                      <p className="text-xs text-gray-500">{formatDate(comment.created_at)}</p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-700">{comment.content}</p>
                {comment.position_x && comment.position_y && (
                  <p className="text-xs text-gray-400 mt-1">
                    Position: ({Math.round(comment.position_x)}, {Math.round(comment.position_y)})
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Icon name="MessageSquare" size={32} className="mx-auto mb-2 opacity-50" />
              <p>No comments yet</p>
              <p className="text-sm">Be the first to comment!</p>
            </div>
          )}
        </div>

        {/* Comment Form */}
        <div className="border-t p-4">
          <form onSubmit={createComment} className="space-y-3">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-gray-500">
                {comments.length} comment{comments.length !== 1 ? 's' : ''}
              </p>
              <button
                type="submit"
                disabled={!newComment.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Icon name="Send" size={16} />
                <span>Comment</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CommentsPanel;