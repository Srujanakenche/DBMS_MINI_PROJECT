import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DBMS Individualized Learning Platform",
  description:
    "Semester project educational learning-path and recommendation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
