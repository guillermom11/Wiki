import { createEmbeddings } from "./ai";
import { GraphNode, GraphFolder, sql } from "./db";


export async function insertNodesEmbeddings(nodes: GraphNode[], repoId: string) {
    const nodesWithDoc = nodes.filter(node => node.generatedDocumentation);

    const embeddings = await createEmbeddings(nodesWithDoc.map(node => node.generatedDocumentation as string));
    const embeddingsWithMetadata = embeddings.map((embedding, index) => {
        const node = nodesWithDoc[index];
        return {
            embedding: JSON.stringify(embedding),
            metadata : {
                id: node.id,
                type: node.type,
                origin_file: node.originFile,
                folder_name: node.originFile?.split('/').slice(0, -1).join('/') || ''
            }
        }
    });

    const insertPromises = embeddingsWithMetadata.map(({ embedding, metadata }) => {
        return sql`
            INSERT INTO vecs.chunks_graph (embedding, metadata, repo_id)
            VALUES (${embedding}, ${metadata}, ${repoId})
        `;
    })

    await Promise.all(insertPromises);
    return
}

export async function insertGraphFolderEmbeddings(folders: GraphFolder[], repoId: string) {
    const foldersWithDoc = folders.filter(folder => folder.wiki);

    const embeddings = await createEmbeddings(foldersWithDoc.map(f => f.wiki));
    const embeddingsWithMetadata = embeddings.map((embedding, index) => {
        const folder = foldersWithDoc[index];
        return {
            embedding: JSON.stringify(embedding),
            metadata : {
                id: folder.id,
                type: 'folder',
                origin_file: '',
                folder_name: folder.name  
            }
        }
    });

    const insertPromises = embeddingsWithMetadata.map(({ embedding, metadata }) => {
        return sql`
            INSERT INTO vecs.chunks_graph (embedding, metadata, repo_id)
            VALUES (${embedding}, ${metadata}, ${repoId})
        `;
    })

    await Promise.all(insertPromises);
    return
}