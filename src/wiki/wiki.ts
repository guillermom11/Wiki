import { GraphFolder, GraphLink, GraphNode } from "../utils/db";
import { bfsLevels, buildGraphs, documentFolders, documentNodesByLevels } from "./utils";
import { sql } from "../utils/db";

export async function generateDocumentation(nodes: GraphNode[], links: GraphLink[],
                                            repoName: string, model: string = 'gpt-4o-mini') {
  const { graph } = buildGraphs(nodes, links)
  const nodesByLevels = bfsLevels(nodes, graph)

  await documentNodesByLevels(nodesByLevels, nodes, graph, repoName, model)
  const documentedFolders = await documentFolders(nodes, links, repoName, 'gpt-4o')

  return documentedFolders
}

export async function generateAndUpdateDocumentation(
  repoName: string,
  repoId: string,
  graphNodes: GraphNode[],
  graphLinks: GraphLink[],
  graphFolders?: GraphFolder[],
  model: string = 'gpt-4o-mini') {

  const documentedFolders = await generateDocumentation(graphNodes, graphLinks, repoName, model)

  const insertFolderPromises = Object.entries(documentedFolders).map(([name, wiki]) => {

    if (graphFolders?.find(folder => folder.name === name)) {
      // update
      return sql`
        UPDATE graph_folders
        SET wiki = ${wiki}
        WHERE name = ${name}
      `
    } else {
      return sql`
        INSERT INTO graph_folders (
          repo_id,
          name,
          wiki
        ) VALUES (
          ${repoId},
          ${name},
          ${wiki}
        )
      `
    }
  })

  const updateNodeDocsPromises = graphNodes.map(node => {
    if (node.generatedDocumentation) {
      return sql`
        UPDATE nodes
        SET generated_documentation = ${node.generatedDocumentation}
        WHERE id = ${node.id}
      `
    }
  })

  await Promise.all([...insertFolderPromises, ...updateNodeDocsPromises])
}