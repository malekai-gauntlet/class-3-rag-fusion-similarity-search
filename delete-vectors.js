import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';

dotenv.config();

const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

async function deleteAllVectors() {
    try {
        const index = pinecone.index(process.env.PINECONE_INDEX);
        
        // Delete all vectors in the 'slack-messages' namespace
        await index.namespace('slack-messages').deleteAll();
        
        console.log('Successfully deleted all vectors from slack-messages namespace');
    } catch (error) {
        console.error('Error deleting vectors:', error);
    }
}

deleteAllVectors(); 