import { AllowedTypes } from "../model/consts";

const fs2 = require("fs").promises;
const path2 = require("path");
const OpenAI2 = require("openai");
const { Tiktoken } = require("tiktoken/lite");
const cl100k_base = require("tiktoken/encoders/cl100k_base.json");

/*Problems:
-- links include links of files, which were supposed to not be included
-- how to summarize files that don't have sub nodes so they don't have documentation? (like jest.config.js)
-- include label "defines" in links
-- originFile

*/

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

// LLM settings
const model = "gpt-3.5-turbo";
const temperature = 0;
const max_tokens = 1024;
const response_format = { type: "json_object" };

const onlyLogs = false;
// Prompts

// Folders references
//const projectId = "codebase-index-ts";
const projectId = "judini-python-main";
const folder_path = `../../test_files/`;

const nodesPath: string = `${folder_path}/${projectId}/nodes.json`;
const linksPath: string = `${folder_path}/${projectId}/links.json`;

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
  const startTime = new Date();
  const nodesWithFiles: wikiNode[] = await readJson(nodesPath); //nodes including the ones that are files
  const nodes = nodesWithFiles.filter((item: any) => item.type !== "file"); //nodes that are not file

  await fs2.writeFile("myNodes.json", JSON.stringify(nodes, null, 2));
  const links: wikiLink[] = await readJson(linksPath);
  const { callGraph, defineGraph, wholeGraph } = buildGraphs(nodes, links); //call graph between nodes,not including files.

  await fs2.writeFile("callGraph.json", JSON.stringify(callGraph, null, 2));
  //await fs2.writeFile("defineGraph.json", JSON.stringify(defineGraph, null, 2));
  //await fs2.writeFile("wholeGraph.json", JSON.stringify(wholeGraph, null, 2));
  const startNodes = findStartNodes(callGraph); //leaf nodes

  await fs2.writeFile("startNodes.json", JSON.stringify(startNodes, null, 2));
  //const usedNodes = await readJson("usedNodes.json");

  const usedNodes = await bfs(nodesWithFiles, startNodes, callGraph, nodes); //only nodes with documentation. INcludes "calls" and "defines"
  await fs2.writeFile("usedNodes.json", JSON.stringify(usedNodes, null, 2));

  const fileToNodes = nodesWithFiles
    .filter((item: wikiNode) => item.type === "file")
    .reduce((acc: any, item: any) => {
      acc[item.label] = []; //label so that includes the extension (type of language)
      return acc;
    }, {});
  console.log(fileToNodes);
  const filesDocumentation = await classifyAndDocumentFiles(
    fileToNodes,
    nodesWithFiles,
    usedNodes
  );
  await fs2.writeFile(
    "filesDocumentation.json",
    JSON.stringify(filesDocumentation, null, 2)
  );
  //console.log("Files Doc: ", filesDocumentation);
  const folderDocumentation = await documentFolders(filesDocumentation);
  //console.log("Folder Doc:", folderDocumentation);
  await fs2.writeFile(
    "folderDocumentation.json",
    JSON.stringify(folderDocumentation, null, 2)
  );
  let wikiContent = await buildWiki(filesDocumentation, folderDocumentation);
  await fs2.writeFile("wikiPage.md", wikiContent);
  console.log("Total tokens used: ", totalTokensUsed);
  const endTime = new Date();
  timeElapsedInSecconds({ fnName: "Total Execution Time", startTime, endTime });
})();

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

function buildGraphs(nodes: wikiNode[], links: wikiLink[]) {
  //all nodes appear on links?
  const callGraph: { [key: string]: string[] } = {};
  const defineGraph: { [key: string]: string[] } = {};
  const wholeGraph: { [key: string]: string[] } = {};
  nodes.forEach((node) => {
    //nodes that are not files!!!
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
        callGraph[link.source].push(link.target);
      } else if (link.label === "defines") {
        defineGraph[link.source].push(link.target);
      }
      wholeGraph[link.source].push(link.target);
    }
  }

  return { callGraph, defineGraph, wholeGraph };
}
function findStartNodes(callGraph: { [key: string]: string[] }) {
  return Object.keys(callGraph).filter((node) => callGraph[node].length === 0); //get nodes that don't call anyone.
}

async function bfs(
  nodesWithFiles: wikiNode[],
  startNodes: string[],
  wholeGraph: { [key: string]: string[] },
  nodes: wikiNode[]
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
  console.log("FINISHED BFS");
  return usedNodes;
}

