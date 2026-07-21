const PDFDocument = require('pdfkit');

/**
 * Format metric key to readable label
 */
const formatLabel = (key) => {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, str => str.toUpperCase())
    .trim();
};

/**
 * Generate a professional PDF report
 * @param {Object} report - The report data from database
 * @returns {Promise<Buffer>} - PDF as buffer
 */
const generateReportPDF = async (report) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'landscape',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        autoFirstPage: false,
        info: {
          Title: report.title,
          Author: 'Learning Navigator',
          Subject: 'Student Progress Report',
          CreationDate: new Date()
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', reject);

      // Colors
      const primaryColor = '#1976d2';
      const secondaryColor = '#424242';
      const accentColor = '#4caf50';
      const lightGray = '#f5f5f5';

      // Add first page manually
      doc.addPage();

      // Header
      doc.rect(0, 0, doc.page.width, 120).fill(primaryColor);
      
      doc.fillColor('white')
         .fontSize(28)
         .font('Helvetica-Bold')
         .text('Learning Navigator', 50, 35);
      
      doc.fontSize(14)
         .font('Helvetica')
         .text('Student Progress Report', 50, 70);

      // Report date
      const reportDate = new Date(report.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      doc.fontSize(10)
         .text(`Generated: ${reportDate}`, 50, 90, { align: 'left' });

      doc.fillColor(secondaryColor);

      // Report Title
      doc.moveDown(4);
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor(secondaryColor)
         .text(report.title, { align: 'center' });

      // Student Information Section
      if (report.scope?.student) {
        doc.moveDown(1.5);
        drawSectionHeader(doc, 'Student Information', primaryColor);
        
        doc.moveDown(0.5);
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor(secondaryColor);
        
        const student = report.scope.student;
        doc.text(`Name: ${student.firstName || ''} ${student.lastName || ''}`, { continued: false });
        doc.text(`Email: ${student.email || 'N/A'}`);
      }

      // Report Period
      doc.moveDown(1);
      drawSectionHeader(doc, 'Report Period', primaryColor);
      
      doc.moveDown(0.5);
      doc.fontSize(11)
         .font('Helvetica')
         .fillColor(secondaryColor);
      
      const startDate = new Date(report.scope.startDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const endDate = new Date(report.scope.endDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      doc.text(`From: ${startDate}  To: ${endDate}`);

      // Summary Statistics
      if (report.data?.summary && Object.keys(report.data.summary).length > 0) {
        doc.moveDown(1.5);
        drawSectionHeader(doc, 'Summary', primaryColor);
        
        doc.moveDown(0.5);
        const summary = report.data.summary;
        
        // Get all non-object metrics for grid layout
        const metricEntries = Object.entries(summary).filter(
          ([, value]) => typeof value !== 'object'
        );
        
        // Draw metrics in a 4-column grid (landscape has more width)
        const colWidth = 165;
        let statsY = doc.y;
        let col = 0;
        
        metricEntries.forEach(([key, value], index) => {
          const label = formatLabel(key);
          const displayValue = key.toLowerCase().includes('rate') ? `${value}%` : String(value);
          const color = key.toLowerCase().includes('completed') ? accentColor :
                       key.toLowerCase().includes('cancelled') ? '#f44336' :
                       key.toLowerCase().includes('noshow') || key.toLowerCase().includes('no_show') ? '#ff9800' :
                       primaryColor;
          
          drawStatBox(doc, 50 + col * colWidth, statsY, label, displayValue, color);
          col++;
          
          if (col >= 4) {
            col = 0;
            statsY += 60;
          }
        });
        
        // Move past the last row
        doc.y = statsY + (col > 0 ? 70 : 10);
        
        // Handle breakdown arrays in summary
        const breakdownEntries = Object.entries(summary).filter(
          ([, value]) => Array.isArray(value) && value.length > 0 && value[0]?.label !== undefined
        );
        
        for (const [key, items] of breakdownEntries) {
          // Check if we need a new page
          if (doc.y > 450) {
            doc.addPage();
            doc.y = 50;
          }
          
          doc.moveDown(0.5);
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor(secondaryColor)
             .text(formatLabel(key));
          
          doc.moveDown(0.3);
          
          // Table header
          const tableLeft = 50;
          const tableWidth = 400;
          doc.rect(tableLeft, doc.y, tableWidth, 18).fill(lightGray);
          
          doc.fontSize(9)
             .font('Helvetica-Bold')
             .fillColor(secondaryColor);
          doc.text('Category', tableLeft + 5, doc.y + 4);
          doc.text('Count', tableLeft + 200, doc.y + 4);
          doc.text('%', tableLeft + 300, doc.y + 4);
          
          let rowY = doc.y + 22;
          
          items.forEach((item, idx) => {
            if (rowY > 520) {
              doc.addPage();
              rowY = 50;
            }
            
            if (idx % 2 === 0) {
              doc.rect(tableLeft, rowY - 2, tableWidth, 16).fill('#fafafa');
            }
            
            doc.fontSize(9)
               .font('Helvetica')
               .fillColor(secondaryColor);
            
            doc.text(item.label || 'N/A', tableLeft + 5, rowY);
            doc.text(String(item.count || 0), tableLeft + 200, rowY);
            doc.text(item.percentage ? `${item.percentage}%` : '', tableLeft + 300, rowY);
            
            rowY += 18;
          });
          
          doc.y = rowY + 10;
        }
      }

      // Progress Metrics (visual attendance bar)
      if (report.data?.progress?.attendanceRate !== undefined) {
        doc.moveDown(1);
        drawSectionHeader(doc, 'Progress Metrics', primaryColor);
        
        doc.moveDown(0.5);
        const progress = report.data.progress;
        
        // Attendance Rate with visual bar
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor(secondaryColor)
           .text('Attendance Rate:', { continued: true })
           .font('Helvetica')
           .text(` ${progress.attendanceRate.toFixed(1)}%`);
        
        // Progress bar
        const barWidth = 200;
        const barHeight = 10;
        const barX = 50;
        const barY = doc.y + 5;
        
        // Background
        doc.rect(barX, barY, barWidth, barHeight)
           .fill('#e0e0e0');
        
        // Fill
        const fillWidth = (progress.attendanceRate / 100) * barWidth;
        const barColor = progress.attendanceRate >= 80 ? accentColor : 
                        progress.attendanceRate >= 60 ? '#ff9800' : '#f44336';
        doc.rect(barX, barY, fillWidth, barHeight)
           .fill(barColor);
        
        doc.y = barY + 25;
      }

      // Grouped Data Section
      if (report.data?.grouped && report.data.grouped.length > 0) {
        if (doc.y > 350) {
          doc.addPage();
          doc.y = 50;
        }
        
        doc.moveDown(1.5);
        drawSectionHeader(doc, 'Grouped Data', primaryColor);
        
        doc.moveDown(0.5);
        
        const tableLeft = 50;
        const grouped = report.data.grouped;
        
        // Get metric keys from first group (filter out objects/arrays)
        const metricKeys = Object.keys(grouped[0]?.metrics || {}).filter(
          key => typeof grouped[0].metrics[key] !== 'object'
        );
        
        // Calculate column widths (landscape gives ~692pt usable width)
        const labelWidth = 160;
        const countWidth = 70;
        const availableForMetrics = 690 - labelWidth - countWidth;
        const metricWidth = Math.max(80, Math.floor(availableForMetrics / Math.max(metricKeys.length, 1)));
        const totalWidth = labelWidth + countWidth + (metricKeys.length * metricWidth);
        
        // Table header
        const tableTop = doc.y;
        doc.rect(tableLeft, tableTop, totalWidth, 18).fill(lightGray);
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor(secondaryColor);
        
        let headerX = tableLeft + 5;
        doc.text('Group', headerX, tableTop + 4, { lineBreak: false, width: labelWidth - 10 });
        headerX += labelWidth;
        doc.text('Count', headerX, tableTop + 4, { lineBreak: false, width: countWidth - 10 });
        headerX += countWidth;
        
        metricKeys.forEach(key => {
          doc.text(formatLabel(key), headerX, tableTop + 4, { lineBreak: false, width: metricWidth - 10 });
          headerX += metricWidth;
        });
        
        let rowY = tableTop + 22;
        
        grouped.forEach((group, idx) => {
          if (rowY > 520) {
            doc.addPage();
            rowY = 50;
          }
          
          if (idx % 2 === 0) {
            doc.rect(tableLeft, rowY - 2, totalWidth, 16).fill('#fafafa');
          }
          
          doc.fontSize(9)
             .font('Helvetica')
             .fillColor(secondaryColor);
          
          let cellX = tableLeft + 5;
          doc.text(String(group.label || ''), cellX, rowY, { lineBreak: false, width: labelWidth - 10 });
          cellX += labelWidth;
          doc.text(String(group.count || 0), cellX, rowY, { lineBreak: false, width: countWidth - 10 });
          cellX += countWidth;
          
          metricKeys.forEach(key => {
            const val = group.metrics[key];
            const displayVal = key.toLowerCase().includes('rate') ? `${val}%` : String(val || 0);
            doc.text(displayVal, cellX, rowY, { lineBreak: false, width: metricWidth - 10 });
            cellX += metricWidth;
          });
          
          rowY += 18;
        });
        
        doc.y = rowY + 10;
      }

      // Session Details (matching Excel format: Date, Student, Status, Duration, Location)
      if (report.data?.sessions && report.data.sessions.length > 0) {
        // Check if we need a new page (need at least 150px for header + a few rows)
        if (doc.y > 400) {
          doc.addPage();
          doc.y = 50;
        }
        
        doc.moveDown(1.5);
        drawSectionHeader(doc, `Sessions (${report.data.sessions.length})`, primaryColor);
        
        doc.moveDown(0.5);
        
        const tableLeft = 50;
        
        // Build student name lookup for group reports
        const studentLookup = {};
        if (report.scope?.students) {
          report.scope.students.forEach(s => {
            if (s._id) {
              studentLookup[s._id.toString()] = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown';
            }
          });
        }
        if (report.scope?.student) {
          const s = report.scope.student;
          if (s._id) {
            studentLookup[s._id.toString()] = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown';
          }
        }
        
        // Column widths: Date(100), Student(180), Status(100), Duration(90), Location(150) = 620
        const colWidths = [100, 180, 100, 90, 150];
        const tableWidth = colWidths.reduce((a, b) => a + b, 0);
        const tableTop = doc.y;
        
        // Table header
        doc.rect(tableLeft, tableTop, tableWidth, 20).fill(lightGray);
        
        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor(secondaryColor);
        
        const headers = ['Date', 'Student', 'Status', 'Duration', 'Location'];
        let headerX = tableLeft + 5;
        headers.forEach((header, idx) => {
          doc.text(header, headerX, tableTop + 5);
          headerX += colWidths[idx];
        });
        
        let rowY = tableTop + 25;
        
        // Session rows
        report.data.sessions.forEach((session, index) => {
          if (rowY > 520) {
            doc.addPage();
            rowY = 50;
          }
          
          // Alternate row background
          if (index % 2 === 0) {
            doc.rect(tableLeft, rowY - 3, tableWidth, 18).fill('#fafafa');
          }
          
          doc.fontSize(9)
             .font('Helvetica')
             .fillColor(secondaryColor);
          
          // Date
          const sessionDate = session.date ? 
            new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 
            'N/A';
          
          // Student name
          let studentName = session.studentName;
          if ((!studentName || studentName === 'Unknown') && session.studentId) {
            studentName = studentLookup[session.studentId.toString()];
          }
          if (!studentName) studentName = 'N/A';
          
          // Status with color
          const status = (session.status || 'N/A').replace('_', ' ');
          const statusColor = session.status === 'completed' ? accentColor :
                             session.status === 'cancelled' ? '#f44336' :
                             session.status === 'no_show' ? '#ff9800' : primaryColor;
          
          // Duration
          const duration = session.duration ? `${session.duration} min` : 'N/A';
          
          // Location
          const location = (session.location || 'N/A').replace('_', ' ');
          
          // Write cells
          let cellX = tableLeft + 5;
          doc.text(sessionDate, cellX, rowY);
          cellX += colWidths[0];
          doc.text(studentName.substring(0, 25), cellX, rowY);
          cellX += colWidths[1];
          doc.fillColor(statusColor).text(status, cellX, rowY);
          cellX += colWidths[2];
          doc.fillColor(secondaryColor).text(duration, cellX, rowY);
          cellX += colWidths[3];
          doc.text(location.substring(0, 20), cellX, rowY);
          
          rowY += 20;
        });
        
        doc.y = rowY;
      }

      // Get actual page count BEFORE footer operations
      const pages = doc.bufferedPageRange();
      const contentPageCount = pages.count;

      // Footer on each content page
      for (let i = 0; i < contentPageCount; i++) {
        doc.switchToPage(i);
        const footerY = doc.page.height - 40;
        doc.fontSize(8)
           .fillColor('#9e9e9e')
           .text(
             `Learning Navigator | Confidential | Page ${i + 1} of ${contentPageCount}`,
             50,
             footerY,
             { align: 'center', width: doc.page.width - 100 }
           );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Draw a section header with underline
 */
function drawSectionHeader(doc, title, color) {
  doc.fontSize(14)
     .font('Helvetica-Bold')
     .fillColor(color)
     .text(title, 50);
  
  // Underline
  const lineY = doc.y + 2;
  doc.moveTo(50, lineY)
     .lineTo(250, lineY)
     .strokeColor(color)
     .lineWidth(2)
     .stroke();
  
  doc.moveDown(0.3);
}

/**
 * Draw a stat box
 */
function drawStatBox(doc, x, y, label, value, color) {
  // Box
  doc.rect(x, y, 150, 50)
     .fill('#fafafa');
  
  // Value - save y position since we're using absolute positioning
  const savedY = doc.y;
  doc.fontSize(20)
     .font('Helvetica-Bold')
     .fillColor(color)
     .text(String(value), x, y + 8, { width: 150, align: 'center' });
  
  // Label
  doc.fontSize(9)
     .font('Helvetica')
     .fillColor('#757575')
     .text(label, x, y + 32, { width: 150, align: 'center' });
  
  // Restore y position
  doc.y = savedY;
}

module.exports = {
  generateReportPDF
};
