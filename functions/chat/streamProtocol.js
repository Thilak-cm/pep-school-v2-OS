export function encodeSseEvent(event, data) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

export function writeSseEvent(res, event, data, telemetry) {
  if (res.writableEnded) return false;
  const encoded = encodeSseEvent(event, data);
  res.write(encoded);
  telemetry?.incrementDimensions?.({
    sseResponseBytes: new TextEncoder().encode(encoded).byteLength,
  });
  return true;
}

export function consumeSseChunk(buffer, chunk) {
  const source = `${buffer || ""}${chunk || ""}`;
  const events = [];
  let remainder = source;
  let boundary = remainder.indexOf("\n\n");

  while (boundary >= 0) {
    const block = remainder.slice(0, boundary);
    remainder = remainder.slice(boundary + 2);
    boundary = remainder.indexOf("\n\n");
    if (!block.trim()) continue;

    let event = "message";
    const dataLines = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    events.push({ event, data: dataLines.join("\n") });
  }

  return { events, remainder };
}
