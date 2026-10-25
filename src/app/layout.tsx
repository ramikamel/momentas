import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "momentas — A memory, made visible",
  description: "Tell a memory. Recreate the moment. Start a conversation.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
