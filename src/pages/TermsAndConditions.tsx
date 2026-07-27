import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ShieldCheck, ArrowLeft, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const TermsAndConditions: React.FC = () => {
  const navigate = useNavigate();
  const [termsContent, setTermsContent] = useState<string>('');
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadTerms() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('app_settings')
          .select('terms_and_conditions, updated_at')
          .eq('id', true)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setTermsContent(data.terms_and_conditions || 'No Terms and Conditions published yet.');
          setUpdatedAt(data.updated_at ? new Date(data.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
        }
      } catch (err) {
        console.error('Failed to load terms:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTerms();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="gap-2 text-slate-600 dark:text-slate-400 font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold px-3 py-1 rounded-full border border-emerald-300/60">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Play Store Verified Policy
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5 font-bold text-xs"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          </div>
        </div>

        {/* Content Card */}
        <Card className="rounded-2xl border-0 shadow-xl overflow-hidden bg-white dark:bg-slate-900">
          <CardHeader className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary text-white rounded-xl shadow-md">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  Terms & Conditions
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-1">
                  Official Terms of Service and Usage Agreement for ZenPOS Application {updatedAt ? `• Last updated: ${updatedAt}` : ''}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 space-y-6">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground animate-pulse">Loading Terms & Conditions...</div>
            ) : (
              <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-line text-slate-800 dark:text-slate-200 font-normal">
                {termsContent}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TermsAndConditions;
