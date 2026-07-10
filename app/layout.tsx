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
        </head>
        <body>{children}</body>
        </html>
    )
}