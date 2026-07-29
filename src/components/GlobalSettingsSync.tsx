import React, { useEffect } from 'react';
import { useBranchSettings } from '@/hooks/useBranchSettings';
import { useBranch } from '@/contexts/BranchContext';
import { setStoredFooterMessage } from '@/utils/billFontUtils';

/**
 * GlobalSettingsSync
 * Transparently pulls backend settings on mount/branch change and 
 * pushes them into localStorage to ensure offline-first synchronous 
 * modules (like receipt formatting) always have the latest data.
 */
export const GlobalSettingsSync: React.FC = () => {
  const { data: shopSettings, branchId } = useBranchSettings('shop_settings', 'bill_bottom_text, bill_font_family, bill_font_scale');
  const { operatingBranchId } = useBranch();

  useEffect(() => {
    if (shopSettings) {
      // Sync footer message
      if (shopSettings.bill_bottom_text !== undefined && shopSettings.bill_bottom_text !== null) {
        setStoredFooterMessage(shopSettings.bill_bottom_text, operatingBranchId || undefined);
      }
      
      // Sync font family
      if (shopSettings.bill_font_family) {
        if (operatingBranchId) {
          localStorage.setItem(`hotel_pos_bill_font_family_${operatingBranchId}`, shopSettings.bill_font_family);
        }
        localStorage.setItem('hotel_pos_bill_font_family', shopSettings.bill_font_family);
      }

      // Sync font scale
      if (shopSettings.bill_font_scale !== undefined && shopSettings.bill_font_scale !== null) {
        if (operatingBranchId) {
          localStorage.setItem(`hotel_pos_bill_font_scale_${operatingBranchId}`, String(shopSettings.bill_font_scale));
        }
        localStorage.setItem('hotel_pos_bill_font_scale', String(shopSettings.bill_font_scale));
      }
    }
  }, [shopSettings, operatingBranchId]);

  return null;
};
