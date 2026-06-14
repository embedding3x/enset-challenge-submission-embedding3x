import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-appbg/80 backdrop-blur-xl border-b border-panelborder/60">
      <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Agentic TP Platform"
            width={179}
            height={120}
            priority
            className="h-[4.5rem] w-auto drop-shadow-[0_0_10px_rgba(168,85,247,0.45)]"
          />
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-textmuted">
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-white transition-colors">
            How It Works
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Pricing
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Docs
          </a>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className={buttonVariants({ variant: "hero", size: "sm" })}
          >
            Sign Up
          </Link>
        </div>
      </div>
    </nav>
  );
}
