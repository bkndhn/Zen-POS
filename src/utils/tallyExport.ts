/**
 * Tally XML Export Utility for ZenPOS
 * Exports sales bills to standard Tally XML format (TallyPrime / Tally.ERP 9 compatible)
 * Includes GST breakdown: Output CGST, Output SGST, Output IGST, Sales Account, and Payment/Party Ledgers.
 */

export interface TallyExportOptions {
  companyName?: string;
  branchName?: string;
  defaultSalesLedger?: string;
  defaultCashLedger?: string;
  defaultBankLedger?: string;
}

function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatTallyDate(dateStr: string | null | undefined): string {
  if (!dateStr) {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return dateStr.replace(/[^0-9]/g, '').slice(0, 8);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function generateTallyXML(bills: any[], options: TallyExportOptions = {}): string {
  const companyName = options.companyName || 'ZenPOS Restaurant';
  const defaultSalesLedger = options.defaultSalesLedger || 'Sales Account';
  const defaultCashLedger = options.defaultCashLedger || 'Cash';
  const defaultBankLedger = options.defaultBankLedger || 'Bank Account';

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<ENVELOPE>\n`;
  xml += `  <HEADER>\n`;
  xml += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
  xml += `  </HEADER>\n`;
  xml += `  <BODY>\n`;
  xml += `    <IMPORTDATA>\n`;
  xml += `      <REQUESTDESC>\n`;
  xml += `        <REPORTNAME>Vouchers</REPORTNAME>\n`;
  xml += `        <STATICVARIABLES>\n`;
  xml += `          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>\n`;
  xml += `        </STATICVARIABLES>\n`;
  xml += `      </REQUESTDESC>\n`;
  xml += `      <REQUESTDATA>\n`;

  bills.forEach((bill) => {
    // Skip deleted bills
    if (bill.is_deleted) return;

    const billNo = bill.bill_no || bill.id;
    const tallyDate = formatTallyDate(bill.date || bill.created_at);
    const totalAmount = Number(bill.total_amount || 0);
    const totalTax = Number(bill.total_tax || 0);

    // Resolve Party / Debit ledger based on payment mode & customer
    let partyLedger = defaultCashLedger;
    const mode = (bill.payment_mode || 'cash').toLowerCase();

    if (bill.customer_gstin && bill.customer_name) {
      partyLedger = bill.customer_name;
    } else if (mode === 'upi' || mode === 'card' || mode === 'online') {
      partyLedger = defaultBankLedger;
    } else if (mode === 'credit' || mode === 'khata') {
      partyLedger = bill.customer_name || 'Sundry Debtors';
    } else {
      partyLedger = defaultCashLedger;
    }

    // Determine GST Breakdown
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let taxable = totalAmount - totalTax;

    let taxSummary = bill.tax_summary;
    if (typeof taxSummary === 'string') {
      try {
        taxSummary = JSON.parse(taxSummary);
      } catch {
        taxSummary = null;
      }
    }

    if (taxSummary) {
      if (taxSummary.totalTaxableValue !== undefined) {
        taxable = Number(taxSummary.totalTaxableValue || 0);
      }
      if (taxSummary.igst || taxSummary.totalIgst) {
        igst = Number(taxSummary.igst || taxSummary.totalIgst || 0);
      } else if (taxSummary.cgst !== undefined || taxSummary.sgst !== undefined) {
        cgst = Number(taxSummary.cgst || 0);
        sgst = Number(taxSummary.sgst || 0);
      } else if (totalTax > 0) {
        cgst = totalTax / 2;
        sgst = totalTax / 2;
      }
    } else if (totalTax > 0) {
      // Default to 50/50 CGST + SGST
      cgst = totalTax / 2;
      sgst = totalTax / 2;
    }

    // Calculate Round Off if any
    const calculatedTotal = taxable + cgst + sgst + igst;
    const roundOff = Math.round((totalAmount - calculatedTotal) * 100) / 100;

    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xml += `          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">\n`;
    xml += `            <DATE>${tallyDate}</DATE>\n`;
    xml += `            <GUID>ZENPOS-${bill.id}</GUID>\n`;
    xml += `            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>\n`;
    xml += `            <VOUCHERNUMBER>${escapeXml(billNo)}</VOUCHERNUMBER>\n`;
    xml += `            <REFERENCE>${escapeXml(billNo)}</REFERENCE>\n`;
    xml += `            <PARTYLEDGERNAME>${escapeXml(partyLedger)}</PARTYLEDGERNAME>\n`;
    xml += `            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>\n`;
    xml += `            <EFFECTIVEDATE>${tallyDate}</EFFECTIVEDATE>\n`;
    xml += `            <ISINVOICE>Yes</ISINVOICE>\n`;

    if (bill.customer_gstin) {
      xml += `            <PARTYGSTIN>${escapeXml(bill.customer_gstin)}</PARTYGSTIN>\n`;
    }

    const narration = `Bill #${billNo} - Mode: ${(bill.payment_mode || 'cash').toUpperCase()}${bill.branch_id ? ` - Branch: ${escapeXml(options.branchName || '')}` : ''}`;
    xml += `            <NARRATION>${escapeXml(narration)}</NARRATION>\n`;

    // 1. Party / Customer / Cash Debit Entry (negative amount indicates debit in Tally XML)
    xml += `            <ALLLEDGERENTRIES.LIST>\n`;
    xml += `              <LEDGERNAME>${escapeXml(partyLedger)}</LEDGERNAME>\n`;
    xml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
    xml += `              <AMOUNT>-${totalAmount.toFixed(2)}</AMOUNT>\n`;
    xml += `            </ALLLEDGERENTRIES.LIST>\n`;

    // 2. Sales Account Credit Entry (positive amount indicates credit in Tally XML)
    xml += `            <ALLLEDGERENTRIES.LIST>\n`;
    xml += `              <LEDGERNAME>${escapeXml(defaultSalesLedger)}</LEDGERNAME>\n`;
    xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
    xml += `              <AMOUNT>${taxable.toFixed(2)}</AMOUNT>\n`;
    xml += `            </ALLLEDGERENTRIES.LIST>\n`;

    // 3. Tax Ledgers (Credit)
    if (cgst > 0) {
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Output CGST</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>${cgst.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    }

    if (sgst > 0) {
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Output SGST</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>${sgst.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    }

    if (igst > 0) {
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Output IGST</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>${igst.toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    }

    // 4. Round Off Ledger if any difference
    if (Math.abs(roundOff) > 0.001) {
      xml += `            <ALLLEDGERENTRIES.LIST>\n`;
      xml += `              <LEDGERNAME>Round Off</LEDGERNAME>\n`;
      xml += `              <ISDEEMEDPOSITIVE>${roundOff > 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>\n`;
      xml += `              <AMOUNT>${Math.abs(roundOff).toFixed(2)}</AMOUNT>\n`;
      xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    }

    xml += `          </VOUCHER>\n`;
    xml += `        </TALLYMESSAGE>\n`;
  });

  xml += `      </REQUESTDATA>\n`;
  xml += `    </IMPORTDATA>\n`;
  xml += `  </BODY>\n`;
  xml += `</ENVELOPE>\n`;

  return xml;
}

export function exportSalesToTallyXML(bills: any[], options: TallyExportOptions = {}): void {
  const xmlContent = generateTallyXML(bills, options);
  const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const dateStr = new Date().toISOString().split('T')[0];
  link.download = `Tally_Sales_Vouchers_${dateStr}.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
