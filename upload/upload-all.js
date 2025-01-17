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

async function uploadFiles() {
    try {
        // Get Pinecone index
        const index = pinecone.index(process.env.PINECONE_INDEX);
        
        // List all files from your storage bucket
        const { data: files, error } = await supabase
            .storage
            .from('message-attachments')
            .list();

        if (error) throw error;

        console.log(`Processing ${files.length} files`);

        const embeddings = new OpenAIEmbeddings({
            modelName: "text-embedding-3-large"
        });

        // Process in batches
        const batchSize = 20;  // Smaller batch size for files
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            
            const vectors = await Promise.all(
                batch.map(async (file) => {
                    // Get file URL
                    const { data: { publicUrl } } = supabase
                        .storage
                        .from('message-attachments')
                        .getPublicUrl(file.name);

                    // Get file metadata if you have it stored
                    const { data: metadata } = await supabase
                        .from('files')
                        .select('*')
                        .eq('name', file.name)
                        .single();

                    // Create embedding from file name and metadata
                    const contentToEmbed = `
                        File Name: ${file.name}
                        Type: ${file.metadata?.mimetype || 'unknown'}
                        Size: ${file.metadata?.size || 'unknown'}
                        Description: ${metadata?.description || ''}
                    `.trim();

                    const embedding = await embeddings.embedQuery(contentToEmbed);

                    return {
                        id: `file_${file.name}`,
                        values: embedding,
                        metadata: {
                            name: file.name,
                            url: publicUrl,
                            type: 'slack_file',  // Metatag to identify as file
                            mimetype: file.metadata?.mimetype,
                            size: file.metadata?.size,
                            created_at: file.created_at || new Date().toISOString(),
                            channel_id: metadata?.channel_id || 'unknown',
                            user_id: metadata?.user_id || 'unknown'
                        }
                    };
                })
            );

            // Store in 'slack-messages' namespace (same as messages)
            await index.namespace('slack-messages').upsert(vectors);
            console.log(`Processed batch ${Math.floor(i/batchSize) + 1}`);
        }

        console.log('Successfully uploaded files to Pinecone');
    } catch (error) {
        console.error('Error uploading files:', error);
    }
}

async function uploadMessages() {
    try {
        // Get Pinecone index
        const index = pinecone.index(process.env.PINECONE_INDEX);
        
        // Fetch messages from Supabase
        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000); // Adjust limit as needed

        if (error) throw error;

        console.log(`Processing ${messages.length} messages`);

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
                            type: isTwitterPost ? 'twitter_post' : 'slack_message',  // Dynamically set type based on content
                            // Add Twitter-specific metadata if it's a Twitter post
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

        console.log('Successfully uploaded messages to Pinecone');
    } catch (error) {
        console.error('Error uploading messages:', error);
    }
}

// Main function to run both uploads
async function uploadAll() {
    console.log('Starting upload process...');
    await uploadMessages();
    await uploadFiles();
    console.log('All uploads completed!');
}

uploadAll(); 