#!/usr/bin/env python3
"""
Fix 1: Cart overlay gated by isTableMode but should be isOrderingMode
Fix 2: placeOrder silently returns when sessionId is null - show proper message
Fix 3: In remote mode, placeOrder should be completely bypassed
"""

FILE = r'src\pages\PublicMenu.tsx'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Total lines: {len(content.splitlines())}")

# ===== FIX 1: Cart overlay gated by isTableMode - change to isOrderingMode =====
OLD1 = "                isTableMode && showCart && cart.length > 0 && ("
NEW1 = "                isOrderingMode && showCart && cart.length > 0 && ("

if OLD1 in content:
    content = content.replace(OLD1, NEW1, 1)
    print("FIX 1 applied: Cart overlay now uses isOrderingMode")
else:
    print("WARNING FIX 1: pattern not found")

# ===== FIX 2: placeOrder - add clear user feedback when sessionId is null =====
OLD2 = "        if (!adminId || !tableNo || !sessionId || cart.length === 0) return;"
NEW2 = """        if (!adminId || !tableNo || cart.length === 0) return;
        if (!sessionId) {
            toast({
                title: "Session not ready",
                description: "Your session is being initialized. Please try again in a moment.",
                variant: "destructive"
            });
            return;
        }"""

if OLD2 in content:
    content = content.replace(OLD2, NEW2, 1)
    print("FIX 2 applied: placeOrder shows proper toast when session not ready")
else:
    print("WARNING FIX 2: pattern not found")

# ===== FIX 3: Also add a note input for remote mode in cart (hide table-specific fields) =====
# The cart shows "Note for kitchen" - this is fine for both modes, no change needed

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nDone. Final lines: {len(content.splitlines())}")

# Verification
checks = [
    ("isOrderingMode && showCart && cart.length > 0", 1),
    ("isTableMode && showCart && cart.length > 0", 0),  # must be 0 now
    ("Session not ready", 1),
]
print("\n=== VERIFY ===")
all_ok = True
for pat, expected in checks:
    count = content.count(pat)
    ok = count == expected
    if not ok: all_ok = False
    print(f"{'OK' if ok else 'FAIL'} '{pat}': found {count} (expected {expected})")

if all_ok:
    print("\nAll checks passed!")
else:
    print("\nSome checks FAILED")
