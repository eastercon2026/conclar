import configData from "../config.json";

function formatUtcDate(zonedDateTime) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = String(zonedDateTime.year).padStart(4, '0');
  const m = pad(zonedDateTime.month);
  const d = pad(zonedDateTime.day);
  const h = pad(zonedDateTime.hour);
  const min = pad(zonedDateTime.minute);
  const s = pad(zonedDateTime.second);
  return y + m + d + 'T' + h + min + s + 'Z';
}

function escapeIcalText(text) {
  if (!text) {
    return '';
  }
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n');
}

function stripHtml(html) {
  if (!html) {
    return '';
  }
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

function foldLine(line) {
  const lines = [];
  const maxLen = 75;
  if (line.length <= maxLen) {
    return line;
  }
  lines.push(line.substring(0, maxLen));
  let rest = line.substring(maxLen);
  while (rest.length > 0) {
    lines.push(' ' + rest.substring(0, maxLen - 1));
    rest = rest.substring(maxLen - 1);
  }
  return lines.join('\r\n');
}

export function buildIcal(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//' + configData.APP_ID + '//NONSGML//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const ev of events) {
    const location = (ev.loc && ev.loc[0]) || '';
    const description = stripHtml(ev.desc);

    lines.push('BEGIN:VEVENT');
    lines.push(foldLine('DTSTART:' + formatUtcDate(ev.startDateAndTime)));
    lines.push(foldLine('DTEND:' + formatUtcDate(ev.endDateAndTime)));
    lines.push(foldLine('SUMMARY:' + escapeIcalText(ev.title)));
    if (location) {
      lines.push(foldLine('LOCATION:' + escapeIcalText(location)));
    }
    if (description) {
      lines.push(foldLine('DESCRIPTION:' + escapeIcalText(description)));
    }
    lines.push('UID:' + ev.id + '@' + configData.APP_ID);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
