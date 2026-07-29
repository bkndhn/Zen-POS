#!/usr/bin/env python3
"""
Add Collector Verification & Pickup Security PIN logic to OnlineOrders.tsx
"""

FILE = r'src\pages\OnlineOrders.tsx'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Original lines: {len(content.splitlines())}")

# 1. Add state variables
OLD_STATE = "  const [paymentDiscount, setPaymentDiscount] = useState(0);"
NEW_STATE = """  const [paymentDiscount, setPaymentDiscount] = useState(0);
  
  // Delegate & Pickup Security PIN state
  const [collectorName, setCollectorName] = useState('');
  const [collectorPhone, setCollectorPhone] = useState('');
  const [isDelegatePickup, setIsDelegatePickup] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');"""

if OLD_STATE in content:
    content = content.replace(OLD_STATE, NEW_STATE, 1)
    print("State variables added")

# 2. Reset delegate states when opening payment modal
OLD_OPEN_PAY = """              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => {
                setPaymentOrder(order);
                const total = Number(order.total_amount);
                setPaymentMode({ 'Cash': total, 'UPI': 0, 'Card': 0, 'GPay': 0 });
                setPaymentDiscount(0);
              }}>"""

NEW_OPEN_PAY = """              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => {
                setPaymentOrder(order);
                const total = Number(order.total_amount);
                setPaymentMode({ 'Cash': total, 'UPI': 0, 'Card': 0, 'GPay': 0 });
                setPaymentDiscount(0);
                setCollectorName('');
                setCollectorPhone('');
                setIsDelegatePickup(false);
                setEnteredPin('');
              }}>"""

content = content.replace(OLD_OPEN_PAY, NEW_OPEN_PAY)

OLD_OPEN_DELIV = """              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => {
                setPaymentOrder(order);
                const total = Number(order.total_amount);
                setPaymentMode({ 'Cash': 0, 'UPI': total, 'Card': 0, 'GPay': 0 });
                setPaymentDiscount(0);
              }}>"""

NEW_OPEN_DELIV = """              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => {
                setPaymentOrder(order);
                const total = Number(order.total_amount);
                setPaymentMode({ 'Cash': 0, 'UPI': total, 'Card': 0, 'GPay': 0 });
                setPaymentDiscount(0);
                setCollectorName('');
                setCollectorPhone('');
                setIsDelegatePickup(false);
                setEnteredPin('');
              }}>"""

content = content.replace(OLD_OPEN_DELIV, NEW_OPEN_DELIV)

# 3. Update updateOrderStatus call in completeWithPayment
OLD_COMPLETE_STATUS = """      // Mark remote order as completed with bill reference
      await updateOrderStatus(order.id, 'completed', {
        completed_at: new Date().toISOString(),
        payment_mode: primaryMode === 'Cash' ? 'pay_on_pickup' : 'paid',
        is_paid: true,
        payment_reference: (billData as any)?.id || null
      });"""

NEW_COMPLETE_STATUS = """      // Mark remote order as completed with bill reference and collector audit info
      await updateOrderStatus(order.id, 'completed', {
        completed_at: new Date().toISOString(),
        payment_mode: primaryMode === 'Cash' ? 'pay_on_pickup' : 'paid',
        is_paid: true,
        payment_reference: (billData as any)?.id || null,
        collected_by_name: isDelegatePickup ? collectorName.trim() : order.customer_name,
        collected_by_phone: isDelegatePickup ? collectorPhone.trim() : order.customer_phone,
        is_delegate_pickup: isDelegatePickup
      });"""

if OLD_COMPLETE_STATUS in content:
    content = content.replace(OLD_COMPLETE_STATUS, NEW_COMPLETE_STATUS, 1)
    print("updateOrderStatus updated with collector details")

