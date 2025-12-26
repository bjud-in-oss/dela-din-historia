
import { DriveFile, FileType, MemoryBook } from '../types';

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
    modifiedTime: f.modifiedTime, // Return RAW ISO string for consistency
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

// Find existing file to avoid duplicates - UPDATED for robust searching
const findFileInFolder = async (accessToken: string, folderId: string, filename: string): Promise<string | null> => {
    try {
        const query = `name = '${filename}' and '${folderId}' in parents and trashed = false`;
        
        // Add critical search parameters to ensure visibility across drives/reload
        const params = new URLSearchParams({
            q: query,
            fields: 'files(id)',
            supportsAllDrives: 'true',
            includeItemsFromAllDrives: 'true',
            corpora: 'user' // Default search scope
        });

        const response = await fetch(`${DRIVE_API_URL}/files?${params.toString()}`, {
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

export const uploadToDrive = async (
    accessToken: string, 
    folderId: string, 
    filename: string, 
    blob: Blob,
    mimeType: string = 'application/pdf'
) => {
  // 1. Check if file exists
  const existingFileId = await findFileInFolder(accessToken, folderId, filename);

  const method = existingFileId ? 'PATCH' : 'POST';
  const url = existingFileId 
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=resumable`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`;

  const metadata: any = {
    mimeType: mimeType
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
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': blob.size.toString()
    },
    body: JSON.stringify(metadata)
  });

  const uploadUrl = initResponse.headers.get('Location');
  if (!uploadUrl) {
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

// --- NEW FUNCTIONS FOR PERSISTENCE ---

export const findOrCreateFolder = async (accessToken: string, parentId: string, folderName: string): Promise<string> => {
    const existingId = await findFileInFolder(accessToken, parentId, folderName);
    if (existingId) return existingId;
    return await createFolder(accessToken, parentId, folderName);
};

export const moveFile = async (accessToken: string, fileId: string, newParentId: string) => {
    // 1. Get current parents to remove them
    const fileRes = await fetch(`${DRIVE_API_URL}/files/${fileId}?fields=parents`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!fileRes.ok) throw new Error("Kunde inte hitta filen för flytt.");
    const fileData = await fileRes.json();
    const previousParents = fileData.parents ? fileData.parents.join(',') : '';

    // 2. Update parents
    const params = new URLSearchParams({
        addParents: newParentId,
        removeParents: previousParents
    });

    const updateRes = await fetch(`${DRIVE_API_URL}/files/${fileId}?${params.toString()}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!updateRes.ok) {
        throw new Error("Kunde inte flytta filen.");
    }
};

export const renameFile = async (accessToken: string, fileId: string, newName: string) => {
    const response = await fetch(`${DRIVE_API_URL}/files/${fileId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newName })
    });
    
    if (!response.ok) throw new Error(`Kunde inte byta namn på fil ${fileId}`);
};

// Rename folder and finding/renaming artifacts inside
export const renameBookArtifacts = async (accessToken: string, folderId: string, oldTitle: string, newTitle: string) => {
    // 1. Rename the folder itself
    await renameFile(accessToken, folderId, newTitle);

    // 2. List all files in the folder
    const files = await fetchDriveFiles(accessToken, folderId);

    // 3. Rename any file that contains the old title
    for (const file of files) {
        if (file.name.includes(oldTitle)) {
            const newName = file.name.replace(oldTitle, newTitle);
            try {
                await renameFile(accessToken, file.id, newName);
            } catch (e) {
                console.warn(`Failed to rename artifact ${file.name}`, e);
            }
        }
    }
};

// Fetches the 'project.json' from a book folder to restore state
export const fetchProjectState = async (accessToken: string, folderId: string): Promise<MemoryBook | null> => {
    const fileId = await findFileInFolder(accessToken, folderId, 'project.json');
    if (!fileId) return null;

    try {
        const blob = await fetchFileBlob(accessToken, fileId);
        const text = await blob.text();
        const bookData = JSON.parse(text);
        
        // Ensure driveFolderId is correct (might have moved)
        return { ...bookData, driveFolderId: folderId };
    } catch (e) {
        console.error("Corrupt project file", e);
        return null;
    }
};

// Saves the 'project.json' to the book folder
export const saveProjectState = async (accessToken: string, book: MemoryBook) => {
    if (!book.driveFolderId) return;
    
    // Clean data before saving (remove large buffers or blobs)
    // IMPORTANT: Save 'processedSize' so we don't have to re-calc on load
    const cleanBook = {
        ...book,
        items: book.items.map(item => ({
            ...item,
            processedBuffer: undefined, // Don't save binary cache to JSON
            blobUrl: undefined, // Cannot save blob URLs
            fileObj: undefined // Cannot save JS File objects
        })),
        // Clean chunks to avoid saving heavy buffers but keep structure
        chunks: book.chunks?.map(chunk => ({
            ...chunk,
            items: chunk.items.map(item => ({
                 ...item,
                 processedBuffer: undefined,
                 blobUrl: undefined,
                 fileObj: undefined
            }))
        }))
    };

    const jsonString = JSON.stringify(cleanBook, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    await uploadToDrive(accessToken, book.driveFolderId, 'project.json', blob, 'application/json');
};

// Helper to find a suitable cover image in a folder
const findCoverImageForFolder = async (accessToken: string, folderId: string): Promise<string | undefined> => {
    try {
        // Look for images, excluding processed PDFs if possible (though mimetype filter helps)
        // Limit to 1 result for speed, but sort by modifiedTime desc to get the LATEST image
        const query = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
        const params = new URLSearchParams({
            q: query,
            fields: 'files(thumbnailLink)',
            pageSize: '1',
            orderBy: 'modifiedTime desc', // Get the newest image
            corpora: 'user',
            supportsAllDrives: 'true',
            includeItemsFromAllDrives: 'true'
        });
        
        const res = await fetch(`${DRIVE_API_URL}/files?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await res.json();
        if (data.files && data.files.length > 0) {
            return data.files[0].thumbnailLink;
        }
    } catch (e) {
        return undefined;
    }
    return undefined;
};

// Scan the 'Dela din historia' root for book folders
export const listDriveBookFolders = async (accessToken: string): Promise<MemoryBook[]> => {
    try {
        // 1. Find root - Updated logic in findFileInFolder makes this robust
        const rootId = await findFileInFolder(accessToken, 'root', 'Dela din historia');
        if (!rootId) return [];

        // 2. List folders inside
        const folders = await fetchDriveFiles(accessToken, rootId);
        const folderList = folders.filter(f => f.type === FileType.FOLDER && f.name !== 'Papperskorg');

        // 3. Convert to minimal MemoryBook objects AND fetch covers
        // Using Promise.all to fetch covers in parallel
        const books = await Promise.all(folderList.map(async (f) => {
            const coverThumb = await findCoverImageForFolder(accessToken, f.id);
            
            // Create a fake "item" to hold the thumbnail for the Dashboard to see
            const previewItems = coverThumb ? [{
                id: 'preview-cover',
                name: 'Omslag',
                type: FileType.IMAGE,
                size: 0,
                modifiedTime: '',
                thumbnail: coverThumb
            } as DriveFile] : [];

            return {
                id: f.id, // Use Drive ID as Book ID for robustness
                title: f.name,
                createdAt: f.modifiedTime, 
                items: previewItems, // Populate with preview item so thumbnail shows
                driveFolderId: f.id
            };
        }));

        return books;
    } catch (e) {
        console.error("Failed to list books from Drive", e);
        return [];
    }
};
