#!/usr/bin/env python3
"""
Comprehensive fix for OnlineOrders.tsx:
1. Fix duplicate history entries (optimistic update + realtime both add to history)
2. Implement View Details modal with full order info
3. Add Payment modal before Customer Collected → creates bill via secure_create_bill RPC
4. Reports integration: bills created with channel='online' appear in Reports automatically
"""

FILE = r'src\pages\OnlineOrders.tsx'
with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

original_lines = len(content.splitlines())
print(f"Original lines: {original_lines}")

# ===== FIX 1: Add new state variables after existing dialog states =====
OLD_STATE = "  // History tab state\n  const [historySearch, setHistorySearch] = useState('');"
NEW_STATE = """  // History tab state
  const [historySearch, setHistorySearch] = useState('');
  
  // View Details state
  const [viewDetailOrder, setViewDetailOrder] = useState<any>(null);
  
  // Payment Modal state (before completing an order)
  const [paymentOrder, setPaymentOrder] = useState<any>(null);
  const [paymentMode, setPaymentMode] = useState<Record<string, number>>({ 'Cash': 0, 'UPI': 0, 'Card': 0, 'GPay': 0 });
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  const [paymentDiscount, setPaymentDiscount] = useState(0);"""

if OLD_STATE in content:
    content = content.replace(OLD_STATE, NEW_STATE, 1)
    print("FIX 1 applied: added state for view details + payment modal")
else:
    print("WARNING FIX 1: state pattern not found")

# ===== FIX 2: Fix duplicate history - remove optimistic add from updateOrderStatus =====
# The Realtime subscription (line 147) already adds to historyOrders when status=completed
# The updateOrderStatus also adds to historyOrders → DUPLICATE
# Fix: Remove the optimistic historyOrders update from updateOrderStatus, let Realtime handle it
OLD_UPDATE = """      if (['completed', 'cancelled', 'no_show'].includes(status)) {
        const updatedOrder = orders.find(o => o.id === id);
        if (updatedOrder) {
          setOrders(prev => prev.filter(o => o.id !== id));
          setHistoryOrders(prev => [{...updatedOrder, ...payload}, ...prev].slice(0, 50));
        }
      } else {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, ...payload } : o));
      }"""
NEW_UPDATE = """      // Realtime subscription handles moving orders between active<->history
      // We only do local optimistic update for non-terminal statuses to avoid duplicates
      if (['completed', 'cancelled', 'no_show'].includes(status)) {
        setOrders(prev => prev.filter(o => o.id !== id));
        // Don't add to historyOrders here - Realtime UPDATE event will do it
      } else {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, ...payload } : o));
      }"""

if OLD_UPDATE in content:
    content = content.replace(OLD_UPDATE, NEW_UPDATE, 1)
    print("FIX 2 applied: removed duplicate historyOrders optimistic update")
else:
    print("WARNING FIX 2: update pattern not found")

# ===== FIX 3: Add completeWithPayment function after updateOrderStatus =====
OLD_AFTER_UPDATE = "  const handleAccept = async () => {"
NEW_AFTER_UPDATE = """  // Complete an online order with payment: creates a bill + marks order as completed
  const completeWithPayment = async (order: any) => {
    if (!adminId || !branchId || !profile?.user_id) return;
    setIsCompletingPayment(true);
    try {
      // Calculate payment total
      const total = Number(order.total_amount) - paymentDiscount;
      const payTotal = Object.values(paymentMode).reduce((s: number, v: any) => s + Number(v || 0), 0);
      if (Math.abs(payTotal - total) > 0.5) {
        toast({ variant: 'destructive', title: 'Payment mismatch', description: `Payment amounts (₹${payTotal}) must equal total (₹${total})` });
        setIsCompletingPayment(false);
        return;
      }

      // Build payment_details object (e.g. { Cash: 30 })
      const paymentDetails: Record<string, number> = {};
      Object.entries(paymentMode).forEach(([k, v]) => {
        if (Number(v) > 0) paymentDetails[k] = Number(v);
      });
      const primaryMode = Object.keys(paymentDetails)[0] || 'Cash';

      // Get next bill number
      const { data: maxBillData } = await (supabase as any).rpc('get_max_bill_number', { p_admin_id: adminId, p_branch_id: branchId }).maybeSingle();
      const nextBillNo = ((maxBillData?.max_bill || 0) + 1).toString();

      // Build cart items from order.items
      const cartItems = Array.isArray(order.items) ? order.items.map((item: any) => ({
        id: item.id || null,
        name: item.name,
        item_name_override: item.name,
        price: Number(item.price),
        quantity: Number(item.qty || item.quantity || 1),
        billing_type: 'pos'
      })) : [];

      // Create bill via secure_create_bill RPC (same as POS)
      const { data: billData, error: rpcError } = await supabase.rpc('secure_create_bill', {
        p_bill_payload: {
          bill_no: nextBillNo,
          total_amount: total,
          created_by: profile.user_id,
          payment_mode: primaryMode,
          payment_details: paymentDetails,
          additional_charges: [],
          discount: paymentDiscount,
          order_type: order.order_type === 'delivery' ? 'delivery' : 'pickup',
          table_no: order.order_number,
          customer_mobile: order.customer_phone || null,
          customer_gstin: null,
          branch_id: branchId,
          admin_id: adminId,
          channel: 'online',
          billing_type: 'pos'
        },
        p_cart_items: cartItems
      });

      if (rpcError) throw rpcError;

      // Mark remote order as completed with bill reference
      await updateOrderStatus(order.id, 'completed', {
        completed_at: new Date().toISOString(),
        payment_mode: primaryMode === 'Cash' ? 'pay_on_pickup' : 'paid',
        is_paid: true,
        payment_reference: (billData as any)?.id || null
      });

      toast({ title: '✅ Order Completed & Bill Created', description: `Bill #${nextBillNo} created. Revenue added to reports.` });
      setPaymentOrder(null);
      setPaymentDiscount(0);
      setPaymentMode({ 'Cash': 0, 'UPI': 0, 'Card': 0, 'GPay': 0 });
      
      // Signal reports to refresh
      window.dispatchEvent(new CustomEvent('bills-updated'));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Payment failed', description: err.message });
    } finally {
      setIsCompletingPayment(false);
    }
  };

  const handleAccept = async () => {"""

