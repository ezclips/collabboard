import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Padlet } from "@/types/collabboard";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const calculatePadletHeight = (padlet: Partial<Padlet>): number => {
  // Default height for text padlets
  const DEFAULT_HEIGHT = 250;

  if (!padlet.type || padlet.type === "text") {
    return DEFAULT_HEIGHT;
  }

  if (padlet.type === "image") {
    return 320; // Taller for images to account for caption
  }

  if (padlet.type === "file") {
    return 180; // Shorter for file attachments
  }

  return DEFAULT_HEIGHT;
};