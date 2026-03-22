import { v2 as cloudinary } from 'cloudinary'
import { config } from '../config/env'

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
})

export const uploadBase64Image = async (
  base64: string,
  folder: string
): Promise<{ url: string; publicId: string }> => {
  try {
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64
    const mediaType = base64.includes('data:image/png') ? 'image/png' : 'image/jpeg'
    const result = await cloudinary.uploader.upload(
      `data:${mediaType};base64,${base64Data}`,
      { folder, resource_type: 'image', quality: 'auto', fetch_format: 'auto' }
    )
    return { url: result.secure_url, publicId: result.public_id }
  } catch (error: any) {
    console.error('Cloudinary error:', error.message)
    return { url: '', publicId: '' }
  }
}
