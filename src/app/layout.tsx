import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: ["400"],
});

const siteUrl = "https://my-stone.vercel.app";
const siteDescription =
  "A gamified reward tracker for your study journey. Log tasks, earn EXP and Gems, unlock milestone prizes, and prove community work with photo and GPS.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "MILESTONE",
    template: "%s · MILESTONE",
  },
  description: siteDescription,
  applicationName: "MILESTONE",
  keywords: [
    "MILESTONE",
    "study tracker",
    "gamified learning",
    "EXP",
    "gems",
    "milestones",
  ],
  authors: [{ name: "MILESTONE" }],
  icons: {
    icon: [{ url: "/brand/icon_d.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/brand/icon_d.png", type: "image/png", sizes: "512x512" }],
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "MILESTONE",
    title: "MILESTONE",
    description: siteDescription,
    images: [
      {
        url: "/brand/og-preview.png",
        width: 1200,
        height: 630,
        alt: "MILESTONE — Kickstart your journey. Every step counts.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MILESTONE",
    description: siteDescription,
    images: ["/brand/og-preview.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-warm-bg font-sans text-ink">
        {children}
      </body>
    </html>
  );
}
