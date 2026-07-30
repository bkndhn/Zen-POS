import React, { useState, useEffect } from 'react';
import { Plus, Search, CalendarDays, Clock, User, Scissors, Pencil, Trash2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

interface Provider {
  id: string;
  name: string;
}

interface Appointment {
  id: string;
  customer_id: string;
  provider_id: string;
  service_name: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  customers: { name: string; phone: string | null };
  providers: { name: string };
}

export default function Appointments() {
  const { profile } = useAuth();
  const { operatingBranchId } = useBranch();
  const { toast } = useToast();
  
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    customer_id: '',
    provider_id: '',
    service_name: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '10:00',
    end_time: '11:00',
    notes: '',
    status: 'scheduled'
  });

  const adminId = profile?.role === 'user' ? profile.admin_id : profile?.user_id;

  useEffect(() => {
    if (adminId) {
      fetchData();
    }
  }, [adminId, operatingBranchId, selectedDate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch appointments for the selected date
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      let apptQuery = supabase
        .from('appointments')
        .select(`
          *,
          customers (name, phone),
          providers (name)
        `)
        .eq('admin_id', adminId)
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .order('start_time');

      if (operatingBranchId) {
        apptQuery = apptQuery.eq('branch_id', operatingBranchId);
      } else {
        apptQuery = apptQuery.is('branch_id', null);
      }

      // 2. Fetch providers
      let provQuery = supabase.from('providers').select('id, name').eq('admin_id', adminId).eq('is_active', true);
      if (operatingBranchId) {
        provQuery = provQuery.eq('branch_id', operatingBranchId);
      } else {
        provQuery = provQuery.is('branch_id', null);
      }

      // 3. Fetch customers
      let custQuery = supabase.from('customers').select('id, name, phone').eq('admin_id', adminId);
      if (operatingBranchId) {
        custQuery = custQuery.eq('branch_id', operatingBranchId);
      } else {
        custQuery = custQuery.is('branch_id', null);
      }

      const [apptRes, provRes, custRes] = await Promise.all([apptQuery, provQuery, custQuery]);

      if (apptRes.error) throw apptRes.error;
      if (provRes.error) throw provRes.error;
      if (custRes.error) throw custRes.error;

      setAppointments((apptRes.data as unknown as Appointment[]) || []);
      setProviders(provRes.data || []);
      setCustomers(custRes.data || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to load data"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (appt?: Appointment) => {
    if (appt) {
      setEditingId(appt.id);
      const startDate = new Date(appt.start_time);
      const endDate = new Date(appt.end_time);
      
      setFormData({
        customer_id: appt.customer_id,
        provider_id: appt.provider_id,
        service_name: appt.service_name,
        date: format(startDate, 'yyyy-MM-dd'),
        start_time: format(startDate, 'HH:mm'),
        end_time: format(endDate, 'HH:mm'),
        notes: appt.notes || '',
        status: appt.status
      });
    } else {
      setEditingId(null);
      setFormData({
        customer_id: '',
        provider_id: '',
        service_name: '',
        date: selectedDate,
        start_time: '10:00',
        end_time: '11:00',
        notes: '',
        status: 'scheduled'
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.customer_id || !formData.provider_id || !formData.service_name) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Customer, Provider, and Service Name are required"
      });
      return;
    }

    try {
      const startDateTime = new Date(`${formData.date}T${formData.start_time}`);
      const endDateTime = new Date(`${formData.date}T${formData.end_time}`);

      const payload = {
        customer_id: formData.customer_id,
        provider_id: formData.provider_id,
        service_name: formData.service_name,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        notes: formData.notes || null,
        status: formData.status,
        admin_id: adminId,
        branch_id: operatingBranchId || null
      };

      if (editingId) {
        const { error } = await supabase
          .from('appointments')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;
        toast({ title: "Success", description: "Appointment updated" });
      } else {
        const { error } = await supabase
          .from('appointments')
          .insert([payload]);

        if (error) throw error;
        toast({ title: "Success", description: "Appointment booked" });
      }

      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving appointment:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save appointment"
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to cancel this appointment?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({ title: "Success", description: "Appointment deleted" });
      fetchData();
    } catch (error: any) {
      console.error('Error deleting appointment:', error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-8 w-8 text-primary" />
            Appointments
          </h1>
          <p className="text-muted-foreground">Manage your bookings and schedule</p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          New Booking
        </Button>
      </div>

      <Card className="border-border/50 bg-background/50 backdrop-blur-sm shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Daily Schedule</CardTitle>
            <CardDescription>View appointments for the selected date</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="date-picker">Date</Label>
            <Input 
              id="date-picker"
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40 bg-background/50"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading schedule...</div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground bg-background/30 rounded-lg border border-border/50 border-dashed">
                <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No appointments scheduled for this day.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {appointments.map((appt) => (
                  <Card key={appt.id} className="bg-background/40 hover:bg-background/60 transition-colors border-border/50">
                    <CardContent className="p-4 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="bg-primary/5 font-medium flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(parseISO(appt.start_time), 'h:mm a')} - {format(parseISO(appt.end_time), 'h:mm a')}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className={appt.status === 'completed' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'}
                        >
                          {appt.status}
                        </Badge>
                      </div>
                      
                      <div className="flex-1 space-y-3 mt-2">
                        <div className="font-semibold text-lg">{appt.service_name}</div>
                        
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-4 w-4" />
                          <span className="truncate">{appt.customers?.name} {appt.customers?.phone ? `(${appt.customers.phone})` : ''}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Scissors className="h-4 w-4" />
                          <span className="truncate">{appt.providers?.name}</span>
                        </div>
                        
                        {appt.notes && (
                          <div className="text-sm italic text-muted-foreground mt-2 line-clamp-2 border-t border-border/30 pt-2">
                            "{appt.notes}"
                          </div>
                        )}
                      </div>
                      
                      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border/30">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(appt)}>
                          <Pencil className="h-4 w-4 mr-1" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(appt.id)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Appointment' : 'Book Appointment'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer</Label>
                <Select value={formData.customer_id} onValueChange={val => setFormData({...formData, customer_id: val})}>
                  <SelectTrigger id="customer">
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider">Provider</Label>
                <Select value={formData.provider_id} onValueChange={val => setFormData({...formData, provider_id: val})}>
                  <SelectTrigger id="provider">
                    <SelectValue placeholder="Select Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="service">Service Name</Label>
              <Input 
                id="service" 
                value={formData.service_name} 
                onChange={e => setFormData({...formData, service_name: e.target.value})} 
                placeholder="e.g. Haircut, Spa, Consultation"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-1">
                <Label htmlFor="app-date">Date</Label>
                <Input 
                  id="app-date" 
                  type="date"
                  value={formData.date} 
                  onChange={e => setFormData({...formData, date: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start">Start Time</Label>
                <Input 
                  id="start" 
                  type="time"
                  value={formData.start_time} 
                  onChange={e => setFormData({...formData, start_time: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">End Time</Label>
                <Input 
                  id="end" 
                  type="time"
                  value={formData.end_time} 
                  onChange={e => setFormData({...formData, end_time: e.target.value})} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={val => setFormData({...formData, status: val})}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input 
                id="notes" 
                value={formData.notes} 
                onChange={e => setFormData({...formData, notes: e.target.value})} 
                placeholder="Any special instructions..."
              />
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
