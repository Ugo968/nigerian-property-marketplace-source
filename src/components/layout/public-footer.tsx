import * as React from "react";
import Link from "next/link";

interface FooterLink {
  href: string;
  label: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

const COLUMNS: FooterColumn[] = [
  {
    title: "Marketplace",
    links: [
      { href: "/properties", label: "Browse Properties" },
      { href: "/agents", label: "Find Agents" },
      { href: "/companies", label: "Companies" },
      { href: "/advertise", label: "Advertise" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/signup", label: "Sign up" },
      { href: "/login", label: "Sign in" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/subscription", label: "Plans & Pricing" },
    ],
  },
  {
    title: "Trust & Safety",
    links: [
      { href: "/safety", label: "Safety Guide" },
      { href: "/safety#report", label: "Report a Listing" },
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About Shelty" },
      { href: "/contact", label: "Contact" },
      { href: "/blog", label: "Blog" },
      { href: "/help", label: "Help Center" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-3">
            <p className="text-lg font-semibold text-foreground">Shelty</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Nigeria&apos;s trusted marketplace for property rentals, sales,
              and short-lets. Built for landlords, agents, and companies.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                {col.title}
              </h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 border-t pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Shelty. Made in Nigeria.
          </p>
          <p className="text-xs text-muted-foreground">
            Shelty does not hold property rent / purchase money. All
            payments are between the parties involved.
          </p>
        </div>
      </div>
    </footer>
  );
}