if OLD_AFTER_UPDATE in content:
    content = content.replace(OLD_AFTER_UPDATE, NEW_AFTER_UPDATE, 1)
    print("FIX 3 applied: added completeWithPayment function")
else:
    print("WARNING FIX 3: handleAccept pattern not found")

# ===== FIX 4: Change Customer Collected button to open payment modal instead =====
OLD_COLLECTED = '              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => updateOrderStatus(order.id, \'completed\', { completed_at: new Date().toISOString() })}>\n                <CheckCircle2 className="w-5 h-5 mr-2" /> Customer Collected\n              </Button>'
NEW_COLLECTED = '''              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => {
                setPaymentOrder(order);
                const total = Number(order.total_amount);
                setPaymentMode({ 'Cash': total, 'UPI': 0, 'Card': 0, 'GPay': 0 });
                setPaymentDiscount(0);
              }}>
                <CheckCircle2 className="w-5 h-5 mr-2" /> Complete & Pay
              </Button>'''

if OLD_COLLECTED in content:
    content = content.replace(OLD_COLLECTED, NEW_COLLECTED, 1)
    print("FIX 4 applied: Customer Collected → Complete & Pay opens payment modal")
else:
    print("WARNING FIX 4: Customer Collected pattern not found")

# Same for delivery "Mark Delivered"
OLD_DELIVERED = '              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => updateOrderStatus(order.id, \'completed\', { completed_at: new Date().toISOString() })}>\n                <CheckCircle2 className="w-5 h-5 mr-2" /> Mark Delivered\n              </Button>'
NEW_DELIVERED = '''              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-base py-6" onClick={() => {
                setPaymentOrder(order);
                const total = Number(order.total_amount);
                setPaymentMode({ 'Cash': 0, 'UPI': total, 'Card': 0, 'GPay': 0 });
                setPaymentDiscount(0);
              }}>
                <CheckCircle2 className="w-5 h-5 mr-2" /> Complete & Pay
              </Button>'''

if OLD_DELIVERED in content:
    content = content.replace(OLD_DELIVERED, NEW_DELIVERED, 1)
    print("FIX 4b applied: Mark Delivered → Complete & Pay opens payment modal")
else:
    print("WARNING FIX 4b: Mark Delivered pattern not found")

# ===== FIX 5: Implement View Details button =====
OLD_VIEW = '''                          <Button variant="ghost" size="sm" className="mt-2 text-xs h-7" onClick={() => {
                            // Could implement view details dialog here
                            toast({ description: "View details coming soon" });
                          }}>
                            View Details
                          </Button>'''
NEW_VIEW = '''                          <Button variant="ghost" size="sm" className="mt-2 text-xs h-7" onClick={() => setViewDetailOrder(order)}>
                            View Details
                          </Button>'''

if OLD_VIEW in content:
    content = content.replace(OLD_VIEW, NEW_VIEW, 1)
    print("FIX 5 applied: View Details opens detail modal")
else:
    print("WARNING FIX 5: View Details pattern not found")

