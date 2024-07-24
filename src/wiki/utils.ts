import { GraphLink, GraphNode } from "../utils/db";
import { chatCompletionMessages, getOpenAIChatCompletion } from "../utils/ai";
import { AllowedTypes } from "../model/consts";
import { generateFolderPrompts, generateNodePrompts } from "./prompts";

let totalTokens = 0

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


export async function generateNodeDocumentation(node: GraphNode, nodes: GraphNode[], graph: Graph,
                                                repoName: string, model: string) {

    if (node.language === 'markdown') {
        node.generatedDocumentation = node.code
        return
    }

    const { systemPrompt, userPrompt } = generateNodePrompts(node, nodes, graph, repoName);
  
    try {

        const messages: chatCompletionMessages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ]

        if (['class', 'function', 'method'].includes(node.type) || node.code.split('\n').length >= 2) {
            const { response, tokens } = await getOpenAIChatCompletion(messages, node.type === 'file' ? 'gpt-4o' : model);
            totalTokens += tokens ?? 0
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

export async function documentNodesByLevels(nodeIdsByLevels: {[key: number]: string[]}, nodes: GraphNode[],
                        graph: Graph, repoName: string, model: string) {
    console.log('Generating documentation for each node ..')
    const levels = Object.keys(nodeIdsByLevels)
    levels.sort((a, b) => parseInt(b) - parseInt(a))

    for (const l of levels) {
        const level = parseInt(l);  // Convert the key back to a number if needed
        const nodeIds = nodeIdsByLevels[level];
        const promises = nodeIds.map(nodeId => {
            const node = nodes.find(n => n.id === nodeId);
            if (node && !node.generatedDocumentation) {
                return generateNodeDocumentation(node, nodes, graph, repoName, model);
            }
        })
        await Promise.all(promises);
    }
    console.log(`${repoName} - Used tokens for node documentation:`, totalTokens)
}

export async function documentFolders(nodes: GraphNode[], links: GraphLink[], repoName: string, model: string) {

    console.log('Generating documentation for each folder ..')
    const fileNodes = nodes.filter(n => n.type === 'file')
    const folderNames = fileNodes.map(n => n.fullName.split('/').slice(0, -1).join('/'))
    const uniqueFolderNames = [...new Set(folderNames)]

    // sort by level (number of '/')
    uniqueFolderNames.sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length)
    const documentedFolders: {[key: string]: string} = {}
    uniqueFolderNames.forEach(foldername => documentedFolders[foldername] = '')

    for (const folderName of uniqueFolderNames) {
        const {systemPrompt, userPrompt} = generateFolderPrompts(nodes, repoName, folderName, documentedFolders)

        const messages: chatCompletionMessages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ]

        // if (folderName.length === 0) {
        //     console.log(systemPrompt)
        //     console.log(userPrompt)
        // }
        
        const { response, tokens } = await getOpenAIChatCompletion(messages, model);
        totalTokens += tokens ?? 0
        documentedFolders[folderName] = response
    }

    console.log(`${repoName} - Total tokens used:`, totalTokens)
    return documentedFolders;
}