// 1. Genera la documentacion de un nodo; todos los nodos en node.json pero que no son files y que tienen links con label 'calls'
async function generateNodeDocumentation(
  nodesWithFiles: wikiNode[],
  node: wikiNode,
  calledNodesSummary: string
) {
  const FunctionStartTime = new Date();
  console.log("start generateNodeDocumentation", FunctionStartTime);

  const parentNode = findFileParent(nodesWithFiles, node);

  const importStatements = parentNode
    ? parentNode.importStatements.join("\n")
    : "";

  let systemPrompt = `You are a helpful ${node.language} code assistant that helps to write code documentation in just one paragraph.`;

  if (["function", "class", "method"].includes(node.type)) {
    systemPrompt += ` The documentation must include how each parameter is used and what the ${node.type} does.`;
  }

  systemPrompt += `\nPrevent any prose in your response. Please, be concise and don't talk about the file.`;

  let userPrompt = `Write a documentation for the following ${node.type} called "${node.label}" in just one paragraph:
	
\`\`\`${node.language}
${node.code}
\`\`\`
`;

  if (importStatements) {
    //include only import statements q se usan en el nodo. O hacer regex para verificar.
    //console.log(`IMPORTS of Node ${node.code}: `, importStatements);
    userPrompt += `You may require to know the import statements of the file where ${node.type} is defined:

\`\`\`${node.language}
${importStatements}
\`\`\`

If the code uses an import statement, mention it in the documentation.
`;
  }

  if (calledNodesSummary) {
    userPrompt += `\nTo put more context, here is the documentation of each component used by the code:\n${calledNodesSummary}`;
  }

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
          {
            role: "user",
            content: userPrompt,
          },
        ],
        model,
        temperature,
        max_tokens,
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

    /*console.log(
      "generateNodeDocumentation time",
      (FunctionEndTime.getTime() - FunctionStartTime.getTime()).toFixed(2)
    );

    console.log(
      "\ngenerateNodeDocumentation",
      "systemPrompt:",
      systemPrompt,
      "\n",
      "userPrompt:",
      userPrompt,
      "\n",
      "response:",
      response.choices[0].message.content,
      "\n",
      "total_tokens:",
      response.usage.total_tokens,
      "\n\n"
    );*/

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
  nodesWithFiles: wikiNode[],
  usedNodes: wikiNode[]
): Promise<{ [filePath: string]: string }> {
  //const files: { [filePath: string]: wikiNode[] } = {};
  for (const node of usedNodes) {
    const correspondingFile = node.originFile;
    //console.log("CF: ", correspondingFile);

    fileToNodes[correspondingFile].push(node);
  }
  //console.log("FTN: ", fileToNodes);
  await fs2.writeFile("fileToNodes.json", JSON.stringify(fileToNodes, null, 2));
  const filesDocumentation: { [filePath: string]: string } = {};

  for (const filePath in fileToNodes) {
    const wikiNodes = fileToNodes[filePath];
    const fileContent = wikiNodes.map((node) => node.summary).join("\n");
    const fileNode = nodesWithFiles.find((node) => node.label === filePath)!; //it should always be there (.label as it includes extension)
    await generateFileDocumentation(fileNode, filePath, fileContent).then(
      (res) => {
        filesDocumentation[filePath] = res;
        //console.log("Updated filesDocumentation:", filesDocumentation);
      }
    );
  }
  //console.log("FILESSSS", filesDocumentation);
  return filesDocumentation;
}

