const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'SuperAdminUsers.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update handleTogglePermission
content = content.replace(
  `      // Update state
      setRows(prev => prev.map(r => r.profile_id === adminProfileId ? { ...r, client_permissions: updatedPerms } : r));
      setSelectedAdmin(prev => prev && prev.profile_id === adminProfileId ? { ...prev, client_permissions: updatedPerms } : prev);

      toast({
        title: "Permission updated",`,
  `      // Update state
      setRows(prev => prev.map(r => r.profile_id === adminProfileId ? { ...r, client_permissions: updatedPerms } : r));
      setSelectedAdmin(prev => prev && prev.profile_id === adminProfileId ? { ...prev, client_permissions: updatedPerms } : prev);

      // Broadcast update instantly
      const channel = supabase.channel(\`permissions:\${adminProfileId}\`);
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({
            type: 'broadcast',
            event: 'permissions_updated',
            payload: { client_permissions: updatedPerms }
          });
          supabase.removeChannel(channel);
        }
      });

      toast({
        title: "Permission updated",`
);

// 2. Add handleSetAllPermissions before handleStatusChange
content = content.replace(
  `  const handleStatusChange = async (profileId: string, newStatus: string) => {`,
  `  const handleSetAllPermissions = async (adminProfileId: string, enabled: boolean) => {
    const admin = rows.find(r => r.profile_id === adminProfileId);
    if (!admin) return;

    const updatedPerms: Record<string, boolean> = {};
    ALL_NAV_ITEMS.forEach(item => {
      updatedPerms[item.to] = enabled;
    });
    // Extra permissions
    updatedPerms['receipt_qr'] = enabled;
    updatedPerms['calci_billing'] = enabled;
    updatedPerms['allow_cloud_storage'] = enabled;
    updatedPerms['/qr-menu'] = enabled;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ client_permissions: updatedPerms })
        .eq('id', adminProfileId);

      if (error) throw error;

      // Update state
      setRows(prev => prev.map(r => r.profile_id === adminProfileId ? { ...r, client_permissions: updatedPerms } : r));
      setSelectedAdmin(prev => prev && prev.profile_id === adminProfileId ? { ...prev, client_permissions: updatedPerms } : prev);

      // Broadcast update instantly
      const channel = supabase.channel(\`permissions:\${adminProfileId}\`);
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({
            type: 'broadcast',
            event: 'permissions_updated',
            payload: { client_permissions: updatedPerms }
          });
          supabase.removeChannel(channel);
        }
      });

      toast({
        title: \`All permissions \${enabled ? 'enabled' : 'disabled'}\`,
        description: \`Successfully updated permissions for \${admin.hotel_name || admin.name}\`
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to update permissions",
        variant: "destructive"
      });
    }
  };

  const handleStatusChange = async (profileId: string, newStatus: string) => {`
);

// 3. Update DialogHeader
content = content.replace(
  `          <DialogHeader className="shrink-0 border-b pb-4 mb-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Shield className="w-5 h-5 text-primary" />
              Client Permissions
            </DialogTitle>
            <DialogDescription className="text-xs">
              Toggle access to specific modules/pages for <strong>{selectedAdmin?.hotel_name || selectedAdmin?.name}</strong>.
            </DialogDescription>
          </DialogHeader>`,
  `          <DialogHeader className="shrink-0 border-b pb-4 mb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <Shield className="w-5 h-5 text-primary" />
                  Client Permissions
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Toggle access to specific modules/pages for <strong>{selectedAdmin?.hotel_name || selectedAdmin?.name}</strong>.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:hover:bg-green-900/40 dark:border-green-800 dark:text-green-300"
                  onClick={() => selectedAdmin && handleSetAllPermissions(selectedAdmin.profile_id, true)}
                >
                  Enable All
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:border-red-800 dark:text-red-300"
                  onClick={() => selectedAdmin && handleSetAllPermissions(selectedAdmin.profile_id, false)}
                >
                  Disable All
                </Button>
              </div>
            </div>
          </DialogHeader>`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched SuperAdminUsers.tsx');
