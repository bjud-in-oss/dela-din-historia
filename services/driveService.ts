
import { DriveFile, FileType } from '../types';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';

const mapMimeType = (mimeType: string): FileType => {
  if (mimeType === 'application/vnd.google-apps.folder') return FileType.FOLDER;
  if (mimeType === 'application/vnd.google-apps.document') return FileType.GOOGLE_DOC;
  if (mimeType === 'application/pdf') return FileType.PDF;
  if (mimeType.startsWith('image/')) return FileType.IMAGE;
  if (mimeType.startsWith('audio/')) return FileType.AUDIO;
  return FileType.TEXT;
};

export const fetchDriveFiles = async (
  accessToken: string, 
  folderId: string = 'root',
  driveId?: string
): Promise<DriveFile[]> => {
  // Om vi navigerar i en Shared Drive måste queryn anpassas
  // 'root' in parents fungerar inte alltid i shared drives, vi använder ID direkt
  const query = `'${folderId}' in parents and trashed = false`;
  
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id, name, mimeType, size, thumbnailLink, modifiedTime)',
    pageSize: '1000',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });

  if (driveId) {
    params.append('driveId', driveId);
    params.append('corpora', 'drive');
  } else {
    // För "Min enhet" (user)
    params.append('corpora', 'user');
  }

  const response = await fetch(`${DRIVE_API_URL}/files?${params.toString()}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
     const err = await response.json();
     console.error("Drive Error:", err);
     throw new Error('Kunde inte hämta filer från Drive');
  }
  const data = await response.json();
  
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    type: mapMimeType(f.mimeType),
    size: parseInt(f.size || '0'),
    thumbnail: f.thumbnailLink,
    modifiedTime: new Date(f.modifiedTime).toLocaleDateString(),
    parentId: folderId
  })).sort((a: any, b: any) => 
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
};

export const fetchFileBlob = async (accessToken: string, fileId: string, isGoogleDoc: boolean = false): Promise<Blob> => {
  const url = isGoogleDoc 
    ? `${DRIVE_API_URL}/files/${fileId}/export?mimeType=application/pdf`
    : `${DRIVE_API_URL}/files/${fileId}?alt=media`;
    
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`Kunde inte hämta fildata för: ${fileId}`);
  return await response.blob();
};

export const createFolder = async (accessToken: string, parentId: string, name: string): Promise<string> => {
  const response = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId === 'root' ? [] : [parentId]
    })
  });
  const data = await response.json();
  return data.id;
};

// Find existing file to avoid duplicates
const findFileInFolder = async (accessToken: string, folderId: string, filename: string): Promise<string | null> => {
    try {
        const query = `name = '${filename}' and '${folderId}' in parents and trashed = false`;
        const response = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (data.files && data.files.length > 0) {
            return data.files[0].id;
        }
        return null;
    } catch (e) {
        console.error("Error searching for file", e);
        return null;
    }
};

export const uploadToDrive = async (accessToken: string, folderId: string, filename: string, blob: Blob) => {
  // 1. Check if file exists
  const existingFileId = await findFileInFolder(accessToken, folderId, filename);

  const method = existingFileId ? 'PATCH' : 'POST';
  const url = existingFileId 
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=resumable`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`;

  const metadata: any = {
    mimeType: 'application/pdf'
  };
  
  // Only set name and parent on creation, or if we want to rename/move (we don't here)
  if (!existingFileId) {
      metadata.name = filename;
      metadata.parents = [folderId];
  }

  const initResponse = await fetch(url, {
    method: method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/pdf',
      'X-Upload-Content-Length': blob.size.toString()
    },
    body: JSON.stringify(metadata)
  });

  const uploadUrl = initResponse.headers.get('Location');
  if (!uploadUrl) {
      // Sometimes PATCH doesn't return Location if just metadata, but for uploadType=resumable it should.
      // If it fails for existing file, fallback to create new? No, throw error.
      throw new Error('Kunde inte initiera uppladdning till Drive');
  }

  await fetch(uploadUrl, { method: 'PUT', body: blob });
};

export const fetchSharedDrives = async (accessToken: string): Promise<DriveFile[]> => {
  const response = await fetch(`${DRIVE_API_URL}/drives?pageSize=100`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!response.ok) return [];
  const data = await response.json();
  
  // Mappa om Drives till DriveFiles så de ser ut som mappar i UI:t
  return (data.drives || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    type: FileType.FOLDER, // Vi behandlar en Drive som en mapp
    size: 0,
    modifiedTime: '', // Shared drives har inte modifiedTime på samma sätt
    thumbnail: undefined
  }));
};
