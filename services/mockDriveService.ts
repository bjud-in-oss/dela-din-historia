
import { DriveFile, FileType } from '../types';

const MOCK_FILES: DriveFile[] = [
  { id: '1', name: 'Birth Certificate - Johansson.jpg', type: FileType.IMAGE, size: 2400000, modifiedTime: '2023-10-01', thumbnail: 'https://picsum.photos/seed/birth/200/300' },
  { id: '2', name: 'Marriage Records 1890.pdf', type: FileType.PDF, size: 5600000, modifiedTime: '2023-09-15' },
  { id: '3', name: 'Family Letters.txt', type: FileType.TEXT, size: 15000, modifiedTime: '2023-11-20' },
  { id: '4', name: 'Sweden Trip 1950', type: FileType.FOLDER, size: 0, modifiedTime: '2024-01-05' },
  { id: '5', name: 'Grandpa Farm.jpg', type: FileType.IMAGE, size: 3100000, modifiedTime: '2023-08-12', thumbnail: 'https://picsum.photos/seed/farm/200/300' },
  { id: '6', name: 'Draft Card.jpg', type: FileType.IMAGE, size: 1200000, modifiedTime: '2023-07-12', thumbnail: 'https://picsum.photos/seed/draft/200/300' },
  { id: '7', name: 'Immigration Documents.pdf', type: FileType.PDF, size: 8900000, modifiedTime: '2023-12-01' },
];

export const fetchFiles = async (folderId: string | null = null): Promise<DriveFile[]> => {
  // Simulating network delay
  await new Promise(r => setTimeout(r, 800));
  if (folderId === '4') {
    return [
      { id: '401', name: 'Stockholm Harbor.jpg', type: FileType.IMAGE, size: 4500000, parentId: '4', modifiedTime: '1950-06-01', thumbnail: 'https://picsum.photos/seed/stock/200/300' },
      { id: '402', name: 'Boat Ticket.jpg', type: FileType.IMAGE, size: 2100000, parentId: '4', modifiedTime: '1950-05-28', thumbnail: 'https://picsum.photos/seed/ticket/200/300' },
    ];
  }
  return MOCK_FILES;
};
