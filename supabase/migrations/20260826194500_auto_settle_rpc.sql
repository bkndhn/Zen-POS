CREATE OR REPLACE FUNCTION public.process_remote_order_auto_settle(p_order_id UUID)
RETURNS JSON AS $$
DECLARE
    v_order RECORD;
    v_bill_id UUID;
    v_item RECORD;
BEGIN
    -- Get the remote order
    SELECT * INTO v_order FROM public.remote_orders WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Order not found');
    END IF;

    IF v_order.status = 'completed' THEN
        RETURN json_build_object('success', true, 'message', 'Already completed');
    END IF;

    -- Create Bill
    INSERT INTO public.bills (
        admin_id, branch_id, bill_number, customer_name, customer_phone, 
        total_amount, subtotal, discount_amount, tax_amount, 
        payment_mode, payment_status, order_type
    ) VALUES (
        v_order.admin_id, v_order.branch_id,
        (SELECT COALESCE(MAX(bill_number), 0) + 1 FROM public.bills WHERE admin_id = v_order.admin_id AND branch_id = v_order.branch_id AND date = CURRENT_DATE),
        v_order.customer_name, v_order.customer_phone,
        v_order.total_amount, v_order.subtotal, v_order.discount_amount, v_order.tax_amount,
        COALESCE(v_order.payment_method, 'online'), 'paid', v_order.order_type
    ) RETURNING id INTO v_bill_id;

    -- Create Bill Items and deduct stock (basic deduction)
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items)
    LOOP
        INSERT INTO public.bill_items (
            bill_id, item_id, item_name, quantity, price, subtotal,
            admin_id, branch_id
        ) VALUES (
            v_bill_id, (v_item.value->>'item_id')::UUID, v_item.value->>'name', 
            (v_item.value->>'quantity')::NUMERIC, (v_item.value->>'price')::NUMERIC, 
            (v_item.value->>'quantity')::NUMERIC * (v_item.value->>'price')::NUMERIC,
            v_order.admin_id, v_order.branch_id
        );

        -- Attempt to deduct stock if tracked
        UPDATE public.branch_item_stock
        SET quantity = quantity - (v_item.value->>'quantity')::NUMERIC
        WHERE admin_id = v_order.admin_id AND branch_id = v_order.branch_id AND item_id = (v_item.value->>'item_id')::UUID;
    END LOOP;

    -- Mark remote order as completed
    UPDATE public.remote_orders SET status = 'completed', completed_at = NOW() WHERE id = p_order_id;

    RETURN json_build_object('success', true, 'bill_id', v_bill_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
