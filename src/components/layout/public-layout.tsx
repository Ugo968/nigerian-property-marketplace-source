import * as React from "react";
import { PublicHeader } from "./public-header";
import { PublicFooter } from "./public-footer";

/**
 * Layout for public-facing pages: home, search, property detail,
 * public profiles, advertising info, etc.
 *
 * Sticky footer pattern: footer sits at the bottom of the viewport when
 * content is short, and gets pushed down naturally when content is long.
 */
export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 flex flex-col">{children}</main>
      <PublicFooter />
    </div>
  );
}
