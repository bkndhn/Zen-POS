import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, Scissors } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Provider {
  id: string;
  name: string;
  phone: string | null;
  commission_type: string | null;
  commission_rate: number | null;
  is_active: boolean | null;
}

export default function Providers() {
  const { profile } = useAuth();
  const { operatingBranchId } = useBranch();
  const { toast } = useToast();
  
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    commission_type: 'percentage',
    commission_rate: '',
    is_active: true
  });

  const adminId = profile?.role === 'user' ? profile.admin_id : profile?.user_id;

  useEffect(() => {
    if (adminId) {
      fetchProviders();
    }
  }, [adminId, operatingBranchId]);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('providers')
        .select('*')
        .eq('admin_id', adminId)
        .order('name');
        
      if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
      } else {
        query = query.is('branch_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProviders(data || []);
    } catch (error: any) {
      console.error('Error fetching providers:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to load providers"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (provider?: Provider) => {
    if (provider) {
      setEditingProvider(provider);
      setFormData({
        name: provider.name,
        phone: provider.phone || '',
        commission_type: provider.commission_type || 'percentage',
        commission_rate: provider.commission_rate ? provider.commission_rate.toString() : '',
        is_active: provider.is_active !== false
      });
    } else {
      setEditingProvider(null);
      setFormData({
        name: '',
        phone: '',
        commission_type: 'percentage',
        commission_rate: '',
        is_active: true
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Provider name is required"
      });
      return;
    }

    try {
      const payload = {
        name: formData.name,
        phone: formData.phone || null,
        commission_type: formData.commission_type,
        commission_rate: formData.commission_rate ? parseFloat(formData.commission_rate) : null,
        is_active: formData.is_active,
        admin_id: adminId,
        branch_id: operatingBranchId || null
      };

      if (editingProvider) {
        const { error } = await supabase
          .from('providers')
          .update(payload)
          .eq('id', editingProvider.id);

        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Provider updated successfully"
        });
      } else {
        const { error } = await supabase
          .from('providers')
          .insert([payload]);

        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Provider added successfully"
        });
      }

      setIsDialogOpen(false);
      fetchProviders();
    } catch (error: any) {
      console.error('Error saving provider:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save provider"
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this provider?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('providers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Provider deleted successfully"
      });
      fetchProviders();
    } catch (error: any) {
      console.error('Error deleting provider:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to delete provider"
      });
    }
  };

  const filteredProviders = providers.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.phone && p.phone.includes(searchQuery))
  );

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Scissors className="h-8 w-8 text-primary" />
            Providers
          </h1>
          <p className="text-muted-foreground">Manage your service providers and staff</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Provider
        </Button>
      </div>

      <Card className="border-border/50 bg-background/50 backdrop-blur-sm shadow-xl">
        <CardHeader>
          <CardTitle>Provider Directory</CardTitle>
          <CardDescription>View and manage staff details and commissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-6">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search by name or phone..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md bg-background/50"
            />
          </div>

          <div className="rounded-md border border-border/50 overflow-hidden bg-background/30 backdrop-blur-md">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading providers...
                    </TableCell>
                  </TableRow>
                ) : filteredProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No providers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProviders.map(provider => (
                    <TableRow key={provider.id}>
                      <TableCell className="font-medium">{provider.name}</TableCell>
                      <TableCell>{provider.phone || '-'}</TableCell>
                      <TableCell>
                        {provider.commission_rate ? (
                          <Badge variant="outline" className="bg-primary/5">
                            {provider.commission_type === 'percentage' 
                              ? `${provider.commission_rate}%` 
                              : `₹${provider.commission_rate}`}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {provider.is_active ? (
                          <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(provider)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(provider.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingProvider ? 'Edit Provider' : 'Add New Provider'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
              <Input 
                id="name" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                placeholder="e.g. John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input 
                id="phone" 
                value={formData.phone} 
                onChange={e => setFormData({...formData, phone: e.target.value})} 
                placeholder="e.g. 9876543210"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="comm_type">Commission Type</Label>
                <Select 
                  value={formData.commission_type} 
                  onValueChange={val => setFormData({...formData, commission_type: val})}
                >
                  <SelectTrigger id="comm_type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="flat">Flat Amount (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="comm_rate">Commission Rate</Label>
                <Input 
                  id="comm_rate" 
                  type="number" 
                  value={formData.commission_rate} 
                  onChange={e => setFormData({...formData, commission_rate: e.target.value})} 
                  placeholder={formData.commission_type === 'percentage' ? 'e.g. 10' : 'e.g. 500'}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Switch 
                id="active" 
                checked={formData.is_active} 
                onCheckedChange={checked => setFormData({...formData, is_active: checked})}
              />
              <Label htmlFor="active">Active Provider</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
