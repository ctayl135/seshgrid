import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "NEW AGE NOIR — by New Age Music",
  description:
    "Underground music, made here. Record, shape beats, mix, and share your sound with NEW AGE NOIR by New Age Music.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
