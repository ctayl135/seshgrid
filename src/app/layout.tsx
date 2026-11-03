import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SeshGrid — Your sound starts here",
  description:
    "A free multitrack recording studio. Record, mix, and export your music.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
