import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PineconeStore } from "@langchain/pinecone";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const LANGCHAIN_API_KEY = process.env.LANGCHAIN_API_KEY;
const LANGCHAIN_TRACING_V2 = process.env.LANGCHAIN_TRACING_V2;
const LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT;
const PINECONE_INDEX = process.env.PINECONE_INDEX;

async function uploadDocuments() {
    try {
        // Prep documents to be uploaded to the vector database (Pinecone)
        const loader = new DirectoryLoader(
            join(__dirname, 'docs'),
            {
                ".pdf": (path) => new PDFLoader(path)
            }
        );
        
        const rawDocs = await loader.load();

        // Split documents into smaller chunks
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 100
        });
        
        const documents = await textSplitter.splitDocuments(rawDocs);
        console.log(`Going to add ${documents.length} chunks to Pinecone`);

        // Choose the embedding model and vector store
        const embeddings = new OpenAIEmbeddings({
            modelName: "text-embedding-3-large"
        });

        await PineconeStore.fromDocuments(
            documents,
            embeddings,
            { indexName: PINECONE_INDEX }
        );

        console.log("Loading to vectorstore done");
    } catch (error) {
        console.error("Error uploading documents:", error);
    }
}

// Execute the upload
uploadDocuments(); 