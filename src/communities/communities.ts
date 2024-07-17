const fs = require("fs").promises;
import { AllowedTypes } from "../model/consts";
const { Graph } = require("graphology");
const louvain = require("graphology-communities-louvain");
import ForceSupervisor from "graphology-layout-force/worker";
const sigma = require("sigma");
import { v4 as uuid } from "uuid";
const express = require("express");
const path = require("path");

const projectId = "judini-python-main";
const folder_path = `../../test_files/`;
const nodesFilePath: string = `${folder_path}/${projectId}/nodes.json`;
const linksFilePath: string = `${folder_path}/${projectId}/links.json`;
//run this file with: node --import=tsx communities.ts

type wikiNode = {
  id: string;
  alias: string;
  language: string;
  label: string;
  type: AllowedTypes;
  parent?: string; // optional
  totalTokens: number;
  inDegree: number;
  outDegree: number;
  code: string;
  summary?: string; // optional
  importStatements: string[];
  codeNoBody: string;
  originFile: string;
};
type wikiLink = {
  source: string;
  target: string;
  label: string;
};
// Function to read JSON files
async function readJson(filePath: string) {
  const data = await fs.readFile(filePath, "utf8");
  return JSON.parse(data);
}

// Function to construct graph from nodes and links
async function constructGraphFromJson(
  nodesFilePath: string,
  linksFilePath: string
) {
  const nodes: wikiNode[] = await readJson(nodesFilePath);
  const links: wikiLink[] = await readJson(linksFilePath);

  const graph = new Graph({
    multi: true,
    allowSelfLoops: false,
    type: "directed",
  });

  nodes.forEach((node) => {
    graph.addNode(node.id, node);
  });

  links.forEach((link) => {
    graph.addEdge(link.source, link.target, link);
  });

  return graph;
}

(async () => {
  const graph = await constructGraphFromJson(nodesFilePath, linksFilePath);
  //console.log(graph);
  await fs.writeFile("myGraph.json", JSON.stringify(graph, null, 2));

  // Detect communities using Louvain algorithm
  const communities = louvain(graph);
  //console.log("Communities: ", communities);
  await fs.writeFile("communities.json", JSON.stringify(communities, null, 2));

  // Assign community colors
  graph.forEachNode((node: wikiNode, attr: string) => {
    graph.setNodeAttribute(node, "community", communities[node.id]);
  });

  // Create Express app
  const app = express();
  const port = 8002;

  // Serve the graph data
  app.get("/", (req: any, res: any) => {
    res.json(graph.export());
  });

  // Serve the HTML file
  app.use(express.static(path.join(__dirname, "public")));

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
})();
