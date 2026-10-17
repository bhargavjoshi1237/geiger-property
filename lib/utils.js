import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Title Case for button labels ("add to lease" -> "Add to Lease"): small words stay lowercase mid-label, hyphen parts are capitalised, and words that already carry capitals (CAM) are left alone.
const MINOR_WORDS = new Set(["a", "an", "the", "and", "or", "nor", "but", "for", "to", "of", "in", "on", "at", "by", "as", "via", "per", "vs", "from", "into", "onto", "with"]);

export function titleCase(text = "") {
  const words = String(text).split(/(\s+)/);
  const last = words.length - 1;
  return words
    .map((word, i) => {
      if (!/^\p{L}/u.test(word)) return word;
      return word
        .split("-")
        .map((part, j) => {
          if (/\p{Lu}/u.test(part.slice(1))) return part;
          if (j === 0 && i !== 0 && i !== last && MINOR_WORDS.has(part.toLowerCase())) return part.toLowerCase();
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join("-");
    })
    .join("");
}
