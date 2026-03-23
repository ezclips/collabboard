import React, { useState } from 'react';
import {
    MoreVertical,
    Plus,
    Trash2,
    MoveLeft,
    MoveRight,
    Edit2
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BoardSection, Padlet } from '@/types/collabboard';
import PostCardContent from '@/components/collabboard/PostCardContent';

interface ColumnsSectionProps {
    section: BoardSection;
    posts: Padlet[];
    onAddPost: () => void;
    onRename: (title: string) => void;
    onDelete: () => void;
    onAddSectionLeft: () => void;
    onAddSectionRight: () => void;
    onMoveLeft: () => void;
    onMoveRight: () => void;
    onEditPost: (post: Padlet) => void;
    onReorderPost?: (postId: string, fromSection: string, toSection: string, newIndex: number) => void;
}

const ColumnsSection: React.FC<ColumnsSectionProps> = ({
    section,
    posts,
    onAddPost,
    onRename,
    onDelete,
    onAddSectionLeft,
    onAddSectionRight,
    onMoveLeft,
    onMoveRight,
    onEditPost,
    onReorderPost
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editingTitle, setEditingTitle] = useState(section.title);

    const handleTitleSave = () => {
        if (editingTitle.trim() && editingTitle.trim() !== section.title) {
            onRename(editingTitle.trim());
        } else {
            setEditingTitle(section.title);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleTitleSave();
        } else if (e.key === 'Escape') {
            setEditingTitle(section.title);
            setIsEditing(false);
        }
    };

    return (
        <div className="flex flex-col w-[280px] min-h-full flex-shrink-0 group/section">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-4 bg-black/60 backdrop-blur-md rounded-full px-4 py-2 text-white shadow-lg">
                <div className="flex-1 min-w-0 pr-2">
                    {isEditing ? (
                        <Input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={handleTitleSave}
                            onKeyDown={handleKeyDown}
                            className="bg-transparent border-none text-white font-bold h-6 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-gray-400"
                            autoFocus
                        />
                    ) : (
                        <h3
                            className="font-bold text-sm truncate cursor-pointer hover:text-white/80"
                            onClick={() => setIsEditing(true)}
                            title={section.title}
                        >
                            {section.title}
                        </h3>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <span className="text-[10px] opacity-60 font-mono bg-white/10 px-1.5 py-0.5 rounded">
                        {posts.length}
                    </span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="p-1 hover:bg-white/10 rounded-full transition-colors">
                                <MoreVertical size={14} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={onAddPost}>
                                <Plus className="mr-2 h-4 w-4" /> Add post
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setIsEditing(true)}>
                                <Edit2 className="mr-2 h-4 w-4" /> Rename section
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onAddSectionLeft}>
                                <MoveLeft className="mr-2 h-4 w-4" /> New section left
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onAddSectionRight}>
                                <MoveRight className="mr-2 h-4 w-4" /> New section right
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onMoveLeft}>
                                <MoveLeft className="mr-2 h-4 w-4" /> Move section left
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onMoveRight}>
                                <MoveRight className="mr-2 h-4 w-4" /> Move section right
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                                <Trash2 className="mr-2 h-4 w-4" /> Delete section
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Add Item Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onAddPost();
                }}
                className="mb-4 w-full h-10 bg-black/20 hover:bg-black/30 text-white rounded-lg flex items-center justify-center transition-all border border-white/5 opacity-0 group-hover/section:opacity-100"
            >
                <Plus size={20} />
            </button>

            {/* Section Content */}
            <div className="flex-grow space-y-4 overflow-y-auto pb-20 no-scrollbar">
                {posts
                    .sort((a, b) => ((a.metadata as any)?.sectionPosition || 0) - ((b.metadata as any)?.sectionPosition || 0))
                    .map((post) => (
                        <div
                            key={post.id}
                            className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all cursor-pointer border border-gray-100/50"
                            onClick={() => onEditPost(post)}
                        >
                            <PostCardContent
                                padlet={post}
                            />
                        </div>
                    ))}
            </div>
        </div>
    );
};

export default ColumnsSection;
