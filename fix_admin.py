import os

content = open('src/pages/SuperAdminUsers.tsx', 'r', encoding='utf-8').read()

target = '''            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scroll-smooth">'''

replacement = '''            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scroll-smooth">
              <div className="flex items-center justify-between p-3 rounded-xl border bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">Offline Grace Period</span>
                    <span className="text-[10px] text-muted-foreground">Days allowed without internet</span>
                  </div>
                </div>
                <select
                  className="bg-transparent border rounded p-1 text-sm"
                  value={selectedAdmin?.client_permissions?.offline_grace_days || 7}
                  onChange={(e) => {
                    if (selectedAdmin) {
                      handleTogglePermission(selectedAdmin.profile_id, 'offline_grace_days', parseInt(e.target.value));
                    }
                  }}
                >
                  <option value={7}>7 Days</option>
                  <option value={30}>30 Days</option>
                  <option value={90}>90 Days</option>
                  <option value={365}>365 Days</option>
                </select>
              </div>'''

content = content.replace(target, replacement)
open('src/pages/SuperAdminUsers.tsx', 'w', encoding='utf-8').write(content)
