import fs from "node:fs/promises";
import { Document, VectorStoreIndex, QdrantVectorStore } from "llamaindex";
import dotenv from "dotenv";
async function main() {
  // Load file
  dotenv.config();
  const path =
    "C:\\Users\\gmasc\\OneDrive\\Documentos\\CodeGPT\\Graphs\\codebase-index-ts\\grapNodes-codebase-index-ts-gpt-35-turbo.json";
  const data = await readJson(path);
  //console.log(data);
  const vectorStore = new QdrantVectorStore({
    url: "http://localhost:8004",
    apiKey: process.env.OPENAI_API_KEY,
  });
  //console.log("HEREEEEE");
  // Create Document object with file
  const docs = [];
  for (let i = 0; i < data.length; i++) {
    docs.push(
      new Document({ text: data[i].generatedDocumentation, id_: data[i].id })
    );
  }
  //const document = new Document({ text: data, id_: path });

  // Split text and create embeddings. Store them in a VectorStoreIndex
  const index = await VectorStoreIndex.fromDocuments(docs, {
    vectorStore,
  });

  // Query the index (own implementation for CODEGPT)
  const queryEngine = index.asQueryEngine();

  //
  const response = await queryEngine.query({
    query: "What does the file db.ts do? Why is it important?",
  });

  // Output response
  console.log(response.toString());
}

main().catch(console.error);

async function readJson(filePath: string) {
  let nodeInfo: any[] = [];

  try {
    const data = await fs.readFile(filePath, "utf8");
    nodeInfo = JSON.parse(data);
    //console.log(nodes);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    process.exit(1);
  }
  return nodeInfo;
}
