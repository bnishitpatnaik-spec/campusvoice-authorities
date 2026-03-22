export const uploadImage = async (base64: string): Promise<string> => {
  try {
    const formData = new FormData()
    formData.append('file', base64)
    formData.append('upload_preset', 'campusvoice_unsigned')
    formData.append('cloud_name', 'dwuzuzvyn')
    const response = await fetch(
      'https://api.cloudinary.com/v1_1/dwuzuzvyn/image/upload',
      { method: 'POST', body: formData }
    )
    const data = await response.json()
    return data.secure_url || ''
  } catch (error) {
    console.error('Upload error:', error)
    return ''
  }
}
