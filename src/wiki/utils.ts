import { GraphLink, GraphNode } from "../utils/db";

type Graph = { [key: string]: string[] }


export function findFileParentNode(nodes: GraphNode[], node: GraphNode) {
    let parentName = ''
    if (node.originFile) {
        parentName = node.originFile?.split('.').slice(0, -1).join('.');
    } else {
        parentName = node.fullName.includes('::') ? node.fullName.split('::')[0] : ''
    }
    const parent = nodes.find((node) => node.fullName === parentName);
    if (parent && parent.type === "file") {
        return parent;
    } else if (parent && parent.type !== "file") {
        return findFileParentNode(nodes, parent);
    } else {
        console.log("Parent not found :(");
    }
}

export function buildGraphs(nodes: GraphNode[], links: GraphLink[]) {
    //all nodes appear on links?
    const callGraph: Graph = {};
    const defineGraph: Graph = {};
    nodes.forEach((node) => {
      // map each node id to an empty array
      callGraph[node.id] = [];
      defineGraph[node.id] = [];
    });
  
    for (const link of links) {
        if (link.source === link.target) continue;
        
        // each link save the id node
        const sourceNode = nodes.find((node) => node.id === link.source);
        const targetNode = nodes.find((node) => node.id === link.target);
        // only save the links between nodes and not files
        if (sourceNode && targetNode && sourceNode.type !== "file" && targetNode.type !== "file") {
            // save call and define links on the respective graphs
            if (link.label === "calls") {
                callGraph[link.source].push(link.target);
            } else if (link.label === "defines") {
                defineGraph[link.source].push(link.target);
            }
      }
    }
  
    return { callGraph, defineGraph };
}


export function bfsLevels(nodes: GraphNode[], graph: Graph): {[key: number]: string[]} {
    const results: { [key: number]: string[] } = {};
    const levels: { [key: string]: number } = {};
    const inDegree: { [key: string]: number } = {};

    // Initialize in-degree for each node
    for (const node of nodes) {
        if (node.type === 'file') continue;
        inDegree[node.id] = 0;
    }

    // Calculate in-degree for each node
    for (const [source, targets] of Object.entries(graph)) {
        for (const target of targets) {
            inDegree[target] = (inDegree[target] || 0) + 1;
        }
    }

    // Find start nodes (nodes with in-degree 0)
    const queue = nodes.filter(node => inDegree[node.id] === 0 && node.type !== 'file').map(node => node.id);
    
    // Perform topological sort and assign levels
    let currentLevel = 0;
    while (queue.length > 0) {
        const levelSize = queue.length;
        for (let i = 0; i < levelSize; i++) {
            const nodeId = queue.shift()!;
            levels[nodeId] = currentLevel;

            if (!results[currentLevel]) {
                results[currentLevel] = [];
            }

            results[currentLevel].push(nodeId);

            for (const neighbor of graph[nodeId] || []) {
                inDegree[neighbor]--;
                if (inDegree[neighbor] === 0) {
                    queue.push(neighbor);
                }
            }
        }
        currentLevel++;
    }

    // Handle cycles by assigning remaining nodes to the highest level of their dependencies
    for (const node of nodes) {
        if (node.type === 'file') continue;
        if (levels[node.id] === undefined) {
            const dependencyLevels = (graph[node.id] || [])
                .map(dep => levels[dep] || 0)
                .filter(level => level !== undefined);
            const maxDependencyLevel = Math.max(...dependencyLevels, -1);
            levels[node.id] = maxDependencyLevel + 1;

            if (!results[levels[node.id]]) {
                results[levels[node.id]] = [];
            }
            results[levels[node.id]].push(node.id);
        }
    }

    return results;
}


export function generateNodePrompts(node: GraphNode, nodes: GraphNode[], graph: Graph): { systemPrompt: string, userPrompt: string } {

    const originFileNode = findFileParentNode(nodes, node);
    let systemPrompt = `You are a helpful ${node.language} code assistant that helps to write code documentation in just one paragraph, mentioning the principal features of the code.`;

    if (["function", "class", "method"].includes(node.type)) {
        systemPrompt += ` The documentation must include how each parameter is used and what the ${node.type} does.`;
        }

    systemPrompt += ` Prevent any prose in your response. Please, be concise and don't talk about the file.`;

    let userPrompt = `Write a documentation for the following ${node.type} called "${node.label}" in just one paragraph. Mention the principal features of the code:`
    userPrompt += `\n\`\`\`${node.language}\n${node.code}\n\`\`\`\n\n`


    if (originFileNode && graph[node.id].length > 0 && originFileNode.importStatements) {
        userPrompt += `You may require to know the import statements of the file where ${node.type} is defined:\n\n`
        userPrompt += `\`\`\`${node.language}\n${originFileNode.importStatements}\n\`\`\`\n`
        userPrompt += `If "${node.label}" uses an import statement, mention it in the documentation.\n\n`;
    }


    const calledNodes = graph[node.id].map(calledNodeId => nodes.find(node => node.id === calledNodeId));

    if (graph[node.id].length > 0 && calledNodes.some(n => n?.generatedDocumentation) ) {
        userPrompt += `To put more context, here is the documentation of other components used by the code:\n`
        
        graph[node.id].forEach(calledNodeId => {
            const calledNode = nodes.find((n) => n.id === calledNodeId);
            if (calledNode && calledNode.generatedDocumentation) {
                userPrompt += `\n- ${calledNode.label}: ${calledNode.generatedDocumentation}`;
            }
        })
    }

    return { systemPrompt, userPrompt }
}

