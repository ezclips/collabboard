import type { Padlet, ColumnData } from './types';

// Sample data for previews
export const samplePadlets: Padlet[] = [
  { 
    id: '1', 
    title: 'Welcome!', 
    content: 'This is your new canvas. Add content and arrange it however you like.', 
    date: '2024-01-15', 
    location: 'Office' 
  },
  { 
    id: '2', 
    title: 'Collaborate', 
    content: 'Invite team members to work together in real-time.', 
    date: '2024-01-16', 
    location: 'Home' 
  },
  { 
    id: '3', 
    title: 'Organize', 
    content: 'Switch between different layouts to organize your content.', 
    date: '2024-01-17', 
    location: 'Cafe' 
  },
  { 
    id: '4', 
    title: 'Customize', 
    content: 'Change colors, wallpapers, and settings to match your style.', 
    date: '2024-01-18', 
    location: 'Park' 
  },
  { 
    id: '5', 
    title: 'Share', 
    content: 'Share your canvas with others or export your work.', 
    date: '2024-01-19', 
    location: 'Library' 
  },
  { 
    id: '6', 
    title: 'Discover', 
    content: 'Explore new features and possibilities.', 
    date: '2024-01-20', 
    location: 'Beach' 
  }
];

export const sampleColumns: ColumnData[] = [
  { 
    id: 'column-1', 
    title: 'To Do', 
    items: [samplePadlets[0], samplePadlets[1]]
  },
  { 
    id: 'column-2', 
    title: 'In Progress', 
    items: [samplePadlets[2]]
  },
  { 
    id: 'column-3', 
    title: 'Done', 
    items: [samplePadlets[3], samplePadlets[4]]
  }
];