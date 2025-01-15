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

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Pinecone client
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

// Query endpoint
app.post('/api/query', async (req, res) => {
    console.log('Received query:', req.body.prompt);
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const embeddings = new OpenAIEmbeddings({
            modelName: "text-embedding-3-large"
        });

        const index = pinecone.index(PINECONE_INDEX);
        
        const documentVectorstore = await PineconeStore.fromExistingIndex(
            embeddings,
            {
                pineconeIndex: index,
                namespace: "default"
            }
        );

        const retriever = documentVectorstore.asRetriever();
        const context = await retriever.invoke(prompt);

        // Print retrieved documents
        console.log("\n=== Retrieved Documents ===");
        context.forEach(doc => {
            console.log(`Source: ${doc.metadata.source}\nContent: ${doc.pageContent}\n\n`);
        });
        console.log("__________________________");

        // Format and stringify the context
        const contextText = JSON.stringify(
            context.map(doc => ({
                content: doc.pageContent,
                source: doc.metadata.source
            }))
        );

        // Log the formatted context
        console.log("\n=== Formatted Context ===");
        console.log(contextText);
        console.log("__________________________");

        const template = new PromptTemplate({
            template: "Please provide a brief, concise answer in 2-3 sentences: {query} Context: {context}",
            inputVariables: ["query", "context"]
        });

        const promptWithContext = await template.invoke({
            query: prompt,
            context: contextText  // Use the stringified context
        });

        // Log the final prompt
        console.log("\n=== Final Prompt ===");
        console.log(promptWithContext);
        console.log("__________________________");

        const llm = new ChatOpenAI({
            temperature: 0.7,
            modelName: "gpt-4o-mini"
        });

        const results = await llm.invoke(promptWithContext);
        
        res.json({ 
            response: results.content,
            sources: context.map(doc => ({
                source: doc.metadata.source,
                content: doc.pageContent
            }))
        });

    } catch (error) {
        console.error('Error processing query:', error);
        res.status(500).json({ error: 'Error processing query' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 