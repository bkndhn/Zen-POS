// Demo account metadata only. No passwords are stored in client code.

export type DemoRole = 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen';

export const DEMO_SHOPS = [
  { key: 'bistro', name: 'Demo Zen Bistro' },
  { key: 'spice', name: 'Demo Royal Spice' },
  { key: 'coffee', name: 'Demo Coffee Club' },
] as const;

export const DEMO_ROLES: { role: DemoRole; label: string; pages: string[] }[] = [
  { role: 'admin', label: 'Owner', pages: [] },
  { role: 'manager', label: 'Manager', pages: ['dashboard', 'billing', 'items', 'expenses', 'reports', 'tables', 'customers', 'stock', 'kitchen', 'serviceArea', 'onlineOrders', 'waiterCompanion', 'tableBilling'] },
  { role: 'cashier', label: 'Cashier', pages: ['billing', 'calci_billing', 'customers', 'tables', 'tableBilling'] },
  { role: 'waiter', label: 'Waiter', pages: ['waiterCompanion', 'tables', 'tableBilling'] },
  { role: 'kitchen', label: 'Kitchen', pages: ['kitchen', 'serviceArea'] },
];

export const demoEmail = (shop: string, role: DemoRole) => `demo.${shop}.${role}@zenpos.test`;

export const DEMO_LOGINS_ENABLED = import.meta.env.VITE_DISABLE_DEMO_LOGINS !== 'true';
