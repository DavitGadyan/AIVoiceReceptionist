import type { Metadata, Viewport } from "next";
import { Manrope as BodyFont, Sora as DisplayFont } from "next/font/google";
import "./globals.css";

const displayFont = DisplayFont({ subsets: ["latin"], variable: "--font-display-loaded", display: "swap" });
const bodyFont = BodyFont({ subsets: ["latin"], variable: "--font-body-loaded", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Receptra — AI voice receptionist", template: "%s · Receptra" },
  description:
    "An AI receptionist that answers every call, books appointments, triages emergencies and texts you the summary. Set up for any business from a form or a PDF.",
  openGraph: {
    title: "Receptra — AI voice receptionist",
    description: "Answers every call. Books the job. Texts you the summary.",
    type: "website",
    images: ["/images/og.jpg"],
  },
};

export const viewport: Viewport = { themeColor: "#060606" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
