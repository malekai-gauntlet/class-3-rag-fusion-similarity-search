import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { PineconeStore } from "@langchain/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import * as dotenv from 'dotenv';
import { Pinecone } from "@pinecone-database/pinecone";

// Load environment variables
dotenv.config();

// Environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const LANGCHAIN_API_KEY = process.env.LANGCHAIN_API_KEY;
const LANGCHAIN_TRACING_V2 = process.env.LANGCHAIN_TRACING_V2;
const LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT;
const PINECONE_INDEX = process.env.PINECONE_INDEX;

// Initialize Pinecone client
const pinecone = new Pinecone({
    apiKey: PINECONE_API_KEY,
});

async function queryDocuments() {
    try {
        const prompt = "How has Berkshire Hathaway's investment in Coca-cola grown?";

        // Note: we must use the same embedding model that we used when uploading the docs
        const embeddings = new OpenAIEmbeddings({
            modelName: "text-embedding-3-large"
        });

        // Get index instance
        const index = pinecone.index(PINECONE_INDEX);
        
        // Querying the vector database for relevant docs
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
        context.forEach(doc => {
            console.log(`Source: ${doc.metadata.source}\nContent: ${doc.pageContent}\n\n`);
        });
        console.log("__________________________");

        // Adding context to our prompt
        const template = new PromptTemplate({
            template: "Please provide a brief, concise answer in 2-3 sentences: {query} Context: {context}",
            inputVariables: ["query", "context"]
        });

        const promptWithContext = await template.invoke({
            query: prompt,
            context: context
        });

        // Asking the LLM for a response from our prompt with the provided context
        const llm = new ChatOpenAI({
            temperature: 0.7,
            modelName: "gpt-4o-mini"
        });

        const results = await llm.invoke(promptWithContext);
        console.log(results.content);
    } catch (error) {
        console.error("Error querying documents:", error);
    }
}

// Execute the query
queryDocuments(); 