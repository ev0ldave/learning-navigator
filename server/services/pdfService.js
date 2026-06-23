const PDFDocument = require('pdfkit');

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
      if (report.data?.summary) {
        doc.moveDown(1.5);
        drawSectionHeader(doc, 'Summary Statistics', primaryColor);
        
        doc.moveDown(0.5);
        const summary = report.data.summary;
        
        // Draw stats in a grid-like layout
        const statsY = doc.y;
        const colWidth = 150;
        
        drawStatBox(doc, 50, statsY, 'Total Sessions', summary.totalSessions || 0, primaryColor);
        drawStatBox(doc, 50 + colWidth, statsY, 'Completed', summary.completedSessions || 0, accentColor);
        drawStatBox(doc, 50 + colWidth * 2, statsY, 'Cancelled', summary.cancelledSessions || 0, '#f44336');
        
        doc.y = statsY + 60;
        
        drawStatBox(doc, 50, doc.y, 'No Shows', summary.noShowSessions || 0, '#ff9800');
        drawStatBox(doc, 50 + colWidth, doc.y, 'Total Minutes', summary.totalDuration || 0, primaryColor);
        drawStatBox(doc, 50 + colWidth * 2, doc.y, 'Avg Duration', `${summary.averageSessionDuration || 0} min`, primaryColor);
        
        doc.y += 70;
      }

      // Progress Metrics
      if (report.data?.progress) {
        doc.moveDown(1);
        drawSectionHeader(doc, 'Progress Metrics', primaryColor);
        
        doc.moveDown(0.5);
        const progress = report.data.progress;
        
        // Attendance Rate with visual bar
        if (progress.attendanceRate !== undefined) {
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

        // Goals
        if (progress.goals && progress.goals.length > 0) {
          doc.moveDown(0.5);
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor(secondaryColor)
             .text('Goals:');
          
          progress.goals.forEach((goal, index) => {
            const statusIcon = goal.status === 'completed' ? '✓' : 
                              goal.status === 'in_progress' ? '→' : '○';
            const statusColor = goal.status === 'completed' ? accentColor : 
                               goal.status === 'in_progress' ? '#ff9800' : '#9e9e9e';
            
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor(statusColor)
               .text(`  ${statusIcon} `, { continued: true })
               .fillColor(secondaryColor)
               .text(`${goal.description || 'Unnamed goal'}`);
            
            if (goal.notes) {
              doc.fontSize(9)
                 .fillColor('#757575')
                 .text(`      ${goal.notes}`);
            }
          });
        }

        // Improvements
        if (progress.improvements && progress.improvements.length > 0) {
          doc.moveDown(0.5);
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor(secondaryColor)
             .text('Areas of Improvement:');
          
          progress.improvements.forEach(improvement => {
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor(accentColor)
               .text('  • ', { continued: true })
               .fillColor(secondaryColor)
               .text(improvement);
          });
        }

        // Areas for Growth
        if (progress.areasForGrowth && progress.areasForGrowth.length > 0) {
          doc.moveDown(0.5);
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor(secondaryColor)
             .text('Areas for Growth:');
          
          progress.areasForGrowth.forEach(area => {
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#ff9800')
               .text('  • ', { continued: true })
               .fillColor(secondaryColor)
               .text(area);
          });
        }
      }

      // Session History
      if (report.data?.sessions && report.data.sessions.length > 0) {
        // Check if we need a new page (need at least 150px for header + a few rows)
        if (doc.y > 550) {
          doc.addPage();
          doc.y = 50;
        }
        
        doc.moveDown(1.5);
        drawSectionHeader(doc, 'Session History', primaryColor);
        
        doc.moveDown(0.5);
        
        const tableLeft = 50;
        const isGroupReport = report.type === 'group_progress';
        
        if (isGroupReport) {
          // Build student name lookup from populated scope.students
          const studentLookup = {};
          if (report.scope?.students) {
            report.scope.students.forEach(s => {
              if (s._id) {
                studentLookup[s._id.toString()] = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unknown';
              }
            });
          }
          
          // Group sessions by student
          const sessionsByStudent = {};
          report.data.sessions.forEach(session => {
            // Try to get student name from session, then from lookup, then default to Unknown
            let studentName = session.studentName;
            if ((!studentName || studentName === 'Unknown') && session.studentId) {
              studentName = studentLookup[session.studentId.toString()];
            }
            if (!studentName) {
              studentName = 'Unknown';
            }
            
            if (!sessionsByStudent[studentName]) {
              sessionsByStudent[studentName] = [];
            }
            sessionsByStudent[studentName].push(session);
          });
          
          let rowY = doc.y;
          
          Object.entries(sessionsByStudent).forEach(([studentName, sessions]) => {
            // Check if we need a new page for this student section
            if (rowY > 600) {
              doc.addPage();
              rowY = 50;
            }
            
            // Student name header
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor(primaryColor)
               .text(studentName, tableLeft, rowY);
            rowY += 20;
            
            // Table header for this student
            doc.rect(tableLeft, rowY, 480, 18)
               .fill(lightGray);
            
            doc.fontSize(9)
               .font('Helvetica-Bold')
               .fillColor(secondaryColor);
            
            doc.text('Date', tableLeft + 5, rowY + 4);
            doc.text('Duration', tableLeft + 120, rowY + 4);
            doc.text('Status', tableLeft + 220, rowY + 4);
            
            rowY += 22;
            
            // Sessions for this student (limit to 10 per student)
            sessions.slice(0, 10).forEach((session, index) => {
              if (rowY > 700) {
                doc.addPage();
                rowY = 50;
              }
              
              if (index % 2 === 0) {
                doc.rect(tableLeft, rowY - 2, 480, 16)
                   .fill('#fafafa');
              }
              
              doc.fontSize(9)
                 .font('Helvetica')
                 .fillColor(secondaryColor);
              
              const sessionDate = session.date ? 
                new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 
                'N/A';
              
              doc.text(sessionDate, tableLeft + 5, rowY);
              doc.text(`${session.duration || 0} min`, tableLeft + 120, rowY);
              
              const statusColor = session.status === 'completed' ? accentColor :
                                 session.status === 'cancelled' ? '#f44336' :
                                 session.status === 'no_show' ? '#ff9800' : primaryColor;
              doc.fillColor(statusColor)
                 .text(session.status || 'N/A', tableLeft + 220, rowY);
              
              rowY += 18;
            });
            
            if (sessions.length > 10) {
              doc.fontSize(8)
                 .fillColor('#757575')
                 .text(`... and ${sessions.length - 10} more sessions`, tableLeft, rowY);
              rowY += 15;
            }
            
            rowY += 15; // Space between students
          });
          
          doc.y = rowY;
        } else {
          // Individual report - original table format
          const colWidths = [100, 100, 80, 150];
          const tableTop = doc.y;
          
          doc.rect(tableLeft, tableTop, 480, 20)
             .fill(lightGray);
          
          doc.fontSize(10)
             .font('Helvetica-Bold')
             .fillColor(secondaryColor);
          
          doc.text('Date', tableLeft + 5, tableTop + 5);
          doc.text('Duration', tableLeft + colWidths[0] + 5, tableTop + 5);
          doc.text('Status', tableLeft + colWidths[0] + colWidths[1] + 5, tableTop + 5);
          doc.text('Notes', tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + 5, tableTop + 5);
          
          let rowY = tableTop + 25;
          
          report.data.sessions.slice(0, 15).forEach((session, index) => {
            if (rowY > 700) {
              doc.addPage();
              rowY = 50;
            }
            
            // Alternate row background
            if (index % 2 === 0) {
              doc.rect(tableLeft, rowY - 3, 480, 18)
                 .fill('#fafafa');
            }
            
            doc.fontSize(9)
               .font('Helvetica')
               .fillColor(secondaryColor);
            
            const sessionDate = session.date ? 
              new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 
              'N/A';
            
            doc.text(sessionDate, tableLeft + 5, rowY);
            doc.text(`${session.duration || 0} min`, tableLeft + colWidths[0] + 5, rowY);
            
            const statusColor = session.status === 'completed' ? accentColor :
                               session.status === 'cancelled' ? '#f44336' :
                               session.status === 'no_show' ? '#ff9800' : primaryColor;
            doc.fillColor(statusColor)
               .text(session.status || 'N/A', tableLeft + colWidths[0] + colWidths[1] + 5, rowY);
            
            doc.fillColor(secondaryColor)
               .text((session.notes || '-').substring(0, 30), tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + 5, rowY);
            
            rowY += 20;
          });
          
          // Sync doc.y with our manual rowY tracking
          doc.y = rowY;
          
          if (report.data.sessions.length > 15) {
            // Only add "more sessions" text if we have room
            if (rowY < 700) {
              doc.fontSize(9)
                 .fillColor('#757575')
                 .text(`... and ${report.data.sessions.length - 15} more sessions`, 50, rowY + 5, { 
                   align: 'center', 
                   width: doc.page.width - 100
                 });
            }
          }
        }
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
     .text(title);
  
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
  doc.rect(x, y, 130, 50)
     .fill('#fafafa');
  
  // Value - save y position since we're using absolute positioning
  const savedY = doc.y;
  doc.fontSize(20)
     .font('Helvetica-Bold')
     .fillColor(color)
     .text(String(value), x, y + 8, { width: 130, align: 'center' });
  
  // Label
  doc.fontSize(9)
     .font('Helvetica')
     .fillColor('#757575')
     .text(label, x, y + 32, { width: 130, align: 'center' });
  
  // Restore y position
  doc.y = savedY;
}

module.exports = {
  generateReportPDF
};
