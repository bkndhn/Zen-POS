file_path = 'src/pages/PublicMenu.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

import re

# We will just write a specific replacer
pattern = r"(const addToCart = useCallback\(\(item: MenuItem, e\?: React\.MouseEvent\) => \{[\s\S]*?\}, \[storeStatus\]\);)\s*(const confirmAddToCart = useCallback\(\(customizedItem: CartItem, e\?: React\.MouseEvent\) => \{[\s\S]*?\}, \[\]\);)"

match = re.search(pattern, content)
if match:
    add_to_cart = match.group(1)
    confirm = match.group(2)
    
    new_add = '''    const addToCart = useCallback((item: MenuItem, e?: React.MouseEvent) => {
        if (storeStatus && storeStatus.status !== 'open') {
            toast({ title: storeStatus.message, description: 'Store is currently not accepting orders.', variant: 'destructive' });
            return;
        }

        const allModifiers = item.modifiers || item.customization_options || item.addons || [];
        if (allModifiers.length === 0) {
            const simpleItem = {
                id: item.id,
                item_id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.base_value || 1,
                unit: item.unit,
                base_value: item.base_value,
                instructions: '',
                tax_rate_id: item.tax_rate_id,
                is_tax_inclusive: item.is_tax_inclusive,
                selected_modifiers: [],
                customization_string: ''
            };
            confirmAddToCart(simpleItem as any, e);
            return;
        }

        setCustomizerItem({ item, event: e });
    }, [storeStatus, confirmAddToCart]);'''
    
    # Swap order
    replacement = confirm + "\n\n" + new_add
    
    new_content = content[:match.start()] + replacement + content[match.end():]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Swapped and updated!")
else:
    print("Not found with regex")

