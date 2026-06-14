import Image from "next/image";
import Link from "next/link";

const columns = [
  {
    title: "Platform",
    links: [
      { label: "Features", href: "#features" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "Pricing", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "#" },
      { label: "API", href: "#" },
      { label: "Support", href: "#" },
    ],
  },
  {
    title: "School",
    links: [
      { label: "ENSET Mohammedia", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-paneldark border-t border-panelborder/60 px-6 pt-16 pb-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center lg:items-start">
          {/* Brand */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <Link href="/" className="block">
              <Image
                src="/footer-logo.png"
                alt="Agentic TP Platform — Learn, Code, Understand"
                width={252}
                height={168}
                className="h-40 w-auto drop-shadow-[0_0_25px_rgba(168,85,247,0.25)]"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm text-textmuted leading-relaxed">
              AI agents that guide, evaluate and adapt — practical work,
              reimagined for the next generation of engineers.
            </p>
          </div>

          {/* Link columns */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-8 w-full">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="text-xs font-semibold uppercase tracking-wider text-textmuted mb-4">
                  {col.title}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-textlight/70 hover:text-white transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-panelborder/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-textmuted">
            © 2026 Agentic TP Platform. All rights reserved.
          </p>
          <p className="text-xs text-textmuted/70">
            Learn · Code · Understand
          </p>
        </div>
      </div>
    </footer>
  );
}
