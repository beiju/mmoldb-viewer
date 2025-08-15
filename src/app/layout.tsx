import type { Metadata } from "next";
import "./globals.css";
import React from "react";

export const metadata: Metadata = {
    title: "MMOLDB Viewer",
    description: "by beiju",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
        <body>
            <h1 className="title"><a href={"/"}>MMOLDB Viewer</a></h1>

            {children}
        </body>
        </html>
    );
}
