import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette, Check, Droplet } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Theme {
    id: string;
    name: string;
    class: string;
    gradient: string;
    description: string;
}

const themes: Theme[] = [
    {
        id: 'blue',
        name: 'Blue',
        class: '',
        gradient: 'linear-gradient(135deg, hsl(218 90% 55%), hsl(230 85% 60%))',
        description: 'Classic blue gradient'
    },
    {
        id: 'blue-bright',
        name: 'Bright Blue',
        class: 'theme-blue-bright',
        gradient: 'linear-gradient(135deg, hsl(232 98% 50%), hsl(260 90% 60%))',
        description: 'Vivid bright blue'
    },
    {
        id: 'purple',
        name: 'Purple Gradient',
        class: 'theme-purple',
        gradient: 'linear-gradient(135deg, hsl(270 70% 55%) 0%, hsl(290 85% 55%) 50%, hsl(320 70% 55%) 100%)',
        description: 'Deep purple with violet'
    },
    {
        id: 'green',
        name: 'Emerald Green',
        class: 'theme-green',
        gradient: 'linear-gradient(135deg, hsl(160 74% 42%) 0%, hsl(175 75% 40%) 50%, hsl(185 70% 45%) 100%)',
        description: 'Fresh emerald & teal'
    },
    {
        id: 'rose',
        name: 'Rose Pink',
        class: 'theme-rose',
        gradient: 'linear-gradient(135deg, hsl(350 75% 58%) 0%, hsl(330 80% 55%) 50%, hsl(310 70% 60%) 100%)',
        description: 'Elegant rose gold'
    },
    {
        id: 'sunset',
        name: 'Sunset Orange',
        class: 'theme-sunset',
        gradient: 'linear-gradient(135deg, hsl(40 95% 55%) 0%, hsl(25 95% 55%) 50%, hsl(10 85% 55%) 100%)',
        description: 'Warm sunset coral'
    },
    {
        id: 'navy',
        name: 'Navy Blue',
        class: 'theme-navy',
        gradient: 'linear-gradient(135deg, hsl(240 100% 25%) 0%, hsl(230 90% 35%) 50%, hsl(220 80% 45%) 100%)',
        description: 'Dark navy blue'
    },
    {
        id: 'hotpink',
        name: 'Dark Pink',
        class: 'theme-hotpink',
        gradient: 'linear-gradient(135deg, hsl(322 75% 43%) 0%, hsl(310 70% 50%) 50%, hsl(300 65% 55%) 100%)',
        description: 'Rich dark pink'
    }
];

const THEME_STORAGE_KEY_BASE = 'hotel_pos_theme';
const CUSTOM_COLOR_STORAGE_KEY_BASE = 'hotel_pos_custom_color';

// Utility to convert Hex to HSL
const hexToHSL = (hex: string) => {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { h: 0, s: 0, l: 0 };

    let r = parseInt(result[1], 16);
    let g = parseInt(result[2], 16);
    let b = parseInt(result[3], 16);

    r /= 255;
    g /= 255;
    b /= 255;

    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
};

import { useBranch } from '@/contexts/BranchContext';

