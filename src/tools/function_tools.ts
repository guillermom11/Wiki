import { distance } from 'https://deno.land/x/fastest_levenshtein@1.0.10/mod.ts'
import { sql } from '@/lib/db/index.ts'
import { GraphLink, GraphNode, NodeType } from '@/types/graph.ts'
import { FunctionDefinition } from 'npm:@azure/openai@1.0.0-beta.11'
import { CONFIGURATION } from '@/lib/ai/consts.ts'

function calculateLanguagePercentages(languages: string[]) {
  const total = languages.length
  const counts: Record<string, number> = {}

  languages.forEach((language) => {
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

interface Similarity {
  id: string
  score: number
}

export async function getGraphNodesById({
  userOrgId,
  graphId,
}: {
  userOrgId: string
  graphId: string
}): Promise<GraphNode[]> {
  try {
    const rows = await sql<GraphNode[]>`
      SELECT
        n.id,
        n.full_name,
        n.type,
        n.language,
        n.documentation,
        n.code,
        n.code_no_body,
        n.total_tokens,
        n.in_degree,
        n.out_degree,
        n.label
      FROM graphs g
      JOIN repositories r
        ON r.id = g.repo_id
      JOIN nodes n
        ON n.repo_id = r.id
      WHERE g.id = ${graphId}
        AND g.org_id = ${userOrgId}
        AND g.status = 'completed'
    `

    return rows
  } catch (error) {
    console.log('Error getting graph nodes by id', error)
    return []
  }
}

export async function getGraphLinksById({
  userOrgId,
  graphId,
}: {
  userOrgId: string
  graphId: string
}): Promise<GraphLink[]> {
  try {
    const rows = await sql<GraphLink[]>`
      SELECT
        l.id,
        l.node_source_id,
        l.node_target_id,
        l.label
      FROM graphs g
      JOIN repositories r
        ON r.id = g.repo_id
      JOIN links l
        ON l.repo_id = r.id
      WHERE g.id = ${graphId}
        AND g.org_id = ${userOrgId}
        AND g.status = 'completed'
    `

    return rows
  } catch (error) {
    console.log('Error getting graph links by id', error)
    return []
  }
}

function topNSimilar(
  targetName: string,
  nodes: GraphNode[],
  n: number = 10,
): string[] {
  const similarities: Similarity[] = nodes.map((n) => ({
    id: n.full_name,
    score: distance(targetName, n.label),
  }))

  const topN = similarities.sort((a, b) => a.score - b.score).slice(0, n)

  return topN.filter((item) => item.score <= CONFIGURATION.DISTANCE_THRESHOLD)
    .map((item) => item.id)
}

/**
 * Finds the most similar nodes to the given name based on their type.
 *
 * @param {string} name - The name to compare against.
 * @param {GraphNode[]} nodes - The array of nodes to search.
 * @param {number} [n=10] - The maximum number of similar nodes to return for each type.
 * @returns {SimilarNodes} An object containing the most similar nodes grouped by type.
 */
function similarTo(
  name: string,
  nodes: GraphNode[],
  type: NodeType | 'all' = 'all',
  n = 10,
) {
  const similarNodes = []
  let topFiles: string[] = []
  let topClasses: string[] = []
  let topFunctions: string[] = []
  let topMethods: string[] = []
  let topInterfaces: string[] = []
  let topAssignments: string[] = []
  let similars: string[] = []

  if (type === 'all') {
    topFiles = topNSimilar(
      name,
      nodes.filter((n) => n.type === 'file'),
      n,
    )

    topClasses = topNSimilar(
      name,
      nodes.filter((n) => n.type === 'class'),
      n,
    )
    topFunctions = topNSimilar(
      name,
      nodes.filter((n) => n.type === 'function'),
      n,
    )
    topMethods = topNSimilar(
      name,
      nodes.filter((n) => n.type === 'method'),
      n,
    )
    topInterfaces = topNSimilar(
      name,
      nodes.filter((n) => n.type === 'interface'),
      n,
    )
    topAssignments = topNSimilar(
      name,
      nodes.filter((n) => n.type === 'assignment'),
      n,
    )

    if (topFiles.length > 0) {
      similarNodes.push(` - Files: ${topFiles}`)
    }
    if (topClasses.length > 0) {
      similarNodes.push(` - Classes: ${topClasses}`)
    }
    if (topFunctions.length > 0) {
      similarNodes.push(` - Functions: ${topFunctions}`)
    }
    if (topMethods.length > 0) {
      similarNodes.push(` - Methods: ${topMethods}`)
    }
    if (topInterfaces.length > 0) {
      similarNodes.push(` - Interfaces: ${topInterfaces}`)
    }
    if (topAssignments.length > 0) {
      similarNodes.push(` - Assignments: ${topAssignments}`)
    }
  } else {
    similars = topNSimilar(name, nodes.filter((n) => n.type === type), n)
    if (similars.length > 0) {
      similarNodes.push(
        ` - ${type.charAt(0).toUpperCase() + type.slice(1)}: ${similars}`,
      )
    }
  }

  if (similarNodes.length === 0) {
    return {
      content: `No similar node IDs found for ${name}.`,
      match: '',
      similars: similarNodes.slice(0, 1),
      topFiles: topFiles.slice(0, 1),
      topClasses: topClasses.slice(0, 1),
      topFunctions: topFunctions.slice(0, 1),
      topMethods: topMethods.slice(0, 1),
      topInterfaces: topInterfaces.slice(0, 1),
      topAssignments: topAssignments.slice(0, 1),
    }
  } else {
    return {
      content: `Similar node IDs to ${name}:\n${similarNodes.join('\n')}`,
      match: '',
      similars: similarNodes.slice(0, 1),
      topFiles: topFiles.slice(0, 1),
      topClasses: topClasses.slice(0, 1),
      topFunctions: topFunctions.slice(0, 1),
      topMethods: topMethods.slice(0, 1),
      topInterfaces: topInterfaces.slice(0, 1),
      topAssignments: topAssignments.slice(0, 1),
    }
  }
}

interface nodeSeen {
  [key: string]: boolean
}

async function getCode(
  nodes: GraphNode[],
  links: GraphLink[],
  nodeName?: string,
  nodeId?: string,
  maxTokens = 4096,
  nodesSeen: nodeSeen = {},
  maxDeepLevel = 2,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  if (!nodesSeen) {
    nodesSeen = {}
  }

  let node: GraphNode | undefined
  if (nodeId) {
    node = nodes.find((node) => node.id === nodeId)
    if (node) {
      nodeName = node.label
    }
  } else if (nodeName) {
    node = nodes.find((node) => node.label === nodeName) ||
      nodes.find((node) => node.full_name.endsWith(nodeName ?? '_NOTFOUND_'))
  }

  let toReturn = ''
  if (maxTokens < 0) {
    return toReturn
  }

  if (Object.keys(nodesSeen).length > 0) {
    toReturn += '\n\n-------\n\n'
  }

  if (node) {
    nodesSeen[node.id] = true
    const language = node.language
    toReturn += `From ${node.full_name}:\n`
    if (node.documentation) {
      toReturn += `\nDocumentation of ${node.label}:\n\n${node.documentation}\n`
    }
    if (node.total_tokens > maxTokens || node.type === 'file') {
      toReturn += `\`\`\`${language}\n${node.code_no_body}\n\`\`\``
    } else {
      toReturn += `\`\`\`${language}\n${node.code}\n\`\`\``
    }

    if (maxDeepLevel > 0) {
      maxDeepLevel -= 1
      const calls = links.filter((link) =>
        link.node_source_id === node!.id && link.label === 'calls'
      )
      for (const call of calls) {
        if (nodesSeen[call.node_target_id]) {
          continue
        }
        nodesSeen[call.node_target_id] = true
        const callNode = await getCode(
          nodes,
          links,
          undefined,
          call.node_target_id,
          maxTokens - node.total_tokens,
          nodesSeen,
          maxDeepLevel,
        )
        toReturn += callNode
      }
    }
  } else {
    toReturn = `There is no node named ${nodeName}.\n`
    if (nodeName) {
      const res = similarTo(nodeName, nodes)
      return {
        ...res,
        content: toReturn + res.content,
        targetNodes: [],
        sourceNodes: [],
      }
    }
  }

  let targetNodes: GraphNode[] = []
  let sourceNodes: GraphNode[] = []

  if (node) {
    const targetLinks = links.filter((link) => {
      return link.node_source_id === node.id
    }) ?? []

    const sourceLinks = links.filter((link) => {
      return link.node_target_id === node.id
    }) ?? []

    sourceNodes = nodes.filter((node) => {
      return sourceLinks.some((link) => link.node_source_id === node.id)
    }) ?? []

    targetNodes = nodes.filter((node) => {
      return targetLinks.some((link) => link.node_target_id === node.id)
    }) ?? []
  }

  return {
    content: toReturn,
    match: nodeName,
    topFiles: [],
    topClasses: [],
    topFunctions: [],
    topMethods: [],
    topInterfaces: [],
    topAssignments: [],
    targetNodes,
    sourceNodes,
  }
}

export async function getUserToolsAndPrompt(
  userOrgId: string,
  graphId: string,
) {
  const [nodes, links] = await Promise.all([
    getGraphNodesById({ userOrgId, graphId }),
    getGraphLinksById({ userOrgId, graphId }),
  ])

  const nodesPerType = nodes.reduce((acc, node) => {
    if (!acc[node.type]) {
      acc[node.type] = []
    }
    acc[node.type].push(node)
    return acc
  }, {} as Record<NodeType, GraphNode[]>)

  // sort mostUsedNodesPerType by in_degree + out_degree and return 5 max values
  const mostUsedNodesPerType = Object.keys(nodesPerType).reduce((acc, type) => {
    acc[type as NodeType] = nodesPerType[type as NodeType].sort(
      (a, b) => (b.out_degree + b.in_degree) - (a.out_degree + a.in_degree),
    ).slice(0, 5).map((n) => n.full_name)
    return acc
  }, {} as Record<NodeType, (string | number)[]>)

  const allLanguages = calculateLanguagePercentages(
    nodesPerType['file'].map((n) => n.language),
  )
  const allLanguagesString = Object.entries(allLanguages).map(([name, pct]) =>
    `${name}: ${pct}`
  ).join(', ')

  let prompt = Object.keys(mostUsedNodesPerType).map((type) => {
    return ` - ${type.charAt(0).toUpperCase() + type.slice(1)}: ${
      mostUsedNodesPerType[type as NodeType]
    }`
  }).join('\n')

  prompt = `Languages: ${allLanguagesString}
  The repository is represented by nodes and links, having a node name, type, code and ID. The node ID is represented by the parent file and name in the form my/path/file::node_name, where my/path/file is the ID of the file, which is also a node.
  These are the most common nodes Ids from the repository:\n${prompt}`

  function getCodeTool(nodeName: string) {
    return getCode(nodes, links, nodeName)
  }

  function getCodenbyNodeIdTool(nodeId: string) {
    return getCode(nodes, links, undefined, nodeId)
  }

  function similarToTool(
    nodeName: string,
    type: NodeType | undefined = undefined,
  ) {
    return similarTo(nodeName, nodes, type)
  }

  return { getCodeTool, similarToTool, getCodenbyNodeIdTool, prompt }
}

export const getCodeDescription: FunctionDefinition = {
  name: 'get_code',
  description: 'Get the code of a node by its name',
  parameters: {
    type: 'object',
    properties: {
      node_name: {
        type: 'string',
        description: 'The name of the node to get the code of',
      },
    },
    required: ['node_name'],
  },
}

export const getCodebyNodeIdDescription: FunctionDefinition = {
  name: 'get_code_by_node_id',
  description:
    'Get the code of a node by its id in the form my/path/file::node_name',
  parameters: {
    type: 'object',
    properties: {
      node_id: {
        type: 'string',
        description:
          'The id of the node to get the code of. Must be in the format my/path/file::node_name',
      },
    },
    required: ['node_id'],
  },
}

export const similarToDescription: FunctionDefinition = {
  name: 'similar_to',
  description:
    'Find similar node names by a name. It returns a list of node Ids.',
  parameters: {
    type: 'object',
    properties: {
      node_name: {
        type: 'string',
        description: 'The node name to search for similar nodes',
      },
    },
    required: ['node_name'],
  },
}

// const userOrgId = '0e2473ff-b3c3-4a92-a94d-8f2e72ef672c'
// const graphId = 'b0203565-40cc-4474-b56a-1368272fdd2d'

// const nodes: GraphNode[] = await getGraphNodesById({ userOrgId, graphId })
// const links = await getGraphLinksById({ userOrgId, graphId })

// console.log(await getCode(nodes, links, 'langchain_utils'))

// // console.log(similarTo('Props', nodes, 'all'))
// const nodesPerType = nodes.reduce((acc, node) => {
//   if (!acc[node.type]) {
//     acc[node.type] = []
//   }
//   acc[node.type].push(node)
//   return acc
// }, {} as Record<NodeType, GraphNode[]>)

// const allLanguages = calculateLanguagePercentages(nodesPerType['file'].map((n) => n.language))

// const allLanguagesString = Object.entries(allLanguages).map(([name, pct]) => `${name}: ${pct}` ).join(', ')
// console.log(allLanguagesString)

// // sort mostUsedNodesPerType by in_degree + out_degree and return 10 max values
// const mostUsedNodesPerType = Object.keys(nodesPerType).reduce((acc, type) => {
//   acc[type as NodeType] = nodesPerType[type as NodeType].sort(
//       (a, b) => (b.out_degree + b.in_degree) - (a.out_degree + a.in_degree)
//     ).slice(0, 5).map((n) => n.full_name)
//   return acc
// }, {} as Record<NodeType, (string | number)[]>)

// let prompt = Object.keys(mostUsedNodesPerType).map((type) => {
//   return ` - ${type.charAt(0).toUpperCase() + type.slice(1)}: ${mostUsedNodesPerType[type as NodeType]}`
// }).join('\n')

// prompt = `The repository is represented by nodes and links, having a node name, type, code and ID. The node ID is represented by the parent file and name in the form my/path/file::node_name, where my/path/file is the ID of the file, which is also a node.
// These are the most common nodes Ids from the repository:\n${prompt}`

// console.log(prompt)
