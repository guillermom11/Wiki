import { Codebase } from "../model/codebase";

import { GraphLink, GraphNode } from "../utils/db";
import { generateDocumentation } from "./wiki";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import { getImportantNodes } from "./importantNodes";

(async () => {
  const repoName = "codebase-index-ts";
  const codebasePath =
    "C:\\Users\\gmasc\\OneDrive\\Documentos\\CodeGPT\\Graphs\\codebase-index-ts";
  const model = "gpt-4o-mini";
  const modelNoDots = model.replace(/\./g, "-");

  let graphNodes: GraphNode[];
  let graphLinks: GraphLink[];

  try {
    const nodesFile = await fs.readFile(
      `./tmp/graphNodes-${repoName}-${modelNoDots}.json`,
      "utf-8"
    );
    graphNodes = JSON.parse(nodesFile);

    const linksFile = await fs.readFile(
      `./tmp/graphLinks-${repoName}-${modelNoDots}.json`,
      "utf-8"
    );
    graphLinks = JSON.parse(linksFile);

    const documentedFolders = await generateDocumentation(
      graphNodes,
      graphLinks,
      repoName,
      model
    );

    fs.writeFile(
      `./tmp/graphNodes-${repoName}-${modelNoDots}.json`,
      JSON.stringify(graphNodes, null, 2)
    );
    fs.writeFile(
      `./tmp/graphLinks-${repoName}-${modelNoDots}.json`,
      JSON.stringify(graphLinks, null, 2)
    );
    fs.writeFile(
      `./tmp/graphFolders-${repoName}-${modelNoDots}.json`,
      JSON.stringify(documentedFolders, null, 2)
    );
  } catch {
    const codebase = new Codebase(codebasePath);
    console.log("Parsing folders ..");
    const fileNodesMap = await codebase.parseFolder();
    console.log("Getting calls ..");
    codebase.getCalls(fileNodesMap, false);
    const nodes = codebase.simplify();

    // create a uuid for each node
    const nodeDBIds: { [key: string]: string } = {};
    for (const node of nodes) {
      nodeDBIds[node.id] = uuidv4();
    }

    graphNodes = nodes.map((n) => {
      return {
        id: nodeDBIds[n.id],
        fullName: n.id,
        type: n.type,
        language: n.language,
        documentation: n.documentation,
        code: n.code,
        codeNoBody: n.codeNoBody,
        totalTokens: 0,
        inDegree: n.inDegree,
        outDegree: n.outDegree,
        label: n.label,
        originFile: n.originFile,
        generatedDocumentation: "",
        importStatements: n.importStatements.join("\n"),
      };
    });

    const links = codebase.getLinks();

    graphLinks = links.map((l) => {
      return {
        id: uuidv4(),
        source: nodeDBIds[l.source],
        target: nodeDBIds[l.target],
        label: l.label,
        line: l.line,
      };
    });

    const tmpFolderPath = `${process.cwd()}/tmp`;
    await fs.mkdir(tmpFolderPath, { recursive: true });

    const documentedFolders = await generateDocumentation(
      graphNodes,
      graphLinks,
      repoName,
      model
    );

    fs.writeFile(
      `./tmp/graphNodes-${repoName}-${modelNoDots}.json`,
      JSON.stringify(graphNodes, null, 2)
    );
    fs.writeFile(
      `./tmp/graphLinks-${repoName}-${modelNoDots}.json`,
      JSON.stringify(graphLinks, null, 2)
    );
    fs.writeFile(
      `./tmp/graphFolders-${repoName}-${modelNoDots}.json`,
      JSON.stringify(documentedFolders, null, 2)
    );
  }
})();
