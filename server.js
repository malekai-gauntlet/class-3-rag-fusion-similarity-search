import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { PineconeStore } from "@langchain/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config();

const app = express();
const port = 3001;
const PINECONE_INDEX = process.env.PINECONE_INDEX;

// Simple in-memory store for conversation history
const conversationHistory = new Map();

// Helper function to get conversation context
function getConversationContext(sessionId) {
    if (!conversationHistory.has(sessionId)) {
        conversationHistory.set(sessionId, []);
    }
    return conversationHistory.get(sessionId);
}

// Helper function to add exchange to history
function addToHistory(sessionId, exchange) {
    const history = getConversationContext(sessionId);
    history.push(exchange);
    // Keep only last 5 exchanges to prevent context from getting too long
    if (history.length > 5) history.shift();
}

app.use(cors());
app.use(express.json());

const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

// Simple time frame parser
function parseTimeFrame(prompt) {
    const timeFrames = {
        'past week': { start: Date.now() - 7 * 24 * 60 * 60 * 1000 },
        'past month': { start: Date.now() - 30 * 24 * 60 * 60 * 1000 },
        'past day': { start: Date.now() - 24 * 60 * 60 * 1000 },
        'today': { start: new Date().setHours(0, 0, 0, 0) }
    };

    for (const [phrase, time] of Object.entries(timeFrames)) {
        if (prompt.toLowerCase().includes(phrase)) {
            return { start: time.start, end: Date.now() };
        }
    }
    return null;
}

// Main query endpoint
app.post('/api/query', async (req, res) => {
    try {
        const { prompt, sessionId = 'default' } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        // Get conversation history
        const history = getConversationContext(sessionId);
        const conversationContext = history.length ? `Previous conversation:\n${history.map(h => 
            `User: ${h.prompt}\nAssistant: ${h.response}`).join('\n')}\n\nCurrent question:` : '';

        // Check if this is a resource query
        const isResourceQuery = /resource|doc|tip|file|link/i.test(prompt);
        const timeFrame = parseTimeFrame(prompt);

        const embeddings = new OpenAIEmbeddings({
            modelName: "text-embedding-3-large"
        });

        const index = pinecone.index(PINECONE_INDEX);
        
        // Build filter based on query type and time frame
        const filter = {
            $and: [
                isResourceQuery ? { type: { $in: ['slack_file', 'twitter_post'] } } : {},
                timeFrame ? {
                    created_at: {
                        $gte: timeFrame.start,
                        $lte: timeFrame.end
                    }
                } : {}
            ]
        };

        const vectorstore = await PineconeStore.fromExistingIndex(embeddings, {
            pineconeIndex: index,
            namespace: "slack-messages",
            filter: filter.$and.length ? filter : undefined
        });

        const retriever = vectorstore.asRetriever({ k: 20 });
        const context = await retriever.invoke(prompt);

        // For resource queries, format response with files/links
        if (isResourceQuery) {
            const resources = context.map(doc => ({
                type: doc.metadata.type,
                name: doc.metadata.type === 'twitter_post' ? 'Twitter Resource' : (doc.metadata.name || 'Resource'),
                url: doc.metadata.url || doc.metadata.tweet_url,
                created_at: doc.metadata.created_at
            }));

            const llm = new ChatOpenAI({
                temperature: 0.7,
                modelName: "gpt-4-turbo-preview"
            });

            const response = await llm.invoke(
                `${conversationContext}
                User: ${prompt}
                
                Here are the available resources: ${JSON.stringify(resources)}
                
                Summarize these resources in one sentence, taking into account any previous context from our conversation.`
            );

            // Store the exchange in history
            addToHistory(sessionId, {
                prompt,
                response: response.content,
                resources
            });

            res.json({
                response: {
                    blocks: [
                        { type: "section", text: { type: "mrkdwn", text: response.content } },
                        ...resources.map(r => ({
                            type: "file",
                            external_id: r.url,
                            source: "remote",
                            title: r.name
                        }))
                    ]
                },
                context: resources
            });
        } 
        // For general queries, just return a simple response
        else {
            const llm = new ChatOpenAI({
                temperature: 0.7,
                modelName: "gpt-4-turbo-preview"
            });

            const fullPrompt = `${conversationContext}\nUser: ${prompt}`;
            const response = await llm.invoke(fullPrompt);

            // Store the exchange in history
            addToHistory(sessionId, {
                prompt,
                response: response.content
            });

            res.json({ 
                response: response.content,
                context: context.map(doc => ({
                    content: doc.metadata.content,
                    created_at: doc.metadata.created_at
                }))
            });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`)); 