# 4. Insert Pickup PIN & Delegate section in Complete Payment Dialog
OLD_PAY_DIALOG_INNER = """                {/* Discount */}"""
NEW_PAY_DIALOG_INNER = """                {/* Handover & Pickup Verification Section */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                      <span>🔐 Pickup PIN Verification</span>
                      {paymentOrder.pickup_pin && (
                        <Badge variant="outline" className="font-mono font-bold bg-amber-500/20 text-amber-800 dark:text-amber-200">
                          PIN: {paymentOrder.pickup_pin}
                        </Badge>
                      )}
                    </div>
                    {enteredPin && enteredPin === paymentOrder.pickup_pin && (
                      <Badge className="bg-green-600 text-white flex items-center gap-1">
                        ✓ PIN Verified
                      </Badge>
                    )}
                  </div>

                  {paymentOrder.pickup_pin && (
                    <div className="flex gap-2 items-center">
                      <Input
                        placeholder="Enter 4-digit PIN from customer"
                        maxLength={4}
                        value={enteredPin}
                        onChange={e => setEnteredPin(e.target.value.trim())}
                        className="h-9 text-sm font-mono tracking-widest text-center max-w-[200px]"
                      />
                      {enteredPin && enteredPin === paymentOrder.pickup_pin && (
                        <span className="text-xs text-green-600 font-semibold">✓ Correct PIN</span>
                      )}
                      {enteredPin && enteredPin !== paymentOrder.pickup_pin && (
                        <span className="text-xs text-red-500 font-medium">Incorrect PIN</span>
                      )}
                    </div>
                  )}

                  {/* Delegate / Third-party Collector Toggle */}
                  <div className="border-t border-amber-500/20 pt-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="delegate-toggle" className="text-xs font-semibold cursor-pointer flex items-center gap-1.5">
                        <span>👤 Collecting on behalf of customer? (Friend / Relative)</span>
                      </Label>
                      <Switch
                        id="delegate-toggle"
                        checked={isDelegatePickup}
                        onCheckedChange={checked => {
                          setIsDelegatePickup(checked);
                          if (!checked) {
                            setCollectorName('');
                            setCollectorPhone('');
                          }
                        }}
                      />
                    </div>

                    {isDelegatePickup && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Collector Name *</Label>
                          <Input
                            placeholder="e.g. Rahul (Friend)"
                            value={collectorName}
                            onChange={e => setCollectorName(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Collector Mobile *</Label>
                          <Input
                            placeholder="10-digit mobile"
                            maxLength={10}
                            value={collectorPhone}
                            onChange={e => setCollectorPhone(e.target.value.replace(/\D/g, ''))}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Discount */}"""

if OLD_PAY_DIALOG_INNER in content:
    content = content.replace(OLD_PAY_DIALOG_INNER, NEW_PAY_DIALOG_INNER, 1)
    print("Handover & PIN section added to Complete Payment dialog")

# 5. Insert Collector Audit in View Details Modal
OLD_VIEW_DETAILS_INNER = """              {/* Rejection reason */}"""
NEW_VIEW_DETAILS_INNER = """              {/* Delegate / Collector Security Audit */}
              {(viewDetailOrder.collected_by_name || viewDetailOrder.pickup_pin) && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm space-y-1">
                  <div className="font-semibold flex items-center justify-between text-amber-900 dark:text-amber-200">
                    <span className="flex items-center gap-1">🔐 Pickup Security Audit</span>
                    {viewDetailOrder.pickup_pin && <Badge variant="outline" className="font-mono font-bold">PIN: {viewDetailOrder.pickup_pin}</Badge>}
                  </div>
                  {viewDetailOrder.is_delegate_pickup && viewDetailOrder.collected_by_name ? (
                    <div className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                      ⚠️ Collected by Delegate (Friend/Relative): {viewDetailOrder.collected_by_name} ({viewDetailOrder.collected_by_phone || 'No phone'})
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Collected by customer directly</div>
                  )}
                </div>
              )}

              {/* Rejection reason */}"""

if OLD_VIEW_DETAILS_INNER in content:
    content = content.replace(OLD_VIEW_DETAILS_INNER, NEW_VIEW_DETAILS_INNER, 1)
    print("Collector Audit section added to View Details dialog")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Final lines: {len(content.splitlines())}")
