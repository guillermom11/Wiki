const fs2 = require("fs").promises;
const path2 = require("path");
const OpenAI2 = require("openai");
const { Tiktoken } = require("tiktoken/lite");
const cl100k_base = require("tiktoken/encoders/cl100k_base.json");

/*Problems:
-- links include links of files, which were supposed to not be included
-- how to summarize files that don't have sub nodes so they don't have documentation? (like jest.config.js)
--
*/
type wikiNode = {
	id: string;
	label: string;
	type: string;
	parent?: string; // optional
	totalTokens: number;
	inDegree: number;
	outDegree: number;
	code: string;
	summary?: string; // optional
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
const startTime = new Date();

// LLM settings
const model = "gpt-3.5-turbo";
const temperature = 0;
const max_tokens = 1024;
const response_format = { type: "json_object" };

const onlyLogs = false;
// Prompts

// Folders references
const projectId = "codebase-index-ts";
const nodesPath: string = `../../test_files/${projectId}/nodes.json`;
const linksPath: string = `../../test_files/${projectId}/links.json`;
let totalTokensUsed = 0;

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

const tokenizer = ({
	fnName,
	content,
}: {
	fnName: string;
	content: string;
}) => {
	const encoding = new Tiktoken(
		cl100k_base.bpe_ranks,
		cl100k_base.special_tokens,
		cl100k_base.pat_str
	);
	const tokens = encoding.encode(content);
	console.log(fnName, tokens.length);
	encoding.free();
};

(async () => {
	const nodesWithFiles: wikiNode[] = await readJson(nodesPath); //nodes including the ones that are files
	const nodes = nodesWithFiles.filter((item: any) => item.type !== "file"); //nodes that are not file

	await fs2.writeFile("myNodes.json", JSON.stringify(nodes, null, 2));
	const links: wikiLink[] = await readJson(linksPath);
	const callGraph = buildCallGraph(nodes, links);

	await fs2.writeFile("callGraph.json", JSON.stringify(callGraph, null, 2));
	const startNodes = findStartNodes(callGraph); //leaf nodes

	await fs2.writeFile("startNodes.json", JSON.stringify(startNodes, null, 2));
	const usedNodes = await readJson("usedNodes.json");

	//const usedNodes = await bfs(startNodes, callGraph, nodes); //only nodes with documentation
	// await fs2.writeFile("usedNodes.json", JSON.stringify(usedNodes, null, 2));

	const fileToNodes = nodesWithFiles
		.filter((item: wikiNode) => item.type === "file")
		.reduce((acc: any, item: any) => {
			acc[item.id] = [];
			return acc;
		}, {});
	//console.log(fileToNodes);
	const filesDocumentation = await classifyAndDocumentFiles(
		fileToNodes,
		usedNodes
	);
	await fs2.writeFile(
		"filesDocumentation.json",
		JSON.stringify(filesDocumentation, null, 2)
	);
	//console.log("Files Doc: ", filesDocumentation);
	const folderDocumentation = await documentFolders(filesDocumentation);
	console.log("Folder Doc:", folderDocumentation);
	await fs2.writeFile(
		"folderDocumentation.json",
		JSON.stringify(folderDocumentation, null, 2)
	);
	console.log("Total tokens used: ", totalTokensUsed);
})();

async function readJson(filePath: string) {
	let nodeInfo: any[] = [];

	try {
		const data = await fs2.readFile(filePath, "utf8");
		nodeInfo = JSON.parse(data);
		//console.log(nodes);
	} catch (err) {
		console.error(`Error reading ${filePath}:`, err);
		process.exit(1);
	}
	return nodeInfo;
}

function buildCallGraph(nodes: wikiNode[], links: wikiLink[]) {
	//all nodes appear on links?
	const callGraph: { [key: string]: string[] } = {};
	nodes.forEach((node) => {
		callGraph[node.id] = [];
	});

	for (const link of links) {
		if (link.label === "calls") {
			if (
				callGraph[link.source] &&
				link.source.includes("::") && //so that links that include files are not included
				link.target.includes("::")
			) {
				callGraph[link.source].push(link.target);
			}
		}
	}

	return callGraph;
}
function findStartNodes(callGraph: { [key: string]: string[] }) {
	return Object.keys(callGraph).filter((node) => callGraph[node].length === 0); //get nodes that don't call anyone.
}

async function bfs(
	startNodes: string[],
	callGraph: { [key: string]: string[] },
	nodes: wikiNode[]
): Promise<wikiNode[]> {
	const queue: string[] = startNodes;
	const visited: Set<string> = new Set();
	const usedNodes: wikiNode[] = [];
	while (queue.length > 0) {
		console.log("HERE:", queue.length);
		const currentNodeId = queue.shift()!;
		if (visited.has(currentNodeId)) continue;

		visited.add(currentNodeId);
		const currentNode = nodes.find((node) => node.id === currentNodeId);

		if (currentNode && currentNode.type !== "file") {
			const calledNodes = callGraph[currentNodeId] || [];
			const calledNodesInfo = calledNodes.map((id) =>
				nodes.find((node) => node.id === id && node.type !== "file")
			);
			const calledNodesSummary = calledNodesInfo
				.map((node) => node?.summary)
				.join("\n");

			const documentation = await generateNodeDocumentation(
				currentNode,
				calledNodesSummary
			);
			currentNode.summary = documentation;
			usedNodes.push(currentNode);
			//console.log(`Documentation for ${currentNode}: `, documentation);

			for (const calledNodeId of calledNodes) {
				if (!visited.has(calledNodeId)) {
					queue.push(calledNodeId);
				}
			}
		}
	}
	console.log("FINISHED");
	return usedNodes;
}

// 2. Genera la documentacion de un nodo; todos los nodos en node.json pero que no son files y que tienen links con label 'calls'
async function generateNodeDocumentation(
	node: wikiNode,
	calledNodesSummary: string
) {
	const FunctionStartTime = new Date();
	console.log("start generateNodeDocumentation", FunctionStartTime);

	const language = "typescript"; // @TODO: cambiar por el lenguaje del codigo dinamicamente

	const systemPrompt = `Generate a short description about the code bellow.
	- The documentation you make should be in Markdown format.
	- Create the description only about the code.
	- You must generate a valid JSON object.
	- Please put the documentation in the JSON.
	- Node Type: ${node.type}; Node Label: ${node.label}.
	- Prevent any prose.

	# JSON FORMAT:
	{ content: string }

	---

	# CODE CONTENT:
	<CodeContent>
		\`\`\`
		${node.code}
		\`\`\`
	</CodeContent>

	This ${node.type} uses the following nodes: <Nodes>${calledNodesSummary}</Nodes>\n\n
	---
	# JSON FORMAT:
	{ 'content': '' }

	`;

	try {
		let response;

		if (onlyLogs) {
			response = null;
		} else {
			response = await client2.chat.completions.create({
				messages: [
					{
						role: "system",
						content: systemPrompt,
					},
				],
				model,
				temperature,
				max_tokens,
				response_format,
			});
		}

		const tokensUsed = response.usage.total_tokens || 0;
		totalTokensUsed += tokensUsed;

		const FunctionEndTime = new Date();

		timeElapsedInSecconds({
			fnName: "generateNodeDocumentation",
			startTime: FunctionStartTime,
			endTime: FunctionEndTime,
		});

		console.log(
			"generateNodeDocumentation time",
			(FunctionEndTime.getTime() - FunctionStartTime.getTime()).toFixed(2)
		);

		console.log(
			"\ngenerateNodeDocumentation",
			"prompt:",
			prompt,
			"\n",
			"response:",
			response.choices[0].message.content,
			"\n",
			"total_tokens:",
			response.usage.total_tokens,
			"\n\n"
		);

		return response.choices[0].message.content;
	} catch (err) {
		console.error(`Error generating documentation for ${node.id}:`, err);
		return "";
	}
}

async function classifyAndDocumentFiles(
	fileToNodes: {
		[filePath: string]: wikiNode[];
	},
	usedNodes: wikiNode[]
): Promise<{ [filePath: string]: string }> {
	//const files: { [filePath: string]: wikiNode[] } = {};
	for (const node of usedNodes) {
		const nodePath = node.id;
		const until = nodePath.lastIndexOf("::");
		const correspondingFile = nodePath.slice(0, until);
		//console.log("CF: ", correspondingFile);
		if (!fileToNodes[correspondingFile]) {
			fileToNodes[correspondingFile] = [];
		}
		fileToNodes[correspondingFile].push(node);
	}
	//console.log("FTN: ", fileToNodes);
	await fs2.writeFile("fileToNodes.json", JSON.stringify(fileToNodes, null, 2));
	const filesDocumentation: { [filePath: string]: string } = {};

	for (const filePath in fileToNodes) {
		const wikiNodes = fileToNodes[filePath];
		const fileContent = wikiNodes.map((node) => node.summary).join("\n");
		await generateFileDocumentation(filePath, fileContent).then((res) => {
			filesDocumentation[filePath] = res;
			//console.log("Updated filesDocumentation:", filesDocumentation);
		});
	}
	//console.log("FILESSSS", filesDocumentation);
	return filesDocumentation;
}

// 1. generateFileDocumentation: Genera la documentacion de un archivo.
async function generateFileDocumentation(
	filePath: string,
	fileContent: string
): Promise<string> {
	const FunctionStartTime = new Date();

	console.log("start generateFileDocumentation", FunctionStartTime);

	const language = filePath.split(".")[1];

	const systemPrompt = `Generate a short description about the \`${language}\` code bellow.
	- The documentation you make should be in Markdown format.
	- Create the description only about the code.
	- You must generate a valid JSON object.
	- Please put the documentation in the JSON.
	- Prevent any prose.

	# JSON FORMAT:
	{ content: string }

	---

	# CODE CONTENT:
	<FileContent>
		\`\`\` ${filePath}
		${fileContent}
		\`\`\`
	</FileContent>

	---
	# JSON FORMAT:
	{ 'content': '' }

	`;
	let response;

	try {
		if (onlyLogs) {
			response = null;
		} else {
			response = await client2.chat.completions.create({
				messages: [{ role: "system", content: systemPrompt }],
				model,
				temperature,
				max_tokens,
				response_format,
			});
		}
	} catch (error) {
		console.error(`Error fn generateFileDocumentation:`, error);
		return "";
	}

	const tokensUsed = response?.usage.total_tokens || 0;
	const inputTokens = response?.usage.prompt_tokens || 0;
	totalTokensUsed += tokensUsed;

	const FunctionEndTime = new Date();

	timeElapsedInSecconds({
		fnName: "generateFileDocumentation",
		startTime: FunctionStartTime,
		endTime: FunctionEndTime,
	});

	console.log(
		"\ngenerateFileDocumentation\n",
		"prompt:",
		systemPrompt,
		"\n",
		response?.choices[0].message.content,
		"\n\n",
		"Tokenized:",
		tokenizer({ fnName: "generateFileDocumentation", content: systemPrompt }),
		"prompt_tokens:",
		inputTokens,
		"total_tokens:",
		response?.usage.total_tokens
	);

	return response?.choices[0].message.content;
}

async function documentFolders(filesDocumentation: any) {
	const folders: { [folderPath: string]: string[] } = {};
	for (const filePath in filesDocumentation) {
		const folderPath = path2.dirname(filePath);

		if (!folders[folderPath]) {
			folders[folderPath] = [];
		}
		folders[folderPath].push(filesDocumentation[filePath]); //push the documentation of the file
	}

	const foldersDocumentation: { [folderPath: string]: string } = {};

	for (const folderPath in folders) {
		const folderContent = folders[folderPath].join("\n");
		generateFolderDocumentation(folderPath, folderContent).then(
			(res) => (foldersDocumentation[folderPath] = res)
		);
	}
	return foldersDocumentation;
}

// 3. generateFolderDocumentation: Genera la documentacion de un folder.
async function generateFolderDocumentation(
	folderPath: string,
	folderContent: string
): Promise<string> {
	const FunctionStartTime = new Date();
	console.log("start generateFolderDocumentation", FunctionStartTime);

	const promptSystem1 =
		"You are wikiGPT. You will provide a wikipedia style info page documentation for the contents of a folder. Given the collection of documentations (in markdown format) of all files of a folder, you will generate a documentation of the folder taking into account that the documentation of a folder is made of the documentation of files inside that folder. Please be systematic and organized in your documentation. The documentation of that folder should be in Markdown format and be between 300-400 words. Use prose and should be precise but without loosing any important information.";

	const promptUser1 = `I need you to document the content of a folder. The content of this folder I want you to document will contain a collection of the documentations of all files inside that folder. Don't add code to the documentation. The contents of the folder (or the collection of documentations of the files inside that folder) you need to document in Markdown Format is:  \n\n${folderContent}\n. The folder has as path ${folderPath}. Keep in mind that a code from a folder in this context is made up of one or more pieces of code of other files. Be organized and systematic, taking into account that this is for a wiki page of a repository. Start by identifying the folder and then continue with the documentation. Crucial: At every opportunity you will link to other relative paths of this website. Use new lines and paragraphs to separate different topics. Remember it has to be between 300 and 400 words. Be organized and systematic with the organization of the content. Separate what each file does in the folder (only if that folder is important) in different paragraphs. Just be organized and systematic. The documentation should be in Markdown format. Keep in mind that the idea of this is to be a wiki page so the documentation should be like a wikipedia page in markdown format. Also, it is very important that you know that the documentation you give me for the folder should be in prose, in paragraphs 25-30 lines long.`;

	const completion = await client2.chat.completions.create({
		messages: [
			{
				role: "system",
				content: promptSystem1,
			},
			{
				role: "user",
				content: promptUser1,
			},
		],
		model,
		temperature,
		max_tokens,
	});
	const tokensUsed = completion.usage.total_tokens;
	totalTokensUsed += tokensUsed;

	const FunctionEndTime = new Date();

	timeElapsedInSecconds({
		fnName: "generateFolderDocumentation",
		startTime: FunctionStartTime,
		endTime: FunctionEndTime,
	});

	return completion.choices[0].message.content;
}
