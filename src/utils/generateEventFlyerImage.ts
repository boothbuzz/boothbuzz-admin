type FlyerContent = {
  title?: string;
  subtitle?: string;
  date?: string;
  time?: string;
  venue?: string;
  organizer?: string;
  stalls?: string;
  sponsors?: string;
  cta?: string;
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 4,
) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  let lineCount = 0;
  let cursorY = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line ? `${line} ${words[n]}` : words[n];
    const { width } = ctx.measureText(testLine);
    if (width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = words[n];
      cursorY += lineHeight;
      lineCount += 1;
      if (lineCount >= maxLines - 1) {
        // remaining on last line with ellipsis if needed
        let rest = words.slice(n).join(' ');
        while (rest && ctx.measureText(`${rest}…`).width > maxWidth) {
          rest = rest.slice(0, -1);
        }
        ctx.fillText(rest ? `${rest}…` : '…', x, cursorY);
        return cursorY + lineHeight;
      }
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }
  return cursorY;
}

/** Client-side Instagram-style flyer (1024x1024 PNG data URL). */
export function generateEventFlyerImage(content: FlyerContent): string {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported in this browser.');

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(0.45, '#1e3a5f');
  bg.addColorStop(1, '#0ea5e9');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Soft accent circle
  ctx.beginPath();
  ctx.arc(820, 180, 220, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();

  // Card panel
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, 64, 64, size - 128, size - 128, 28);
  ctx.fill();

  let y = 140;
  const left = 100;
  const maxW = size - 200;

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px Georgia, "Times New Roman", serif';
  y = wrapText(ctx, content.title || 'Event', left, y, maxW, 72, 3);

  if (content.subtitle) {
    y += 12;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '28px system-ui, sans-serif';
    y = wrapText(ctx, content.subtitle, left, y, maxW, 36, 3);
  }

  y += 36;
  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 30px system-ui, sans-serif';
  const when = [content.date, content.time].filter(Boolean).join(' · ');
  if (when) {
    ctx.fillText(when, left, y);
    y += 48;
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = '26px system-ui, sans-serif';
  if (content.venue) {
    y = wrapText(ctx, content.venue, left, y, maxW, 34, 2);
    y += 8;
  }
  if (content.organizer) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    y = wrapText(ctx, content.organizer, left, y, maxW, 32, 2);
    y += 8;
  }
  if (content.stalls) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    y = wrapText(ctx, content.stalls, left, y, maxW, 32, 2);
    y += 8;
  }
  if (content.sponsors) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    y = wrapText(ctx, content.sponsors, left, y, maxW, 30, 3);
  }

  // CTA pill
  const cta = content.cta || 'Book your stall now';
  ctx.font = 'bold 28px system-ui, sans-serif';
  const ctaWidth = Math.min(maxW, ctx.measureText(cta).width + 64);
  const ctaX = left;
  const ctaY = size - 160;
  ctx.fillStyle = '#f59e0b';
  roundRect(ctx, ctaX, ctaY, ctaWidth, 56, 28);
  ctx.fill();
  ctx.fillStyle = '#111827';
  ctx.fillText(cta, ctaX + 32, ctaY + 38);

  return canvas.toDataURL('image/png');
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
