import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Copy, RefreshCw, Key, Link as LinkIcon, Network } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';

export const AggregatorIntegrationSettings = () => {
  const { profile , adminProfileId } = useAuth();
  const { operatingBranchId } = useBranch();
  const adminId = adminProfileId;
  
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [provider, setProvider] = useState('urbanpiper');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (adminId) {
      fetchIntegrations();
    }
  }, [adminId, operatingBranchId]);

  const fetchIntegrations = async () => {
    try {
      let query = supabase
        .from('aggregator_integrations')
        .select('*')
        .eq('admin_id', adminId);

      if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setIntegrations(data || []);
    } catch (error) {
      console.error('Error fetching integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateWebhookUrl = (branchId: string, providerId: string) => {
    // In a real production app, this would point to a Supabase Edge Function
    // Example: https://[project-ref].supabase.co/functions/v1/aggregator-webhook?branch=...
    return `https://zenpos.app/api/webhooks/${providerId}?branch=${branchId || 'default'}`;
  };

  const handleSaveIntegration = async () => {
    if (!adminId) return;
    setIsSaving(true);
    
    try {
      const webhookUrl = generateWebhookUrl(operatingBranchId || '', provider);

      // Check if exists
      const existing = integrations.find(i => i.provider === provider && i.branch_id === operatingBranchId);
      
      let error;
      if (existing) {
        const { error: updateErr } = await supabase
          .from('aggregator_integrations')
          .update({ api_key: apiKey, webhook_url: webhookUrl })
          .eq('id', existing.id);
        error = updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('aggregator_integrations')
          .insert([{
            admin_id: adminId,
            branch_id: operatingBranchId,
            provider,
            api_key: apiKey,
            webhook_url: webhookUrl
          }]);
        error = insertErr;
      }

      if (error) throw error;

      toast({
        title: "Integration Saved",
        description: `Successfully configured ${provider.toUpperCase()}`
      });
      
      setApiKey('');
      fetchIntegrations();
    } catch (err: any) {
      console.error('Save error:', err);
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('aggregator_integrations')
        .update({ is_active: !currentStatus })
        .eq('id', id);
        
      if (error) throw error;
      fetchIntegrations();
      toast({
        title: "Status Updated",
        description: `Integration turned ${!currentStatus ? 'ON' : 'OFF'}`
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!" });
  };

  if (loading) return <div className="p-4">Loading integrations...</div>;

  return (
    <div className="space-y-6">
      <Card className="border-orange-500/20 shadow-sm">
        <CardHeader className="bg-orange-50/50 dark:bg-orange-950/10 pb-4 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="w-5 h-5 text-orange-500" />
            Connect New Aggregator
          </CardTitle>
          <CardDescription>
            Generate a secure webhook URL to receive live orders from UrbanPiper, Swiggy, or Zomato.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Platform / Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urbanpiper">UrbanPiper (Recommended)</SelectItem>
                  <SelectItem value="zomato">Zomato Direct API</SelectItem>
                  <SelectItem value="swiggy">Swiggy Direct API</SelectItem>
                  <SelectItem value="custom">Custom Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>API Key / Hub ID</Label>
              <Input 
                type="password" 
                placeholder="Enter API Key provided by platform" 
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </div>
          </div>
          <Button 
            className="mt-6 w-full md:w-auto" 
            onClick={handleSaveIntegration} 
            disabled={isSaving || !apiKey}
          >
            {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
            Generate Webhook & Connect
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="font-bold text-gray-700 dark:text-gray-300">Active Integrations</h3>
        {integrations.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No active integrations found for this branch.</p>
        ) : (
          integrations.map(integration => (
            <Card key={integration.id} className="relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1 h-full ${integration.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
              <CardContent className="p-4 pl-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                  <h4 className="font-bold text-lg uppercase flex items-center gap-2">
                    {integration.provider}
                    <Switch 
                      checked={integration.is_active} 
                      onCheckedChange={() => handleToggleActive(integration.id, integration.is_active)} 
                    />
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">Configure this webhook URL in your {integration.provider} dashboard:</p>
                  <div className="flex items-center gap-2 bg-muted p-2 rounded-md border">
                    <code className="text-xs text-primary font-mono truncate max-w-[200px] md:max-w-md">
                      {integration.webhook_url}
                    </code>
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-2 shrink-0" onClick={() => copyToClipboard(integration.webhook_url)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                
                <div className="text-right shrink-0">
                  <Badge variant={integration.is_active ? 'default' : 'secondary'}>
                    {integration.is_active ? 'Listening for Orders' : 'Paused'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
