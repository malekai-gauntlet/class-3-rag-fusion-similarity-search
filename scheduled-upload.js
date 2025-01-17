import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from '@pinecone-database/pinecone';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

async function getLastUpdateTime() {
    const { data, error } = await supabase
        .from('vector_db_updates')
        .select('last_update_time')
        .order('last_update_time', { ascending: false })
        .limit(1);

    if (error) throw error;
    return data?.[0]?.last_update_time || new Date(0).toISOString(); // Default to epoch if no updates yet
}

async function recordUpdate(messagesProcessed, status = 'success') {
    const { error } = await supabase
        .from('vector_db_updates')
        .insert([
            {
                last_update_time: new Date().toISOString(),
                status,
                messages_processed: messagesProcessed
            }
        ]);

    if (error) throw error;
}

async function uploadNewMessages() {
    try {
        // Get the last update time
        const lastUpdateTime = await getLastUpdateTime();
        console.log(`Fetching messages since ${lastUpdateTime}`);

        // Get Pinecone index
        const index = pinecone.index(process.env.PINECONE_INDEX);
        
        // Fetch only new messages since last update
        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .gt('created_at', lastUpdateTime)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!messages.length) {
            console.log('No new messages to process');
            return;
        }

        console.log(`Processing ${messages.length} new messages`);

        const embeddings = new OpenAIEmbeddings({
            modelName: "text-embedding-3-large"
        });

        // Process in batches
        const batchSize = 100;
        for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize);
            
            const vectors = await Promise.all(
                batch.map(async (msg) => {
                    // Check if the message contains a Twitter/X URL
                    const twitterPattern = /https?:\/\/(www\.)?(twitter\.com|x\.com)\/\w+\/status\/\d+/;
                    const isTwitterPost = msg.content.match(twitterPattern);
                    
                    const embedding = await embeddings.embedQuery(msg.content);
                    return {
                        id: `msg_${msg.id}`,
                        values: embedding,
                        metadata: {
                            content: msg.content,
                            user_id: msg.user_id || 'unknown',
                            channel_id: msg.channel_id || 'unknown',
                            created_at: msg.created_at || new Date().toISOString(),
                            type: isTwitterPost ? 'twitter_post' : 'slack_message',
                            ...(isTwitterPost && {
                                tweet_url: msg.content.match(twitterPattern)[0],
                                is_twitter_url: true
                            })
                        }
                    };
                })
            );

            // Store in 'slack-messages' namespace
            await index.namespace('slack-messages').upsert(vectors);
            console.log(`Processed batch ${Math.floor(i/batchSize) + 1}`);
        }

        // Record successful update
        await recordUpdate(messages.length);
        console.log(`Successfully processed ${messages.length} messages`);

    } catch (error) {
        console.error('Error uploading messages:', error);
        // Record failed update
        await recordUpdate(0, 'failed');
        throw error;
    }
}

// Execute the upload
uploadNewMessages(); 