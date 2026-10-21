import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HYDROGRAPH · Underwater Acoustic Intelligence",
  description: "Mission-control dashboard for AI-powered classification of hydrophone recordings. Detect biophonic, anthropogenic, and geophonic sound events in real time.",
  keywords: ["hydrophone", "acoustic classification", "machine learning", "librosa", "scikit-learn", "underwater audio", "biophonic", "anthropogenic", "geophonic", "oceanography"],
  authors: [{ name: "HYDROGRAPH" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "HYDROGRAPH · Underwater Acoustic Intelligence",
    description: "Mission-control dashboard for AI-powered hydrophone audio classification",
    url: "https://chat.z.ai",
    siteName: "HYDROGRAPH",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HYDROGRAPH",
    description: "Mission-control dashboard for AI-powered hydrophone audio classification",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased hydro-theme hydro-grid-animated`}
      >
        {children}
        <Toaster richColors theme="dark" />
      </body>
    </html>
  );
}
