const fs = require('fs');
let code = fs.readFileSync('src/pages/SuperAdminUsers.tsx', 'utf8');

// 1. Add TabsTrigger
const tabsListEnd = '</TabsList>';
code = code.replace(
  tabsListEnd,
  '  <TabsTrigger value="push" className="rounded-lg py-2 text-xs font-bold transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm"><Bell className="w-3.5 h-3.5 mr-2" /> Push Alerts</TabsTrigger>\n            </TabsList>'
);

// 2. Add TabsContent
const pushTabContent = `
            <TabsContent value="push" className="space-y-4 mt-6">
              <Card className="border-2 border-indigo-100 dark:border-indigo-900 shadow-md">
                <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/20 border-b pb-4">
                  <CardTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                    <Bell className="w-5 h-5" /> Broadcast Custom Push Notification
                  </CardTitle>
                  <CardDescription>
                    Send a custom notification to all clients or a specific client. Only users who have FCM unlocked and enabled will receive it.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-4 max-w-2xl">
                  <div className="space-y-2">
                    <Label>Target Recipient</Label>
                    <select id="push-target" className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                      <option value="all">🌍 All Active Clients (Broadcast)</option>
                      {rows.filter(r => r.role === 'admin' || r.role === 'super_admin').map(client => (
                        <option key={client.profile_id} value={client.profile_id}>
                          👤 {client.hotel_name || client.name} ({client.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Notification Title</Label>
                    <Input id="push-title" placeholder="e.g. ZenPOS System Update" />
                  </div>
                  <div className="space-y-2">
                    <Label>Message Body</Label>
                    <Textarea id="push-body" placeholder="e.g. We just released a new feature..." className="resize-none h-24" />
                  </div>
                  <Button className="w-full font-bold bg-indigo-600 hover:bg-indigo-700 text-white" onClick={async () => {
                    const target = (document.getElementById('push-target') as HTMLSelectElement).value;
                    const title = (document.getElementById('push-title') as HTMLInputElement).value;
                    const body = (document.getElementById('push-body') as HTMLTextAreaElement).value;
                    if (!title || !body) return alert('Title and body are required!');
                    
                    try {
                      // @ts-ignore
                      const { data, error } = await supabase.rpc('admin_send_custom_push', {
                        p_title: title,
                        p_body: body,
                        p_target_user_id: target === 'all' ? null : target
                      });
                      if (error) throw error;
                      alert('Successfully queued ' + data + ' push notifications!');
                      (document.getElementById('push-title') as HTMLInputElement).value = '';
                      (document.getElementById('push-body') as HTMLTextAreaElement).value = '';
                    } catch (e: any) {
                      alert('Failed: ' + e.message);
                    }
                  }}>
                    <Play className="w-4 h-4 mr-2 fill-current" /> Send Notification Now
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
`;

code = code.replace(
  /<\/TabsContent>\s+<\/Tabs>\s+<\/div>/,
  '</TabsContent>\n' + pushTabContent + '\n          </Tabs>\n        </div>'
);

const liveBillToggleStr = `
                            {/* Live Bill Push Gate */}
                            <div className="flex items-center justify-between p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold flex items-center gap-1.5">
                                  <Bell className="w-4 h-4 text-amber-500" /> Live Bill Alerts (Owner)
                                </span>
                                <span className="text-xs text-muted-foreground">Unlock real-time new bill alerts for this client</span>
                              </div>
                              <Switch 
                                checked={(admin.shop_settings as any)?.live_bill_push_unlocked || false}
                                onCheckedChange={async (checked) => {
                                  if (!admin.shop_settings?.id) return;
                                  try {
                                    await supabase.from('shop_settings').update({ live_bill_push_unlocked: checked } as any).eq('id', admin.shop_settings.id);
                                    window.location.reload();
                                  } catch(e) {}
                                }}
                              />
                            </div>
`;

code = code.replace(
  /\{\/\* Native App Gate \*\/\}/,
  liveBillToggleStr + '\n                            {/* Native App Gate */}'
);

fs.writeFileSync('src/pages/SuperAdminUsers.tsx', code);
console.log('Patched SuperAdminUsers.tsx');
