import { GraphLink, GraphNode } from "../utils/db";
import { chatCompletionMessages, getOpenAIChatCompletion } from "../utils/ai";

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
    const graph: Graph = {};
    nodes.forEach((node) => {
      graph[node.id] = [];
    });
  
    for (const link of links) {
        if (link.source === link.target) continue;
        
        // each link save the id node
        const sourceNode = nodes.find((node) => node.id === link.source);
        const targetNode = nodes.find((node) => node.id === link.target);
        // only save the links between nodes and not files
        if (sourceNode && targetNode) {
                graph[link.source].push(link.target);
      }
    }
  
    return { graph };
}


export function bfsLevels(nodes: GraphNode[], graph: Graph): {[key: number]: string[]} {
    const results: { [key: number]: string[] } = {};
    const levels: { [key: string]: number } = {};
    const inDegree: { [key: string]: number } = {};

    // Initialize in-degree for each node
    for (const node of nodes) {

        inDegree[node.id] = 0;
    }

    // Calculate in-degree for each node
    for (const [source, targets] of Object.entries(graph)) {
        for (const target of targets) {
            inDegree[target] = (inDegree[target] || 0) + 1;
        }
    }

    // Find start nodes (nodes with in-degree 0)
    const queue = nodes.filter(node => inDegree[node.id] === 0).map(node => node.id);
    
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

    let systemPrompt = '';
    if (node.type !== 'file') {
        systemPrompt = `You are a helpful ${node.language} code assistant that helps to write code documentation in just one paragraph, mentioning the principal features of the code.`;
    } else {
        systemPrompt = `You are a helpful ${node.language} code assistant that helps to write wikis for files. I will pass a reduced version of the file content and you must explain the main features and purpose of the file.`;
    }

    if (["function", "class", "method"].includes(node.type)) {
        systemPrompt += ` The documentation must include how each parameter is used and what the ${node.type} does.`;
    }

    systemPrompt += ` Prevent any prose in your response. Please, be concise and don't talk about the file.`;

    const parentFileString = originFileNode ? `from file "${originFileNode.label}" ` : ''
    let userPrompt = '';
    if (node.type !== 'file') {
        userPrompt = `Write a documentation for the ${node.type} called "${node.fullName}" ${parentFileString}in just one paragraph, mention it the principal features of the code:`
    } else {
        const folder = node.fullName.split('/').slice(0, -1).join('/');
        userPrompt = `Write a wiki for the file "${node.label}" from folder "${folder}", explain it the main features and purpose of the file:`
    }
    
    const code = ['method', 'function', 'interface', 'assignment', 'type', 'enum', 'struct', 'union'].includes(node.type) ? node.code : node.codeNoBody

    if (originFileNode && graph[node.id].length > 0 && originFileNode.importStatements) {
        userPrompt += `\n\`\`\`${node.language}\n${originFileNode.importStatements}\n\n${code}\n\`\`\`\n\n`
        systemPrompt += ` Don't mention about the imports if "${node.label}" is not using it directly in its implementation.`
    } else {
        userPrompt += `\n\`\`\`${node.language}\n${code}\n\`\`\`\n\n`
    }

    const linkedNodes = graph[node.id].map(linkedNodeId => nodes.find(node => node.id === linkedNodeId));

    if (graph[node.id].length > 0 && linkedNodes.some(n => n?.generatedDocumentation) ) {
        userPrompt += `Use the following information to a better description of what ${node.label} does:`
        systemPrompt += ` Do not verbose about the extra information, just use them as a reference to explain what ${node.label} does.`

        graph[node.id].forEach(linkedNodeId => {
            const linkedNode = nodes.find((n) => n.id === linkedNodeId);
            if (linkedNode && linkedNode.generatedDocumentation) {
                userPrompt += `\n- ${linkedNode.label}: ${linkedNode.generatedDocumentation}`;
            }
        })
        
    }

    userPrompt += `Remember to not verbose about the extra information, just use them as a reference to explain what "${node.label}" does.`
    if (node.type === 'file') {
        userPrompt += ' Remember also to explain the purpose of the file.'
    }
    return { systemPrompt, userPrompt }
}

export async function generateNodeDocumentation(node: GraphNode, nodes: GraphNode[], graph: Graph) {
    const { systemPrompt, userPrompt } = generateNodePrompts(node, nodes, graph);
  
    try {

        const messages: chatCompletionMessages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ]

        if (['class', 'function', 'method'].includes(node.type) || node.code.split('\n').length >= 2) {
            const { response, tokens } = await getOpenAIChatCompletion(messages);
            node.generatedDocumentation = response;
        } else {
            node.generatedDocumentation = `Code: ${node.code}`
        }
        // console.log(`#### ${node.label} ####`)
        // console.log({ systemPrompt, userPrompt } )
        // console.log({ response, tokens })

    } catch (error: any) {
        console.error(`Error generating documentation for ${node.label}: ${error.message}`)
    }
}

export async function documentNodesByLevels(nodeIdsByLevels: {[key: number]: string[]}, nodes: GraphNode[], graph: Graph) {
    const levels = Object.keys(nodeIdsByLevels)
    levels.sort((a, b) => parseInt(b) - parseInt(a))

    for (const l of levels) {
        const level = parseInt(l);  // Convert the key back to a number if needed
        const nodeIds = nodeIdsByLevels[level];
        const promises = nodeIds.map(nodeId => {
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                return generateNodeDocumentation(node, nodes, graph);
            }
        })
        await Promise.all(promises);
    }
}