// 2. generateFileDocumentation: Genera la documentacion de un archivo.
async function generateFileDocumentation(
  fileNode: wikiNode,
  filePath: string,
  fileContent: string
): Promise<string> {
  const FunctionStartTime = new Date();
  //console.log("FILE CONTENT: ", fileContent, filePath);
  //console.log("FILE NODE LANGUAGE: ", fileNode.language);
  console.log("start generateFileDocumentation", FunctionStartTime);

  let systemPrompt = `You are a helpful ${fileNode.language} code assistant that helps to write documentation in just one paragraph
  based on the documentation of the sub components of a file. By sub components I mean the functions, classes, methods, etc. that are in the file`;

  systemPrompt += `\nPrevent any prose in your response. Please, be concise.`;

  let userPrompt = `Write a documentation for the following ${fileNode.type} called "${fileNode.label}" in a concise manner.`;
  userPrompt += `I am going to give you the code of the file in a way that it is digestible for you. 
  The code of the file is the following:\n
  \`\`\`${fileNode.codeNoBody}\`\`\``;

  if (fileContent) {
    userPrompt += `Lucky for you, I also have individual documentation of the sub components (parts) of the ${fileNode.type}. 
    The documentation of the "sub components" of the ${fileNode.type} corresponds to the collection of documentations of the sub parts (methods, functions, definition or more that are inside the file).
     So, the individual documentation of the sub components (parts) is the following:\n\n
     ${fileContent}`;
  }
  let response;

  try {
    if (onlyLogs) {
      response = null;
    } else {
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

  return response?.choices[0].message.content;
}

async function documentFolders(filesDocumentation: any) {
  const folders: { [folderPath: string]: string[] } = {};
  for (const filePath in filesDocumentation) {
    let currentFolderPath = path2.dirname(filePath);
    //console.log("Processing filePath:", filePath);

    while (
      currentFolderPath &&
      currentFolderPath.includes(projectId) && // Only process files that are in the project we want
      currentFolderPath !== path2.parse(currentFolderPath).root //do not go past root folder
    ) {
      //console.log("Adding to folder:", currentFolderPath);
      if (!folders[currentFolderPath]) {
        folders[currentFolderPath] = [];
      }
      folders[currentFolderPath].push(filesDocumentation[filePath]); // Push the documentation of the file

      const nextPath = path2.dirname(currentFolderPath);
      if (nextPath === currentFolderPath) {
        break; //Prevent inf loop
      }
      currentFolderPath = nextPath;
    }
  }

  const foldersDocumentation: { [folderPath: string]: string } = {};

  for (const folderPath in folders) {
    //console.log(`Processing folder ${folderPath}:`, folders[folderPath]);
    const folderContent = folders[folderPath].join("\n\n");
    await generateFolderDocumentation(folderPath, folderContent).then(
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

  let systemPrompt = `You are a helpful documentation assistant that helps to write documentation in 
  just one paragraph based on the documentation 
  of the files that are inside that folder.`;

  systemPrompt += `\nPrevent any prose in your response. Please, be concise.`;
  let userPrompt = `Write a documentation for the following folder called "${folderPath}" in a concise manner.
  You will be given the documentation of the files that are inside the folder.
  What I am going to give you now is the documentation of files inside the folder "${folderPath}". Keep in mind that you should document the folder 
  using the documentation of the files inside that folder. The documentation of the files inside the folder "${folderPath}" is the following:\n
  ${folderContent}`;
  //console.log(`Folder ${folderPath} has contents: ${folderContent}`);
  let response;

  try {
    if (onlyLogs) {
      response = null;
    } else {
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
    }
  } catch (error) {
    console.error(`Error fn generateFolderDocumentation:`, error);
    return "";
  }

  const tokensUsed = response?.usage.total_tokens || 0;
  const inputTokens = response?.usage.prompt_tokens || 0;
  totalTokensUsed += tokensUsed;

  const FunctionEndTime = new Date();

  timeElapsedInSecconds({
    fnName: "generateFolderDocumentation",
    startTime: FunctionStartTime,
    endTime: FunctionEndTime,
  });

  /*console.log(
    "\ngenerateFolderDocumentation\n",
    "prompt:",
    systemPrompt,
    "\n",
    "userPrompt:",
    userPrompt,
    "\n",
    "response:",
    response?.choices[0].message.content,
    "\n\n",
    "Tokenized:",
    tokenizer({ fnName: "generateFolderDocumentation", content: systemPrompt }),
    "prompt_tokens:",
    inputTokens,
    "total_tokens:",
    response?.usage.total_tokens
  );*/

  return response?.choices[0].message.content;
}

async function buildWiki(
  filesDocumentation: {
    [folderPath: string]: string;
  },
  folderDocumentation: {
    [folderPath: string]: string;
  }
) {
  //console.log("Folder:", folderDocumentation);
  //console.log("Files:", filesDocumentation);
  let wikiContent = `# Codebase Documentation`;
  let promptSystem1 = `You are wikiGPT. You will provide a wikipedia style for the documentation of a repository. Given the folder documentation of and the file documentation of a whole repository , you will generate a wiki page.
  Take into account that the whole documentation of a repository is made of the documentation of files and folders. Please be systematic and organized in your documentation and remember to give a markdown document and avoid prose.
  The structure of the input given is 2 dictionaries (one for folders and one for files) where the key is the path of the folder or file and the value is the documentation of the folder or file.`;

  let promptUser1 = `I need you to create a wikipedia page in markdown format given the documentation of all of a repository and it's components (documentation of the folders and files).
   Avoid prose like in a wikipedia page and remember it has to be in markdown format. Don't add code to the documentation. The documentation of files and folders corresponds to dictionaries where
   the key is the path of the folder or file and the value is the documentation of the folder or file. Please keep this in mind. The documentation of the folder is the following: \n\n${JSON.stringify(
     folderDocumentation,
     null,
     2
   )} \n\n
   The documentation of the files is the following: \n\n${JSON.stringify(
     filesDocumentation,
     null,
     2
   )} \n\n Remember to use both documentations (files and folders) to create the wiki page. 
   The most important thing is that the documentation is accurate. The structure of the wiki should be something like an overview of what the whole repo does and then a detailed explanation of each folder but only the most relevant files.`;
  //console.log("PromptSystem :", promptSystem1);
  //console.log("PromptUser :", promptUser1);

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
    model: model,
  });

  wikiContent += completion.choices[0].message.content;
  return wikiContent;
}
