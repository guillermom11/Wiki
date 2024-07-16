import { AllowedTypesArray, type AllowedTypes } from "$lib/consts";
import { json } from "@sveltejs/kit";

import OpenAI2 from "openai";
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({
	apiKey:
		"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",
});

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

const client2 = new OpenAI2({
	apiKey: "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",
});

// Settings
const temperature = 0;
const max_tokens = 1024;

const response_format = { type: "json_object" };
const onlyLogs = false;

// Utils
const timeElapsedInSecconds = ({
	fnName,
	startTime,
	endTime,
}: {
	fnName: string;
	startTime: Date;
	endTime: Date;
}) => {
	const timeElapsed = (endTime.getTime() - startTime.getTime()) / 1000;
	console.log(fnName, timeElapsed);
	return timeElapsed.toFixed(2);
};

function findStartNodes(callGraph: { [key: string]: string[] }) {
	return Object.keys(callGraph).filter((node) => callGraph[node].length === 0); //get nodes that don't call anyone.
}

async function buildGraphs({
	nodes,
	links,
}: {
	nodes: wikiNode[];
	links: wikiLink[];
}) {
	const callGraph: { [key: string]: string[] } = {};
	const defineGraph: { [key: string]: string[] } = {};
	const wholeGraph: { [key: string]: string[] } = {};

	nodes.forEach((node) => {
		callGraph[node.id] = [];
		defineGraph[node.id] = [];
		wholeGraph[node.id] = [];
	});

	for (const link of links) {
		if (
			link.source.includes("::") && //so that links that include files are not included
			link.target.includes("::")
		) {
			if (link.label === "calls") {
				if (!callGraph[link.source]) {
					callGraph[link.source] = [];
				}
				callGraph[link.source].push(link.target);
			} else if (link.label === "defines") {
				if (!defineGraph[link.source]) {
					defineGraph[link.source] = [];
				}
				defineGraph[link.source].push(link.target);
			}
			if (!wholeGraph[link.source]) {
				wholeGraph[link.source] = [];
			}
			wholeGraph[link.source].push(link.target);
		}
	}

	return { callGraph, defineGraph, wholeGraph };
}

async function bfs(
	nodesWithFiles: wikiNode[],
	startNodes: string[],
	wholeGraph: { [key: string]: string[] },
	nodes: wikiNode[],
	model: string
): Promise<wikiNode[]> {
	const queue: string[] = startNodes;
	const visited: Set<string> = new Set();
	const usedNodes: wikiNode[] = [];
	if (queue.length === 0) {
		console.log("There is no start node (no node that doesn't call anyone).");
	}
	while (queue.length > 0) {
		console.log("HERE:", queue.length);
		const currentNodeId = queue.shift()!;
		if (visited.has(currentNodeId)) continue;

		visited.add(currentNodeId);
		const currentNode = nodes.find((node) => node.id === currentNodeId);

		if (currentNode && currentNode.type !== "file") {
			const calledNodes = wholeGraph[currentNodeId] || []; //defined or called by the current node
			const calledNodesInfo = calledNodes.map((id) =>
				nodes.find((node) => node.id === id && node.type !== "file")
			);
			const calledNodesSummary = calledNodesInfo
				.map((node) => node?.summary)
				.join("\n");

			const documentation = await generateNodeDocumentation(
				nodesWithFiles,
				currentNode,
				calledNodesSummary,
				model
			);
			currentNode.summary = documentation || "";

			usedNodes.push(currentNode);
			//console.log(`Documentation for ${currentNode}: `, documentation);

			for (const calledNodeId of calledNodes) {
				if (!visited.has(calledNodeId)) {
					queue.push(calledNodeId);
				}
			}
		}
	}
	return usedNodes;
}

function findFileParent(nodesWithFiles: wikiNode[], node: wikiNode) {
	const parent = nodesWithFiles.filter((n) => n.id == node.parent)[0];
	if (parent && parent.type === "file") {
		return parent;
	} else if (parent.type !== "file") {
		return findFileParent(nodesWithFiles, parent);
	} else {
		console.log("Parent not found :(");
	}
}

// 1. Genera la documentacion de un nodo; todos los nodos en node.json pero que no son files y que tienen links con label 'calls'
async function generateNodeDocumentation(
	nodesWithFiles: wikiNode[],
	node: wikiNode,
	calledNodesSummary: string,
	model: string
) {
	const FunctionStartTime = new Date();
	console.log("start generateNodeDocumentation", FunctionStartTime);

	const parentNode = findFileParent(nodesWithFiles, node);

	const importStatements = parentNode
		? parentNode.importStatements.join("\n")
		: "";

	let systemPrompt = `Write the \`${node.language}\` technical code documentation in just one paragraph.`;

	if (["function", "class", "method"].includes(node.type)) {
		systemPrompt += `\nThe documentation must include how each **parameter** is used and what the \`${node.type}\` does.`;
	}

	systemPrompt += `\n- Prevent any prose.\n- Please, be concise and do not talk about the file.\n`;

	let userPrompt = `- Write a documentation for the following \`${node.type}\` called \`${node.label}\`:

\`\`\`${node.language}
${node.code}
\`\`\`
`;

	if (importStatements) {
		userPrompt += `Mention the code **import statement**, in the documentation. You may require to know the **import statements** of the file where \`${node.type}\` is defined:

\`\`\`${node.language}
${importStatements}
\`\`\`
`;
	}

	if (calledNodesSummary) {
		userPrompt += `- To put more context, here is the documentation of each component used by the code:\n${calledNodesSummary}`;
	}

	console.log(systemPrompt, userPrompt);

	try {
		let response;

		if (onlyLogs) {
			response = null;
		} else {
			if (model.includes("gpt")) {
				response = await client2.chat.completions.create({
					messages: [
						{
							role: "system",
							content: systemPrompt,
						},
						{
							role: "user",
							content: userPrompt,
						},
					],
					model,
					temperature,
					max_tokens,
				});

				response = response.choices[0].message.content;
			}
			// Claude
			if (model.includes("claude")) {
				response = await anthropic.messages.create({
					max_tokens: 1024,
					system: systemPrompt,
					messages: [{ role: "user", content: userPrompt }],
					model,
				});

				response = response.content[0].text;
				// console.log("response", { response });
			}
		}

		const FunctionEndTime = new Date();

		timeElapsedInSecconds({
			fnName: "generateNodeDocumentation",
			startTime: FunctionStartTime,
			endTime: FunctionEndTime,
		});

		return response;
	} catch (err) {
		console.error(`Error generating documentation for ${node.id}:`, err);
		return "";
	}
}

// Response to the client

export async function POST({ request }) {
	const { nodes, links, model } = await request.json();

	if (!model) {
		return json([], { status: 400 });
	}

	const { callGraph, defineGraph, wholeGraph } = await buildGraphs({
		nodes,
		links,
	});

	const startNodes = findStartNodes(callGraph);
	const usedNodes = await bfs(nodes, startNodes, callGraph, nodes, model);

	return json(usedNodes);
}
