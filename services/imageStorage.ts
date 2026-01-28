// IndexedDB service for storing large images
const DB_NAME = 'promptgrid_db';
const DB_VERSION = 1;
const IMAGES_STORE = 'images';

interface ImageRecord {
    cellId: string;
    content: string; // base64 data URL
    savedAt: string;
}

let dbInstance: IDBDatabase | null = null;

// Initialize the database
export const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Create images store if it doesn't exist
            if (!db.objectStoreNames.contains(IMAGES_STORE)) {
                db.createObjectStore(IMAGES_STORE, { keyPath: 'cellId' });
            }
        };
    });
};

// Save an image to IndexedDB
export const saveImage = async (cellId: string, content: string): Promise<void> => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(IMAGES_STORE, 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);

        const record: ImageRecord = {
            cellId,
            content,
            savedAt: new Date().toISOString()
        };

        const request = store.put(record);

        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Failed to save image:', request.error);
            reject(request.error);
        };
    });
};

// Get an image from IndexedDB
export const getImage = async (cellId: string): Promise<string | null> => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);
        const request = store.get(cellId);

        request.onsuccess = () => {
            const result = request.result as ImageRecord | undefined;
            resolve(result?.content || null);
        };

        request.onerror = () => {
            console.error('Failed to get image:', request.error);
            reject(request.error);
        };
    });
};

// Get all images from IndexedDB
export const getAllImages = async (): Promise<Map<string, string>> => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
            const records = request.result as ImageRecord[];
            const imageMap = new Map<string, string>();

            records.forEach(record => {
                imageMap.set(record.cellId, record.content);
            });

            resolve(imageMap);
        };

        request.onerror = () => {
            console.error('Failed to get all images:', request.error);
            reject(request.error);
        };
    });
};

// Delete an image from IndexedDB
export const deleteImage = async (cellId: string): Promise<void> => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(IMAGES_STORE, 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);
        const request = store.delete(cellId);

        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Failed to delete image:', request.error);
            reject(request.error);
        };
    });
};

// Clear all images from IndexedDB
export const clearAllImages = async (): Promise<void> => {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(IMAGES_STORE, 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Failed to clear images:', request.error);
            reject(request.error);
        };
    });
};
