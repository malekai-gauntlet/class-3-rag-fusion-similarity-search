import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PineconeStore } from "@langchain/pinecone";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Pinecone } from "@pinecone-database/pinecone";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX;

// Initialize Pinecone client
const pinecone = new Pinecone({
    apiKey: PINECONE_API_KEY,
});

async function uploadDocuments() {
    try {
        // Get the index
        const index = pinecone.index(PINECONE_INDEX);
        
        const loader = new DirectoryLoader(
            join(__dirname, 'docs'),
            {
                ".pdf": (path) => new PDFLoader(path)
            }
        );
        
        const rawDocs = await loader.load();

        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 100
        });
        
        const documents = await textSplitter.splitDocuments(rawDocs);
        console.log(`Going to add ${documents.length} chunks to Pinecone`);

        const embeddings = new OpenAIEmbeddings({
            modelName: "text-embedding-3-large"
        });

        // Create PineconeStore with the index instance
        const vectorStore = await PineconeStore.fromExistingIndex(
            embeddings,
            {
                pineconeIndex: index,
                namespace: "default"
            }
        );

        // Add documents
        await vectorStore.addDocuments(documents);

        console.log("Loading to vectorstore done");
    } catch (error) {
        console.error("Error uploading documents:", error);
    }
}

// Execute the upload
uploadDocuments(); 