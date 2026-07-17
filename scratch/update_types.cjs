const fs = require('fs');
let content = fs.readFileSync('src/integrations/supabase/types.ts', 'utf8');

// bill_items Row
content = content.replace(
  /(\s+id: string\s+)(item_id: string)(\s+price: number)/,
  '$1item_id: string | null\n          item_name_override: string | null$3'
);
// bill_items Insert
content = content.replace(
  /(\s+id\?: string\s+)(item_id: string)(\s+price: number)/,
  '$1item_id?: string | null\n          item_name_override?: string | null$3'
);
// bill_items Update
content = content.replace(
  /(\s+id\?: string\s+)(item_id\?: string)(\s+price\?: number)/,
  '$1item_id?: string | null\n          item_name_override?: string | null$3'
);

// bills Row
content = content.replace(
  /(\s+additional_charges: Json \| null\s+admin_id: string \| null\s+)(bill_no: string)/,
  '$1billing_type: string | null\n            $2'
);
// bills Insert
content = content.replace(
  /(\s+additional_charges\?: Json \| null\s+admin_id\?: string \| null\s+)(bill_no: string)/,
  '$1billing_type?: string | null\n            $2'
);
// bills Update
content = content.replace(
  /(\s+additional_charges\?: Json \| null\s+admin_id\?: string \| null\s+)(bill_no\?: string)/,
  '$1billing_type?: string | null\n            $2'
);

// shop_settings Row
content = content.replace(
  /(\s+address: string \| null\s+branch_id: string \| null\s+)(composition_rate: number \| null)/g,
  '$1calci_billing_enabled: boolean | null\n            $2'
);
// shop_settings Insert
content = content.replace(
  /(\s+address\?: string \| null\s+branch_id\?: string \| null\s+)(composition_rate\?: number \| null)/g,
  '$1calci_billing_enabled?: boolean | null\n            $2'
);

fs.writeFileSync('src/integrations/supabase/types.ts', content);
console.log('Types updated successfully');
