import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import { Palette, LayoutTemplate, LayoutGrid, Type, Sparkles, Box, Check, RefreshCw, Droplets } from 'lucide-react';

const COLOR_PRESETS = [
    { id: 'custom', label: 'Custom Colors (Use Pickers)', primary: '', secondary: '', bg: '', text: '' },
    // Warm / Sunset
    { id: 'sunset', label: 'Sunset Warmth', primary: '#f97316', secondary: '#ea580c', bg: '#fffbeb', text: '#1c1917' },
    { id: 'ember', label: 'Ember Glow', primary: '#dc2626', secondary: '#991b1b', bg: '#fff7ed', text: '#431407' },
    { id: 'amber-noir', label: 'Amber Noir', primary: '#f59e0b', secondary: '#b45309', bg: '#0c0a09', text: '#fef3c7' },
    { id: 'saffron', label: 'Saffron Spice', primary: '#ea580c', secondary: '#c2410c', bg: '#fff7ed', text: '#7c2d12' },
    { id: 'tandoor', label: 'Tandoor Fire', primary: '#b91c1c', secondary: '#7f1d1d', bg: '#fef2f2', text: '#450a0a' },
    { id: 'peach-cream', label: 'Peach Cream', primary: '#fb923c', secondary: '#f97316', bg: '#fff7ed', text: '#7c2d12' },
    { id: 'terracotta', label: 'Terracotta Clay', primary: '#c2410c', secondary: '#9a3412', bg: '#fef6f2', text: '#431407' },
    { id: 'sunrise', label: 'Sunrise Bloom', primary: '#f43f5e', secondary: '#e11d48', bg: '#fff1f2', text: '#4c0519' },
    { id: 'copper', label: 'Copper Kettle', primary: '#b45309', secondary: '#78350f', bg: '#fffbeb', text: '#451a03' },
    { id: 'chai', label: 'Masala Chai', primary: '#92400e', secondary: '#78350f', bg: '#fef3c7', text: '#451a03' },
    // Green / Nature
    { id: 'forest', label: 'Forest Mint', primary: '#059669', secondary: '#047857', bg: '#f0fdf4', text: '#064e3b' },
    { id: 'sage', label: 'Sage Garden', primary: '#65a30d', secondary: '#4d7c0f', bg: '#f7fee7', text: '#1a2e05' },
    { id: 'emerald-dark', label: 'Emerald Night', primary: '#10b981', secondary: '#059669', bg: '#022c22', text: '#d1fae5' },
    { id: 'olive', label: 'Olive Grove', primary: '#84cc16', secondary: '#65a30d', bg: '#fefce8', text: '#365314' },
    { id: 'basil', label: 'Fresh Basil', primary: '#16a34a', secondary: '#15803d', bg: '#f0fdf4', text: '#052e16' },
    { id: 'jade', label: 'Jade Serenity', primary: '#14b8a6', secondary: '#0d9488', bg: '#f0fdfa', text: '#134e4a' },
    { id: 'moss', label: 'Deep Moss', primary: '#4d7c0f', secondary: '#3f6212', bg: '#f7fee7', text: '#1a2e05' },
    { id: 'matcha', label: 'Matcha Latte', primary: '#84cc16', secondary: '#65a30d', bg: '#f7fee7', text: '#365314' },
    { id: 'pine', label: 'Winter Pine', primary: '#166534', secondary: '#14532d', bg: '#f0fdf4', text: '#052e16' },
    { id: 'tea-leaf', label: 'Tea Leaf', primary: '#15803d', secondary: '#166534', bg: '#f0fdf4', text: '#14532d' },
    // Blue / Ocean
    { id: 'ocean', label: 'Ocean Breeze', primary: '#0284c7', secondary: '#0369a1', bg: '#f0f9ff', text: '#0c4a6e' },
    { id: 'deep-sea', label: 'Deep Sea', primary: '#0369a1', secondary: '#075985', bg: '#0c1a2b', text: '#e0f2fe' },
    { id: 'sky', label: 'Clear Sky', primary: '#0ea5e9', secondary: '#0284c7', bg: '#f0f9ff', text: '#0c4a6e' },
    { id: 'azure', label: 'Azure Bay', primary: '#2563eb', secondary: '#1d4ed8', bg: '#eff6ff', text: '#1e3a8a' },
    { id: 'navy-linen', label: 'Navy Linen', primary: '#1e3a8a', secondary: '#1e40af', bg: '#f8fafc', text: '#0f172a' },
    { id: 'arctic', label: 'Arctic Frost', primary: '#0ea5e9', secondary: '#0284c7', bg: '#f0f9ff', text: '#082f49' },
    { id: 'cyan-pop', label: 'Cyan Pop', primary: '#06b6d4', secondary: '#0891b2', bg: '#ecfeff', text: '#164e63' },
    { id: 'indigo-dream', label: 'Indigo Dream', primary: '#6366f1', secondary: '#4f46e5', bg: '#eef2ff', text: '#1e1b4b' },
    { id: 'midnight-blue', label: 'Midnight Blue', primary: '#3b82f6', secondary: '#2563eb', bg: '#0b1220', text: '#dbeafe' },
    { id: 'lagoon', label: 'Tropical Lagoon', primary: '#0d9488', secondary: '#0f766e', bg: '#f0fdfa', text: '#134e4a' },
    // Purple / Royal
    { id: 'royal', label: 'Royal Amethyst', primary: '#7c3aed', secondary: '#6d28d9', bg: '#faf5ff', text: '#4c1d95' },
    { id: 'lavender', label: 'Lavender Fields', primary: '#a855f7', secondary: '#9333ea', bg: '#faf5ff', text: '#581c87' },
    { id: 'plum', label: 'Plum Wine', primary: '#9333ea', secondary: '#7e22ce', bg: '#fdf4ff', text: '#4a044e' },
    { id: 'violet-noir', label: 'Violet Noir', primary: '#a78bfa', secondary: '#8b5cf6', bg: '#1e1b3a', text: '#ede9fe' },
    { id: 'orchid', label: 'Wild Orchid', primary: '#c026d3', secondary: '#a21caf', bg: '#fdf4ff', text: '#701a75' },
    { id: 'mulberry', label: 'Mulberry', primary: '#86198f', secondary: '#701a75', bg: '#fdf4ff', text: '#4a044e' },
    { id: 'grape', label: 'Grape Soda', primary: '#7e22ce', secondary: '#6b21a8', bg: '#faf5ff', text: '#3b0764' },
    // Pink / Rose
    { id: 'rose', label: 'Rose Gold', primary: '#db2777', secondary: '#be185d', bg: '#fff1f2', text: '#881337' },
    { id: 'blush', label: 'Blush Petal', primary: '#f472b6', secondary: '#ec4899', bg: '#fdf2f8', text: '#831843' },
    { id: 'coral', label: 'Coral Reef', primary: '#fb7185', secondary: '#f43f5e', bg: '#fff1f2', text: '#881337' },
    { id: 'magenta', label: 'Neon Magenta', primary: '#ec4899', secondary: '#db2777', bg: '#0f0715', text: '#fce7f3' },
    { id: 'candy', label: 'Bubblegum', primary: '#f472b6', secondary: '#ec4899', bg: '#fdf2f8', text: '#500724' },
    { id: 'strawberry', label: 'Strawberry Cream', primary: '#e11d48', secondary: '#be123c', bg: '#fff1f2', text: '#4c0519' },
    // Dark / Luxury
    { id: 'midnight', label: 'Midnight Velvet', primary: '#a78bfa', secondary: '#c084fc', bg: '#0f172a', text: '#f8fafc' },
    { id: 'obsidian', label: 'Luxury Obsidian', primary: '#fbbf24', secondary: '#f59e0b', bg: '#18181b', text: '#f4f4f5' },
    { id: 'onyx-gold', label: 'Onyx & Gold', primary: '#d4af37', secondary: '#b8860b', bg: '#0a0a0a', text: '#f5e6b3' },
    { id: 'noir-rose', label: 'Noir Rose', primary: '#f472b6', secondary: '#db2777', bg: '#111827', text: '#fce7f3' },
    { id: 'carbon', label: 'Carbon Fiber', primary: '#f43f5e', secondary: '#e11d48', bg: '#0c0a09', text: '#f5f5f4' },
    { id: 'graphite', label: 'Graphite Steel', primary: '#94a3b8', secondary: '#64748b', bg: '#1e293b', text: '#f1f5f9' },
    { id: 'midnight-mint', label: 'Midnight Mint', primary: '#5eead4', secondary: '#2dd4bf', bg: '#042f2e', text: '#ccfbf1' },
    { id: 'coal-copper', label: 'Coal & Copper', primary: '#ea580c', secondary: '#c2410c', bg: '#0c0a09', text: '#fef3c7' },
    { id: 'ink-cream', label: 'Ink & Cream', primary: '#facc15', secondary: '#eab308', bg: '#0f172a', text: '#fef9c3' },
    { id: 'black-emerald', label: 'Black Emerald', primary: '#10b981', secondary: '#059669', bg: '#0a0a0a', text: '#d1fae5' },
    { id: 'charcoal-rose', label: 'Charcoal Rose', primary: '#fb7185', secondary: '#f43f5e', bg: '#1c1917', text: '#ffe4e6' },
    // Neutral / Minimal
    { id: 'linen', label: 'Warm Linen', primary: '#78716c', secondary: '#57534e', bg: '#fafaf9', text: '#1c1917' },
    { id: 'stone', label: 'Stone Minimal', primary: '#44403c', secondary: '#292524', bg: '#f5f5f4', text: '#0c0a09' },
    { id: 'paper', label: 'Cream Paper', primary: '#a16207', secondary: '#854d0e', bg: '#fefce8', text: '#422006' },
    { id: 'nordic', label: 'Nordic White', primary: '#334155', secondary: '#1e293b', bg: '#f8fafc', text: '#0f172a' },
    { id: 'oat', label: 'Oat Milk', primary: '#a8a29e', secondary: '#78716c', bg: '#fafaf9', text: '#292524' },
    { id: 'kraft', label: 'Kraft Paper', primary: '#a16207', secondary: '#713f12', bg: '#fef3c7', text: '#422006' },
    { id: 'muji', label: 'Muji Beige', primary: '#57534e', secondary: '#44403c', bg: '#fafaf9', text: '#1c1917' },
    { id: 'porcelain', label: 'Porcelain', primary: '#475569', secondary: '#334155', bg: '#f8fafc', text: '#020617' },
    // Vintage / Retro
    { id: 'vintage', label: 'Vintage Diner', primary: '#dc2626', secondary: '#b91c1c', bg: '#fffaf0', text: '#450a0a' },
    { id: 'mustard', label: 'Vintage Mustard', primary: '#ca8a04', secondary: '#a16207', bg: '#fefce8', text: '#422006' },
    { id: 'burgundy', label: 'Burgundy Bistro', primary: '#9f1239', secondary: '#881337', bg: '#fff1f2', text: '#4c0519' },
    { id: 'retro-teal', label: 'Retro Teal', primary: '#0d9488', secondary: '#115e59', bg: '#fefce8', text: '#134e4a' },
    { id: '70s-orange', label: '70s Orange', primary: '#ea580c', secondary: '#9a3412', bg: '#fef3c7', text: '#431407' },
    { id: 'diner-blue', label: 'Diner Blue', primary: '#1d4ed8', secondary: '#1e3a8a', bg: '#fef3c7', text: '#172554' },
    // Cafe / Bakery
    { id: 'espresso', label: 'Espresso Bar', primary: '#78350f', secondary: '#451a03', bg: '#fef3c7', text: '#1c1917' },
    { id: 'cappuccino', label: 'Cappuccino', primary: '#92400e', secondary: '#78350f', bg: '#fefce8', text: '#422006' },
    { id: 'bakery', label: 'Bakery Cream', primary: '#b45309', secondary: '#92400e', bg: '#fffbeb', text: '#451a03' },
    { id: 'cocoa', label: 'Rich Cocoa', primary: '#7c2d12', secondary: '#431407', bg: '#fef7ed', text: '#1c1917' },
    { id: 'caramel', label: 'Caramel Drip', primary: '#c2410c', secondary: '#9a3412', bg: '#fefce8', text: '#431407' },
    { id: 'matcha-cafe', label: 'Matcha Cafe', primary: '#4d7c0f', secondary: '#3f6212', bg: '#fefce8', text: '#1a2e05' },
    // Bar / Nightlife
    { id: 'neon-pink', label: 'Neon Pink Bar', primary: '#ec4899', secondary: '#db2777', bg: '#0f0715', text: '#fce7f3' },
    { id: 'neon-cyan', label: 'Neon Cyan Club', primary: '#06b6d4', secondary: '#0891b2', bg: '#0c0a1a', text: '#cffafe' },
    { id: 'lime-glow', label: 'Lime Glow', primary: '#a3e635', secondary: '#84cc16', bg: '#0a0f0a', text: '#ecfccb' },
    { id: 'wine-cellar', label: 'Wine Cellar', primary: '#be123c', secondary: '#9f1239', bg: '#1c0a0f', text: '#ffe4e6' },
    { id: 'whiskey', label: 'Whiskey Amber', primary: '#f59e0b', secondary: '#d97706', bg: '#1c1206', text: '#fef3c7' },
    { id: 'speakeasy', label: 'Speakeasy', primary: '#d4af37', secondary: '#b8860b', bg: '#111827', text: '#fef3c7' },
    // Regional / Cultural
    { id: 'kerala', label: 'Kerala Coconut', primary: '#059669', secondary: '#065f46', bg: '#f0fdf4', text: '#052e16' },
    { id: 'rajasthan', label: 'Rajasthan Royal', primary: '#c026d3', secondary: '#a21caf', bg: '#fdf4ff', text: '#4a044e' },
    { id: 'punjab-gold', label: 'Punjab Gold', primary: '#eab308', secondary: '#ca8a04', bg: '#fefce8', text: '#422006' },
    { id: 'goa-beach', label: 'Goa Beach', primary: '#f97316', secondary: '#ea580c', bg: '#ecfeff', text: '#164e63' },
    { id: 'tuscany', label: 'Tuscany Sun', primary: '#ca8a04', secondary: '#a16207', bg: '#fef3c7', text: '#422006' },
    { id: 'sakura', label: 'Sakura Blossom', primary: '#f472b6', secondary: '#ec4899', bg: '#fdf2f8', text: '#831843' },
    { id: 'zen-garden', label: 'Zen Garden', primary: '#78716c', secondary: '#57534e', bg: '#fafaf9', text: '#1c1917' },
    { id: 'moroccan', label: 'Moroccan Tile', primary: '#0d9488', secondary: '#115e59', bg: '#fff7ed', text: '#134e4a' },
    { id: 'santorini', label: 'Santorini Blue', primary: '#2563eb', secondary: '#1d4ed8', bg: '#f8fafc', text: '#1e3a8a' },
    { id: 'mexico-fiesta', label: 'Mexico Fiesta', primary: '#e11d48', secondary: '#be123c', bg: '#fefce8', text: '#4c0519' },
    // Playful / Modern
    { id: 'bento', label: 'Bento Bright', primary: '#f97316', secondary: '#facc15', bg: '#fefce8', text: '#422006' },
    { id: 'pastel-mix', label: 'Pastel Mix', primary: '#a78bfa', secondary: '#f472b6', bg: '#faf5ff', text: '#3b0764' },
    { id: 'gelato', label: 'Gelato Scoops', primary: '#f472b6', secondary: '#a78bfa', bg: '#fdf2f8', text: '#500724' },
    { id: 'sunrise-pop', label: 'Sunrise Pop', primary: '#fb923c', secondary: '#f472b6', bg: '#fff7ed', text: '#7c2d12' },
    { id: 'mint-choc', label: 'Mint Chocolate', primary: '#5eead4', secondary: '#14b8a6', bg: '#0c0a09', text: '#ccfbf1' },
    { id: 'watermelon', label: 'Watermelon', primary: '#f43f5e', secondary: '#65a30d', bg: '#f7fee7', text: '#881337' },
    { id: 'mango-lassi', label: 'Mango Lassi', primary: '#f59e0b', secondary: '#eab308', bg: '#fffbeb', text: '#78350f' },
    { id: 'blueberry', label: 'Blueberry Muffin', primary: '#6366f1', secondary: '#4f46e5', bg: '#eef2ff', text: '#1e1b4b' },
    { id: 'kiwi', label: 'Kiwi Slice', primary: '#84cc16', secondary: '#65a30d', bg: '#f7fee7', text: '#365314' },
    { id: 'raspberry', label: 'Raspberry Tart', primary: '#e11d48', secondary: '#be123c', bg: '#fff1f2', text: '#4c0519' },
];