# ===== FIX 6: Add View Details Dialog + Payment Dialog before closing </div> of component =====
OLD_CLOSING = "    </div>\n  );\n}"
NEW_CLOSING = """    </div>

      {/* ====== VIEW DETAILS DIALOG ====== */}
      <Dialog open={!!viewDetailOrder} onOpenChange={open => !open && setViewDetailOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Order #{viewDetailOrder?.order_number}
            </DialogTitle>
          </DialogHeader>
          {viewDetailOrder && (
            <div className="space-y-4 py-2">
              {/* Customer Info */}
              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <div className="font-semibold text-base">{viewDetailOrder.customer_name}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{viewDetailOrder.customer_phone}</div>
                <div className="flex gap-2 mt-1">
                  <Badge variant={viewDetailOrder.order_type === 'pickup' ? 'secondary' : 'default'}>
                    {viewDetailOrder.order_type === 'pickup' ? '📦 Pickup' : '🚗 Delivery'}
                  </Badge>
                  <Badge className={
                    viewDetailOrder.status === 'completed' ? 'bg-green-600' :
                    viewDetailOrder.status === 'cancelled' ? 'bg-red-600' :
                    viewDetailOrder.status === 'pending' ? 'bg-orange-500' : 'bg-blue-600'
                  }>{viewDetailOrder.status.replace(/_/g, ' ')}</Badge>
                </div>
              </div>

              {/* Delivery Address */}
              {viewDetailOrder.order_type === 'delivery' && viewDetailOrder.delivery_address && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm">
                  <div className="font-semibold flex items-center gap-1 mb-1"><MapPin className="w-3.5 h-3.5" /> Delivery Address</div>
                  <div>{viewDetailOrder.delivery_address}</div>
                  {viewDetailOrder.delivery_distance_km && <div className="text-muted-foreground mt-1">{viewDetailOrder.delivery_distance_km} km away</div>}
                </div>
              )}

              {/* Items */}
              <div>
                <div className="font-semibold mb-2">Items Ordered</div>
                <div className="space-y-1.5">
                  {Array.isArray(viewDetailOrder.items) && viewDetailOrder.items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm bg-muted/20 rounded p-2">
                      <span><span className="font-medium">{item.qty ?? item.quantity}x</span> {item.name}</span>
                      <span className="font-medium">₹{(item.price * (item.qty ?? item.quantity)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fee Breakdown */}
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>₹{Number(viewDetailOrder.subtotal || 0).toFixed(2)}</span></div>
                {Number(viewDetailOrder.tax_total) > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>₹{Number(viewDetailOrder.tax_total).toFixed(2)}</span></div>}
                {Number(viewDetailOrder.delivery_fee) > 0 && <div className="flex justify-between text-muted-foreground"><span>Delivery Fee</span><span>₹{Number(viewDetailOrder.delivery_fee).toFixed(2)}</span></div>}
                {Number(viewDetailOrder.packaging_fee) > 0 && <div className="flex justify-between text-muted-foreground"><span>Packaging</span><span>₹{Number(viewDetailOrder.packaging_fee).toFixed(2)}</span></div>}
                {Number(viewDetailOrder.tip_amount) > 0 && <div className="flex justify-between text-muted-foreground"><span>Tip</span><span>₹{Number(viewDetailOrder.tip_amount).toFixed(2)}</span></div>}
                <div className="flex justify-between font-bold text-base border-t pt-1 mt-1"><span>Total</span><span>₹{Number(viewDetailOrder.total_amount).toFixed(2)}</span></div>
              </div>

              {/* Timestamps */}
              <div className="border-t pt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div><span className="font-medium">Placed:</span> {new Date(viewDetailOrder.created_at).toLocaleString()}</div>
                {viewDetailOrder.accepted_at && <div><span className="font-medium">Accepted:</span> {new Date(viewDetailOrder.accepted_at).toLocaleString()}</div>}
                {viewDetailOrder.ready_at && <div><span className="font-medium">Ready:</span> {new Date(viewDetailOrder.ready_at).toLocaleString()}</div>}
                {viewDetailOrder.completed_at && <div><span className="font-medium">Completed:</span> {new Date(viewDetailOrder.completed_at).toLocaleString()}</div>}
                <div><span className="font-medium">Payment:</span> {viewDetailOrder.payment_mode?.replace(/_/g, ' ') || 'N/A'}</div>
                {viewDetailOrder.is_scheduled && viewDetailOrder.scheduled_for && (
                  <div><span className="font-medium">Scheduled:</span> {new Date(viewDetailOrder.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                )}
              </div>

              {/* Rejection reason */}
              {viewDetailOrder.rejection_reason && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded p-3 text-sm text-red-700 dark:text-red-300">
                  <span className="font-semibold">Rejected: </span>{viewDetailOrder.rejection_reason}
                </div>
              )}

              {/* Rating */}
              {viewDetailOrder.rating > 0 && (
                <div className="flex items-center gap-1 text-yellow-500">
                  {Array.from({length: viewDetailOrder.rating}).map((_: any, i: number) => <Star key={i} className="w-4 h-4 fill-current" />)}
                  {viewDetailOrder.feedback_text && <span className="text-sm text-muted-foreground ml-2">"{viewDetailOrder.feedback_text}"</span>}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDetailOrder(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====== COMPLETE PAYMENT DIALOG ====== */}
      <Dialog open={!!paymentOrder} onOpenChange={open => { if (!open) { setPaymentOrder(null); setPaymentDiscount(0); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              Complete Payment — Order #{paymentOrder?.order_number}
            </DialogTitle>
            <DialogDescription>Confirm payment before marking order as completed. A bill will be created in Reports.</DialogDescription>
          </DialogHeader>
          {paymentOrder && (() => {
            const orderTotal = Number(paymentOrder.total_amount);
            const discountedTotal = Math.max(0, orderTotal - paymentDiscount);
            const payTotal = Object.values(paymentMode).reduce((s: number, v: any) => s + Number(v || 0), 0);
            const isBalanced = Math.abs(payTotal - discountedTotal) <= 0.5;
            return (
              <div className="space-y-4 py-2">
                {/* Order Summary */}
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="font-semibold mb-2">Order Summary ({Array.isArray(paymentOrder.items) ? paymentOrder.items.length : 0} items) — ₹{orderTotal.toFixed(2)}</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {Array.isArray(paymentOrder.items) && paymentOrder.items.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{item.qty ?? item.quantity}x {item.name}</span>
                        <span>₹{(item.price * (item.qty ?? item.quantity)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  {Number(paymentOrder.delivery_fee) > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground mt-1 border-t pt-1">
                      <span>Delivery Fee</span><span>₹{Number(paymentOrder.delivery_fee).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Discount */}
                <div className="flex items-center gap-3">
                  <Label className="shrink-0 text-sm">Discount (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={orderTotal}
                    value={paymentDiscount || ''}
                    onChange={e => setPaymentDiscount(Math.min(Number(e.target.value) || 0, orderTotal))}
                    placeholder="0"
                    className="w-24"
                  />
                  <span className="text-sm font-bold text-green-700">Net: ₹{discountedTotal.toFixed(2)}</span>
                </div>

                {/* Payment Methods */}
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Payment</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(paymentMode).map(([mode, amount]) => (
                      <div key={mode} className="flex flex-col gap-1">
                        <Button
                          type="button"
                          variant={Number(amount) > 0 ? 'default' : 'outline'}
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            const remaining = discountedTotal - Object.entries(paymentMode).filter(([k]) => k !== mode).reduce((s, [, v]) => s + Number(v || 0), 0);
                            setPaymentMode(prev => ({
                              ...prev,
                              [mode]: Number(prev[mode]) > 0 ? 0 : Math.max(0, remaining)
                            }));
                          }}
                        >{mode}</Button>
                        <Input
                          type="number"
                          min={0}
                          value={Number(amount) || ''}
                          onChange={e => setPaymentMode(prev => ({ ...prev, [mode]: Number(e.target.value) || 0 }))}
                          placeholder="0"
                          className="h-8 text-center text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <div className={`text-sm mt-2 font-medium ${isBalanced ? 'text-green-600' : 'text-red-500'}`}>
                    {isBalanced ? '✓ Payment balanced' : `⚠ Collected ₹${payTotal.toFixed(2)} of ₹${discountedTotal.toFixed(2)}`}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaymentOrder(null); setPaymentDiscount(0); }}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={isCompletingPayment || !paymentOrder}
              onClick={() => paymentOrder && completeWithPayment(paymentOrder)}
            >
              {isCompletingPayment ? '⏳ Processing...' : '✅ Complete Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

  );
}"""

if "    </div>\n  );\n}" in content:
    content = content.replace("    </div>\n  );\n}", NEW_CLOSING, 1)
    print("FIX 6 applied: added View Details + Payment dialogs to JSX")
else:
    print("WARNING FIX 6: closing pattern not found, trying alternate...")
    if "  );\n}" in content:
        idx = content.rfind("  );\n}")
        content = content[:idx] + NEW_CLOSING + "\n"
        print("FIX 6b applied: used rfind for closing")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

final_lines = len(content.splitlines())
print(f"\nDone. Lines: {original_lines} → {final_lines}")
