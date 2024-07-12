import { GraphLink, GraphNode } from "../utils/db";
import { bfsLevels, buildGraphs, documentFolders, documentNodesByLevels } from "./utils";

export async function generateDocumentation(nodes: GraphNode[], links: GraphLink[], repoName: string) {
  const { graph } = buildGraphs(nodes, links)
  const nodesByLevels = bfsLevels(nodes, graph)

  await documentNodesByLevels(nodesByLevels, nodes, graph, repoName)
  const documentedFolders = await documentFolders(nodes, links, repoName)

  return documentedFolders
}