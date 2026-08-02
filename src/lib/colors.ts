const PALETTE = [
  '#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a', '#0d9488',
  '#0284c7', '#4f46e5', '#7c3aed', '#c026d3', '#db2777', '#78716c',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function colorForOwner(ownerId: string, isMe: boolean): string {
  if (isMe) return '#2563eb';
  return PALETTE[hashStr(ownerId) % PALETTE.length];
}
