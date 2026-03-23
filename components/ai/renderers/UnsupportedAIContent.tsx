'use client';

import { AlertCircle } from 'lucide-react';

export default function UnsupportedAIContent({ message }: { message: string }) {
  return (
    <div className="flex min-h-[160px] w-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <AlertCircle className="h-6 w-6 text-gray-300" />
        <div className="text-sm font-medium text-gray-500">AI content unavailable</div>
        <div className="max-w-[260px] text-xs text-gray-400">{message}</div>
      </div>
    </div>
  );
}
