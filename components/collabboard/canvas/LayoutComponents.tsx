'use client';

import {
  LayoutGrid,
  Columns,
  Grid3X3,
  Table,
  Move,
  Calendar,
  Waves,
  Map,
  Layers,
  AlignJustify,
  Palette,
  Kanban,
  GanttChart
} from "lucide-react";
import type { LayoutOption } from '../settings/types';

// Layout options configuration with modern Lucide icons
export const layoutOptions: LayoutOption[] = [
  {
    id: "wall",
    name: "Wall",
    description: "Arrange content in a brick-like formation.",
    icon: Layers
  },
  {
    id: "columns",
    name: "Columns",
    description: "Organize content in columns.",
    icon: Columns
  },
  {
    id: "kanban",
    name: "Kanban",
    description: "Manage tasks with drag-and-drop cards.",
    icon: Kanban
  },
  {
    id: "gantt",
    name: "Gantt",
    description: "Visualize tasks on a timeline with dependencies.",
    icon: GanttChart
  },
  {
    id: "grid",
    name: "Grid",
    description: "Arrange content in a grid pattern.",
    icon: Grid3X3
  },
  {
    id: "table",
    name: "Table",
    description: "Organize content in table format.",
    icon: Table
  },
  {
    id: "freeform",
    name: "Freeform",
    description: "Position content freely.",
    icon: Palette
  },
  {
    id: "timeline",
    name: "Timeline",
    description: "Arrange content along a horizontal line.",
    icon: Calendar
  },
  {
    id: "stream",
    name: "Stream",
    description: "Arrange content in a stream.",
    icon: AlignJustify
  },
  {
    id: "map",
    name: "Map",
    description: "Display content points on a map.",
    icon: Map
  },
];