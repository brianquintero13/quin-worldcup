export const metadata = {
    title: 'World Cup 2026 Live Draft',
    description: 'Automated Real-Time Standings',
}

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
        <head>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body>{children}</body>
        </html>
    )
}