// 100+ curated Google Fonts organized by mood/use-case.
const FONT_OPTIONS: { value: string; label: string; group: string }[] = [
    // System / Clean
    { value: 'Inter', label: 'Inter (Default, Clean)', group: 'Modern Sans' },
    { value: "'Poppins', sans-serif", label: 'Poppins (Sleek, Geometric)', group: 'Modern Sans' },
    { value: "'Montserrat', sans-serif", label: 'Montserrat (Modern, Strong)', group: 'Modern Sans' },
    { value: "'Outfit', sans-serif", label: 'Outfit (Modern, Geometric)', group: 'Modern Sans' },
    { value: "'DM Sans', sans-serif", label: 'DM Sans (Neutral, Balanced)', group: 'Modern Sans' },
    { value: "'Manrope', sans-serif", label: 'Manrope (Rounded, Friendly)', group: 'Modern Sans' },
    { value: "'Plus Jakarta Sans', sans-serif", label: 'Plus Jakarta Sans (Startup)', group: 'Modern Sans' },
    { value: "'Sora', sans-serif", label: 'Sora (Tech, Modern)', group: 'Modern Sans' },
    { value: "'Figtree', sans-serif", label: 'Figtree (Digital, Warm)', group: 'Modern Sans' },
    { value: "'Nunito', sans-serif", label: 'Nunito (Rounded, Cozy)', group: 'Modern Sans' },
    { value: "'Nunito Sans', sans-serif", label: 'Nunito Sans (Clean, Friendly)', group: 'Modern Sans' },
    { value: "'Work Sans', sans-serif", label: 'Work Sans (Professional)', group: 'Modern Sans' },
    { value: "'Rubik', sans-serif", label: 'Rubik (Playful, Solid)', group: 'Modern Sans' },
    { value: "'Barlow', sans-serif", label: 'Barlow (Industrial)', group: 'Modern Sans' },
    { value: "'Urbanist', sans-serif", label: 'Urbanist (Contemporary)', group: 'Modern Sans' },
    { value: "'Space Grotesk', sans-serif", label: 'Space Grotesk (Tech Editorial)', group: 'Modern Sans' },
    { value: "'Epilogue', sans-serif", label: 'Epilogue (Modern Architecture)', group: 'Modern Sans' },
    { value: "'Onest', sans-serif", label: 'Onest (Neutral Modern)', group: 'Modern Sans' },
    { value: "'Kanit', sans-serif", label: 'Kanit (Bold Confident)', group: 'Modern Sans' },
    { value: "'Karla', sans-serif", label: 'Karla (Grotesque, Warm)', group: 'Modern Sans' },
    { value: "'Hind', sans-serif", label: 'Hind (Indic-friendly)', group: 'Modern Sans' },
    { value: "'Mulish', sans-serif", label: 'Mulish (Minimal Sans)', group: 'Modern Sans' },
    { value: "'PT Sans', sans-serif", label: 'PT Sans (Utility)', group: 'Modern Sans' },
    { value: "'Public Sans', sans-serif", label: 'Public Sans (Government Clear)', group: 'Modern Sans' },
    { value: "'Overpass', sans-serif", label: 'Overpass (Clean UI)', group: 'Modern Sans' },
    { value: "'Cabin', sans-serif", label: 'Cabin (Humanist)', group: 'Modern Sans' },
    { value: "'Josefin Sans', sans-serif", label: 'Josefin Sans (Art Deco, Elegant)', group: 'Modern Sans' },
    { value: "'Quicksand', sans-serif", label: 'Quicksand (Friendly, Soft)', group: 'Modern Sans' },
    { value: "'Comfortaa', sans-serif", label: 'Comfortaa (Rounded Soft)', group: 'Modern Sans' },
    { value: "'Varela Round', sans-serif", label: 'Varela Round (Cheerful)', group: 'Modern Sans' },
    // Elegant Serifs / Fine Dining
    { value: "'Playfair Display', serif", label: 'Playfair Display (Elegant, Fine Dining)', group: 'Elegant Serif' },
    { value: "'Cormorant Garamond', serif", label: 'Cormorant Garamond (Prestige Serifs)', group: 'Elegant Serif' },
    { value: "'Cormorant', serif", label: 'Cormorant (Refined Classical)', group: 'Elegant Serif' },
    { value: "'Cinzel', serif", label: 'Cinzel (Luxury Classic)', group: 'Elegant Serif' },
    { value: "'DM Serif Display', serif", label: 'DM Serif Display (Editorial)', group: 'Elegant Serif' },
    { value: "'DM Serif Text', serif", label: 'DM Serif Text (Editorial Body)', group: 'Elegant Serif' },
    { value: "'Instrument Serif', serif", label: 'Instrument Serif (Modern Magazine)', group: 'Elegant Serif' },
    { value: "'Fraunces', serif", label: 'Fraunces (Warm Editorial)', group: 'Elegant Serif' },
    { value: "'Libre Baskerville', serif", label: 'Libre Baskerville (Classic Book)', group: 'Elegant Serif' },
    { value: "'Libre Caslon Display', serif", label: 'Libre Caslon (Old-world Class)', group: 'Elegant Serif' },
    { value: "'Merriweather', serif", label: 'Merriweather (Readable Serif)', group: 'Elegant Serif' },
    { value: "'Lora', serif", label: 'Lora (Calligraphic Warmth)', group: 'Elegant Serif' },
    { value: "'PT Serif', serif", label: 'PT Serif (Traditional)', group: 'Elegant Serif' },
    { value: "'Crimson Text', serif", label: 'Crimson Text (Book)', group: 'Elegant Serif' },
    { value: "'Crimson Pro', serif", label: 'Crimson Pro (Refined Book)', group: 'Elegant Serif' },
    { value: "'EB Garamond', serif", label: 'EB Garamond (Timeless)', group: 'Elegant Serif' },
    { value: "'Spectral', serif", label: 'Spectral (Long-form Elegant)', group: 'Elegant Serif' },
    { value: "'Bitter', serif", label: 'Bitter (Slab Editorial)', group: 'Elegant Serif' },
    { value: "'Alegreya', serif", label: 'Alegreya (Literary)', group: 'Elegant Serif' },
    { value: "'Source Serif Pro', serif", label: 'Source Serif Pro (Balanced)', group: 'Elegant Serif' },
    { value: "'Prata', serif", label: 'Prata (Fashion Editorial)', group: 'Elegant Serif' },
    { value: "'Italiana', serif", label: 'Italiana (Couture Thin)', group: 'Elegant Serif' },
    { value: "'Cardo', serif", label: 'Cardo (Scholarly)', group: 'Elegant Serif' },
    { value: "'Marcellus', serif", label: 'Marcellus (Roman Refined)', group: 'Elegant Serif' },
    // Bold Headline / Display
    { value: "'Abril Fatface', serif", label: 'Abril Fatface (Bold Headline)', group: 'Display' },
    { value: "'Bebas Neue', sans-serif", label: 'Bebas Neue (Poster Bold)', group: 'Display' },
    { value: "'Anton', sans-serif", label: 'Anton (Condensed Impact)', group: 'Display' },
    { value: "'Archivo Black', sans-serif", label: 'Archivo Black (Heavy)', group: 'Display' },
    { value: "'Oswald', sans-serif", label: 'Oswald (Newspaper Bold)', group: 'Display' },
    { value: "'Righteous', cursive", label: 'Righteous (Retro Sign)', group: 'Display' },
    { value: "'Alfa Slab One', serif", label: 'Alfa Slab One (Chunky Slab)', group: 'Display' },
    { value: "'Ultra', serif", label: 'Ultra (Extreme Weight)', group: 'Display' },
    { value: "'Rozha One', serif", label: 'Rozha One (Bold Editorial)', group: 'Display' },
    { value: "'Yeseva One', serif", label: 'Yeseva One (Curvy Display)', group: 'Display' },
    { value: "'Bungee', cursive", label: 'Bungee (Signage Fun)', group: 'Display' },
    { value: "'Titan One', cursive", label: 'Titan One (Chunky Playful)', group: 'Display' },
    { value: "'Passion One', cursive", label: 'Passion One (Sports Bold)', group: 'Display' },
    { value: "'Staatliches', cursive", label: 'Staatliches (Poster Sans)', group: 'Display' },
    { value: "'Russo One', sans-serif", label: 'Russo One (Industrial Bold)', group: 'Display' },
    { value: "'Black Ops One', cursive", label: 'Black Ops One (Stencil)', group: 'Display' },
    { value: "'Fjalla One', sans-serif", label: 'Fjalla One (Compact Poster)', group: 'Display' },
    { value: "'Teko', sans-serif", label: 'Teko (Compressed Bold)', group: 'Display' },
    // Handwritten / Script / Playful
    { value: "'Caveat', cursive", label: 'Caveat (Playful, Cafe style)', group: 'Handwritten' },
    { value: "'Dancing Script', cursive", label: 'Dancing Script (Handwritten)', group: 'Handwritten' },
    { value: "'Pacifico', cursive", label: 'Pacifico (Fun, Bold Retro)', group: 'Handwritten' },
    { value: "'Lobster', cursive", label: 'Lobster (Vintage Script)', group: 'Handwritten' },
    { value: "'Lobster Two', cursive", label: 'Lobster Two (Retro Bakery)', group: 'Handwritten' },
    { value: "'Great Vibes', cursive", label: 'Great Vibes (Wedding Script)', group: 'Handwritten' },
    { value: "'Sacramento', cursive", label: 'Sacramento (Delicate Script)', group: 'Handwritten' },
    { value: "'Satisfy', cursive", label: 'Satisfy (Retro Diner)', group: 'Handwritten' },
    { value: "'Kaushan Script', cursive", label: 'Kaushan Script (Brush)', group: 'Handwritten' },
    { value: "'Shadows Into Light', cursive", label: 'Shadows Into Light (Marker)', group: 'Handwritten' },
    { value: "'Amatic SC', cursive", label: 'Amatic SC (Thin Handwritten)', group: 'Handwritten' },
    { value: "'Permanent Marker', cursive", label: 'Permanent Marker (Bold Marker)', group: 'Handwritten' },
    { value: "'Indie Flower', cursive", label: 'Indie Flower (Casual Note)', group: 'Handwritten' },
    { value: "'Homemade Apple', cursive", label: 'Homemade Apple (Real Handwriting)', group: 'Handwritten' },
    { value: "'Cookie', cursive", label: 'Cookie (Sweet Script)', group: 'Handwritten' },
    { value: "'Yellowtail', cursive", label: 'Yellowtail (Retro Brush)', group: 'Handwritten' },
    { value: "'Parisienne', cursive", label: 'Parisienne (French Script)', group: 'Handwritten' },
    { value: "'Alex Brush', cursive", label: 'Alex Brush (Elegant Brush)', group: 'Handwritten' },
    { value: "'Allura', cursive", label: 'Allura (Wedding Elegant)', group: 'Handwritten' },
    { value: "'Marck Script', cursive", label: 'Marck Script (Casual Script)', group: 'Handwritten' },
    { value: "'Kalam', cursive", label: 'Kalam (Indic Handwriting)', group: 'Handwritten' },
    { value: "'Neucha', cursive", label: 'Neucha (Sketch Notes)', group: 'Handwritten' },
    { value: "'Reenie Beanie', cursive", label: 'Reenie Beanie (School Notes)', group: 'Handwritten' },
    // Monospace / Tech
    { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono (Code)', group: 'Monospace' },
    { value: "'Space Mono', monospace", label: 'Space Mono (Retro Tech)', group: 'Monospace' },
    { value: "'Fira Code', monospace", label: 'Fira Code (Developer)', group: 'Monospace' },
    { value: "'IBM Plex Mono', monospace", label: 'IBM Plex Mono (Corporate Tech)', group: 'Monospace' },
    { value: "'Roboto Mono', monospace", label: 'Roboto Mono (Neutral Mono)', group: 'Monospace' },
    { value: "'Source Code Pro', monospace", label: 'Source Code Pro (Adobe Mono)', group: 'Monospace' },
    { value: "'Inconsolata', monospace", label: 'Inconsolata (Clean Mono)', group: 'Monospace' },
    { value: "'Ubuntu Mono', monospace", label: 'Ubuntu Mono (System Mono)', group: 'Monospace' },
    { value: "'Cousine', monospace", label: 'Cousine (Typewriter Mono)', group: 'Monospace' },
    // Indic scripts
    { value: "'Noto Sans Tamil', sans-serif", label: 'Noto Sans Tamil (தமிழ்)', group: 'Indic' },
    { value: "'Noto Serif Tamil', serif", label: 'Noto Serif Tamil (தமிழ் Serif)', group: 'Indic' },
    { value: "'Noto Sans Devanagari', sans-serif", label: 'Noto Sans Devanagari (हिन्दी)', group: 'Indic' },
    { value: "'Tiro Devanagari Hindi', serif", label: 'Tiro Devanagari (Editorial हिन्दी)', group: 'Indic' },
    { value: "'Noto Sans Telugu', sans-serif", label: 'Noto Sans Telugu (తెలుగు)', group: 'Indic' },
    { value: "'Noto Sans Kannada', sans-serif", label: 'Noto Sans Kannada (ಕನ್ನಡ)', group: 'Indic' },
    { value: "'Noto Sans Malayalam', sans-serif", label: 'Noto Sans Malayalam (മലയാളം)', group: 'Indic' },
    { value: "'Noto Sans Bengali', sans-serif", label: 'Noto Sans Bengali (বাংলা)', group: 'Indic' },
    { value: "'Noto Sans Gujarati', sans-serif", label: 'Noto Sans Gujarati (ગુજરાતી)', group: 'Indic' },
    { value: "'Baloo Chettan 2', sans-serif", label: 'Baloo Chettan 2 (Malayalam Bold)', group: 'Indic' },
    { value: "'Baloo Tamma 2', sans-serif", label: 'Baloo Tamma 2 (Kannada Bold)', group: 'Indic' },
    { value: "'Baloo Thambi 2', sans-serif", label: 'Baloo Thambi 2 (Tamil Bold)', group: 'Indic' },
    { value: "'Hind Madurai', sans-serif", label: 'Hind Madurai (Tamil Modern)', group: 'Indic' },
    { value: "'Anek Tamil', sans-serif", label: 'Anek Tamil (Contemporary Tamil)', group: 'Indic' },
    { value: "'Mukti', sans-serif", label: 'Mukti (Bengali)', group: 'Indic' },
];

export const MenuDesignStudio = () => {
    const { profile } = useAuth();
    const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
    const { operatingBranchId, branches } = useBranch();
    const isMainBranch = branches.find(b => b.id === operatingBranchId)?.is_main;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Layout Settings
    const [layoutStyle, setLayoutStyle] = useState('classic');
    const [menuItemsPerRow, setMenuItemsPerRow] = useState(1);
    
    // Typography Settings
    const [fontFamily, setFontFamily] = useState('Inter');
    
    // Aesthetics Settings
    const [borderRadius, setBorderRadius] = useState('md');
    const [cardElevation, setCardElevation] = useState('subtle');
    const [glassmorphism, setGlassmorphism] = useState(false);
    
    // AI Settings
    const [aiEnabled, setAiEnabled] = useState(false);
    
    // Store original shop settings to preserve them during save
    const [shopDetails, setShopDetails] = useState<any>(null);

    // Color Settings & Preset
    const [colorPreset, setColorPreset] = useState('custom');
    const [primaryColor, setPrimaryColor] = useState('#f97316');
    const [secondaryColor, setSecondaryColor] = useState('#ea580c');
    const [backgroundColor, setBackgroundColor] = useState('#fffbeb');
    const [textColor, setTextColor] = useState('#1c1917');
    
    const [isDarkMode, setIsDarkMode] = useState<boolean>(() => document.documentElement.classList.contains('dark'));

    useEffect(() => {
        const handleThemeChange = () => setIsDarkMode(document.documentElement.classList.contains('dark'));
        window.addEventListener('theme-changed', handleThemeChange);
        return () => window.removeEventListener('theme-changed', handleThemeChange);
    }, []);

    // Preset selection change handler
    const handlePresetChange = (presetId: string) => {
        setColorPreset(presetId);
        const preset = COLOR_PRESETS.find(p => p.id === presetId);
        if (preset && presetId !== 'custom') {
            setPrimaryColor(preset.primary);
            setSecondaryColor(preset.secondary);
            setBackgroundColor(preset.bg);
            setTextColor(preset.text);
        }
    };

    // Dynamically load Google Font in studio for previewing
    useEffect(() => {
        if (!fontFamily || fontFamily === 'Inter') {
            return;
        }

        const fontName = fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        const fontId = `google-font-studio-${fontName.toLowerCase().replace(/\s+/g, '-')}`;

        if (document.getElementById(fontId)) return;

        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700;800&display=swap`;
        document.head.appendChild(link);
    }, [fontFamily]);

    const [adminAuthUid, setAdminAuthUid] = useState<string | null>(null);

    useEffect(() => {
        const resolveAuthUid = async () => {
            if (!profile) return;
            if (profile.role === 'admin') {
                setAdminAuthUid(profile.user_id);
            } else if (profile.admin_id) {
                const { data } = await supabase
                    .from('profiles')
                    .select('user_id')
                    .eq('id', profile.admin_id)
                    .maybeSingle();
                if (data?.user_id) setAdminAuthUid(data.user_id);
            }
        };
        resolveAuthUid();
    }, [profile]);

    useEffect(() => {
        if (adminAuthUid) {
            loadSettings();
        }
    }, [adminAuthUid, operatingBranchId]);

    const loadSettings = async () => {
        if (!adminAuthUid) return;
        setLoading(true);
            // Fetch branch-specific settings or fallback to main
            let { data } = await supabase
                .from('shop_settings')
                .select('*')
                .eq('user_id', adminAuthUid)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();

            if (!data) {
                const { data: fb } = await supabase
                    .from('shop_settings')
                    .select('*')
                    .eq('user_id', adminAuthUid)
                    .order('branch_id', { nullsFirst: false })
                    .limit(1)
                    .maybeSingle();
                data = fb;
            }

            if (data) {
                // Keep a copy of non-design-studio settings
                setShopDetails({
                    shop_name: data.shop_name,
                    address: data.address,
                    contact_number: data.contact_number,
                    logo_url: data.logo_url,
                    printer_width: data.printer_width,
                    facebook: data.facebook,
                    show_facebook: data.show_facebook,
                    instagram: data.instagram,
                    show_instagram: data.show_instagram,
                    whatsapp: data.whatsapp,
                    show_whatsapp: data.show_whatsapp,
                    upi_id: data.upi_id,
                    upi_name: data.upi_name,
                    qr_payment_enabled: data.qr_payment_enabled,
                    gst_enabled: data.gst_enabled,
                    gstin: data.gstin,
                    is_composition_scheme: data.is_composition_scheme,
                    composition_rate: data.composition_rate,
                    visible_nav_pages: data.visible_nav_pages
                });

                if (data.menu_layout_style) {
                    const parts = data.menu_layout_style.split(':');
                    setLayoutStyle(parts[0]);
                    setCardElevation(parts[1] || 'subtle');
                }
                if (data.menu_font_family) setFontFamily(data.menu_font_family);
                if (data.menu_border_radius) setBorderRadius(data.menu_border_radius);
                if (data.menu_glassmorphism !== null) setGlassmorphism(data.menu_glassmorphism);
                if (data.menu_ai_features_enabled !== null) setAiEnabled(data.menu_ai_features_enabled);
                if (data.menu_items_per_row) setMenuItemsPerRow(data.menu_items_per_row);
                
                // Color settings
                if (data.menu_primary_color) setPrimaryColor(data.menu_primary_color);
                if (data.menu_secondary_color) setSecondaryColor(data.menu_secondary_color);
                if (data.menu_background_color) setBackgroundColor(data.menu_background_color);
                if (data.menu_text_color) setTextColor(data.menu_text_color);

                // Determine if preset matches loaded colors
                const matchedPreset = COLOR_PRESETS.find(p => 
                    p.id !== 'custom' &&
                    p.primary.toLowerCase() === (data.menu_primary_color || '').toLowerCase() &&
                    p.secondary.toLowerCase() === (data.menu_secondary_color || '').toLowerCase() &&
                    p.bg.toLowerCase() === (data.menu_background_color || '').toLowerCase() &&
                    p.text.toLowerCase() === (data.menu_text_color || '').toLowerCase()
                );
                if (matchedPreset) {
                    setColorPreset(matchedPreset.id);
                } else {
                    setColorPreset('custom');
                }
            }
        setLoading(false);
    };

    const handleSave = async () => {
        if (!adminAuthUid) return;
        setSaving(true);
        try {
            const payload: any = {
                user_id: adminAuthUid,
                branch_id: operatingBranchId,
                menu_layout_style: `${layoutStyle}:${cardElevation}`,
                menu_font_family: fontFamily,
                menu_border_radius: borderRadius,
                menu_glassmorphism: glassmorphism,
                menu_ai_features_enabled: aiEnabled,
                menu_primary_color: primaryColor,
                menu_secondary_color: secondaryColor,
                menu_background_color: backgroundColor,
                menu_text_color: textColor,
                menu_items_per_row: menuItemsPerRow
            };

            // If we have loaded shop details, merge them to avoid wiping them out
            if (shopDetails) {
                payload.shop_name = shopDetails.shop_name;
                payload.address = shopDetails.address;
                payload.contact_number = shopDetails.contact_number;
                payload.logo_url = shopDetails.logo_url;
                payload.printer_width = shopDetails.printer_width;
                payload.facebook = shopDetails.facebook;
                payload.show_facebook = shopDetails.show_facebook;
                payload.instagram = shopDetails.instagram;
                payload.show_instagram = shopDetails.show_instagram;
                payload.whatsapp = shopDetails.whatsapp;
                payload.show_whatsapp = shopDetails.show_whatsapp;
                payload.upi_id = shopDetails.upi_id;
                payload.upi_name = shopDetails.upi_name;
                payload.qr_payment_enabled = shopDetails.qr_payment_enabled;
                payload.gst_enabled = shopDetails.gst_enabled;
                payload.gstin = shopDetails.gstin;
                payload.is_composition_scheme = shopDetails.is_composition_scheme;
                payload.composition_rate = shopDetails.composition_rate;
                payload.visible_nav_pages = shopDetails.visible_nav_pages;
            }

            const { data: existing } = await supabase
                .from('shop_settings')
                .select('id')
                .eq('user_id', adminAuthUid)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();

            if (existing?.id) {
                await supabase.from('shop_settings').update(payload).eq('id', existing.id);
            } else {
                await supabase.from('shop_settings').insert(payload);
            }

            toast({
                title: "Settings Saved",
                description: "Your customer portal has been updated.",
            });
            
            // Broadcast so preview updates immediately (match event name in PublicMenu.tsx)
            const channel = supabase.channel(`menu-settings-${adminId}`);
            await channel.send({
                type: 'broadcast',
                event: 'menu-settings-updated',
                payload: {
                    menu_primary_color: primaryColor,
                    menu_secondary_color: secondaryColor,
                    menu_background_color: backgroundColor,
                    menu_text_color: textColor,
                    menu_layout_style: `${layoutStyle}:${cardElevation}`,
                    menu_font_family: fontFamily,
                    menu_border_radius: borderRadius,
                    menu_glassmorphism: glassmorphism,
                    menu_ai_features_enabled: aiEnabled,
                    menu_items_per_row: menuItemsPerRow
                }
            });
            supabase.removeChannel(channel);

        } catch (error: any) {
            toast({
                title: "Error saving settings",
                description: error.message,
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center animate-pulse">Loading design studio...</div>;

    return (
        <div className="space-y-6">
            <Card className="border-purple-500/20 shadow-sm bg-gradient-to-br from-purple-50/50 to-background dark:from-purple-950/10">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Palette className="w-6 h-6 text-purple-600" />
                        Menu Design Studio
                    </CardTitle>
                    <CardDescription>
                        Completely transform the way your customers view and interact with your digital menu.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    
                    {/* Layout Style */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <LayoutTemplate className="w-5 h-5 text-blue-500" />
                            <h3 className="font-semibold text-lg">Layout Architecture</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { id: 'classic', label: 'Classic List', desc: 'Clean, traditional row layout.' },
                                { id: 'modern_cards', label: 'Modern Cards', desc: 'Large imagery, beautiful shadow cards.' },
                                { id: 'image_grid', label: 'Masonry Grid', desc: 'Compact grid focusing on visuals.' }
                            ].map(layout => (
                                <div 
                                    key={layout.id}
                                    onClick={() => setLayoutStyle(layout.id)}
                                    className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${layoutStyle === layout.id ? 'border-primary bg-primary/5 shadow-md' : 'border-border hover:border-primary/50'}`}
                                >
                                    {layoutStyle === layout.id && <Check className="absolute top-3 right-3 w-4 h-4 text-primary" />}
                                    <p className="font-bold">{layout.label}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{layout.desc}</p>
                                </div>
                            ))}
                        </div>

                        {/* Items Per Row */}
                        <div className="pt-4 border-t border-border mt-4">
                            <div className="flex items-center gap-2 mb-2">
                                <LayoutGrid className="w-4 h-4 text-blue-600" />
                                <Label className="text-sm font-medium">Items Per Row</Label>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {[
                                    { val: 1, label: '1 Item' },
                                    { val: 2, label: '2 Items' },
                                    { val: 3, label: '3 Items' },
                                    { val: 4, label: '↔ Scroll' },
                                ].map(opt => (
                                    <Button
                                        key={opt.val}
                                        variant={menuItemsPerRow === opt.val ? 'default' : 'outline'}
                                        size="sm"
                                        className="flex-1 min-w-[60px]"
                                        onClick={() => setMenuItemsPerRow(opt.val)}
                                    >
                                        {opt.label}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2">
                                For mobile devices, 1 or 2 items work best. Scroll mode creates a horizontal carousel.
                            </p>
                        </div>
                    </div>

                    {/* Color Theme & Branding */}
                    <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center gap-2 mb-2">
                            <Palette className="w-5 h-5 text-purple-600" />
                            <h3 className="font-semibold text-lg">Color Theme & Branding</h3>
                        </div>
                        {isDarkMode ? (
                            <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-xl border border-dashed">
                                <Droplets className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
                                <h3 className="text-lg font-semibold text-foreground mb-2">Themes Disabled in Dark Mode</h3>
                                <p className="text-sm text-muted-foreground max-w-sm">
                                    To ensure optimal text visibility and contrast, color themes are automatically disabled while Dark Mode is active.
                                </p>
                            </div>
                        ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2 md:col-span-1">
                                <Label>Preset Theme Palette</Label>
                                <Select value={colorPreset} onValueChange={handlePresetChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Palette" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {COLOR_PRESETS.map(preset => (
                                            <SelectItem key={preset.id} value={preset.id}>
                                                {preset.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Select a predefined palette or fine-tune custom colors using the pickers.
                                </p>
                            </div>
                            
                            <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs">Primary Color</Label>
                                    <div className="flex gap-1.5">
                                        <Input 
                                            type="color" 
                                            value={primaryColor} 
                                            onChange={(e) => {
                                                setPrimaryColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="w-8 h-8 p-1 border rounded cursor-pointer flex-shrink-0" 
                                        />
                                        <Input 
                                            type="text" 
                                            value={primaryColor} 
                                            onChange={(e) => {
                                                setPrimaryColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="text-[10px] font-mono h-8 px-1.5" 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Accent Color</Label>
                                    <div className="flex gap-1.5">
                                        <Input 
                                            type="color" 
                                            value={secondaryColor} 
                                            onChange={(e) => {
                                                setSecondaryColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="w-8 h-8 p-1 border rounded cursor-pointer flex-shrink-0" 
                                        />
                                        <Input 
                                            type="text" 
                                            value={secondaryColor} 
                                            onChange={(e) => {
                                                setSecondaryColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="text-[10px] font-mono h-8 px-1.5" 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Background</Label>
                                    <div className="flex gap-1.5">
                                        <Input 
                                            type="color" 
                                            value={backgroundColor} 
                                            onChange={(e) => {
                                                setBackgroundColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="w-8 h-8 p-1 border rounded cursor-pointer flex-shrink-0" 
                                        />
                                        <Input 
                                            type="text" 
                                            value={backgroundColor} 
                                            onChange={(e) => {
                                                setBackgroundColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="text-[10px] font-mono h-8 px-1.5" 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Text Color</Label>
                                    <div className="flex gap-1.5">
                                        <Input 
                                            type="color" 
                                            value={textColor} 
                                            onChange={(e) => {
                                                setTextColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="w-8 h-8 p-1 border rounded cursor-pointer flex-shrink-0" 
                                        />
                                        <Input 
                                            type="text" 
                                            value={textColor} 
                                            onChange={(e) => {
                                                setTextColor(e.target.value);
                                                setColorPreset('custom');
                                            }}
                                            className="text-[10px] font-mono h-8 px-1.5" 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t">
                        {/* Typography */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Type className="w-5 h-5 text-pink-500" />
                                <h3 className="font-semibold text-lg">Typography</h3>
                            </div>
                            <div className="space-y-2">
                                <Label>Font Family</Label>
                                <Select value={fontFamily} onValueChange={setFontFamily}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Font" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-80">
                                        {Array.from(new Set(FONT_OPTIONS.map(f => f.group))).map(group => (
                                            <div key={group}>
                                                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-bold sticky top-0 bg-popover">
                                                    {group}
                                                </div>
                                                {FONT_OPTIONS.filter(f => f.group === group).map(f => (
                                                    <SelectItem key={f.value} value={f.value}>
                                                        <span style={{ fontFamily: f.value.includes(',') ? f.value : `${f.value}, sans-serif` }}>
                                                            {f.label}
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </div>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-muted-foreground">{FONT_OPTIONS.length} fonts available — auto-loaded from Google Fonts in the customer menu.</p>
                            </div>
                        </div>

                        {/* Aesthetics */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Box className="w-5 h-5 text-teal-500" />
                                <h3 className="font-semibold text-lg">Aesthetics</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Border Radius</Label>
                                    <Select value={borderRadius} onValueChange={setBorderRadius}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sharp (0px)</SelectItem>
                                            <SelectItem value="sm">Subtle (4px)</SelectItem>
                                            <SelectItem value="md">Rounded (8px)</SelectItem>
                                            <SelectItem value="lg">Soft (16px)</SelectItem>
                                            <SelectItem value="full">Pill (9999px)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Card Elevation (Shadows)</Label>
                                    <Select value={cardElevation} onValueChange={setCardElevation}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Flat (No Shadow)</SelectItem>
                                            <SelectItem value="subtle">Subtle Shadow</SelectItem>
                                            <SelectItem value="glow">Elegant Brand Glow</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-3 border rounded-lg bg-background mt-2">
                                <div className="space-y-0.5">
                                    <Label>Glassmorphism UI</Label>
                                    <p className="text-xs text-muted-foreground">Applies frosted glass effect to navigation</p>
                                </div>
                                <Switch checked={glassmorphism} onCheckedChange={setGlassmorphism} />
                            </div>
                        </div>
                    </div>

                    {/* AI Customer Experience */}
                    <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-5 h-5 text-amber-500" />
                            <h3 className="font-semibold text-lg">AI Customer Experience</h3>
                        </div>
                        <div className="flex items-center justify-between p-4 border-2 border-amber-500/20 rounded-xl bg-gradient-to-r from-amber-500/5 to-transparent">
                            <div className="space-y-1 max-w-[80%]">
                                <Label className="text-base font-bold text-amber-700 dark:text-amber-400">Free AI "Smart Waiter"</Label>
                                <p className="text-sm text-muted-foreground">
                                    Adds a floating chat button to your menu. Our free internal algorithm will automatically recommend dishes based on taste profiles (spicy, vegan, sweet) when customers search.
                                </p>
                            </div>
                            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
                        </div>
                    </div>

                    <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto mt-6">
                        {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Palette className="w-4 h-4 mr-2" />}
                        Apply New Design
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
