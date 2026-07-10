import { ReactNode } from 'react';
import type { Metadata } from 'next'; // <-- Import the Metadata type
import './global.css'; // <-- This imports Tailwind CSS globally

export const metadata: Metadata = { // <-- Explicitly type the object
    title: 'World Cup 2026 Live Draft',
    description: 'Automated Real-Time Standings',
};

interface RootLayoutProps {
    children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <html lang="en">
        <head>
            {/* Additional head meta or link tags can go here */}
        </head>
        <body>
        {children}
        </body>
        </html>
    );
}