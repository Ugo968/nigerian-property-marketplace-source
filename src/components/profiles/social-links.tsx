import * as React from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Social links display — only shown when the profile owner is on a
 * Premium plan (capability gating in the public-profile fetcher).
 *
 * Per spec Section 23: social handles are a Premium-only feature.
 */
export interface SocialLinksProps {
  handles: Record<string, string> | null;
  className?: string;
}

const PLATFORM_URL_PRESETS: Record<string, string> = {
  facebook: "https://facebook.com/",
  instagram: "https://instagram.com/",
  twitter: "https://twitter.com/",
  x: "https://x.com/",
  linkedin: "https://linkedin.com/in/",
  tiktok: "https://tiktok.com/@",
  youtube: "https://youtube.com/@",
  whatsapp: "https://wa.me/",
};

export function SocialLinks({ handles, className }: SocialLinksProps) {
  const entries = Object.entries(handles ?? {});
  if (entries.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {entries.map(([key, value]) => {
        const href = resolveHandleUrl(key, value);
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Globe className="h-3 w-3" aria-hidden="true" />
            <span className="capitalize">{key}</span>
            <span className="text-muted-foreground">·{value}</span>
          </a>
        );
      })}
    </div>
  );
}

function resolveHandleUrl(platform: string, value: string): string {
  // If the value already starts with http, treat it as a full URL.
  if (/^https?:\/\//i.test(value)) return value;
  // WhatsApp special case: value should be phone digits
  if (platform === "whatsapp") {
    const digits = value.replace(/[^\d]/g, "");
    return `https://wa.me/${digits}`;
  }
  const preset = PLATFORM_URL_PRESETS[platform.toLowerCase()];
  if (preset) {
    // Strip leading @ if user included it
    const clean = value.replace(/^@/, "");
    return `${preset}${clean}`;
  }
  // Unknown platform — wrap in a generic http:// if it looks domain-y
  if (/^[\w-]+\.[a-z]{2,}/i.test(value)) {
    return `https://${value}`;
  }
  return value;
}
