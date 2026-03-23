import React from "react";
import ColumnsLayout from "./ColumnsLayout";
import { BoardSection, Padlet, DropIndicatorState } from "../../../types/collabboard";
import { Plus } from "lucide-react";


type SectionWithPosts = {
    section: BoardSection;
    posts: Padlet[];
};

interface ColumnsCanvasRowProps {
    columns: SectionWithPosts[];
    className?: string;

    onAddPost: (sectionId: number) => void;
    onRenameSection: (sectionId: number, title: string) => void;
    onDeleteSection: (sectionId: number) => void;
    onAddSectionLeft: (sectionId: number) => void;
    onAddSectionRight: (sectionId: number) => void;
    onMoveLeft: (sectionId: number) => void;
    onMoveRight: (sectionId: number) => void;
    onAddGlobalSection: () => void;
    onReorderPost?: (postId: string, fromSection: string, toSection: string, newIndex: number) => void;

    onEditPost: (post: Padlet) => void;
    onOpenPost?: (post: Padlet) => void;
    onDeletePost?: (post: Padlet) => void;
    onStartSlideshow?: (post: Padlet) => void;
    onDownloadAttachment?: (post: Padlet) => void;
    onCopyAttachmentLink?: (post: Padlet) => void;
    onColorChange?: (post: Padlet, color: string) => void;
    onAddBefore?: (post: Padlet) => void;
    onAddAfter?: (post: Padlet) => void;
    onDuplicate?: (post: Padlet) => void;
    onCopyToAnotherPadlet?: (post: Padlet) => void;
    onTransferToAnotherPadlet?: (post: Padlet) => void;
    onSetAsCover?: (post: Padlet) => void;
    onPin?: (post: Padlet) => void;
    onReport?: (post: Padlet) => void;
    onCopyLink?: (post: Padlet) => void;
    onOpenInNewTab?: (post: Padlet) => void;
    onSectionActive?: (sectionId: string) => void;
    onAddContainerAt?: (sectionId: number, position: number) => void;
    onDropContainerToSection?: (
        containerId: string,
        toSectionId: string,
        targetIndex: number,
        fromSectionId?: string
    ) => Promise<void> | void;
    allPadlets: Padlet[];
    dropIndicator?: DropIndicatorState;
    setDropIndicator?: (state: DropIndicatorState) => void;
}

const DND_KIND_CONTAINER_MOVE = 'columns-container-move';

export default function ColumnsCanvasRow({
    columns,
    className,
    onAddPost,
    onRenameSection,
    onDeleteSection,
    onAddSectionLeft,
    onAddSectionRight,
    onMoveLeft,
    onMoveRight,
    onAddGlobalSection,
    onReorderPost,
    onEditPost,
    onOpenPost,
    onDeletePost,
    onStartSlideshow,
    onDownloadAttachment,
    onCopyAttachmentLink,
    onColorChange,
    onAddBefore,
    onAddAfter,
    onDuplicate,
    onCopyToAnotherPadlet,
    onTransferToAnotherPadlet,
    onSetAsCover,
    onPin,
    onReport,
    onCopyLink,
    onOpenInNewTab,
    onSectionActive,
    onAddContainerAt,
    onDropContainerToSection,
    allPadlets,
    dropIndicator,
    setDropIndicator,
}: ColumnsCanvasRowProps) {
    return (
        <div className={`h-full min-h-0 overflow-hidden ${className || ""}`}>
            {/* horizontal scroll only */}
            <div className="h-full min-h-0 overflow-x-auto overflow-y-hidden no-scrollbar">
                <div className="h-full min-h-0 flex gap-6 px-10 py-10 items-stretch overflow-y-hidden">
                    {columns.map(({ section, posts }) => (
                        <div
                            key={section.id}
                            data-section-id={section.id}
                            className="h-full min-h-0 flex"
                            onPointerDownCapture={() => onSectionActive?.(section.id.toString())}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50/30');
                            }}
                            onDragLeave={(e) => {
                                e.currentTarget.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50/30');
                            }}
                            onDrop={(e) => {
                                e.currentTarget.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50/30');
                            }}
                        >
                            <ColumnsLayout
                                section={section}
                                posts={posts}
                                onReorderPost={onReorderPost}
                                onAddPost={() => onAddPost(section.id)}
                                onRename={(title) => onRenameSection(section.id, title)}
                                onDelete={() => onDeleteSection(section.id)}
                                onAddSectionLeft={() => onAddSectionLeft(section.id)}
                                onAddSectionRight={() => onAddSectionRight(section.id)}
                                onMoveLeft={() => onMoveLeft(section.id)}
                                onMoveRight={() => onMoveRight(section.id)}
                                onEditPost={onEditPost}
                                onOpenPost={onOpenPost}
                                onDeletePost={onDeletePost}
                                onStartSlideshow={onStartSlideshow}
                                onDownloadAttachment={onDownloadAttachment}
                                onCopyAttachmentLink={onCopyAttachmentLink}
                                onColorChange={onColorChange}
                                onAddBefore={onAddBefore}
                                onAddAfter={onAddAfter}
                                onDuplicate={onDuplicate}
                                onCopyToAnotherPadlet={onCopyToAnotherPadlet}
                                onTransferToAnotherPadlet={onTransferToAnotherPadlet}
                                onSetAsCover={onSetAsCover}
                                onPin={onPin}
                                onReport={onReport}
                                onCopyLink={onCopyLink}
                                onOpenInNewTab={onOpenInNewTab}
                                onAddContainerAt={(pos: number) => onAddContainerAt?.(section.id, pos)}
                                onDropContainerToSection={onDropContainerToSection}
                                allPadlets={allPadlets}
                                dropIndicator={dropIndicator}
                                setDropIndicator={setDropIndicator}
                            />
                        </div>
                    ))}

                    {/* Add Section Button */}
                    <button
                        onClick={onAddGlobalSection}
                        className="min-w-[280px] h-12 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center gap-2 transition-all shadow-lg border border-white/10 shrink-0"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="font-bold text-sm">Add section</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
