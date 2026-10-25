import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceProvider } from "../context/WorkspaceContext";

export const metadata: Metadata = {
  title: "AIClear | Technical Institution Approval Workflow & Compliance Management",
  description: "Integrated institutional case tracking, evidence vault, deterministic APH compliance checks, and alert management system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <WorkspaceProvider>
          {children}
        </WorkspaceProvider>
      </body>
    </html>
  );
}
