import { GraphLink, GraphNode } from "../utils/db";
import { bfsLevels, buildGraphs, documentFolders, documentNodesByLevels } from "./utils";

export async function generateDocumentation(nodes: GraphNode[], links: GraphLink[],
                                            repoName: string, model: string = 'gpt-3.5-turbo') {
  const { graph } = buildGraphs(nodes, links)
  const nodesByLevels = bfsLevels(nodes, graph)

  await documentNodesByLevels(nodesByLevels, nodes, graph, repoName, model)
  const documentedFolders = await documentFolders(nodes, links, repoName, 'gpt-4o')

  return documentedFolders
}