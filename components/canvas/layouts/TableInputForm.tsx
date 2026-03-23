import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BoardSection, Padlet } from '@/types/collabboard';

interface TableInputFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Padlet>) => void;
    sections: BoardSection[];
}

export function TableInputForm({ isOpen, onClose, onSubmit, sections }: TableInputFormProps) {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [attachmentUrl, setAttachmentUrl] = useState('');
    const [sectionValues, setSectionValues] = useState<Record<string, string>>({});

    const handleSubmit = () => {
        // Construct basic Padlet structure
        const timestamp = new Date().toISOString();

        // Handle dynamic fields (sections)
        const tableValues = { ...sectionValues };

        const newPadletData: Partial<Padlet> = {
            title: subject,
            content: body,
            file_url: attachmentUrl, // Basic mapping for now
            created_at: timestamp,
            updated_at: timestamp,
            type: attachmentUrl ? 'image' : 'text', // Simple inference
            metadata: {
                tableValues
            }
        };

        onSubmit(newPadletData);

        // Reset form
        setSubject('');
        setBody('');
        setAttachmentUrl('');
        setSectionValues({});
        onClose();
    };

    const handleSectionChange = (sectionId: number, value: string) => {
        setSectionValues(prev => ({
            ...prev,
            [sectionId]: value
        }));
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>New Record</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {/* Standard Fields */}
                    <div className="grid gap-2">
                        <Label htmlFor="subject">Subject</Label>
                        <Input
                            id="subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Enter subject..."
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="body">Body</Label>
                        <Textarea
                            id="body"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Enter content description..."
                            rows={3}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="attachment">Attachment (URL)</Label>
                        <Input
                            id="attachment"
                            value={attachmentUrl}
                            onChange={(e) => setAttachmentUrl(e.target.value)}
                            placeholder="https://..."
                        />
                    </div>

                    {/* Dynamic Fields from Sections */}
                    {sections.length > 0 && (
                        <>
                            <div className="border-t border-gray-100 my-2"></div>
                            <div className="text-sm font-medium text-gray-500 mb-2">Custom Fields</div>
                            {sections.map(section => (
                                <div key={section.id} className="grid gap-2">
                                    <Label htmlFor={`section-${section.id}`}>{section.title}</Label>
                                    <Input
                                        id={`section-${section.id}`}
                                        value={sectionValues[section.id] || ''}
                                        onChange={(e) => handleSectionChange(section.id, e.target.value)}
                                        placeholder={`Enter ${section.title}...`}
                                    />
                                </div>
                            ))}
                        </>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit}>
                        Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
