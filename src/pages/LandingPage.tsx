import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  ShoppingCart, Monitor, QrCode, Wifi, WifiOff, MessageSquare,
  BarChart3, Users, Receipt, ChefHat, Globe, Shield,
  Check, Star, ArrowRight, Smartphone, Database, FileDown,
  Zap, Phone, Menu
} from 'lucide-react';
import { RoiCalculator } from '@/components/landing/RoiCalculator';
import { FeatureShowcaseTabs } from '@/components/landing/FeatureShowcaseTabs';
import { CompetitorComparison } from '@/components/landing/CompetitorComparison';
import { PilotModal } from '@/components/landing/PilotModal';

import { useLandingConfig, type LandingConfig } from '@/hooks/useLandingConfig';

// ── Static Data ───────────────────────────────────────────────────────────────
const features = [
  { icon: ShoppingCart, title: 'Smart Billing', desc: 'Fast touch-based billing with trie search, multi-cart hold/recall' },
  { icon: ChefHat, title: 'Kitchen Display (KDS)', desc: 'Real-time color-coded order flow from counter to kitchen' },
  { icon: QrCode, title: 'QR Self-Ordering Menu', desc: 'Customers scan & browse your menu, add items, call waiter' },
  { icon: WifiOff, title: '100% Offline Mode', desc: 'Full billing even without internet — syncs automatically' },
  { icon: MessageSquare, title: 'WhatsApp Bills', desc: 'Send branded invoices directly via WhatsApp — zero SMS fees' },
  { icon: BarChart3, title: 'Reports & Analytics', desc: 'Daily Z-reports, item-wise sales, payment mode breakdown' },
  { icon: Users, title: 'Staff & Shift Management', desc: 'Role-based access, shift reconciliation, anti-theft alerts' },
  { icon: Monitor, title: 'Token TV Board', desc: 'Public display showing Preparing vs. Ready orders with voice chime' },
  { icon: Globe, title: 'Tamil & English', desc: 'Full Tamil language support, toggleable per staff member' },
  { icon: Receipt, title: 'GST Billing', desc: 'GST-compliant invoices with HSN codes, CGST/SGST split' },
  { icon: Shield, title: 'Secure & Private', desc: 'Row-Level Security — every shop\'s data is strictly isolated' },
  { icon: Smartphone, title: 'Any Device, Any Printer', desc: 'Phone, tablet, laptop — 58mm & 80mm thermal printing built-in' },
];

const trustBannerItems = [
  {
    icon: FileDown,
    title: 'Your Data Stays Yours',
    desc: 'Export full bills, inventory, and customer databases to CSV/Excel anytime — one tap, no restrictions.',
  },
  {
    icon: Shield,
    title: 'Single-Tenant RLS Isolation',
    desc: "Every shop's data is strictly isolated with Supabase Row-Level Security. No cross-contamination, ever.",
  },
  {
    icon: Database,
    title: 'GST & FSSAI Compliant',
    desc: 'Indian tax-ready invoices, HSN codes, and 58mm / 80mm thermal printer formats built-in.',
  },
];

