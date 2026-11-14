import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-sans-face", subsets: ["latin"] });
const display = Newsreader({ variable: "--font-display-face", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MedGuard: are your medicines safe together?",
  description:
    "Scan your medicine labels. MedGuard finds hidden duplicate ingredients, dangerous combinations and confusing directions, backed by RxNorm and the exact words of FDA labels.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
