const fs = require("fs").promises;
import * as path from "path";
import { DataFrame, Series, ISeries } from "data-forge";
import Graph from "graphology";
import betweennessCentrality from "graphology-metrics/centrality/betweenness";
import closenessCentrality from "graphology-metrics/centrality/closeness";
import {
  degreeCentrality,
  inDegreeCentrality,
  outDegreeCentrality,
} from "graphology-metrics/centrality/degree";
import eigenvectorCentrality from "graphology-metrics/centrality/eigenvector";
import hits from "graphology-metrics/centrality/hits";
import pagerank from "graphology-metrics/centrality/pagerank";
import { plot } from "nodeplotlib";

const projectId = "judini-python-main";
const folderPath = "..\\..\\test_files\\";
const nodesPath = `./test_files/codebase-index-ts/nodes.json`;
const linksPath = `./test_files/codebase-index-ts/links.json`;

// Function to read JSON files
async function readJsonGraph(filePath: string) {
  console.log("Reading JSON file: ", filePath);
  const data = await fs.readFile(filePath, "utf8");
  return JSON.parse(data);
}

// Function to construct graph from nodes and links
function constructGraphFromJson(nodes: any[], links: any[]): Graph {
  const G = new Graph({
    multi: true,
    allowSelfLoops: true,
    type: "directed",
  });
  nodes.forEach((node) => {
    G.addNode(node.id, node);
  });

  links.forEach((link) => {
    G.addEdge(link.source, link.target, link);
  });

  return G;
}

async function graphToCsv(name: string = "codebase"): Promise<void> {
  const nodes = new DataFrame(await readJsonGraph(nodesPath));
  //console.log("NODES COUNT: ", nodes.count());
  const links = new DataFrame(await readJsonGraph(linksPath));
  const newNodes = new DataFrame({
    columnNames: ["full_name", "type"],
    rows: nodes.toArray().map((node: any) => [node.id, node.type]),
  });

  const newNodesCSV = newNodes.toCSV();
  const linksCSV = links.toCSV();
  await fs.writeFile(`nodes_${name}.csv`, newNodesCSV);
  await fs.writeFile(`links_${name}.csv`, linksCSV);
}

function calculateCentralityMeasures(G: Graph) {
  return {
    degree: normalizeMetrics(degreeCentrality(G)),
    betweenness: normalizeMetrics(betweennessCentrality(G)),
    closeness: normalizeMetrics(closenessCentrality(G)),
    pagerank: normalizeMetrics(pagerank(G)),
    //hits: hits(G),
    eigenvector: normalizeMetrics(
      eigenvectorCentrality(G, { maxIterations: 10000 })
    ),
  };
}

function calculateInOutDegrees(G: Graph) {
  return {
    indegree: inDegreeCentrality(G),
    outdegree: outDegreeCentrality(G),
  };
}

function createDataFrame(
  centralityMeasures: any,
  inOutDegreesDefines: any,
  inOutDegreesCalls: any,
  label: string
): DataFrame {
  const length = Object.keys(centralityMeasures.degree).length;

  const keys = Object.keys(centralityMeasures.degree);
  const data = [];
  for (let i = 0; i < length; i++) {
    const key = keys[i];

    data.push({
      ID: key,
      degree: centralityMeasures.degree[key],
      [`indegree_${label}_defines`]: inOutDegreesDefines.indegree[key],
      [`outdegree_${label}_defines`]: inOutDegreesDefines.outdegree[key],
      [`indegree_${label}_calls`]: inOutDegreesCalls.indegree[key],
      [`outdegree_${label}_calls`]: inOutDegreesCalls.outdegree[key],
      betweenness: centralityMeasures.betweenness[key],
      closeness: centralityMeasures.closeness[key],
      pagerank: centralityMeasures.pagerank[key],
      // Uncomment the following lines if HITS is defined (not right now as it doesnt work with Multigraphs)
      // hubs: centralityMeasures.hits.hubs[key],
      // authorities: centralityMeasures.hits.authorities[key],
      eigenvector: centralityMeasures.eigenvector[key],
    });
  }

  return new DataFrame(data);
}

/// Function to normalize an object's values
function normalizeMetrics(
  metrics: Record<string, number>
): Record<string, number> {
  const values = Object.values(metrics);

  // Find the min and max values
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Function to normalize values
  const normalize = (value: number) => (value - min) / (max - min);

  // Create a new object with normalized values
  return Object.keys(metrics).reduce((acc, key) => {
    acc[key] = normalize(metrics[key]);
    return acc;
  }, {} as Record<string, number>);
}
// Function to safely add a node to a graph
function addNodeIfNotExists(graph: any, node: string, attributes: any) {
  if (!graph.hasNode(node)) {
    graph.addNode(node, attributes);
  }
}

// Function to add an edge to a graph
function addEdge(graph: any, source: string, target: string, attributes: any) {
  graph.addEdge(source, target, attributes);
}

