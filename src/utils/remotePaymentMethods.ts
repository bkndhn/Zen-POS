/**
 * Which payment methods a customer may use for delivery/pickup orders on the
 * public menu. The server enforces the same rules in a trigger on remote_orders,
 * so this only decides which buttons the customer sees.
 */
export type RemotePaymentMode = 'both' | 'online_only' | 'cod_only';

export interface RemotePaymentOptions {
  mode: RemotePaymentMode;
  allowOnline: boolean;
  allowCod: boolean;
  /** Shop chose online-only but has no UPI ID, so no order can be placed. */
  blocked: boolean;
}

export const normalizeRemotePaymentMode = (settings: any): RemotePaymentMode => {
  const raw = settings?.remote_payment_methods;
  if (raw === 'both' || raw === 'online_only' || raw === 'cod_only') return raw;
  return settings?.require_payment_before_order ? 'online_only' : 'both';
};

export const resolveRemotePaymentOptions = (settings: any): RemotePaymentOptions => {
  const mode = normalizeRemotePaymentMode(settings);
  const hasUpi = typeof settings?.upi_id === 'string' && settings.upi_id.trim().length > 0;
  const allowOnline = mode !== 'cod_only' && hasUpi;
  const allowCod = mode !== 'online_only';
  return { mode, allowOnline, allowCod, blocked: !allowOnline && !allowCod };
};
