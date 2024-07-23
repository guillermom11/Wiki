import { GraphLink, GraphNode } from "../utils/db";
import { chatCompletionMessages, getOpenAIChatCompletion } from "../utils/ai";
import { AllowedTypes } from "../model/consts";

let totalTokens = 0

type Graph = { [key: string]: string[] }


function calculateLanguagePercentages(nodesPerType: Record<AllowedTypes, GraphNode[]>) {
    const allLanguages = nodesPerType['file'].map((n) => n.language)
    const total = allLanguages.length
    const counts: Record<string, number> = {}
  
    allLanguages.forEach((language) => {
      counts[language] = (counts[language] || 0) + 1
    })
  
    const percentages: Record<string, string> = {}
    for (const [language, count] of Object.entries(counts)) {
      percentages[language] = (count / total * 100).toFixed(2) + '%'
    }
  
    const sortedPercentagesArray = Object.entries(percentages).sort((a, b) =>
      parseFloat(b[1]) - parseFloat(a[1])
    )
    const sortedPercentages = Object.fromEntries(sortedPercentagesArray)
    return sortedPercentages
  }

function getNodesPerType(nodes: GraphNode[]) {
    const nodesPerType = nodes.reduce((acc, node) => {
        if (!acc[node.type]) {
          acc[node.type] = []
        }
        acc[node.type].push(node)
        return acc
      }, {} as Record<AllowedTypes, GraphNode[]>)

    return nodesPerType
}

function getMostUsedNodesPerType(nodesPerType: Record<AllowedTypes, GraphNode[]>, discardMethods: boolean = false) {
    // sort mostUsedNodesPerType by in_degree + out_degree and return 5 max values
    const mostUsedNodesPerType = Object.keys(nodesPerType).reduce((acc, type) => {
        if (discardMethods && type === 'method') {
            return acc
        }

        if (!['file', 'namespace', 'package', 'mod', 'assignment', 'header'].includes(type)) 
            acc[type as AllowedTypes] = nodesPerType[type as AllowedTypes]
        .filter(n => n.outDegree > 0)
        .sort(
            (a, b) => (b.outDegree + b.inDegree) - (a.outDegree + a.inDegree),
            ).slice(0, 5).map((n) => `### From ${n.originFile}:\n\`\`\`${n.language}\n${n.codeNoBody}\n\`\`\``)
        return acc
    }, {} as Record<AllowedTypes, (string | number)[]>)

    return mostUsedNodesPerType
}

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


export function generateNodePrompts(node: GraphNode, nodes: GraphNode[], graph: Graph, repoName: string): { systemPrompt: string, userPrompt: string } {

    const originFileNode = findFileParentNode(nodes, node);

    let systemPrompt = '';
    if (node.type !== 'file') {
        systemPrompt = `You are a helpful ${node.language} code assistant that helps to write code documentation for the repository ${repoName} in just one paragraph, mentioning the principal features of the code.`;
    } else {
        systemPrompt = `You are a helpful ${node.language} code assistant that helps to write summaries for files from the repository ${repoName}. The user will pass you a reduced version of the file content and you must explain the main features and purpose of the file.`;
    }

    if (["function", "class", "method"].includes(node.type)) {
        systemPrompt += ` The documentation must include how each parameter is used and what the ${node.type} does.`;
    }

    if (node.type !== 'file')
        systemPrompt += ` Prevent any prose in your response. Please, be concise and don't talk about the file.`;

    const parentFileString = originFileNode ? `from file "${originFileNode.label}" ` : ''

    let userPrompt = '';
    if (node.type !== 'file') {
        userPrompt = `Write a documentation for the ${node.type} called "${node.fullName}" ${parentFileString}in just one paragraph, mentioning the principal features of the code:`
    } else {
        const folder = node.fullName.split('/').slice(0, -1).join('/');
        userPrompt = `Write a brief summary for the file "${node.label}" from folder "${folder}", explaining the main features and purpose of the file:`
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
        userPrompt += `Use the following information to generate a better description of what ${node.label} does:`
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

export async function generateNodeDocumentation(node: GraphNode, nodes: GraphNode[], graph: Graph,
                                                repoName: string, model: string) {
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
            if (node && node.generatedDocumentation?.length === 0) {
                return generateNodeDocumentation(node, nodes, graph, repoName, model);
            }
        })
        await Promise.all(promises);
    }
    console.log(`${repoName} - Used tokens for node documentation:`, totalTokens)
}

