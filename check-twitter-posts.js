import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';

dotenv.config();

const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

async function checkTwitterPosts() {
    try {
        const index = pinecone.index(process.env.PINECONE_INDEX);
        
        // Query vectors with type 'twitter_post'
        const queryResponse = await index.namespace('slack-messages').query({
            vector: Array(3072).fill(0),  // dummy vector
            topK: 100,
            filter: {
                type: 'twitter_post'
            },
            includeMetadata: true
        });
        
        console.log(`Found ${queryResponse.matches.length} Twitter posts:`);
        queryResponse.matches.forEach(match => {
            console.log('\n-------------------');
            console.log('Content:', match.metadata.content);
            console.log('Tweet URL:', match.metadata.tweet_url);
            console.log('Created at:', match.metadata.created_at);
            console.log('-------------------');
        });
    } catch (error) {
        console.error('Error checking Twitter posts:', error);
    }
}

checkTwitterPosts(); 