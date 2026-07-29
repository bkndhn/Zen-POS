#!/usr/bin/env python3
"""
Surgical patch for PublicMenu.tsx remote ordering integration.
Reads the file, makes minimal targeted changes, writes back.
"""
import re

FILE = r'src\pages\PublicMenu.tsx'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()
    lines = content.splitlines(keepends=True)

print(f"Total lines read: {len(lines)}")

# ===== CHANGE 1: Add imports after OperatingHours import =====
IMPORT_ANCHOR = "import { OperatingHours } from '@/types/operatingHours';"
IMPORT_ADDITION = "\nimport { RemoteCheckout } from '@/components/RemoteCheckout';\nimport { LiveOrderTracker } from '@/components/LiveOrderTracker';"

if 'RemoteCheckout' not in content:
    content = content.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + IMPORT_ADDITION)
    print("✅ CHANGE 1: Added RemoteCheckout and LiveOrderTracker imports")
else:
    print("⏭️  CHANGE 1: Imports already present")

# Re-split after change 1
lines = content.splitlines(keepends=True)

# ===== CHANGE 2: Add remote ordering state after cart state block =====
# Find the line "    // Orders for this session" which comes right after the cart block
CART_ANCHOR = "    const [instructionItemId, setInstructionItemId] = useState<string | null>(null);\n"
REMOTE_STATE_BLOCK = """
    // ========== REMOTE ORDERING STATE ==========
    // isTableMode declared at ~line 224, cart at ~line 304 — both initialized before these hooks (no TDZ)
    const isRemoteMode = !isTableMode && !!(rawShopSettings as any)?.remote_ordering_enabled && !(rawShopSettings as any)?.remote_ordering_paused;
    const isOrderingMode = isTableMode || isRemoteMode;
    const [showRemoteCheckout, setShowRemoteCheckout] = useState(false);
    const [activeRemoteOrderId, setActiveRemoteOrderId] = useState<string | null>(null);
    const [showRemoteTracker, setShowRemoteTracker] = useState(false);

    // Check for active remote order on mount
    useEffect(() => {
        if (!adminId || !branchId || isTableMode) return;
        const deviceId = localStorage.getItem('zenpos_remote_device_id');
        if (!deviceId) return;
        (async () => {
            const { data } = await (supabase as any)
                .from('remote_orders')
                .select('id, status')
                .eq('admin_id', adminId)
                .eq('branch_id', branchId)
                .eq('device_id', deviceId)
                .not('status', 'in', '(completed,cancelled,no_show)')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (data?.id) {
                setActiveRemoteOrderId(data.id);
                setShowRemoteTracker(true);
            }
        })();
    }, [adminId, branchId, isTableMode]);

    // Abandoned cart recovery for remote mode
    useEffect(() => {
        if (!isRemoteMode || !adminId) return;
        const deviceId = localStorage.getItem('zenpos_remote_device_id');
        const savedCart = localStorage.getItem(`zenpos_remote_cart_${deviceId || 'anon'}`);
        if (savedCart && cart.length === 0) {
            try {
                const parsed = JSON.parse(savedCart);
                if (Array.isArray(parsed) && parsed.length > 0) setCart(parsed);
            } catch {}
        }
    }, [isRemoteMode, adminId]);

    // Save cart to localStorage for remote recovery
    useEffect(() => {
        if (!isRemoteMode) return;
        const deviceId = localStorage.getItem('zenpos_remote_device_id') || 'anon';
        if (cart.length > 0) {
            localStorage.setItem(`zenpos_remote_cart_${deviceId}`, JSON.stringify(cart));
        } else {
            localStorage.removeItem(`zenpos_remote_cart_${deviceId}`);
        }
    }, [cart, isRemoteMode]);

"""

if 'isRemoteMode' not in content:
    content = content.replace(CART_ANCHOR, CART_ANCHOR + REMOTE_STATE_BLOCK)
    print("✅ CHANGE 2: Added remote ordering state and useEffects")
else:
    print("⏭️  CHANGE 2: Remote ordering state already present")

# ===== CHANGE 3: Replace isTableMode with isOrderingMode in item card Add buttons =====
# These are the 3 occurrences in menu item card renders
# Pattern: indented {isTableMode && ( inside item cards (NOT in floating bar/session/etc)
# We need to be surgical - only replace where Add buttons appear
# The pattern is very specific indentation in item card renders

replacements_3 = [
    # Grid layout card (deepest indent ~56 spaces)
    (
        "                                                        {isTableMode && (\n                                                            <div className=\"mt-1.5\">",
        "                                                        {isOrderingMode && (\n                                                            <div className=\"mt-1.5\">"
    ),
    # List layout card
    (
        "                                                                {isTableMode && (\n                                                                    getCartQuantity",
        "                                                                {isOrderingMode && (\n                                                                    getCartQuantity"
    ),
    # Compact layout card  
    (
        "                                                            {isTableMode && (\n                                                                <div className=\"mt-2\">",
        "                                                            {isOrderingMode && (\n                                                                <div className=\"mt-2\">"
    ),
]

for old, new in replacements_3:
    if old in content:
        content = content.replace(old, new, 1)
        print(f"✅ CHANGE 3: Replaced isTableMode with isOrderingMode in item card")
    else:
        print(f"⚠️  CHANGE 3: Pattern not found: {repr(old[:60])}")

