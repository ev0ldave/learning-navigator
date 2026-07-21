/**
 * Excel Report Service - Professional XLSX generation with themed styling
 * Uses the application's color scheme for consistent branding
 */
const ExcelJS = require('exceljs');

// Theme colors matching the application's MUI theme
const THEME = {
  primary: { argb: 'FF1976D2' },      // Blue
  primaryDark: { argb: 'FF1565C0' },
  primaryLight: { argb: 'FF42A5F5' },
  secondary: { argb: 'FF9C27B0' },    // Purple
  success: { argb: 'FF2E7D32' },      // Green
  warning: { argb: 'FFED6C02' },      // Orange
  error: { argb: 'FFD32F2F' },        // Red
  white: { argb: 'FFFFFFFF' },
  lightGray: { argb: 'FFF5F5F5' },
  mediumGray: { argb: 'FFE0E0E0' },
  darkGray: { argb: 'FF616161' },
  black: { argb: 'FF212121' }
};

// Style presets
const STYLES = {
  title: {
    font: { bold: true, size: 18, color: THEME.primary },
    alignment: { horizontal: 'left', vertical: 'middle' }
  },
  subtitle: {
    font: { bold: false, size: 11, color: THEME.darkGray },
    alignment: { horizontal: 'left', vertical: 'middle' }
  },
  sectionHeader: {
    font: { bold: true, size: 12, color: THEME.white },
    fill: { type: 'pattern', pattern: 'solid', fgColor: THEME.primary },
    alignment: { horizontal: 'left', vertical: 'middle' },
    border: {
      bottom: { style: 'thin', color: THEME.primaryDark }
    }
  },
  tableHeader: {
    font: { bold: true, size: 10, color: THEME.white },
    fill: { type: 'pattern', pattern: 'solid', fgColor: THEME.primaryDark },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      top: { style: 'thin', color: THEME.mediumGray },
      bottom: { style: 'thin', color: THEME.mediumGray },
      left: { style: 'thin', color: THEME.mediumGray },
      right: { style: 'thin', color: THEME.mediumGray }
    }
  },
  tableCell: {
    font: { size: 10, color: THEME.black },
    alignment: { horizontal: 'left', vertical: 'middle' },
    border: {
      top: { style: 'thin', color: THEME.mediumGray },
      bottom: { style: 'thin', color: THEME.mediumGray },
      left: { style: 'thin', color: THEME.mediumGray },
      right: { style: 'thin', color: THEME.mediumGray }
    }
  },
  tableCellAlt: {
    font: { size: 10, color: THEME.black },
    fill: { type: 'pattern', pattern: 'solid', fgColor: THEME.lightGray },
    alignment: { horizontal: 'left', vertical: 'middle' },
    border: {
      top: { style: 'thin', color: THEME.mediumGray },
      bottom: { style: 'thin', color: THEME.mediumGray },
      left: { style: 'thin', color: THEME.mediumGray },
      right: { style: 'thin', color: THEME.mediumGray }
    }
  },
  metricLabel: {
    font: { bold: true, size: 10, color: THEME.darkGray },
    alignment: { horizontal: 'left', vertical: 'middle' }
  },
  metricValue: {
    font: { bold: true, size: 12, color: THEME.primary },
    alignment: { horizontal: 'right', vertical: 'middle' }
  },
  statusCompleted: {
    font: { size: 10, color: THEME.success },
    alignment: { horizontal: 'center', vertical: 'middle' }
  },
  statusCancelled: {
    font: { size: 10, color: THEME.error },
    alignment: { horizontal: 'center', vertical: 'middle' }
  },
  statusNoShow: {
    font: { size: 10, color: THEME.warning },
    alignment: { horizontal: 'center', vertical: 'middle' }
  },
  statusDefault: {
    font: { size: 10, color: THEME.darkGray },
    alignment: { horizontal: 'center', vertical: 'middle' }
  }
};

/**
 * Format metric key to readable label
 */
const formatLabel = (key) => {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
};

/**
 * Get status style based on status value
 */
const getStatusStyle = (status) => {
  switch (status) {
    case 'completed': return STYLES.statusCompleted;
    case 'cancelled': return STYLES.statusCancelled;
    case 'no_show': return STYLES.statusNoShow;
    default: return STYLES.statusDefault;
  }
};

/**
 * Apply style to a cell
 */
const applyStyle = (cell, style) => {
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = style.fill;
  if (style.alignment) cell.alignment = style.alignment;
  if (style.border) cell.border = style.border;
};

/**
 * Generate professional Excel report
 */
