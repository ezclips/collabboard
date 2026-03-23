import React from 'react';
import {
    MoreVertical,
    Eye,
    EyeOff,
    Settings,
    ArrowRight,
    ArrowLeft,
    Minimize2,
    CheckCircle2
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ColumnHeaderMenuProps {
    columnId: string;
    title: string;
    isVisible?: boolean;
    isRequired?: boolean;
    placeholder?: string;
    onToggleVisibility: () => void;
    onToggleRequired: (required: boolean) => void;
    onUpdatePlaceholder: (text: string) => void;
    onGroup: (action: 'next' | 'previous' | 'ungroup') => void;
}

export default function ColumnHeaderMenu({
    columnId,
    title,
    isVisible = true,
    isRequired = false,
    placeholder = '',
    onToggleVisibility,
    onToggleRequired,
    onUpdatePlaceholder,
    onGroup
}: ColumnHeaderMenuProps) {
    // Prevent drag propagation when interacting with menu
    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-50 hover:opacity-100 transition-opacity data-[state=open]:opacity-100"
                    onPointerDown={handlePointerDown}
                    onKeyDown={handleKeyDown}
                >
                    <MoreVertical className="h-4 w-4 text-gray-400" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 bg-white shadow-lg border border-gray-200" align="start">
                <DropdownMenuLabel className="font-normal text-xs text-gray-500">
                    {title} Options
                </DropdownMenuLabel>

                <DropdownMenuItem onClick={onToggleVisibility}>
                    {isVisible ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                    <span>{isVisible ? 'Hide Column' : 'Show Column'}</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <div className="p-2 flex items-center justify-between">
                    <Label htmlFor="required-toggle" className="flex items-center text-sm font-medium">
                        <CheckCircle2 className="mr-2 h-4 w-4 text-gray-500" />
                        Required
                    </Label>
                    <Switch
                        id="required-toggle"
                        checked={isRequired}
                        onCheckedChange={onToggleRequired}
                    />
                </div>

                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Field Settings</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="p-2 w-60">
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Placeholder Text</Label>
                                <Input
                                    value={placeholder}
                                    onChange={(e) => onUpdatePlaceholder(e.target.value)}
                                    placeholder="Enter placeholder..."
                                    className="h-8 text-sm"
                                />
                            </div>
                        </div>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="font-normal text-xs text-gray-500">
                    Grouping
                </DropdownMenuLabel>

                <DropdownMenuItem onClick={() => onGroup('next')}>
                    <ArrowRight className="mr-2 h-4 w-4" />
                    <span>Move to Next Row</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => onGroup('previous')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    <span>Merge with Previous</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => onGroup('ungroup')}>
                    <Minimize2 className="mr-2 h-4 w-4" />
                    <span>Ungroup (Reset)</span>
                </DropdownMenuItem>

            </DropdownMenuContent>
        </DropdownMenu>
    );
}
