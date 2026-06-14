import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-appbg">
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <Image
          src="/hero-bg.jpg"
          alt=""
          fill
          priority
          className="object-cover opacity-25"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-appbg/90 via-appbg/70 to-appbg" />
      </div>

      {/* Floating glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary/10 blur-3xl animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full bg-secondary/10 blur-3xl animate-pulse" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 mb-8">
          <Sparkles className="w-4 h-4 text-secondary" />
          <span className="text-sm text-white/80 font-medium">
            AI-Powered Practical Work Environment
          </span>
        </div>

        <h1 className="font-serif text-5xl md:text-7xl font-semibold tracking-tight mb-6 text-white">
          The Future of <span className="text-gradient">Practical Work</span>
          <br />
          is Agentic
        </h1>

        <p className="text-lg md:text-xl text-textmuted max-w-2xl mx-auto mb-10 leading-relaxed">
          Transform how students learn with AI agents that guide, evaluate, and adapt in real time.
          A smart TP platform built for the next generation of hands-on education.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className={buttonVariants({ variant: "hero", size: "lg", className: "px-8 glow-button" })}
          >
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </Link>
          <a
            href="#features"
            className={buttonVariants({
              variant: "heroOutline",
              size: "lg",
              className: "px-8",
            })}
          >
            Watch Demo
          </a>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
          {[
            { value: "10K+", label: "Students" },
            { value: "500+", label: "TP Sessions" },
            { value: "98%", label: "Satisfaction" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-gradient">
                {stat.value}
              </div>
              <div className="text-sm text-textmuted mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
