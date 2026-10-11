import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, Clock, Zap } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

export const RoiCalculator: React.FC<{ onStartTrial?: () => void }> = ({ onStartTrial }) => {
  const [dailyBills, setDailyBills] = useState(150);
  const [avgOrderValue, setAvgOrderValue] = useState(180);
  const [leakagePct, setLeakagePct] = useState(3.5);
  const [wastePct, setWastePct] = useState(4);

  const monthlyRevenue = dailyBills * avgOrderValue * 30;
  const leakageSaved = (monthlyRevenue * leakagePct) / 100;
  const wasteSaved = (monthlyRevenue * wastePct) / 100;
  const cashierHoursSaved = dailyBills * 0.8 * 30 / 60; // 0.8 min saved per bill
  const extraProfit = leakageSaved + wasteSaved;
  const zenposMonthly = 1000;
  const roi = extraProfit / zenposMonthly;

  return (
    <section className="py-16 sm:py-20 bg-primary/5">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            Calculate How Much ZenPOS Saves Your Shop Every Month
          </h2>
          <p className="text-muted-foreground">Drag the sliders to match your shop — see real savings instantly.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Sliders */}
          <Card className="border border-border">
            <CardContent className="p-6 space-y-6">
              {[
                { label: 'Daily Bills', value: dailyBills, min: 30, max: 1500, step: 10, unit: 'bills/day', set: setDailyBills },
                { label: 'Average Order Value', value: avgOrderValue, min: 30, max: 2000, step: 10, unit: '₹', prefix: '₹', set: setAvgOrderValue },
                { label: 'Billing Leakage Prevented', value: leakagePct, min: 0, max: 10, step: 0.5, unit: '%', set: setLeakagePct },
                { label: 'Kitchen Waste Reduction', value: wastePct, min: 0, max: 10, step: 0.5, unit: '%', set: setWastePct },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between mb-1.5 text-sm font-medium">
                    <span className="text-foreground">{s.label}</span>
                    <span className="text-primary font-bold">{s.prefix || ''}{s.value}{s.unit.startsWith('%') ? '%' : s.unit.startsWith('bills') ? ` bills/day` : ''}</span>
                  </div>
                  <input
                    type="range" min={s.min} max={s.max} step={s.step} value={s.value}
                    onChange={e => s.set(Number(e.target.value))}
                    className="w-full accent-primary h-2 rounded-full cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>{s.prefix}{s.min}</span><span>{s.prefix}{s.max}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Output cards */}
          <div className="space-y-4">
            <Card className="border-2 border-primary bg-primary/5">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Estimated Monthly Extra Profit</p>
                  <p className="text-2xl font-extrabold text-primary">₹{fmt(extraProfit)}</p>
                  <p className="text-[11px] text-muted-foreground">Leakage ₹{fmt(leakageSaved)} + Waste ₹{fmt(wasteSaved)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Clock className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Cashier Hours Saved / Month</p>
                  <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">{fmt(cashierHoursSaved)} hrs</p>
                  <p className="text-[11px] text-muted-foreground">~0.8 min faster per bill with trie search</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Zap className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Return on Investment (ROI)</p>
                  <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{roi.toFixed(1)}x</p>
                  <p className="text-[11px] text-muted-foreground">vs ₹1,000/month ZenPOS subscription</p>
                </div>
              </CardContent>
            </Card>

            <Button className="w-full" size="lg" onClick={onStartTrial}>
              Start 7-Day Free Pilot <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
