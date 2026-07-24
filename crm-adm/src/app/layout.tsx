import type { Metadata } from "next";
import { DM_Sans, Bree_Serif } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

const breeSerif = Bree_Serif({
  variable: "--font-bree-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "CRM ADM Soluções",
  description: "CRM interno da ADM Soluções",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${breeSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-navy">
        <Nav />
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
