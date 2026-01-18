export interface ProcessAvatarOptions {
  size?: number; // 出力する正方形の辺長
  quality?: number; // 0-1
}

const DEFAULT_SIZE = 720;
const DEFAULT_QUALITY = 0.86;

// ファイル読込 → EXIF 回転補正 → 中央トリミングで正方形化 → 圧縮して Blob 出力
export const processAvatarImage = (file: File, options: ProcessAvatarOptions = {}) =>
  new Promise<Blob>((resolve, reject) => {
    const size = options.size ?? DEFAULT_SIZE;
    const quality = options.quality ?? DEFAULT_QUALITY;

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('画像を読み込めませんでした'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('画像を処理できませんでした'));
            return;
          }

          // 中央トリミングで正方形化
          const minSide = Math.min(img.naturalWidth, img.naturalHeight);
          const sx = (img.naturalWidth - minSide) / 2;
          const sy = (img.naturalHeight - minSide) / 2;

          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('画像の圧縮に失敗しました'));
            },
            'image/jpeg',
            quality,
          );
        } catch (err) {
          reject(err instanceof Error ? err : new Error('画像処理中にエラーが発生しました'));
        }
      };
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
