#!/usr/bin/env python3
"""
Fix item.qty vs item.quantity mismatch across all remote ordering components.
Strategy: 
  1. RemoteCheckout.tsx: map cart items to use 'qty' key when inserting (source of truth)  
  2. OnlineOrders.tsx: defensive display using (item.qty ?? item.quantity)
  3. RemoteOrdersKDS.tsx: defensive display using (item.qty ?? item.quantity)
  4. LiveOrderTracker.tsx: already uses item.quantity correctly (from its own read)
"""

import re

# ===== FIX 1: RemoteCheckout.tsx - normalize cart items to use qty when inserting =====
# Map cart items (which have 'quantity') to use 'qty' for the DB insert
file1 = r'src\components\RemoteCheckout.tsx'
with open(file1, 'r', encoding='utf-8') as f:
    content1 = f.read()

OLD1 = "        items: cart,"
NEW1 = "        items: cart.map(item => ({ ...item, qty: item.quantity })),"

if OLD1 in content1:
    content1 = content1.replace(OLD1, NEW1, 1)
    print("FIX 1 applied: RemoteCheckout cart items normalized to qty")
else:
    print("WARNING: FIX 1 pattern not found in RemoteCheckout.tsx")

with open(file1, 'w', encoding='utf-8') as f:
    f.write(content1)

# ===== FIX 2: OnlineOrders.tsx - defensive qty ?? quantity =====
file2 = r'src\pages\OnlineOrders.tsx'
with open(file2, 'r', encoding='utf-8') as f:
    content2 = f.read()

# Fix item display in order card (lines 406-407)
OLD2a = '                <span><span className="font-bold text-base mr-2">{item.qty}x</span> {item.name}</span>\n                <span className="font-medium">₹{item.price * item.qty}</span>'
NEW2a = '                <span><span className="font-bold text-base mr-2">{(item.qty ?? item.quantity)}x</span> {item.name}</span>\n                <span className="font-medium">₹{(item.price * (item.qty ?? item.quantity)).toFixed(2)}</span>'

if OLD2a in content2:
    content2 = content2.replace(OLD2a, NEW2a, 1)
    print("FIX 2a applied: OnlineOrders item card qty display fixed")
else:
    print("WARNING: FIX 2a pattern not found")

# Fix analytics item count (line 337)
OLD2b = "          itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.qty || 1);"
NEW2b = "          itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.qty ?? item.quantity ?? 1);"

if OLD2b in content2:
    content2 = content2.replace(OLD2b, NEW2b, 1)
    print("FIX 2b applied: OnlineOrders analytics qty fixed")
else:
    print("WARNING: FIX 2b pattern not found")

with open(file2, 'w', encoding='utf-8') as f:
    f.write(content2)

# ===== FIX 3: RemoteOrdersKDS.tsx - defensive qty ?? quantity =====
file3 = r'src\components\RemoteOrdersKDS.tsx'
with open(file3, 'r', encoding='utf-8') as f:
    content3 = f.read()

OLD3 = '                  <span><span className="font-medium">{item.qty}x</span> {item.name}</span>\n                  <span>₹{item.price * item.qty}</span>'
NEW3 = '                  <span><span className="font-medium">{(item.qty ?? item.quantity)}x</span> {item.name}</span>\n                  <span>₹{(item.price * (item.qty ?? item.quantity)).toFixed(2)}</span>'

if OLD3 in content3:
    content3 = content3.replace(OLD3, NEW3, 1)
    print("FIX 3 applied: RemoteOrdersKDS item qty display fixed")
else:
    # Try to find the pattern more flexibly
    count_qty = content3.count('item.qty')
    print(f"WARNING: FIX 3 exact pattern not found. Found {count_qty} occurrences of item.qty")
    # Show context
    idx = content3.find('item.qty')
    if idx > 0:
        print("  Context:", repr(content3[max(0,idx-50):idx+100]))

with open(file3, 'w', encoding='utf-8') as f:
    f.write(content3)

# ===== FIX 4: LiveOrderTracker.tsx - already uses item.quantity correctly =====
# Check it uses item.quantity (which comes from the JSONB stored with qty key now)
file4 = r'src\components\LiveOrderTracker.tsx'
with open(file4, 'r', encoding='utf-8') as f:
    content4 = f.read()

# LiveOrderTracker reads from DB which now stores items with 'qty' key
# Update it to be defensive too
OLD4 = '                  <span>{item.quantity}x {item.name}</span>\n                  <span>₹{(item.price * item.quantity).toFixed(2)}</span>'
NEW4 = '                  <span>{(item.qty ?? item.quantity)}x {item.name}</span>\n                  <span>₹{(item.price * (item.qty ?? item.quantity)).toFixed(2)}</span>'

if OLD4 in content4:
    content4 = content4.replace(OLD4, NEW4, 1)
    print("FIX 4 applied: LiveOrderTracker item qty display fixed")
    with open(file4, 'w', encoding='utf-8') as f:
        f.write(content4)
else:
    qty_count = content4.count('item.quantity')
    qty_q = content4.count('item.qty')
    print(f"INFO: LiveOrderTracker - item.quantity: {qty_count}, item.qty: {qty_q}")
    # Find and show the items loop context
    idx = content4.find('item.quantity')
    if idx > 0:
        print("  Context:", repr(content4[max(0,idx-60):idx+120]))

print("\nAll fixes applied. Run tsc --noEmit to verify.")
