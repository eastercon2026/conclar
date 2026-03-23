import { jsPDF } from "jspdf";
import { LocalTime } from "./LocalTime";
import configData from "../config.json";

async function loadFont(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

function getDisplayTags(tags) {
  return (tags || [])
    .filter(function(t) { return !configData.TAGS.DONTLIST.includes(t.category); })
    .map(function(t) { return t.label || t.value; });
}

export async function buildPdf(events, sizes, title) {
  const orientation = sizes.orientation || 'portrait';
  const numColumns = sizes.columns || 1;
  const doc = new jsPDF({ orientation: orientation, unit: 'mm', format: 'a4' });

  // Load and register Inter fonts
  const [regularB64, boldB64, semiBoldB64, italicB64] = await Promise.all([
    loadFont('/fonts/Inter-Regular.ttf'),
    loadFont('/fonts/Inter-Bold.ttf'),
    loadFont('/fonts/Inter-SemiBold.ttf'),
    loadFont('/fonts/Inter-Italic.ttf')
  ]);

  doc.addFileToVFS('Inter-Regular.ttf', regularB64);
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  doc.addFileToVFS('Inter-Bold.ttf', boldB64);
  doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
  doc.addFileToVFS('Inter-SemiBold.ttf', semiBoldB64);
  doc.addFont('Inter-SemiBold.ttf', 'Inter', 'semibold');
  doc.addFileToVFS('Inter-Italic.ttf', italicB64);
  doc.addFont('Inter-Italic.ttf', 'Inter', 'italic');

  // Group events by date
  const byDate = {};
  for (const ev of events) {
    if (!byDate[ev.date]) {
      byDate[ev.date] = [];
    }
    byDate[ev.date].push(ev);
  }
  const dates = Object.keys(byDate).sort();

  // Page dimensions and margins
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 15;
  const marginRight = 15;
  const marginTop = 15;
  const marginBottom = 15;
  const columnGap = numColumns > 1 ? 8 : 0;
  const totalContentWidth = pageWidth - marginLeft - marginRight;
  const colWidth = (totalContentWidth - columnGap * (numColumns - 1)) / numColumns;

  // Font size (pt) to mm conversion ratios
  const textLineHeight = 0.45;
  const detailLineHeight = 0.4;
  const textBaseline = 0.35;

  // Line widths for separators (mm)
  const dayHeaderLineWidth = 0.8;
  const timeHeaderLineWidth = 0.3;
  const eventSeparatorLineWidth = 0.15;

  // Spacing (mm)
  const lineSpacing = 1;
  const gapAfterDayLine = 4;
  const gapAfterTimeLine = 3;
  const eventGap = 2;
  const eventIndentSize = 5;
  const pageNumBottomOffset = 8;
  const separatorGray = 180;
  const titleHeaderHeight = title && sizes.headerSize ? sizes.headerSize * textLineHeight + lineSpacing + eventGap : 0;
  const dayHeaderHeight = sizes.titleSize * textLineHeight + lineSpacing + gapAfterDayLine + dayHeaderLineWidth;

  const col = {
    current: 0,
    left()  { return marginLeft + this.current * (colWidth + columnGap); },
    right() { return this.left() + colWidth; },
    width: colWidth,
    next() {
      if (numColumns > 1 && this.current < numColumns - 1) {
        this.current++;
        return marginTop + titleHeaderHeight + dayHeaderHeight;
      }
      // Need a new page
      doc.addPage();
      this.current = 0;
      return drawDayHeader();
    },
  };
  let y = marginTop;

  function drawDayHeader() {
    // Reserve space for day header (text added in final pass)
    let y = marginTop + titleHeaderHeight;
    y += sizes.titleSize * textLineHeight + lineSpacing;
    doc.setLineWidth(dayHeaderLineWidth);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    return y + gapAfterDayLine;
  }

  let isFirstPage = true;
  const dayPages = [];

  for (const date of dates) {
    const dayEvents = byDate[date];
    const dayLabel = LocalTime.formatDateForLocaleAsUTC(date);

    // Group events by time
    const byTime = {};
    for (const ev of dayEvents) {
      if (!byTime[ev.time]) {
        byTime[ev.time] = [];
      }
      byTime[ev.time].push(ev);
    }
    const times = Object.keys(byTime).sort();

    // Start new page for each day
    if (!isFirstPage) {
      doc.addPage();
    }
    isFirstPage = false;
    col.current = 0;

    const dayStartPage = doc.internal.getNumberOfPages();
    y = drawDayHeader();

    for (const time of times) {
      const timeEvents = byTime[time];

      // Sort events by room for consistent ordering
      timeEvents.sort(function(a, b) {
        const roomA = (a.loc && a.loc[0]) || '';
        const roomB = (b.loc && b.loc[0]) || '';
        return roomA.localeCompare(roomB);
      });

      // Check if there's room for at least the time header + one event
      const timeHeaderHeight = sizes.timeSize * textLineHeight + eventGap + gapAfterTimeLine;
      const minEventHeight = sizes.eventTitleSize * textLineHeight + lineSpacing + sizes.detailSize * detailLineHeight + lineSpacing + eventGap;
      if (y + timeHeaderHeight + minEventHeight > pageHeight - marginBottom) {
        y = col.next();
      }

      // Time header
      doc.setFontSize(sizes.timeSize);
      doc.setFont('Inter', 'bold');
      doc.text(time, col.left(), y + sizes.timeSize * textBaseline);
      y += sizes.timeSize * textLineHeight + eventGap;

      // Draw a thin line under the time
      doc.setLineWidth(timeHeaderLineWidth);
      doc.line(col.left(), y, col.right(), y);
      y += gapAfterTimeLine;

      let eventIndent = col.left() + eventIndentSize;

      for (let i = 0; i < timeEvents.length; i++) {
        const ev = timeEvents[i];
        const room = (ev.loc && ev.loc[0]) || '';
        const duration = configData.DURATION.DURATION_LABEL.replace('@mins', ev.mins);

        // Pre-compute wrapped lines and height
        doc.setFontSize(sizes.eventTitleSize);
        doc.setFont('Inter', 'bold');
        const titleLines = doc.splitTextToSize(ev.title, col.width - eventIndentSize);
        const tags = getDisplayTags(ev.tags);
        let tagLines = [];
        if (tags.length > 0) {
          doc.setFontSize(sizes.detailSize);
          doc.setFont('Inter', 'italic');
          tagLines = doc.splitTextToSize(tags.join(', '), col.width - eventIndentSize);
        }

        const eventHeight =
          titleLines.length * (sizes.eventTitleSize * textLineHeight + lineSpacing) +
          tagLines.length * (sizes.detailSize * detailLineHeight + lineSpacing) +
          sizes.detailSize * detailLineHeight + lineSpacing +
          eventGap;

        if (y + eventHeight > pageHeight - marginBottom) {
          y = col.next();

          // Re-print time header
          doc.setFontSize(sizes.timeSize);
          doc.setFont('Inter', 'bold');
          doc.text(time + ' ' + configData.ALT_FORMATS.TIME_CONTINUED, col.left(), y + sizes.timeSize * textBaseline);
          y += sizes.timeSize * textLineHeight + eventGap;
          doc.setLineWidth(timeHeaderLineWidth);
          doc.line(col.left(), y, col.right(), y);
          y += gapAfterTimeLine;
          eventIndent = col.left() + eventIndentSize;
        }

        // Event title (bold, wrapping)
        doc.setFontSize(sizes.eventTitleSize);
        doc.setFont('Inter', 'bold');
        for (const line of titleLines) {
          doc.text(line, eventIndent, y + sizes.eventTitleSize * textBaseline);
          y += sizes.eventTitleSize * textLineHeight + lineSpacing;
        }

        // Tags line
        if (tagLines.length > 0) {
          doc.setFontSize(sizes.detailSize);
          doc.setFont('Inter', 'italic');
          for (const tl of tagLines) {
            doc.text(tl, eventIndent, y + sizes.detailSize * textBaseline);
            y += sizes.detailSize * detailLineHeight + lineSpacing;
          }
        }

        // Room and duration detail line
        doc.setFontSize(sizes.detailSize);
        if (room) {
          doc.setFont('Inter', 'semibold');
          const roomWidth = doc.getStringUnitWidth(room) * sizes.detailSize / doc.internal.scaleFactor;
          doc.text(room, eventIndent, y + sizes.detailSize * textBaseline);
          doc.setFont('Inter', 'normal');
          doc.text(' ' + duration, eventIndent + roomWidth, y + sizes.detailSize * textBaseline);
        } else {
          doc.setFont('Inter', 'normal');
          doc.text(duration, eventIndent, y + sizes.detailSize * textBaseline);
        }
        y += sizes.detailSize * detailLineHeight + lineSpacing;

        // Small gap between events
        y += eventGap;

        // Light separator between events in same time slot
        if (i < timeEvents.length - 1) {
          doc.setLineWidth(eventSeparatorLineWidth);
          doc.setDrawColor(separatorGray, separatorGray, separatorGray);
          doc.line(eventIndent, y - 1, col.right(), y - 1);
          doc.setDrawColor(0, 0, 0);
        }
      }

      // Extra gap after time block
      y += eventGap;
    }

    dayPages.push({ label: dayLabel, startPage: dayStartPage, endPage: doc.internal.getNumberOfPages() });
  }

  // Add day headers with page counts
  for (const dp of dayPages) {
    const dayTotal = dp.endPage - dp.startPage + 1;
    for (let p = dp.startPage; p <= dp.endPage; p++) {
      doc.setPage(p);
      doc.setFontSize(sizes.titleSize);
      doc.setFont('Inter', 'bold');
      doc.text(dp.label, marginLeft, marginTop + titleHeaderHeight + sizes.titleSize * textBaseline);
      if (dayTotal > 1) {
        const dayPageNum = p - dp.startPage + 1;
        const labelWidth = doc.getStringUnitWidth(dp.label) * sizes.titleSize / doc.internal.scaleFactor;
        doc.setFont('Inter', 'normal');
        doc.text(' (' + dayPageNum + '/' + dayTotal + ')', marginLeft + labelWidth, marginTop + titleHeaderHeight + sizes.titleSize * textBaseline);
      }
    }
  }

  // Add title and page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (title && sizes.headerSize) {
      doc.setFontSize(sizes.headerSize);
      doc.setFont('Inter', 'normal');
      doc.text(title, marginLeft, marginTop + sizes.headerSize * textBaseline);
    } else if (title) {
      doc.setFontSize(sizes.titleSize);
      doc.setFont('Inter', 'bold');
      doc.text(title, pageWidth - marginRight, marginTop + sizes.titleSize * textBaseline, { align: 'right' });
    }
    doc.setFontSize(sizes.pageNumSize);
    doc.setFont('Inter', 'normal');
    const pageStr = 'Page ' + p + ' / ' + totalPages;
    doc.text(pageStr, pageWidth - marginRight, pageHeight - pageNumBottomOffset, { align: 'right' });
  }

  return doc;
}
