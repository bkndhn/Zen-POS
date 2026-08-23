import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Languages, Check } from 'lucide-react';

// To add a new language, add a new entry here.
// The flag emoji and nativeName will be displayed in the dropdown.
const languages = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' }
];

export const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const currentLanguage = languages.find(lang => i18n.language?.startsWith(lang.code)) || languages[0];

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem('i18nextLng', langCode);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" title="Change language">
          <span className="text-base leading-none">{currentLanguage.flag}</span>
          <Languages className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">{currentLanguage.nativeName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {languages.map((lang) => {
          const isActive = i18n.language?.startsWith(lang.code);
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => changeLanguage(lang.code)}
              className={`flex items-center gap-2 ${isActive ? 'bg-accent font-medium' : ''}`}
            >
              <span className="text-base">{lang.flag}</span>
              <span className="flex-1">{lang.nativeName}</span>
              <span className="text-muted-foreground text-xs">({lang.name})</span>
              {isActive && <Check className="w-4 h-4 text-primary ml-1" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