# ===== CHANGE 4: Update the Place Order button onClick and label =====
OLD_BUTTON = """                                <Button
                                    onClick={placeOrder}
                                    disabled={isPlacingOrder || cart.length === 0}
                                    className="w-full h-12 text-base font-bold rounded-xl text-white"
                                    style={{ background: shopSettings?.menu_primary_color ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})` : 'linear-gradient(135deg, #ea580c, #dc2626)' }}
                                >
                                    {isPlacingOrder ? (
                                        <><Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('menu.placingOrder') || 'Placing Order...'}</>
                                    ) : (
                                        <><Send className="w-5 h-5 mr-2" /> {t('menu.placeOrder') || 'Place Order'} ₹{cartTotal.toFixed(2)}</>
                                    )}
                                </Button>"""

NEW_BUTTON = """                                <Button
                                    onClick={isRemoteMode ? () => { setShowCart(false); setShowRemoteCheckout(true); } : placeOrder}
                                    disabled={isPlacingOrder || cart.length === 0}
                                    className="w-full h-12 text-base font-bold rounded-xl text-white"
                                    style={{ background: shopSettings?.menu_primary_color ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})` : 'linear-gradient(135deg, #ea580c, #dc2626)' }}
                                >
                                    {isPlacingOrder ? (
                                        <><Loader2 className="w-5 h-5 animate-spin mr-2" /> {t('menu.placingOrder') || 'Placing Order...'}</>
                                    ) : isRemoteMode ? (
                                        <><Send className="w-5 h-5 mr-2" /> Proceed to Checkout ₹{cartTotal.toFixed(2)}</>
                                    ) : (
                                        <><Send className="w-5 h-5 mr-2" /> {t('menu.placeOrder') || 'Place Order'} ₹{cartTotal.toFixed(2)}</>
                                    )}
                                </Button>"""

if OLD_BUTTON in content:
    content = content.replace(OLD_BUTTON, NEW_BUTTON, 1)
    print("✅ CHANGE 4: Updated Place Order button for remote mode")
else:
    print("⚠️  CHANGE 4: Place Order button pattern not found")

# ===== CHANGE 5: Update floating cart bar from isTableMode to isOrderingMode =====
OLD_FLOAT = """            {/* Floating Cart Bar (when table mode + items in cart) */}
            {
                isTableMode && cartItemCount > 0 && !showCart && ("""

NEW_FLOAT = """            {/* Floating Cart Bar (when ordering mode + items in cart) */}
            {
                isOrderingMode && cartItemCount > 0 && !showCart && ("""

if OLD_FLOAT in content:
    content = content.replace(OLD_FLOAT, NEW_FLOAT, 1)
    print("✅ CHANGE 5: Updated floating cart bar to isOrderingMode")
else:
    print("⚠️  CHANGE 5: Floating cart bar pattern not found")

# ===== CHANGE 6: Add RemoteCheckout and LiveOrderTracker JSX before closing </div> =====
OLD_CLOSING = """            )}
        </div>
    );
};


export default PublicMenu;"""

NEW_CLOSING = """            )}

            {/* Remote Checkout Modal */}
            {showRemoteCheckout && (
                <RemoteCheckout
                    isOpen={showRemoteCheckout}
                    onClose={() => setShowRemoteCheckout(false)}
                    cart={cart}
                    adminId={adminId || ''}
                    branchId={branchId || ''}
                    shopSettings={rawShopSettings as any}
                    taxRates={Object.values(taxRatesMap).map((t: any) => ({ id: '', rate: t.rate, name: t.name, cess: t.cess || 0 }))}
                    onOrderPlaced={(orderId) => {
                        setActiveRemoteOrderId(orderId);
                        setShowRemoteCheckout(false);
                        setShowRemoteTracker(true);
                        setCart([]);
                        const deviceId = localStorage.getItem('zenpos_remote_device_id') || 'anon';
                        localStorage.removeItem(`zenpos_remote_cart_${deviceId}`);
                    }}
                />
            )}

            {/* Live Order Tracker */}
            {showRemoteTracker && activeRemoteOrderId && (
                <LiveOrderTracker
                    isOpen={showRemoteTracker}
                    onClose={() => setShowRemoteTracker(false)}
                    orderId={activeRemoteOrderId}
                    onOrderComplete={() => {
                        setShowRemoteTracker(false);
                        setActiveRemoteOrderId(null);
                    }}
                />
            )}

        </div>
    );
};


export default PublicMenu;"""

if OLD_CLOSING in content:
    content = content.replace(OLD_CLOSING, NEW_CLOSING, 1)
    print("✅ CHANGE 6: Added RemoteCheckout and LiveOrderTracker JSX modals")
else:
    print("⚠️  CHANGE 6: Closing pattern not found, trying alternate...")
    # Try to find the actual end
    idx = content.rfind("        </div>\n    );\n};\n")
    if idx > 0:
        print(f"  Found alternate closing at char {idx}")
    else:
        print("  Could not find alternate closing either")

# Write final file
with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

lines_final = content.splitlines()
print(f"\n✅ Done! Final line count: {len(lines_final)}")

# Verify all key patterns exist exactly once
checks = [
    ('import React', 1),
    ('import { RemoteCheckout }', 1),
    ('import { LiveOrderTracker }', 1),
    ('const isTableMode = !!tableNo', 1),
    ('const [cart, setCart]', 1),
    ('const isRemoteMode', 1),
    ('const isOrderingMode', 1),
    ('const [showRemoteCheckout', 1),
    ('<RemoteCheckout', 1),
    ('<LiveOrderTracker', 1),
]
print("\n=== VERIFICATION ===")
all_ok = True
for pattern, expected_count in checks:
    count = content.count(pattern)
    status = "✅" if count == expected_count else "❌"
    if count != expected_count:
        all_ok = False
    print(f"{status} '{pattern}': found {count} (expected {expected_count})")

if all_ok:
    print("\n🎉 All checks passed!")
else:
    print("\n⚠️  Some checks failed - review above")
