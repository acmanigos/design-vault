export async function extractPalette(imageUrl: string, count = 6): Promise<string[]> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 96;
      const scale = Math.min(size / image.width, size / image.height, 1);
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve([]);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const buckets = new Map<string, { r: number; g: number; b: number; hits: number }>();

      for (let i = 0; i < data.length; i += 16) {
        const alpha = data[i + 3];
        if (alpha < 180) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const qr = Math.round(r / 32) * 32;
        const qg = Math.round(g / 32) * 32;
        const qb = Math.round(b / 32) * 32;
        const key = `${qr},${qg},${qb}`;
        const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, hits: 0 };
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.hits += 1;
        buckets.set(key, bucket);
      }

      const colors = [...buckets.values()]
        .sort((a, b) => b.hits - a.hits)
        .filter((bucket, index, all) => {
          const r = bucket.r / bucket.hits;
          const g = bucket.g / bucket.hits;
          const b = bucket.b / bucket.hits;
          return all.slice(0, index).every((other) => {
            const or = other.r / other.hits;
            const og = other.g / other.hits;
            const ob = other.b / other.hits;
            return Math.hypot(r - or, g - og, b - ob) > 58;
          });
        })
        .slice(0, count)
        .map((bucket) => {
          const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
          return `#${toHex(bucket.r / bucket.hits)}${toHex(bucket.g / bucket.hits)}${toHex(bucket.b / bucket.hits)}`.toUpperCase();
        });

      resolve(colors);
    };
    image.onerror = () => resolve([]);
    image.src = imageUrl;
  });
}