export async function documentFolders(nodes: GraphNode[], links: GraphLink[], repoName: string, model: string) {

    const nodesPerType = getNodesPerType(nodes)
    const allLanguages = calculateLanguagePercentages(nodesPerType)
    const allLanguagesString = Object.entries(allLanguages).map(([name, pct]) =>
        `${name} (${pct})`
      ).join(', ')


    console.log('Generating documentation for each folder ..')
    const fileNodes = nodes.filter(n => n.type === 'file')
    const folderNames = fileNodes.map(n => n.fullName.split('/').slice(0, -1).join('/'))
    const uniqueFolderNames = [...new Set(folderNames)]

    // sort by level (number of '/')
    uniqueFolderNames.sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length)
    const documentedFolders: {[key: string]: string} = {}
    uniqueFolderNames.forEach(foldername => documentedFolders[foldername] = '')

    for (const folderName of uniqueFolderNames) {
        const filteredNodes = folderName.length > 0 ? nodes.filter(n => n.originFile?.startsWith(folderName)) : nodes
        const fileNodesPerType = getNodesPerType(filteredNodes)
        const mostUsedNodesPerType = getMostUsedNodesPerType(fileNodesPerType)
        const mostUsedNodesPerTypeString = Object.keys(mostUsedNodesPerType).map((type) => {
            return mostUsedNodesPerType[type as AllowedTypes].join('\n\n')
          }).join('\n')
        let systemPrompt = `You are a helpful code expert and wikipedia editor who is writing a publication for repository ${repoName}, which uses the following languages: ${allLanguagesString}.`
        systemPrompt += `\nThese are the most common elements from the repository:\n${mostUsedNodesPerTypeString}\n\n`
        systemPrompt += `The user will pass you information about files and subfolders of the repo, and you have to generate a final wiki.`
        
        if (folderName.length === 0) {
        systemPrompt += ` The wiki must describe the main features of the repo and its final purpose, i.e.:\n
        1. **Introduction**: Brief description of the project, its purpose, and main functionalities.
        2. **Getting Started**: List of software, libraries, and tools needed.
        3. **Project Structure**: Description of the main directories and their purposes. Explanation of important files and their roles.
        4. **Glossary**:  Definitions of key terms and concepts used in the project.`
        } else {
            systemPrompt += ` The wiki must describe the main features of the folder and its final purpose, i.e.:\n
            1. **Introduction**: Brief description of the folder, its purpose, and main functionalities.
            2. **Directory structure**:  Explanation of important files/directories and their roles.` 
        }
        
        const fileNodesInFolder = fileNodes.filter(n => n.fullName.startsWith(folderName) && n.fullName.split('/').length == (folderName ? folderName.split('/').length + 1 : 1))
        const subfoldersDocumentations = Object.fromEntries(
            Object.entries(documentedFolders).filter(([key]) => {
                return key.startsWith(folderName) && key != folderName  // && key.split('/').length == folderName.split('/').length + 1 && key != folderName 
            })
        )

        const folderContext = folderName.length > 0 ? `folder "${folderName}"` : `repository ${repoName}`
        let userPrompt = `Generate a publication for the ${folderContext}. Use the following information to generate a better response:\n\n`

        for (const [subfolder, subfolderDoc] of Object.entries(subfoldersDocumentations)) {
            if (subfolderDoc) {
                userPrompt += `Subfolder ${subfolder} information:\n${subfolderDoc}`
                userPrompt += `\n------------------------------------------------\n\n`
            }
        }

        for (const fileNode of fileNodesInFolder) {
            userPrompt += `Documentation for file ${fileNode.label}:\n${fileNode.generatedDocumentation ?? ''}\n`
            // const callLinks = links.filter(l => l.source === fileNode.id && l.label == 'calls')
            // const defineLinks = links.filter(l => l.source === fileNode.id && l.label == 'defines')
            
            // if (callLinks.length) {
            //     userPrompt += `  ${fileNode.label} Uses:\n`
            //     callLinks.forEach(l => {
            //         const calledNode = nodes.find(n => n.id === l.target)
            //         if (calledNode) {
            //             userPrompt += `   - ${calledNode.type} ${calledNode.label}${": " + calledNode.generatedDocumentation ?? ''}\n` 
            //         }
            //     })
            // }
            
            // if (defineLinks.length) {
            //     userPrompt += `  ${fileNode.label} Defines:\n`
            //     defineLinks.forEach(l => {
            //         const definedNode = nodes.find(n => n.id === l.target)
            //         if (definedNode) {
            //             userPrompt += `   - ${definedNode.type} ${definedNode.label}${": " + definedNode.generatedDocumentation ?? ''}\n`
            //         }
            //     })
            // userPrompt += `\n------------------------------------------------\n\n`
            // }
            
        }

        const messages: chatCompletionMessages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ]

        if (folderName.length === 0) {
            console.log(systemPrompt)
            console.log(userPrompt)
        }
        
        const { response, tokens } = await getOpenAIChatCompletion(messages, model);
        totalTokens += tokens ?? 0
        documentedFolders[folderName] = response
    }

    console.log(`${repoName} - Total tokens used:`, totalTokens)
    return documentedFolders;
}