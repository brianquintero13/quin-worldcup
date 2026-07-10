import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Fetch insult from Evil Insult API (server-side, bypassing browser CORS completely)
        const insultPromise = fetch('https://evilinsult.com/generate_insult.php?lang=en&type=json', {
            method: 'GET',
            next: { revalidate: 0 } // Bypass Next.js caches
        })
            .then(res => res.ok ? res.json() : null)
            .catch(() => null);

        // Fetch compliment from Complimentr API (server-side, bypassing browser CORS completely)
        const complimentPromise = fetch('https://complimentr.com/api', {
            method: 'GET',
            next: { revalidate: 0 }
        })
            .then(res => res.ok ? res.json() : null)
            .catch(() => null);

        const [insultData, complimentData] = await Promise.all([insultPromise, complimentPromise]);

        // Local fallbacks if the external APIs fail or are offline
        const fallbackInsults = [
            "YOUR TACTICAL SETUP IS AN ABSOLUTE DISASTER.",
            "SOMEONE TELL YOUR FORWARDS SCORING IS ALLOWED.",
            "YOUR SELF-ESTEEM HAS BEEN RULED OUT FOR THE REMAINDER OF THE TOURNAMENT.",
            "YOU ARE COLLECTING LOSSES LIKE RARE TRADING CARDS.",
            "WATCHING YOUR SQUAD PLAY FOOTBALL IS A CURE FOR CHRONIC INSOMNIA."
        ];

        const fallbackCompliments = [
            "YOUR SQUAD HAS LOCKED DOWN DEFENSE WITH AN UNBREAKABLE STRUCTURE.",
            "A MASTER OF THE DRAFT BOARD, ABSOLUTE PEP GUARDIOLA ENERGY.",
            "STOCKS IN YOUR SQUAD AND SELECTIONS ARE SOARING.",
            "YOU DRAFTED CAPE VERDE LIKE AN ABSOLUTE STRATEGY GENIUS.",
            "YOUR SELECTIONS REDEFINE TACTICAL BRILLIANCE."
        ];

        const finalInsult = insultData?.insult || fallbackInsults[Math.floor(Math.random() * fallbackInsults.length)];
        const finalCompliment = complimentData?.compliment || fallbackCompliments[Math.floor(Math.random() * fallbackCompliments.length)];

        return NextResponse.json({
            success: true,
            insult: finalInsult.toUpperCase(),
            compliment: finalCompliment.toUpperCase()
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            insult: "YOUR TACTICAL SETUP IS AN ABSOLUTE DISASTER.",
            compliment: "A MASTER OF THE DRAFT BOARD, ABSOLUTE PEP GUARDIOLA ENERGY."
        });
    }
}