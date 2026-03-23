import React from 'react';
import {
    MoreHorizontal,
    Layers,
    Ungroup,
    Settings,
    Palette,
    ChevronDown,
    ChevronRight,
    Type
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RowGroupMenuProps {
    groupId?: string;
    groupName?: string;
    isGrouped: boolean;
    isCollapsed?: boolean;
    onGroupSelected: () => void;
    onUngroup: () => void;
    onRename: (name: string) => void;
    onToggleCollapse: () => void;
    onColorChange: (color: string) => void;
}

export default function RowGroupMenu({
    groupId,
    groupName = 'Group',
    isGrouped,
    isCollapsed,
    onGroupSelected,
    onUngroup,
    onRename,
    onToggleCollapse,
    onColorChange
}: RowGroupMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-gray-400 opacity-50 hover:opacity-100 transition-opacity"
                >
                    <MoreHorizontal className="h-4 w-4 text-gray-400" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-white shadow-lg border border-gray-200" align="start">
                <DropdownMenuLabel className="text-xs font-normal text-gray-500">
                    Row Options
                </DropdownMenuLabel>

                {!isGrouped ? (
                    <DropdownMenuItem onClick={onGroupSelected}>
                        <Layers className="mr-2 h-4 w-4" />
                        <span>Group Selected Rows</span>
                    </DropdownMenuItem>
                ) : (
                    <>
                        <DropdownMenuItem onClick={onToggleCollapse}>
                            {isCollapsed ? <ChevronRight className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                            <span>{isCollapsed ? 'Expand Group' : 'Collapse Group'}</span>
                        </DropdownMenuItem>

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <Type className="mr-2 h-4 w-4" />
                                <span>Rename Group</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="p-2">
                                <Label className="mb-2 block">Group Name</Label>
                                <Input
                                    value={groupName}
                                    onChange={(e) => onRename(e.target.value)}
                                    className="h-8"
                                />
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <Palette className="mr-2 h-4 w-4" />
                                <span>Group Color</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="p-2">
                                <div className="grid grid-cols-5 gap-1">
                                    {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#64748b', '#000000', '#ffffff'].map(color => (
                                        <button
                                            key={color}
                                            className="w-6 h-6 rounded-full border border-gray-200"
                                            style={{ backgroundColor: color }}
                                            onClick={() => onColorChange(color)}
                                        />
                                    ))}
                                </div>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={onUngroup}>
                            <Ungroup className="mr-2 h-4 w-4" />
                            <span>Ungroup</span>
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
