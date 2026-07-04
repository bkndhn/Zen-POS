import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ShoppingCart, Monitor, QrCode, Wifi, WifiOff, MessageSquare, 
  BarChart3, Users, Receipt, ChefHat, Globe, Shield, 
  Check, Star, ArrowRight, Smartphone
} from 'lucide-react';

const features = [
  { icon: ShoppingCart, title: 'Smart Billing', desc: 'Fast touch-based billing with category filters and search' },
  { icon: ChefHat, title: 'Kitchen Display (KDS)', desc: 'Real-time order flow from counter to kitchen' },
  { icon: QrCode, title: 'QR Menu', desc: 'Customers scan & browse your menu on their phone' },
  { icon: WifiOff, title: 'Offline Mode', desc: 'Works without internet — syncs when back online' },
  { icon: MessageSquare, title: 'WhatsApp Bills', desc: 'Send bills directly via WhatsApp to customers' },
  { icon: BarChart3, title: 'Reports & Analytics', desc: 'Daily sales, item-wise reports, expense tracking' },
  { icon: Users, title: 'Staff Management', desc: 'Add staff with role-based page permissions' },
  { icon: Monitor, title: 'Customer Display', desc: 'Show order details on a second screen' },
  { icon: Globe, title: 'Tamil & English', desc: 'Full Tamil language support for local shops' },
  { icon: Receipt, title: 'GST Billing', desc: 'GST-compliant invoices with HSN codes & tax summary' },
  { icon: Shield, title: 'Secure & Private', desc: 'Your data is encrypted and isolated per account' },
  { icon: Smartphone, title: 'Works on Any Device', desc: 'Phone, tablet, laptop — no special hardware needed' },
];

const pricingPlans = [
  {
    name: 'Starter',
    price: '999',
    period: '/year',
    desc: 'Tea shops, bakeries, juice bars',
    features: ['Billing & Receipts', 'Up to 50 Items', 'Daily Reports', 'WhatsApp Bills', '1 User'],
    popular: false,
  },
  {
    name: 'Standard',
    price: '1,999',
    period: '/year',
    desc: 'Small restaurants & hotels',
    features: ['Everything in Starter', 'Unlimited Items', 'Kitchen Display (KDS)', 'Staff Management', 'GST Billing', '3 Users'],
    popular: true,
  },
  {
    name: 'Pro',
    price: '3,999',
    period: '/year',
    desc: 'Multi-counter restaurants',
    features: ['Everything in Standard', 'QR Menu for Customers', 'Customer Display', 'Table Management', 'CRM & Loyalty', 'Unlimited Users'],
    popular: false,
  },
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleTryDemo = () => {
    localStorage.setItem('hotel_pos_demo_mode', 'true');
    navigate('/demo');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <ShoppingCart className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">Zen POS</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleTryDemo}>
              Try Demo
            </Button>
            <Button size="sm" onClick={() => navigate('/auth')}>
              Login
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Star className="h-3.5 w-3.5" /> Built for Tamil Nadu Restaurants
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Simple POS for <br className="hidden sm:block" />
            <span className="text-primary">Small Restaurants</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            No hardware needed. Works offline. Tamil & English. 
            Start billing in 2 minutes — from your phone or tablet.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" className="text-base px-8" onClick={handleTryDemo}>
              Try Free Demo <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" className="text-base px-8" onClick={() => navigate('/auth')}>
              Start Free Trial
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">No credit card required • 14-day free trial</p>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Everything Your Restaurant Needs</h2>
            <p className="text-muted-foreground">No complex setup. No expensive hardware. Just works.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {features.map((f) => (
              <Card key={f.title} className="border border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
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

      {/* Pricing */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Simple, Affordable Pricing</h2>
            <p className="text-muted-foreground">Cheaper than a daily newspaper subscription</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {pricingPlans.map((plan) => (
              <Card key={plan.name} className={`relative border-2 transition-all ${plan.popular ? 'border-primary shadow-lg scale-[1.02]' : 'border-border'}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <CardContent className="p-6">
                  <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{plan.desc}</p>
                  <div className="mb-6">
                    <span className="text-3xl font-extrabold">₹{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                  <ul className="space-y-2.5 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full" variant={plan.popular ? 'default' : 'outline'} onClick={() => navigate('/auth')}>
                    Get Started
                  </Button>
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
            Explore the full POS with sample menu items, create bills, and see reports. 
            All in demo mode, completely free.
          </p>
          <Button size="lg" className="text-base px-8" onClick={handleTryDemo}>
            Launch Demo <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Zen POS. Made with ❤️ for Tamil Nadu restaurants.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
