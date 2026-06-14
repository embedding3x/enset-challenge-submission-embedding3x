import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { StorageProvider } from "@/contexts/StorageContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agentic TP Platform",
  description: "AI-powered practical work platform for students and teachers",
  icons: { icon: "/chatbot-logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${playfair.variable} ${GeistMono.variable} font-sans antialiased bg-appbg min-h-screen`}
      >
        <StorageProvider>
          <AuthProvider>{children}</AuthProvider>
        </StorageProvider>
      </body>
    </html>
  );
}
