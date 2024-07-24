import { GraphFolder, GraphLink, GraphNode } from "../utils/db";
import { bfsLevels, buildGraphs, documentFolders, documentNodesByLevels } from "./utils";
import { sql } from "../utils/db";
import { insertNodesEmbeddings, insertGraphFolderEmbeddings  } from '../utils/rag'

export async function generateDocumentation(nodes: GraphNode[], links: GraphLink[],
                                            repoName: string, model: string = 'gpt-4o-mini') {
  const { graph } = buildGraphs(nodes, links)
  const nodesByLevels = bfsLevels(nodes, graph)

  await documentNodesByLevels(nodesByLevels, nodes, graph, repoName, model)
  const documentedFolders = await documentFolders(nodes, repoName, 'gpt-4o')

  return documentedFolders
}

export async function generateAndUpdateDocumentation(
  repoName: string,
  repoId: string,
  graphNodes: GraphNode[],
  graphLinks: GraphLink[],
  model: string = 'gpt-4o-mini') {

  const documentedFolders = await generateDocumentation(graphNodes, graphLinks, repoName, model)
  const insertFolderPromises = Object.entries(documentedFolders).map(([name, wiki]) => {
      // update
      return sql`
        UPDATE graph_folders
        SET wiki = ${wiki}
        WHERE name = ${name}
        RETURNING id
      `
  })

  const folderRows = await Promise.all(insertFolderPromises)
  const folderIds = folderRows.map(row => row[0].id)

  const updateNodeDocsPromises = graphNodes.map(node => {
    if (node.generatedDocumentation) {
      return sql`
        UPDATE nodes
        SET generated_documentation = ${node.generatedDocumentation}
        WHERE id = ${node.id}
      `
    }
  })

  await Promise.all(updateNodeDocsPromises)

  const graphFoldersToInsert: GraphFolder[] = Object.entries(documentedFolders).map(([name, wiki], index) => {
    return {
      id: folderIds[index],
      name: name,
      wiki: wiki,
    }
  })

  console.log('Inserting embeddings ..')
  // Delete old embeddings
  await sql`
        DELETE FROM vecs.chunks_graph
        WHERE repo_id = ${repoId}
    `;
  await Promise.all([
                    insertNodesEmbeddings(graphNodes, repoId),
                    // insertGraphFolderEmbeddings(graphFoldersToInsert, repoId)
                  ])

  await sql`UPDATE repositories SET has_autowiki = true WHERE id = ${repoId}`
}