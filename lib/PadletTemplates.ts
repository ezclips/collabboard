// PadletTemplates.ts - Templates for different padlet types
export interface PadletTemplate {
  title: string;
  content: string;
  type: string;
  width: number;
  height: number;
  backgroundColor?: string;
  textColor?: string;
}

export const getPadletTemplate = (type: string): PadletTemplate => {
  const templates: Record<string, PadletTemplate> = {
    text: {
      title: '📝 Note',
      content: 'Click to edit your note...',
      type: 'text',
      width: 280,
      height: 200,
      backgroundColor: '#ffffff',
      textColor: '#000000'
    },
    
    link: {
      title: '🔗 Link',
      content: 'https://example.com\n\nAdd your link description here...',
      type: 'link',
      width: 280,
      height: 160,
      backgroundColor: '#f3f4f6',
      textColor: '#1f2937'
    },
    
    todo: {
      title: '✅ To-Do List',
      content: '☐ Task 1\n☐ Task 2\n☐ Task 3\n\nClick to edit tasks...',
      type: 'todo',
      width: 280,
      height: 220,
      backgroundColor: '#f0fdf4',
      textColor: '#166534'
    },
    
    column: {
      title: '📋 Column',
      content: 'Column Header\n\n• Item 1\n• Item 2\n• Item 3\n\nAdd more items...',
      type: 'column',
      width: 240,
      height: 300,
      backgroundColor: '#fafafa',
      textColor: '#374151'
    },
    
    image: {
      title: '🖼️ Image',
      content: 'Click to upload an image or add a caption...',
      type: 'image',
      width: 280,
      height: 250,
      backgroundColor: '#fef3c7',
      textColor: '#92400e'
    },
    
    file: {
      title: '📎 File Upload',
      content: 'Drag & drop files here or click to upload...\n\nSupported: PDF, DOC, XLS, etc.',
      type: 'file',
      width: 280,
      height: 180,
      backgroundColor: '#fef2f2',
      textColor: '#991b1b'
    },
    
    color: {
      title: '🎨 Color Palette',
      content: 'Click to choose colors for your design...',
      type: 'color',
      width: 200,
      height: 160,
      backgroundColor: '#fdf2f8',
      textColor: '#be185d'
    },
    
    date: {
      title: '📅 Due Date',
      content: 'Set deadline: [Click to select date]\n\nReminder: Not set\nPriority: Medium',
      type: 'date',
      width: 260,
      height: 180,
      backgroundColor: '#fff7ed',
      textColor: '#c2410c'
    },
    
    audio: {
      title: '🎵 Audio',
      content: 'Record voice note or upload audio file...\n\nDuration: 00:00\nFormat: MP3/WAV',
      type: 'audio',
      width: 280,
      height: 160,
      backgroundColor: '#eef2ff',
      textColor: '#3730a3'
    },
    
    map: {
      title: '📍 Location',
      content: 'Add location or map...\n\nAddress: [Click to add]\nCoordinates: Not set',
      type: 'map',
      width: 300,
      height: 200,
      backgroundColor: '#f0fdfa',
      textColor: '#0d9488'
    },
    
    video: {
      title: '🎥 Video',
      content: 'Embed video or upload file...\n\nURL: [Paste video link]\nDuration: 00:00',
      type: 'video',
      width: 320,
      height: 240,
      backgroundColor: '#ecfdf5',
      textColor: '#166534'
    },
    
    table: {
      title: '📊 Table',
      content: 'Column 1 | Column 2 | Column 3\nRow 1   | Data    | Data\nRow 2   | Data    | Data\n\nClick to edit table...',
      type: 'table',
      width: 350,
      height: 220,
      backgroundColor: '#f8fafc',
      textColor: '#334155'
    },
    
    heading: {
      title: '📝 Heading',
      content: 'MAIN HEADING\n\nSubheading text goes here...\n\nClick to edit heading styles.',
      type: 'heading',
      width: 300,
      height: 150,
      backgroundColor: '#fffbeb',
      textColor: '#92400e'
    }
  };

  return templates[type] || templates.text;
};

// Enhanced padlet creation function
export const createPadletFromTemplate = (
  type: string, 
  position: { x: number; y: number },
  canvasId: string
) => {
  const template = getPadletTemplate(type);
  
  return {
    board_id: canvasId,
    title: template.title,
    content: template.content,
    type: template.type,
    position_x: Math.round(Math.max(0, position.x)),
    position_y: Math.round(Math.max(0, position.y)),
    width: template.width,
    height: template.height,
    background_color: template.backgroundColor,
    text_color: template.textColor,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
};