// ── Landing Page ──────────────────────────────────────────────────────────────
const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'ROI Calculator', href: '#roi-calculator' },
  { label: 'Live Showcase', href: '#showcase' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Trust & Security', href: '#trust' },
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const [showPilotModal, setShowPilotModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [config, setConfig] = useState<LandingConfig>(DEFAULT_CONFIG);

  // Fetch dynamic landing config from super_admin_settings
  useEffect(() => {
    Promise.resolve((supabase.rpc as any)('get_public_landing_config'))
      .then(({ data }: { data: unknown }) => {
        if (data && typeof data === 'object') {
          setConfig({ ...DEFAULT_CONFIG, ...(data as Partial<LandingConfig>) });
        }
      })
      .catch(() => {/* silently use defaults */});
  }, []);

  useEffect(() => {
    if (!loading && profile) {
      navigate(profile.role === 'super_admin' ? '/super-admin/users' : '/', { replace: true });
    }
  }, [profile, loading, navigate]);

  const handleTryDemo = () => {
    localStorage.setItem('hotel_pos_demo_mode', 'true');
    navigate('/demo');
  };

  const whatsappPilotMsg = encodeURIComponent(
    `Hi! I'd like to start the ${config.pilotDays}-day free pilot of ZenPOS for my restaurant. Please help me get set up.`
  );

  const pricingPlans = [
    {
      name: 'Free Pilot',
      price: '0',
      period: ` for ${config.pilotDays} days`,
      desc: 'Run it next to your bill book',
      features: ['All features unlocked', 'Free menu setup from a photo', 'On-site Day 1 help', 'No card, no contract'],
      popular: false,
      cta: `Start ${config.pilotDays}-Day Free Pilot`,
      yearlyPrice: '0',
    },
    {
      name: 'All-in-One',
      price: config.monthlyPrice,
      period: '/month',
      desc: 'Everything, for every shop size',
      features: ['Billing, KOT & Kitchen Display', 'Tables, seats & Waiter app', 'QR ordering & WhatsApp bills', 'Recipe costing & stock tracking', 'Anti-theft owner alerts', 'Unlimited staff & menu items'],
      popular: true,
      cta: 'Get Started',
      yearlyPrice: config.yearlyPrice,
    },
    {
      name: 'Yearly Plan',
      price: config.yearlyPrice,
      period: '/year',
      desc: 'Pay yearly, get 2 months free',
      features: ['Everything in All-in-One', 'Priority phone support', 'Free thermal printer setup visit', 'Data export anytime (CSV/Excel)'],
      popular: false,
      cta: 'Get Started',
      yearlyPrice: config.yearlyPrice,
    },
  ];

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-background text-foreground scroll-smooth">

      {/* Promo Banner (dynamic) */}
      {config.promoBannerText && (
        <div className="bg-primary text-primary-foreground text-center text-xs py-2 px-4 font-medium">
          {config.promoBannerText}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border shadow-xs transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">ZenPOS</span>
          </div>
          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 rounded-full text-xs lg:text-sm font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleTryDemo} className="hidden sm:flex">
              🚀 Try Demo
            </Button>
            <a
              href={`https://wa.me/${config.whatsappNumber}?text=${whatsappPilotMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-green-300 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 hover:bg-green-100 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <Button size="sm" onClick={() => navigate('/auth')}>Login</Button>

            {/* Mobile Nav Hamburger */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[80vw] max-w-xs p-6 flex flex-col justify-between">
                <SheetHeader className="text-left">
                  <SheetTitle className="flex items-center gap-2 text-lg">
                    <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                      <Zap className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <span>ZenPOS</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2 my-8">
                  {navLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileNavOpen(false)}
                      className="px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
                <div className="space-y-2 pt-4 border-t border-border">
                  <Button className="w-full" size="sm" onClick={() => { setMobileNavOpen(false); handleTryDemo(); }}>
                    🚀 Try Live Demo
                  </Button>
                  <Button variant="outline" className="w-full" size="sm" onClick={() => { setMobileNavOpen(false); setShowPilotModal(true); }}>
                    Start Free Pilot
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden py-16 sm:py-28">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-emerald-500/5" />
        {/* Background grid texture */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 40px,currentColor 40px,currentColor 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,currentColor 40px,currentColor 41px)'
        }} />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          {/* Glassmorphic badge with pulse */}
          <div className="inline-flex items-center gap-2.5 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border border-primary/20 text-primary rounded-full px-4 py-2 text-sm font-semibold mb-8 shadow-lg shadow-primary/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <Zap className="h-3.5 w-3.5" />
            ⚡ {config.heroTitle}
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-tight break-words">
            Simple POS for{' '}
            <span className="relative">
              <span className="text-primary">Small Restaurants</span>
              <span className="absolute -bottom-1 left-0 right-0 h-1 bg-primary/20 rounded-full" />
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            {config.heroSubtitle}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8 w-full max-w-md mx-auto sm:max-w-none">
            <Button size="lg" className="w-full sm:w-auto text-base px-8 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow" onClick={() => setShowPilotModal(true)}>
              🚀 Start Free {config.pilotDays}-Day Pilot <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8" onClick={handleTryDemo}>
              Try Interactive Demo
            </Button>
          </div>

          {/* Social proof strip */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-primary" /> No credit card required</span>
            <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-primary" /> {config.pilotDays}-day free pilot</span>
            <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-primary" /> Works offline</span>
            <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-primary" /> No hardware lock-in</span>
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <div id="roi-calculator" className="scroll-mt-16"><RoiCalculator onStartTrial={() => setShowPilotModal(true)} /></div>

      {/* Feature Showcase Tabs */}
      <div id="showcase" className="scroll-mt-16"><FeatureShowcaseTabs /></div>

      {/* Features Grid */}
      <section id="features" className="py-16 sm:py-20 bg-muted/30 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Everything Your Restaurant Needs</h2>
            <p className="text-muted-foreground">No complex setup. No expensive hardware. Just works.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((f) => (
              <Card key={f.title} className="border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center shrink-0 transition-colors">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{f.title}</h3>
                    <p className="text-sm text-muted-foreground">{f.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Competitor Comparison */}
      <CompetitorComparison />

      {/* Pricing */}
      <section id="pricing" className="py-16 sm:py-20 bg-muted/30 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Simple, Affordable Pricing</h2>
            <p className="text-muted-foreground mb-6">Cheaper than a daily newspaper subscription</p>

            {/* Monthly / Yearly toggle */}
            <div className="inline-flex items-center rounded-full border border-border bg-muted p-1 gap-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${billingCycle === 'monthly' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${billingCycle === 'yearly' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Yearly
                <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">Save 17%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {pricingPlans.map((plan) => (
              <Card key={plan.name} className={`relative border-2 transition-all duration-200 ${plan.popular ? 'border-primary shadow-xl shadow-primary/15 scale-[1.02]' : 'border-border hover:border-primary/30 hover:shadow-md'}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full shadow">
                    ⭐ Most Popular
                  </div>
                )}
                <CardContent className="p-6">
                  <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{plan.desc}</p>
                  <div className="mb-6">
                    <span className="text-3xl font-extrabold">
                      ₹{billingCycle === 'yearly' && plan.name !== 'Free Pilot' ? plan.yearlyPrice : plan.price}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {billingCycle === 'yearly' && plan.name === 'All-in-One' ? '/year' : plan.period}
                    </span>
                    {billingCycle === 'yearly' && plan.name === 'All-in-One' && (
                      <p className="text-xs text-emerald-600 font-semibold mt-1">🎁 2 months free included</p>
                    )}
                  </div>
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full" variant={plan.popular ? 'default' : 'outline'} onClick={() => setShowPilotModal(true)}>
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Contact strip */}
          <div className="text-center mt-8 text-sm text-muted-foreground">
            <p>Questions? Call or WhatsApp us directly:</p>
            <div className="flex items-center justify-center gap-4 mt-2">
              <a href={`tel:${config.contactPhone}`} className="flex items-center gap-1.5 font-semibold text-foreground hover:text-primary transition-colors">
                <Phone className="h-4 w-4" /> +91 {config.contactPhone}
              </a>
              <a href={`https://wa.me/${config.whatsappNumber}?text=${whatsappPilotMsg}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-semibold text-green-700 dark:text-green-400 hover:underline">
                <MessageSquare className="h-4 w-4" /> WhatsApp Demo
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Zero Lock-in Banner */}
      <section id="trust" className="py-16 sm:py-20 scroll-mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Zero Lock-in. Full Transparency.</h2>
            <p className="text-muted-foreground">Your business data is yours — always.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {trustBannerItems.map((t) => (
              <Card key={t.title} className="border border-border/50 text-center hover:border-primary/30 transition-colors">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <t.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-bold mb-2">{t.title}</h3>
                  <p className="text-sm text-muted-foreground">{t.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20 bg-primary/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Try It Right Now — No Signup Needed</h2>
          <p className="text-muted-foreground mb-8">
            Explore the full POS with sample menu items, create bills with split payment, and see 58mm thermal receipt preview.
            All in demo mode, completely free.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="text-base px-8 shadow-md" onClick={() => setShowPilotModal(true)}>
              Start Free Pilot <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="text-base px-8" onClick={handleTryDemo}>
              🚀 Launch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} ZenPOS. Made with ❤️ for Tamil Nadu restaurants.</p>
          <p className="mt-1 text-xs">GST & FSSAI Ready • 100% Offline First • RLS Isolated • No Lock-in</p>
        </div>
      </footer>

      {/* Sticky mobile CTA footer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-background/95 backdrop-blur-md border-t border-border px-4 py-2.5 flex gap-2 shadow-2xl">
        <Button className="flex-1 text-sm h-10" onClick={handleTryDemo}>
          🚀 Try Live Demo
        </Button>
        <a
          href={`https://wa.me/${config.whatsappNumber}?text=${whatsappPilotMsg}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          💬 WhatsApp Free Pilot
        </a>
      </div>

      {/* Pilot Modal */}
      <PilotModal open={showPilotModal} onOpenChange={setShowPilotModal} />
    </div>
  );
};

export default LandingPage;
