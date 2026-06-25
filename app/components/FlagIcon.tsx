import * as Flags from 'country-flag-icons/react/3x2';

interface FlagIconProps {
    teamName: string;
    variant?: 'small' | 'large';
}

export default function FlagIcon({ teamName, variant = 'small' }: FlagIconProps) {
    const isLarge = variant === 'large';

    // Manage dimensions cleanly based on active layout context
    const emptyClass = isLarge
        ? "w-6 h-4 sm:w-8 sm:h-6 inline-block bg-white/10 rounded-sm shadow-sm shrink-0"
        : "w-[18px] h-[12px] sm:w-[22px] sm:h-[15px] inline-block mr-1 bg-white/10 rounded-sm shadow-sm shrink-0";

    const emojiClass = isLarge
        ? "inline-block text-xl sm:text-2xl leading-none shrink-0 drop-shadow-md"
        : "inline-block mr-1 text-[14px] sm:text-[16px] leading-none shrink-0 drop-shadow-md";

    const flagClass = isLarge
        ? "w-6 h-4 sm:w-8 sm:h-6 rounded-sm shadow-lg object-cover shrink-0 drop-shadow-md"
        : "w-[18px] h-[12px] sm:w-[22px] sm:h-[15px] inline mr-1 rounded-sm shadow-md object-cover shrink-0 drop-shadow-md";

    if (!teamName || teamName === 'TBD') {
        return <span className={emptyClass} />;
    }

    if (teamName === 'Scotland') return <span className={emojiClass}>🏴󠁧󠁢󠁳󠁣󠁴󠁿</span>;
    if (teamName === 'England') return <span className={emojiClass}>🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>;
    if (teamName === 'Wales') return <span className={emojiClass}>🏴󠁧󠁢󠁷󠁬󠁳󠁿</span>;

    const map: { [key: string]: string } = {
        'USA': 'US', 'Argentina': 'AR', 'France': 'FR', 'Brazil': 'BR', 'Germany': 'DE',
        'Spain': 'ES', 'Mexico': 'MX', 'Japan': 'JP', 'Portugal': 'PT', 'Belgium': 'BE',
        'Netherlands': 'NL', 'Italy': 'IT', 'Canada': 'CA', 'Uruguay': 'UY', 'Croatia': 'HR',
        'Morocco': 'MA', 'Switzerland': 'CH', 'Colombia': 'CO', 'Senegal': 'SN', 'Denmark': 'DK',
        'South Korea': 'KR', 'Australia': 'AU', 'Poland': 'PL', 'Sweden': 'SE', 'Serbia': 'RS',
        'Ecuador': 'EC', 'Peru': 'PE', 'Iran': 'IR', 'Saudi Arabia': 'SA', 'Qatar': 'QA',
        'Tunisia': 'TN', 'Cameroon': 'CM', 'Ghana': 'GH', 'South Africa': 'ZA', 'Algeria': 'DZ',
        'Egypt': 'EG', 'Ivory Coast': 'CI', 'Nigeria': 'NG', 'Mali': 'ML', 'DR Congo': 'CD',
        'Turkey': 'TR', 'Norway': 'NO', 'Czechia': 'CZ', 'Austria': 'AT', 'Cape Verde': 'CV',
        'Haiti': 'HT', 'Uzbekistan': 'UZ', 'Iraq': 'IQ', 'Jordan': 'JO', 'Bosnia & Herz.': 'BA',
        'Paraguay': 'PY', 'Panama': 'PA', 'Curaçao': 'CW', 'New Zealand': 'NZ'
    };

    const code = map[teamName];
    if (!code) return <span className={emptyClass} />;

    const FlagComponent = (Flags as any)[code];
    return FlagComponent
        ? <FlagComponent className={flagClass} />
        : <span className={emptyClass} />;
}