// Measure rendered ink, including vector figures and images, rather than text alone.
function inkBounds({ data, width, height }, padding = 8) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 16 && Math.min(data[i], data[i + 1], data[i + 2]) < 245) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) return { x: 0, y: 0, width: 1, height: 1 };
  left = Math.max(0, left - padding); top = Math.max(0, top - padding);
  return { x: left, y: top, width: Math.min(width, right + padding + 1) - left,
    height: Math.min(height, bottom + padding + 1) - top };
}

function contentScale(bounds, availableWidth, zoom = 1) {
  // A 10pt document font appears at approximately 16 CSS pixels at 100%.
  return Math.min(1.6 * zoom, Math.max(1, availableWidth) / bounds.width);
}

// Remove white paper and its antialiased edges, retaining colored ink.
function transparentPaper(image) {
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const white = Math.min(data[i], data[i + 1], data[i + 2]);
    const opacity = 255 - white;
    if (!opacity) { data[i + 3] = 0; continue; }
    for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.round((data[i + channel] - white) * 255 / opacity);
    data[i + 3] = Math.round(data[i + 3] * opacity / 255);
  }
  return image;
}
module.exports = { inkBounds, contentScale, transparentPaper };
