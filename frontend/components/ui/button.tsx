import * as React from "react";

export type ButtonVariant = "hero" | "heroOutline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonVariantOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export function buttonVariants({
  variant = "hero",
  size = "md",
  className = "",
}: ButtonVariantOptions = {}) {
  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50";

  const sizes: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-sm rounded-lg",
    md: "h-10 px-4 text-sm rounded-xl",
    lg: "h-12 px-6 text-base rounded-2xl",
  };

  const variants: Record<ButtonVariant, string> = {
    hero: "bg-gradient-hero text-white font-bold hover:opacity-90 shadow-lg shadow-primary/20",
    heroOutline:
      "border border-primary/50 text-textlight bg-transparent hover:bg-primary/10",
    ghost:
      "bg-transparent text-textlight/70 hover:text-textlight hover:bg-white/5",
  };

  return [base, sizes[size], variants[variant], className].filter(Boolean).join(" ");
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={buttonVariants({ variant, size, className })}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
