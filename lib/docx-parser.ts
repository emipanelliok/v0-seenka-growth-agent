/**
 * Extract text from DOCX files
 * DOCX files are ZIP archives containing XML files
 */

export async function extractTextFromDocx(file: File): Promise<string> {
  // Import JSZip dynamically
  const JSZip = (await import('jszip')).default
  
  const zip = new JSZip()
  const contents = await zip.loadAsync(file)
  
  // The main document text is in word/document.xml
  const docXml = contents.file('word/document.xml')
  if (!docXml) {
    throw new Error('No se encontró document.xml en el archivo DOCX')
  }
  
  const xmlContent = await docXml.async('string')
  
  // Parse XML and extract text from <w:t> elements
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlContent, 'application/xml')
  
  if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Error al parsear el XML del DOCX')
  }
  
  // Get all text elements
  const textElements = xmlDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't')
  
  let text = ''
  for (let i = 0; i < textElements.length; i++) {
    text += textElements[i].textContent || ''
  }
  
  return text || ''
}
