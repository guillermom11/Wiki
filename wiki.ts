const fs = require("fs").promises;
const path = require("path");
const OpenAI = require("openai");

//DUDAS:
//-HTML O LENGUAGE NATURAL COMO OUTPUT DEL MODELO?
//-Input que sea el codigo o el summary del codigo?

const client = new OpenAI({
  apiKey: "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",
});
const codebasePath =
  "C:\\Users\\gmasc\\OneDrive\\Documentos\\CodeGPT\\Graphs\\codebase-index-ts\\";

export type wikiNode = {
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

const nodesFilePath: string =
  "C:/Users/gmasc/OneDrive/Documentos/CodeGPT/Graphs/codebase-index-ts/nodes.json";
// Dictionary to hold contents of each folder's wiki
let folderContents: { [key: string]: wikiNode[] } = {};
let contents = "";
let allCode = "";
(async () => {
  const nodes: wikiNode[] = await readNodes(nodesFilePath);
  //console.log(nodes);
  const generalSummary = await getSummaryOfAllRepoForContext(nodes);
  await fs.writeFile("allCode.txt", allCode);
  await fs.writeFile("mainSummary.md", generalSummary);
  contents += `The following is the general summary of the whole repo,that will be used as context to make other summaries: \n\n${generalSummary} heheh\n\n`;
  await processAllFiles(nodes, generalSummary);
  //console.log("Folder Contents: ", folderContents);
  await processAllFolders(generalSummary);
  await fs.writeFile(
    "folderContents.json",
    JSON.stringify(folderContents, null, 2)
  );
  let final = await buildFinalMarkdown(generalSummary);
  let wiki = await buildWiki(final);
  wiki = await improveWiki(wiki);
  await fs.writeFile("variablesPrompts.txt", contents);
  await fs.writeFile("final.md", wiki);
})();

async function readNodes(nodesFilePath: string) {
  let nodes: any[] = [];

  try {
    const data = await fs.readFile(nodesFilePath, "utf8");
    nodes = JSON.parse(data);
    //console.log(nodes);
  } catch (err) {
    console.error(`Error reading ${nodesFilePath}:`, err);
    process.exit(1);
  }
  return nodes;
}

async function processAllFiles(
  nodes: wikiNode[],
  generalSummary: string
): Promise<void> {
  // Process each node and wait for all to complete
  await Promise.all(
    nodes.map(async (node) => {
      // Create wiki for individual files
      if (node.type === "file") {
        await processFile(node, generalSummary);
      }
    })
  );
  contents +=
    "------------------------------------------------------------------------------------------------------------\n\n";
}
async function processFile(node: wikiNode, generalSummary: string) {
  const fileSummary = await createFileSummary(node, generalSummary);
  if (fileSummary !== null) {
    contents += `This is the summary of file ${node.label}:\n\n${fileSummary}\n\n`;
    const parentFolder = getParentFolder(node);
    if (!folderContents[parentFolder]) {
      folderContents[parentFolder] = [];
    }
    //console.log("I AM HEREEE");
    folderContents[parentFolder].push(node);
    //console.log(folderContents);
  }
}

async function createFileSummary(
  node: wikiNode,
  generalSummary: string
): Promise<string> {
  const promptSystem1 =
    "You are wikiGPT. You will provide a wikipedia style info page documentation for the contents of a file. Given the code of a file, you will generate a documentation of the file. Please be systematic and organized in your documentation. The documentation should be like a Wikipedia page style. You will receive a documentation and overview of the whole repository to give context to the file you are documenting. The documentation you make should be in Markdown format.";

  const promptUser1 = `I need you to document and describe the content of a file, which is part of a repository. The repository as a whole, has a documentation which is: ${generalSummary}\n\n. Don't add code to the documentation. The file that I want you to document and describe about is the following: \n\n ${node.code}\n\n. Mention the file path which is: ${node.id}. Be systematic and keep in mind this is for a wiki page of a whole repository. Start by identifying the file and then continue by summarizing it. Crucial: At every opportunity you will link to other relative paths of this website. The documentation of the file should be between 330 words and 400 words. Use prose!!!! Be organized and systematic with the organization of the content. The documentation should be in Markdown format and it should be in prose.`;
  const completion = await client.chat.completions.create({
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
    model: "gpt-4o",
  });
  node.summary = completion.choices[0].message.content;
  return completion.choices[0].message.content;
}
function getParentFolder(node: wikiNode): string {
  const nodePath = node.id;
  const until = nodePath.lastIndexOf("\\");
  const parentFolder = nodePath.slice(0, until);
  //console.log(parentFolder);
  return parentFolder;
}
async function createFolderSummary(
  folderPath: string,
  combinedSummary: string,
  generalSummary: string
): Promise<string> {
  contents += `This is the collection of summaries of the files inside the folder ${folderPath}:\n\n${combinedSummary}\n\n`;
  const promptSystem1 =
    "You are wikiGPT. You will provide a wikipedia style info page documentation for the contents of a folder. Given the collection of documentations (in markdown format) of all files of a folder, you will generate a documentation of the folder taking into account that the code of a folder is made of code of files inside that folder. Please be systematic and organized in your documentation. The documentation of that folder should be in Markdown format and be between 300-400 words. Use prose and should be precise but without loosing any important information. You will receive a documentation of the whole repository to give context to the folder you are documenting.";

  const promptUser1 = `I need you to document the content of a folder. The content of this folder I want you to document will contain a collection of the documentations of all files inside that folder. This folder is part of a repository, which is why as context I am going to give you a documentation of the whole repository where the folder is. The documentation of the whole repo is the following: \n\n ${generalSummary}\n\n. Don't add code to the documentation. The contents of the folder (or the collection of documentations of the files inside that folder) you need to document in Markdown Format is:  \n\n${combinedSummary}\n. The folder has as path ${folderPath}. Keep in mind that a code from a folder in this context is made up of one or more pieces of code of other files. Be organized and systematic, taking into account that this is for a wiki page of a repository. Start by identifying the folder and then continue with the documentation. Crucial: At every opportunity you will link to other relative paths of this website. Use new lines and paragraphs to separate different topics. Remember it has to be between 300 and 400 words. Be organized and systematic with the organization of the content. Separate what each file does in the folder (only if that file is important) in different paragraphs. Just be organized and systematic. The documentation should be in Markdown format. Keep in mind that the idea of this is to be a wiki page so the documentation should be like a wikipedia page in markdown format. Also, it is very important that you know that the documentation you give me for the folder should be in prose, in paragraphs 25-30 lines long.`;

  const completion = await client.chat.completions.create({
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
    model: "gpt-4o",
  });

  return completion.choices[0].message.content;
}

async function processAllFolders(generalSummary: string): Promise<void> {
  const folderPaths = Object.keys(folderContents).sort(
    (a, b) => b.length - a.length
  );

  for (const folderPath of folderPaths) {
    const folderNodes = folderContents[folderPath];
    const summaries = folderNodes
      .map((node) => node.summary)
      .filter((summary) => summary !== undefined);
    const subfolderSummaries = Object.keys(folderContents)
      .filter(
        (subfolder) =>
          subfolder.startsWith(folderPath + "\\") && subfolder !== folderPath
      )
      .map((subfolder) =>
        folderContents[subfolder]
          .map((node) => node.summary)
          .filter((summary) => summary !== undefined)
          .join("\n")
      );

    const combinedSummary = [...summaries, ...subfolderSummaries].join("\n");

    const folderSummary = await createFolderSummary(
      folderPath,
      combinedSummary,
      generalSummary
    );
    let parentFolder = path.dirname(folderPath);
    if (folderPath === codebasePath) {
      parentFolder = "root";
    }
    if (!folderContents[parentFolder]) {
      folderContents[parentFolder] = [];
    }

    folderContents[parentFolder].push({
      id: folderPath,
      label: path.basename(folderPath),
      type: "folder",
      totalTokens: combinedSummary.length,
      inDegree: 0,
      outDegree: 0,
      code: "",
      summary: folderSummary,
    });
  }
  contents +=
    "------------------------------------------------------------------------------------------------------------\n\n";
}

async function getSummaryOfAllRepoForContext(
  nodes: wikiNode[]
): Promise<string> {
  //need the number of tokens
  await Promise.all(
    nodes.map(async (node) => {
      // Create wiki for individual files
      if (node.type === "file") {
        allCode += `\n\nThis file has as label (path): ${node.label} and the code in the file with that label is:
        
        ${node.code}\n\n`;
      }
    })
  );

  //console.log("ALLCODE: ", allCode);

  const repoSummary = await createRepoSummary(allCode);
  return repoSummary;
}

async function createRepoSummary(allCode: string): Promise<string> {
  const promptSystem1 =
    "You are wikiGPT. You will provide a wikipedia style markdown documentation for the contents of a repository. Given the code of a whole repository, you will generate a documentation and description of the whole code of the repo. Take into account that the whole code of a repository is made of code of files inside folders which is why I am going to give the whole code of the repo but the code will be separated by what the path (label) of the code file where you can find the code. Please be systematic and organized in your description and documentation and remember to give a markdown document.";

  const promptUser1 = `I need you to document the following content (code) of a repository (it is the whole code): ${allCode}. Keep in mind that a code from a repo is the collection code from files that are in that repo. Be organized and systematic, taking into account that this is for a wiki page of a repository. Don't add code to the documentation. Start by identifying the folder and then continue by documenting it. Crucial: At every opportunity you will link to other relative paths of this website. Use new lines and paragraphs to separate different topics. Be organized and systematic with the organization of the content. Separate what each file does in the folder (only if that file is important) in different paragraphs. Just be organized and systematic. Also, the combined code from all files inside the repo will be given as the file path (label) and then the code of that file. The documentation should be in Markdown format and cohesive, organized and structured. Has to be precise but without loosing important information. Use prose (except when showing folder structure). The summary should be between 350 and 400 words. There should be 6-10 lines of an overview. In the overview talk  about the objective of the project (repo) and what problem does it solve and with what does it solve it. Give a bit (just a bit) of details on the purpose and functionality. Then comment on the most important parts of the repo (this should be 6-9 lines). Then comment on each of the important parts (2-6 lines each) and then finally comment on the Key algorithms and technologies the repository relies on (6 - 10 lines).`;
  contents += `This is the collection of code of the whole repository which will be the input to try to summarize the repo as a whole at first: \n\n${allCode}\n\n`;
  contents +=
    "------------------------------------------------------------------------------------------------------------\n\n";
  const completion = await client.chat.completions.create({
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
    model: "gpt-4o",
  });

  return completion.choices[0].message.content;
}

async function buildFinalMarkdown(generalSummary: string): Promise<string> {
  const nodes: wikiNode[] = await readNodes("./folderContents.json");

  let finalMarkdown = ` The following is the general documentation of the whole repository: \n\n ${generalSummary}\n\n`;
  const keys = Object.keys(folderContents);
  const reversedKeys = keys.reverse(); // Reverse the array of keys
  for (const key of reversedKeys) {
    if (key === "root") {
      continue; // Skip the current iteration if key is "root"
    }
    const nodesInsideKey = folderContents[key];
    for (const node of nodesInsideKey) {
      finalMarkdown += node.summary;
    }
  }
  //console.log(finalMarkdown);
  return finalMarkdown;
}

async function buildWiki(finalMarkdown: string): Promise<string> {
  const promptSystem1 =
    "You are wikiGPT. You will provide a wikipedia style for the documentation of a repository. Given the documentation of a whole repository, you will generate a wiki page. Take into account that the whole documentation of a repository is made of the summary of files inside folders. Please be systematic and organized in your documentation and remember to give a markdown document and in prose";

  const promptUser1 = `I need you to create a wikipedia page in markdown format given the documentation of all of a repository and it's components (documentation of the folders and files). Use prose like in a wikipedia page and remember it has to be in markdown format. Don't add code to the documentation. The documentation of the whole repository that you need to convert into a wiki page is the following: \n\n${finalMarkdown} `;
  contents += `This is the final markdown of the whole repository which will be used as input to convert it to a wiki: \n\n${finalMarkdown}\n\n`;
  contents +=
    "------------------------------------------------------------------------------------------------------------\n\n";
  const completion = await client.chat.completions.create({
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
    model: "gpt-4o",
  });

  return completion.choices[0].message.content;
}

async function improveWiki(wiki: string) {
  const promptSystem1 =
    "You are wikiGPT. Imagine that you are a developer who is an expert in code documentation. You have been given the wiki for a project (whole repository). Based on your experience, use your expertise to improve the delivered wiki`s content. You will receive a documentation of the whole repository and its components (documentation of the folders and files) in markdown format. You will have to improve the content of the wiki page. The new documentation should be in Markdown format.";

  const promptUser1 = `I need you to improve the wiki page that I will give you. The wiki page I will give you corresponds to the documentation of a whole repository as a wikipedia page in markdown format. The improvements I want are the following:\n\n 1. Create an index of the documentation. \n\n 2. Clearer sections: Divide documentation into clearer and more concise sections \n\n 3. Include References and links: Include links to additional resources, such as documentation of the libraries used and relevant articles.\n\n 4. Overview a bit too general. Talk about what Wikipedia is about generic code. You should explain what the code solves.\n\n 5. Use paragraphs, no bullet points, just like in a wikipedia page. Concise paragraphs without loosing important information. \n\n The wiki page for the whole repo that I need you to improve is the following: \n\n${wiki} `;
  contents += `This is the wiki page of the whole repository which will be used as input to improve it: \n\n${wiki}\n\n`;
  contents +=
    "------------------------------------------------------------------------------------------------------------\n\n";
  const completion = await client.chat.completions.create({
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
    model: "gpt-4o",
  });

  return completion.choices[0].message.content;
}
