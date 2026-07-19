import { db } from './src/firebase';
import { getDocs, collection, deleteDoc } from 'firebase/firestore';

async function run() {
    const docs = await getDocs(collection(db, 'locators'));
    for (const doc of docs.docs) {
        await deleteDoc(doc.ref);
    }
    console.log("Deleted", docs.size);
}

run();
