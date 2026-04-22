import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'text-color': [
        {
          text: [
            'primary-foreground',
            'secondary-foreground',
            'destructive-foreground',
            'muted-foreground',
            'accent-foreground',
            'card-foreground',
            'popover-foreground',
            'foreground',
          ],
        },
      ],
      'bg-color': [
        {
          bg: [
            'primary',
            'secondary',
            'destructive',
            'muted',
            'accent',
            'card',
            'popover',
            'background',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}
