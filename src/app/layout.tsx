import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "The Binder — private tutoring, properly organised",
    template: "%s · The Binder",
  },
  description:
    "The Binder matches students with specialist tutors and keeps every lesson note, question and invoice in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${plexSans.variable} ${plexSerif.variable}`}>
      <body className="min-h-screen bg-paper-100">{children}</body>
    </html>
  );
}
