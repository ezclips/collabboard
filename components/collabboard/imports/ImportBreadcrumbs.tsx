'use client';

import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface ImportBreadcrumbsProps {
  crumbs: BreadcrumbItem[];
  onNavigate: (id: string) => void;
}

export default function ImportBreadcrumbs({ crumbs, onNavigate }: ImportBreadcrumbsProps) {
  const all: BreadcrumbItem[] = [{ id: 'root', name: 'My Files' }, ...crumbs];

  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap">
      {all.map((crumb, i) => (
        <React.Fragment key={crumb.id}>
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
          {i === 0 ? (
            <button
              onClick={() => onNavigate('root')}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-800 transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{crumb.name}</span>
            </button>
          ) : i === all.length - 1 ? (
            <span className="text-gray-800 font-medium truncate max-w-[160px]">{crumb.name}</span>
          ) : (
            <button
              onClick={() => onNavigate(crumb.id)}
              className="text-blue-600 hover:text-blue-800 transition-colors truncate max-w-[120px]"
            >
              {crumb.name}
            </button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