// Function to handle the addition of nodes and edges based on the label
function handleEdge(
  graph: any,
  definesGraph: any,
  callsGraph: any,
  source: string,
  target: string,
  attributes: any,
  G: any
) {
  addNodeIfNotExists(graph, source, G.getNodeAttributes(source));
  addNodeIfNotExists(graph, target, G.getNodeAttributes(target));
  addEdge(graph, source, target, attributes);

  if (attributes.label === "defines") {
    addNodeIfNotExists(definesGraph, source, G.getNodeAttributes(source));
    addNodeIfNotExists(definesGraph, target, G.getNodeAttributes(target));
    addEdge(definesGraph, source, target, attributes);
  } else if (attributes.label === "calls") {
    addNodeIfNotExists(callsGraph, source, G.getNodeAttributes(source));
    addNodeIfNotExists(callsGraph, target, G.getNodeAttributes(target));
    addEdge(callsGraph, source, target, attributes);
  }
}

export async function getImportantNodes(
  criteria: string = "degree",
  top: number = 10
): Promise<{
  mostImportantNodesKeys: string[];
  mostImportantFilesKeys: string[];
}> {
  // Read nodes and links JSON files
  const nodes = await readJsonGraph(nodesPath);
  const links = await readJsonGraph(linksPath);
  //graphToCsv("vicuna");

  const G = constructGraphFromJson(nodes, links);

  // Subgraphs for "defines" and "calls"
  const G_nodes = new Graph({
    multi: true,
    allowSelfLoops: true,
    type: "directed",
  });
  const G_files = new Graph({
    multi: true,
    allowSelfLoops: true,
    type: "directed",
  });
  const G_node_defines = new Graph({
    multi: true,
    allowSelfLoops: true,
    type: "directed",
  });
  const G_node_calls = new Graph({
    multi: true,
    allowSelfLoops: true,
    type: "directed",
  });
  const G_files_defines = new Graph({
    multi: true,
    allowSelfLoops: true,
    type: "directed",
  });
  const G_files_calls = new Graph({
    multi: true,
    allowSelfLoops: true,
    type: "directed",
  });

  // Main forEachEdge loop
  G.forEachEdge(
    (edge: any, attributes: any, source: string, target: string) => {
      if (source.includes(":") && target.includes(":")) {
        handleEdge(
          G_nodes,
          G_node_defines,
          G_node_calls,
          source,
          target,
          attributes,
          G
        );
      } else {
        //console.log("HEREE");
        handleEdge(
          G_files,
          G_files_defines,
          G_files_calls,
          source,
          target,
          attributes,
          G
        );
      }
    }
  );

  /*const numNodes = G_nodes.nodes();
  console.log(`Number of nodes: ${numNodes.length}`);

  // Get the number of edges
  const numEdges = G_nodes.edges();
  console.log(`Number of edges: ${numEdges.length}`);*/
  const centralityMeasuresNodes = calculateCentralityMeasures(G_nodes);

  const centralityMeasuresFiles = calculateCentralityMeasures(G_files);
  //console.log("CMN ", centralityMeasuresNodes);
  // Calculate in-degree and out-degree
  const inOutDegreesNodeDefines = calculateInOutDegrees(G_node_defines);
  const inOutDegreesNodeCalls = calculateInOutDegrees(G_node_calls);
  const inOutDegreesFilesDefines = calculateInOutDegrees(G_files_defines);
  const inOutDegreesFilesCalls = calculateInOutDegrees(G_files_calls);

  // Create dataframes
  const dfNodes = createDataFrame(
    centralityMeasuresNodes,
    inOutDegreesNodeDefines,
    inOutDegreesNodeCalls,
    "nodes"
  );

  const dfFiles = createDataFrame(
    centralityMeasuresFiles,
    inOutDegreesFilesDefines,
    inOutDegreesFilesCalls,
    "files"
  );

  const mostImportantNodesTop = dfNodes
    .orderByDescending((row: any) => row[criteria])
    .take(top);
  const mostImportantFilesTop = dfFiles
    .orderByDescending((row: any) => row[criteria])
    .take(top);

  const mostImportantNodesKeys = mostImportantNodesTop
    .toArray()
    .map((row) => row.ID);
  const mostImportantFilesKeys = mostImportantFilesTop
    .toArray()
    .map((row) => row.ID);

  const mostImportantNodesCSV = mostImportantNodesTop.toCSV();
  const mostImportantFilesCSV = mostImportantFilesTop.toCSV();

  await fs.writeFile(
    `${projectId}-important-nodes-ts.csv`,
    mostImportantNodesCSV
  );
  await fs.writeFile(
    `${projectId}-important-files-ts.csv`,
    mostImportantFilesCSV
  );
  // Metrics to plot
  const metricsNodes = [
    "degree",
    "indegree_nodes_defines",
    "outdegree_nodes_defines",
    "indegree_nodes_calls",
    "degree_nodes_calls",
    "betweenness",
    "closeness",
    "pagerank",
    "hubs",
    "authorities",
    "eigenvector",
    "combined_score",
  ];

  // Metrics to plot for files
  const metricsFiles = [
    "degree",
    "indegree_files_defines",
    "outdegree_files_defines",
    "egree_files_calls",
    "outdegree_files_calls",
    "betweenness",
    "closeness",
    "pagerank",
    "hubs",
    "authorities",
    "eigenvector",
    "combined_score",
  ];
  return { mostImportantNodesKeys, mostImportantFilesKeys };
}
