// Returns the image as a data URL, so the database stores pixels and never a Cloudinary URL. See ADR 0006.
export async function fetchGateBackdropImage(src: string): Promise<string> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load the gate backdrop (${response.status})`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read the gate backdrop'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the gate backdrop'));
    reader.readAsDataURL(blob);
  });
}
