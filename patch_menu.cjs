const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'PublicMenu.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add allow_qr_menu?: boolean; to ShopSettings
content = content.replace(
  `    store_status_override?: string;
    operating_hours?: any;
}`,
  `    store_status_override?: string;
    operating_hours?: any;
    allow_qr_menu?: boolean;
}`
);

// 2. Add broadcast subscription effect
content = content.replace(
  `    // Auto-swipe banners every 4 seconds (pauses when user interacts)`,
  `    // Real-time permission updates
    useEffect(() => {
        if (!adminId) return;
        const permsChannel = supabase.channel(\`permissions:\${adminId}\`);
        
        permsChannel.on(
            'broadcast',
            { event: 'permissions_updated' },
            (payload) => {
                if (payload.payload?.client_permissions) {
                    const allowQrMenu = payload.payload.client_permissions['/qr-menu'];
                    // We only care about allow_qr_menu changes on the public side
                    if (allowQrMenu !== undefined) {
                        setShopSettings(prev => {
                            if (!prev) return prev;
                            return { ...prev, allow_qr_menu: allowQrMenu };
                        });
                    }
                }
            }
        ).subscribe();

        return () => {
            supabase.removeChannel(permsChannel);
        };
    }, [adminId]);

    // Auto-swipe banners every 4 seconds (pauses when user interacts)`
);

// 3. Add block screen logic
content = content.replace(
  `    if (error) {
        return (`,
  `    if (shopSettings && shopSettings.allow_qr_menu === false) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
                <QrCode className="w-20 h-20 text-muted-foreground mb-6 opacity-50" />
                <h1 className="text-3xl font-bold mb-4 text-center">Menu Unavailable</h1>
                <p className="text-muted-foreground text-center max-w-md">
                    This digital menu is currently disabled by the administrator. Please contact the restaurant staff for a physical menu.
                </p>
            </div>
        );
    }

    if (error) {
        return (`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched PublicMenu.tsx');
