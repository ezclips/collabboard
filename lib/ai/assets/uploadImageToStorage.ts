import { getSupabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'ai-component-assets';

export type UploadedImage = {
  storagePath: string;
  publicUrl: string;
};

export async function uploadImageToStorage(
  buffer: Buffer,
  mimeType: string,
  storagePath: string
): Promise<UploadedImage> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: data.publicUrl,
  };
}
