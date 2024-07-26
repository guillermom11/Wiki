import { createEmbeddings } from "./ai";
import { GraphNode, GraphFolder, sql } from "./db";

function splitMarkdownByHeaders(markdown: string, minChars: number = 2000): string[] {
    const lines = markdown.trim().split('\n');
    const chunks: string[] = [];
    let currentChunk: string = '';

    for (const line of lines) {
        const headerMatch = line.match(/^(#{1,6})\s(.+)$/);

        if (headerMatch) {
        // If we find a header, start a new chunk
        if (currentChunk) {
            chunks.push(currentChunk);
        }

        currentChunk = line + '\n';
        } else {
            // If it's not a header, add the line to the current chunk
            if (currentChunk) {
                currentChunk += line + '\n';
            } else {
                // If there's no current chunk, create one for content before any headers
                currentChunk = line + '\n';
            }
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    // Combine chunks that don't meet the minimum character count
    const combinedChunks: string[] = [];
    let tempChunk: string = '';

    for (const chunk of chunks) {
        tempChunk += chunk;
        if (tempChunk.length >= minChars) {
        combinedChunks.push(tempChunk);
        tempChunk = '';
        }
    }

    // Add any remaining content as the last chunk
    if (tempChunk) {
        combinedChunks.push(tempChunk);
    }

    return combinedChunks;
}

export async function insertNodesEmbeddings(nodes: GraphNode[], repoId: string) {
    const nodesWithDoc = nodes.filter(node => node.generatedDocumentation);
    const markdownNodes = nodesWithDoc.filter(node => node.language == 'markdown')
    const otherNodes = nodesWithDoc.filter(node => node.language != 'markdown')
    const markdownPromises: Promise<any>[] = []
    const insertPromises: Promise<any>[] = []

    if (otherNodes.length > 0) {
        const embeddings = await createEmbeddings(otherNodes.map(node => `${node.type} ${node.label}:\n${node.generatedDocumentation as string}`));
        const embeddingsWithMetadata = embeddings.map((embedding, index) => {
            const node = otherNodes[index];
            return {
                embedding: JSON.stringify(embedding),
                metadata : {
                    id: node.id,
                    type: node.type,
                    origin_file: node.originFile,
                    folder_name: node.originFile?.split('/').slice(0, -1).join('/') || '',
                    label: node.label,
                    code_no_body: node.codeNoBody,
                    language: node.language,
                    content: node.generatedDocumentation
                }
            }
        });
        

        const promise = embeddingsWithMetadata.map(({ embedding, metadata }) => {
            return sql`
                INSERT INTO vecs.chunks_graph (embedding, metadata, repo_id)
                VALUES (${embedding}, ${metadata}, ${repoId})
            `;
        })
        insertPromises.push(...promise)
    }
    
    for (const node of markdownNodes) {
        const chunks = splitMarkdownByHeaders(node.generatedDocumentation as string);
        const mdEmbeddings = await createEmbeddings(chunks);
        const mdEmbeddingsWithMetadata = mdEmbeddings.map((embedding, index) => {
            return {
                embedding: JSON.stringify(embedding),
                metadata : {
                    id: node.id,
                    type: node.type,
                    origin_file: node.originFile,
                    folder_name: node.originFile?.split('/').slice(0, -1).join('/') || '',
                    chunk_index: index,
                    content: chunks[index],
                    label: node.label,
                    code_no_body: '',
                    language: 'markdown',
                }
            }
            
        })
        const mdInsertPromises = mdEmbeddingsWithMetadata.map(({ embedding, metadata }) => {
            return sql`
                INSERT INTO vecs.chunks_graph (embedding, metadata, repo_id)
                VALUES (${embedding}, ${metadata}, ${repoId})
            `;
        })
        markdownPromises.push(...mdInsertPromises)
    }

    await Promise.all([...insertPromises, ...markdownPromises])
}

export async function insertGraphFolderEmbeddings(folders: GraphFolder[], repoId: string) {
    const foldersWithDoc = folders.filter(folder => folder.wiki);
    const markdownPromises: Promise<any>[] = []
    
    for (const folder of foldersWithDoc) {
        const chunks = splitMarkdownByHeaders(folder.wiki);
        const mdEmbeddings = await createEmbeddings(chunks);
        const mdEmbeddingsWithMetadata = mdEmbeddings.map((embedding, index) => {
            return {
                embedding: JSON.stringify(embedding),
                metadata : {
                    id: folder.id,
                    type: 'folder',
                    origin_file: '',
                    folder_name: folder.name,
                    chunk_index: index,
                    content: chunks[index]
                }
            }
            
        })
        const mdInsertPromises = mdEmbeddingsWithMetadata.map(({ embedding, metadata }) => {
            return sql`
                INSERT INTO vecs.chunks_graph (embedding, metadata, repo_id)
                VALUES (${embedding}, ${metadata}, ${repoId})
            `;
        })
        markdownPromises.push(...mdInsertPromises)
    }

    await Promise.all(markdownPromises)
}