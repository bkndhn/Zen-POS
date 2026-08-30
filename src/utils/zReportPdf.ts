import jsPDF from 'jspdf';
import { format } from 'date-fns';

export interface ZReportPdfData {
  branchName: string;
  date: string;
  totalSales: number;
  totalBills: number;
  paymentTotals: Record<string, number>;
  openingCash?: number;
  expectedCash?: number;
  actualCash?: number;
  variance?: number;
  notes?: string;
}

export interface ReconciliationRecord {
  opened_at: string;
  closed_at: string;
  opening_cash: number;
  total_sales: number;
  total_bills: number;
  expected_cash: number;
  actual_cash: number;
  variance: number;
  notes?: string;
}

export const generateZReportPdf = (
  reportData: ZReportPdfData,
  history?: ReconciliationRecord[]
): jsPDF => {
  const doc = new jsPDF('p', 'mm', 'a4');
  let y = 20;
  const leftMargin = 20;

  // Helper for checking page boundaries
  const checkPage = (heightNeeded: number) => {
    if (y + heightNeeded > 280) {
      doc.addPage();
      y = 20;
    }
  };

  // Header
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('ZenPOS', leftMargin, y);
  
  y += 10;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Branch: ${reportData.branchName}`, leftMargin, y);
  
  y += 8;
  doc.setFontSize(10);
  doc.text(`Generated on: ${reportData.date}`, leftMargin, y);

  y += 15;

  // Summary Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Z-Report Summary', leftMargin, y);
  y += 8;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Bills: ${reportData.totalBills}`, leftMargin, y);
  y += 6;
  doc.text(`Total Sales: Rs ${reportData.totalSales.toFixed(2)}`, leftMargin, y);
  
  y += 10;

  // Payment Breakdown
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Breakdown', leftMargin, y);
  y += 6;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  Object.entries(reportData.paymentTotals).forEach(([mode, amount]) => {
    if (amount > 0 || Object.keys(reportData.paymentTotals).length <= 5) {
      doc.text(`${mode.toUpperCase()}:`, leftMargin, y);
      doc.text(`Rs ${amount.toFixed(2)}`, leftMargin + 50, y);
      y += 6;
    }
  });

  y += 5;

  // Shift Section
  if (reportData.openingCash !== undefined) {
    checkPage(40);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Shift Summary', leftMargin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Opening Cash:`, leftMargin, y);
    doc.text(`Rs ${reportData.openingCash.toFixed(2)}`, leftMargin + 50, y);
    y += 6;

    if (reportData.expectedCash !== undefined) {
      doc.text(`Expected Cash:`, leftMargin, y);
      doc.text(`Rs ${reportData.expectedCash.toFixed(2)}`, leftMargin + 50, y);
      y += 6;
    }

    if (reportData.actualCash !== undefined) {
      doc.text(`Actual Cash:`, leftMargin, y);
      doc.text(`Rs ${reportData.actualCash.toFixed(2)}`, leftMargin + 50, y);
      y += 6;
    }

    if (reportData.variance !== undefined) {
      doc.text(`Variance:`, leftMargin, y);
      doc.text(`Rs ${reportData.variance.toFixed(2)}`, leftMargin + 50, y);
      y += 6;
    }
    
    if (reportData.notes) {
      doc.text(`Notes: ${reportData.notes}`, leftMargin, y);
      y += 6;
    }
    y += 5;
  }

  // Reconciliation History Table
  if (history && history.length > 0) {
    checkPage(30);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Reconciliation History (Last 30 Days)', leftMargin, y);
    y += 10;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    
    // Table Headers
    const colWidths = [30, 30, 25, 25, 25, 25, 20];
    const headers = ['Opened', 'Closed', 'Open Cash', 'Sales', 'Exp Cash', 'Act Cash', 'Var'];
    
    let currentX = leftMargin;
    headers.forEach((h, i) => {
      doc.text(h, currentX, y);
      currentX += colWidths[i];
    });
    
    y += 2;
    doc.line(leftMargin, y, 200, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    
    history.forEach((record) => {
      checkPage(15);
      
      const openedStr = format(new Date(record.opened_at), 'dd/MM HH:mm');
      const closedStr = record.closed_at ? format(new Date(record.closed_at), 'dd/MM HH:mm') : '-';
      
      let x = leftMargin;
      doc.text(openedStr, x, y); x += colWidths[0];
      doc.text(closedStr, x, y); x += colWidths[1];
      doc.text(record.opening_cash.toFixed(2), x, y); x += colWidths[2];
      doc.text(record.total_sales.toFixed(2), x, y); x += colWidths[3];
      doc.text(record.expected_cash.toFixed(2), x, y); x += colWidths[4];
      doc.text(record.actual_cash.toFixed(2), x, y); x += colWidths[5];
      doc.text(record.variance.toFixed(2), x, y);
      
      y += 6;
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Generated by ZenPOS', leftMargin, 290);
    doc.text(`Page ${i} of ${pageCount}`, 190, 290, { align: 'right' });
  }

  return doc;
};