export const ThemeSettings: React.FC = () => {
    const { operatingBranchId, isAllBranchesView } = useBranch();

    // Branch-scoped storage key helpers
    const themeKey = operatingBranchId ? `${THEME_STORAGE_KEY_BASE}_${operatingBranchId}` : THEME_STORAGE_KEY_BASE;
    const customColorKey = operatingBranchId ? `${CUSTOM_COLOR_STORAGE_KEY_BASE}_${operatingBranchId}` : CUSTOM_COLOR_STORAGE_KEY_BASE;

    const readTheme = () => localStorage.getItem(themeKey) ?? localStorage.getItem(THEME_STORAGE_KEY_BASE) ?? 'blue';
    const readCustomColor = () => localStorage.getItem(customColorKey) ?? localStorage.getItem(CUSTOM_COLOR_STORAGE_KEY_BASE) ?? '#0324fc';

    const [activeTheme, setActiveTheme] = useState<string>(readTheme);
    const [customColor, setCustomColor] = useState<string>(readCustomColor);
    const [isDarkMode, setIsDarkMode] = useState<boolean>(document.documentElement.classList.contains('dark'));

    useEffect(() => {
        // Apply theme on mount
        if (activeTheme === 'custom') {
            applyCustomTheme(customColor);
        } else {
            applyTheme(activeTheme);
        }
        
        const handleThemeChange = () => {
            setIsDarkMode(document.documentElement.classList.contains('dark'));
        };
        window.addEventListener('theme-changed', handleThemeChange);
        return () => window.removeEventListener('theme-changed', handleThemeChange);
    }, []);

    // Re-apply theme when branch changes
    useEffect(() => {
        const newTheme = readTheme();
        const newColor = readCustomColor();
        setActiveTheme(newTheme);
        setCustomColor(newColor);
        if (newTheme === 'custom') {
            applyCustomTheme(newColor);
        } else {
            applyTheme(newTheme);
        }
    }, [operatingBranchId]);

    // Theme colors for status bar (meta theme-color)
    const themeColors: Record<string, string> = {
        'blue': '#3b82f6',
        'blue-bright': '#0324fc',
        'purple': '#9333ea',
        'green': '#10b981',
        'rose': '#e11d48',
        'sunset': '#f97316',
        'navy': '#1e3a8a',
        'hotpink': '#c11c84'
    };

    const applyTheme = (themeId: string) => {
        const theme = themes.find(t => t.id === themeId);
        if (!theme) return;

        // Cleanup custom styles
        document.documentElement.style.removeProperty('--primary');
        document.documentElement.style.removeProperty('--primary-foreground');
        document.documentElement.style.removeProperty('--primary-glow');
        document.documentElement.style.removeProperty('--ring');
        document.documentElement.style.removeProperty('--gradient-primary');
        document.documentElement.style.removeProperty('--sidebar-primary');
        document.documentElement.style.removeProperty('--sidebar-ring');
        document.documentElement.style.removeProperty('--btn-increment');
        document.documentElement.style.removeProperty('--qty-badge');

        // Remove all theme classes first
        themes.forEach(t => {
            if (t.class) document.documentElement.classList.remove(t.class);
        });

        // Add the new theme class (if not default blue)
        if (theme.class) {
            document.documentElement.classList.add(theme.class);
        }

        updateMetaThemeColor(themeColors[themeId] || '#3b82f6');
    };

    const applyCustomTheme = (color: string) => {
        const { h, s, l } = hexToHSL(color);
        const hslString = `${h} ${s}% ${l}%`;
        const glowString = `${h} ${Math.min(s + 5, 100)}% ${Math.min(l + 10, 95)}%`;

        // Remove existing theme classes
        themes.forEach(t => {
            if (t.class) document.documentElement.classList.remove(t.class);
        });

        // Set CSS variables directly on root
        document.documentElement.style.setProperty('--primary', hslString);
        document.documentElement.style.setProperty('--primary-foreground', '0 0% 100%');
        document.documentElement.style.setProperty('--primary-glow', glowString);
        document.documentElement.style.setProperty('--ring', hslString);
        document.documentElement.style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(${h} ${Math.max(s - 10, 0)}% ${Math.min(l + 5, 100)}%))`);
        
        // Sidebar and Buttons
        document.documentElement.style.setProperty('--sidebar-primary', hslString);
        document.documentElement.style.setProperty('--sidebar-ring', hslString);
        document.documentElement.style.setProperty('--btn-increment', hslString);
        document.documentElement.style.setProperty('--qty-badge', hslString);

        updateMetaThemeColor(color);
    };

    const updateMetaThemeColor = (color: string) => {
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', color);
        } else {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.setAttribute('name', 'theme-color');
            metaThemeColor.setAttribute('content', color);
            document.head.appendChild(metaThemeColor);
        }
    };

    const handleThemeChange = (themeId: string) => {
        setActiveTheme(themeId);
        localStorage.setItem(themeKey, themeId);
        window.dispatchEvent(new CustomEvent('theme-changed'));
        
        if (themeId === 'custom') {
            applyCustomTheme(customColor);
            toast({ title: "Custom Theme Active", description: "Using your custom color preference" });
        } else {
            applyTheme(themeId);
            const theme = themes.find(t => t.id === themeId);
            toast({ title: "Theme Changed", description: `Switched to ${theme?.name} theme` });
        }
    };

    const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newColor = e.target.value;
        setCustomColor(newColor);
        localStorage.setItem(customColorKey, newColor);
        window.dispatchEvent(new CustomEvent('theme-changed'));
        
        if (activeTheme === 'custom') {
            applyCustomTheme(newColor);
        }
    };

    const activateCustomTheme = () => {
        handleThemeChange('custom');
    };

    return (
        <Card>
            <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center space-x-2">
                    <Palette className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="text-base sm:text-lg">App Theme</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
                {isDarkMode ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-xl border border-dashed">
                        <Droplet className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
                        <h3 className="text-lg font-semibold text-foreground mb-2">Themes Disabled in Dark Mode</h3>
                        <p className="text-sm text-muted-foreground max-w-sm">
                            To ensure optimal text visibility and contrast, color themes are automatically disabled while Dark Mode is active.
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground mb-4">
                            Choose a theme to personalize your app experience.
                        </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
                    {themes.map((theme) => (
                        <button
                            key={theme.id}
                            onClick={() => handleThemeChange(theme.id)}
                            disabled={isAllBranchesView}
                            className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 ${isAllBranchesView ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:shadow-lg'} ${activeTheme === theme.id
                                ? 'border-primary ring-2 ring-primary/30 shadow-md'
                                : 'border-border hover:border-primary/50'
                                }`}
                        >
                            <div
                                className="w-full h-12 sm:h-16 rounded-lg mb-2 shadow-inner relative overflow-hidden"
                                style={{ background: theme.gradient }}
                            >
                                {activeTheme === theme.id && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                        <div className="bg-white rounded-full p-1">
                                            <Check className="w-3 h-3 text-black" />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-center">{theme.name}</span>
                        </button>
                    ))}

                    {/* Custom Color Option */}
                    <button
                        onClick={activateCustomTheme}
                        disabled={isAllBranchesView}
                        className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 ${isAllBranchesView ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:shadow-lg'} ${activeTheme === 'custom'
                            ? 'border-primary ring-2 ring-primary/30 shadow-md'
                            : 'border-border hover:border-primary/50'
                            }`}
                    >
                         <div
                            className="w-full h-12 sm:h-16 rounded-lg mb-2 shadow-inner relative overflow-hidden flex items-center justify-center bg-muted"
                            style={activeTheme === 'custom' ? { backgroundColor: customColor } : {}}
                        >
                             {activeTheme === 'custom' ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                     <div className="bg-white rounded-full p-1">
                                        <Check className="w-3 h-3 text-black" />
                                    </div>
                                </div>
                            ) : (
                                <Droplet className="w-6 h-6 text-muted-foreground" />
                            )}
                        </div>
                        <span className="text-xs sm:text-sm font-medium text-center">Custom</span>
                    </button>
                </div>

                {/* Custom Color Picker Input */}
                <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                     <div className="flex items-center gap-4">
                        <div className="relative">
                            <Input 
                                type="color" 
                                value={customColor}
                                onChange={handleCustomColorChange}
                                disabled={isAllBranchesView}
                                className="w-12 h-12 p-1 rounded-full cursor-pointer" 
                            />
                        </div>
                        <div className="flex-1">
                            <Label className="font-medium">Custom Color Picker</Label>
                            <p className="text-xs text-muted-foreground mt-1">
                                Pick any color to automatically generate a theme.
                            </p>
                        </div>
                        {activeTheme !== 'custom' && (
                             <Button size="sm" variant="outline" onClick={activateCustomTheme} disabled={isAllBranchesView}>
                                Apply Custom Color
                            </Button>
                        )}
                     </div>
                </div>
                </>
                )}
            </CardContent>
        </Card >
    );
};