const generateReportExcel = async (report) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Learning Navigator';
  workbook.created = new Date();
  
  // Create main worksheet
  const ws = workbook.addWorksheet('Report', {
    properties: { tabColor: { argb: '1976D2' } },
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
  });
  
  // Set column widths
  ws.columns = [
    { width: 25 }, // A
    { width: 20 }, // B
    { width: 15 }, // C
    { width: 15 }, // D
    { width: 15 }, // E
    { width: 15 }, // F
    { width: 15 }, // G
  ];
  
  let currentRow = 1;
  
  // === HEADER SECTION ===
  // Title
  const titleCell = ws.getCell(`A${currentRow}`);
  titleCell.value = report.title;
  applyStyle(titleCell, STYLES.title);
  ws.mergeCells(`A${currentRow}:G${currentRow}`);
  ws.getRow(currentRow).height = 30;
  currentRow++;
  
  // Report type and date
  const subtitleCell = ws.getCell(`A${currentRow}`);
  const typeLabel = report.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  subtitleCell.value = `${typeLabel} • Generated ${new Date(report.createdAt).toLocaleDateString()}`;
  applyStyle(subtitleCell, STYLES.subtitle);
  ws.mergeCells(`A${currentRow}:G${currentRow}`);
  currentRow++;
  
  // Period
  const periodCell = ws.getCell(`A${currentRow}`);
  const startDate = new Date(report.scope.startDate).toLocaleDateString();
  const endDate = new Date(report.scope.endDate).toLocaleDateString();
  periodCell.value = `Period: ${startDate} — ${endDate}`;
  applyStyle(periodCell, STYLES.subtitle);
  ws.mergeCells(`A${currentRow}:G${currentRow}`);
  currentRow += 2;
  
  // === SUMMARY SECTION ===
  if (report.data?.summary && Object.keys(report.data.summary).length > 0) {
    // Section header
    const summaryHeader = ws.getCell(`A${currentRow}`);
    summaryHeader.value = 'Summary';
    applyStyle(summaryHeader, STYLES.sectionHeader);
    ws.mergeCells(`A${currentRow}:G${currentRow}`);
    ws.getRow(currentRow).height = 24;
    currentRow++;
    
    // Metrics in grid layout (2 columns)
    const metricEntries = Object.entries(report.data.summary).filter(
      ([, value]) => typeof value !== 'object'
    );
    
    for (let i = 0; i < metricEntries.length; i += 2) {
      const [key1, value1] = metricEntries[i];
      const label1Cell = ws.getCell(`A${currentRow}`);
      const value1Cell = ws.getCell(`B${currentRow}`);
      label1Cell.value = formatLabel(key1);
      value1Cell.value = key1.includes('Rate') ? `${value1}%` : value1;
      applyStyle(label1Cell, STYLES.metricLabel);
      applyStyle(value1Cell, STYLES.metricValue);
      
      if (i + 1 < metricEntries.length) {
        const [key2, value2] = metricEntries[i + 1];
        const label2Cell = ws.getCell(`D${currentRow}`);
        const value2Cell = ws.getCell(`E${currentRow}`);
        label2Cell.value = formatLabel(key2);
        value2Cell.value = key2.includes('Rate') ? `${value2}%` : value2;
        applyStyle(label2Cell, STYLES.metricLabel);
        applyStyle(value2Cell, STYLES.metricValue);
      }
      currentRow++;
    }
    
    // Handle breakdown arrays in summary
    const breakdownEntries = Object.entries(report.data.summary).filter(
      ([, value]) => Array.isArray(value) && value.length > 0
    );
    
    for (const [key, items] of breakdownEntries) {
      currentRow++;
      const breakdownLabel = ws.getCell(`A${currentRow}`);
      breakdownLabel.value = formatLabel(key);
      applyStyle(breakdownLabel, STYLES.metricLabel);
      currentRow++;
      
      // Table header for breakdown
      ['Category', 'Count', '%'].forEach((header, idx) => {
        const cell = ws.getCell(currentRow, idx + 1);
        cell.value = header;
        applyStyle(cell, STYLES.tableHeader);
      });
      currentRow++;
      
      items.forEach((item, idx) => {
        const style = idx % 2 === 0 ? STYLES.tableCell : STYLES.tableCellAlt;
        const labelCell = ws.getCell(currentRow, 1);
        const countCell = ws.getCell(currentRow, 2);
        const pctCell = ws.getCell(currentRow, 3);
        
        labelCell.value = item.label || 'N/A';
        countCell.value = item.count || 0;
        pctCell.value = item.percentage ? `${item.percentage}%` : '';
        
        applyStyle(labelCell, style);
        applyStyle(countCell, { ...style, alignment: { horizontal: 'center' } });
        applyStyle(pctCell, { ...style, alignment: { horizontal: 'center' } });
        currentRow++;
      });
    }
    
    currentRow++;
  }
  
  // === GROUPED DATA SECTION ===
  if (report.data?.grouped && report.data.grouped.length > 0) {
    const groupedHeader = ws.getCell(`A${currentRow}`);
    groupedHeader.value = 'Grouped Data';
    applyStyle(groupedHeader, STYLES.sectionHeader);
    ws.mergeCells(`A${currentRow}:G${currentRow}`);
    ws.getRow(currentRow).height = 24;
    currentRow++;
    
    // Get metric keys from first group
    const metricKeys = Object.keys(report.data.grouped[0]?.metrics || {});
    const headers = ['Group', 'Count', ...metricKeys.map(formatLabel)];
    
    // Table headers
    headers.forEach((header, idx) => {
      const cell = ws.getCell(currentRow, idx + 1);
      cell.value = header;
      applyStyle(cell, STYLES.tableHeader);
    });
    currentRow++;
    
    // Table rows
    report.data.grouped.forEach((group, idx) => {
      const style = idx % 2 === 0 ? STYLES.tableCell : STYLES.tableCellAlt;
      
      const labelCell = ws.getCell(currentRow, 1);
      const countCell = ws.getCell(currentRow, 2);
      labelCell.value = group.label;
      countCell.value = group.count;
      applyStyle(labelCell, style);
      applyStyle(countCell, { ...style, alignment: { horizontal: 'center' } });
      
      metricKeys.forEach((key, mIdx) => {
        const cell = ws.getCell(currentRow, mIdx + 3);
        const val = group.metrics[key];
        cell.value = key.includes('Rate') ? `${val}%` : val;
        applyStyle(cell, { ...style, alignment: { horizontal: 'center' } });
      });
      currentRow++;
    });
    
    currentRow++;
  }
  
  // === SESSION DETAILS SECTION ===
  if (report.data?.sessions && report.data.sessions.length > 0) {
    const sessionsHeader = ws.getCell(`A${currentRow}`);
    sessionsHeader.value = `Sessions (${report.data.sessions.length})`;
    applyStyle(sessionsHeader, STYLES.sectionHeader);
    ws.mergeCells(`A${currentRow}:G${currentRow}`);
    ws.getRow(currentRow).height = 24;
    currentRow++;
    
    // Table headers
    const sessionHeaders = ['Date', 'Student', 'Status', 'Duration', 'Location'];
    sessionHeaders.forEach((header, idx) => {
      const cell = ws.getCell(currentRow, idx + 1);
      cell.value = header;
      applyStyle(cell, STYLES.tableHeader);
    });
    currentRow++;
    
    // Session rows
    report.data.sessions.forEach((session, idx) => {
      const baseStyle = idx % 2 === 0 ? STYLES.tableCell : STYLES.tableCellAlt;
      
      const dateCell = ws.getCell(currentRow, 1);
      const studentCell = ws.getCell(currentRow, 2);
      const statusCell = ws.getCell(currentRow, 3);
      const durationCell = ws.getCell(currentRow, 4);
      const locationCell = ws.getCell(currentRow, 5);
      
      dateCell.value = new Date(session.date).toLocaleDateString();
      studentCell.value = session.studentName || 'N/A';
      statusCell.value = (session.status || 'N/A').replace('_', ' ');
      durationCell.value = session.duration ? `${session.duration} min` : 'N/A';
      locationCell.value = (session.location || 'N/A').replace('_', ' ');
      
      applyStyle(dateCell, baseStyle);
      applyStyle(studentCell, baseStyle);
      applyStyle(statusCell, { ...baseStyle, ...getStatusStyle(session.status) });
      applyStyle(durationCell, { ...baseStyle, alignment: { horizontal: 'center' } });
      applyStyle(locationCell, baseStyle);
      
      currentRow++;
    });
  }
  
  // Add footer
  currentRow += 2;
  const footerCell = ws.getCell(`A${currentRow}`);
  footerCell.value = `Generated by Learning Navigator • ${new Date().toLocaleString()}`;
  footerCell.font = { size: 8, color: THEME.darkGray, italic: true };
  ws.mergeCells(`A${currentRow}:G${currentRow}`);
  
  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

module.exports = {
  generateReportExcel,
  THEME,
  STYLES
};
