import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { createGraph } from "./routes/create_graph";
import { createGraphTest } from "./routes/create_graph-test";
import { graphs } from "./routes/graphs";
import { Codebase } from "./model/codebase";
import { writeFile } from "node:fs/promises";
// const
const app = new Hono();
var fs = require("fs");
app.use("*", prettyJSON());
app.use("/v1/*", cors());

app.get("/", async (c) => {
  console.time("codebase");
  // const codebasePath = path.join(__dirname, '../../../codebase-index')
  const codebasePath =
    "C:/Users/gmasc/OneDrive/Documentos/CodeGPT/Graphs/codebase-index-ts/src/utils";
  const codebase = new Codebase(codebasePath); //
  console.log(`Parsing ${codebasePath}`);
  const fileNodesMap = await codebase.parseFolder();
  console.log(`Found ${Object.keys(codebase.nodesMap).length} nodes`);
  console.log("Getting Calls");
  codebase.getCalls(fileNodesMap, false);
  console.timeEnd("codebase");
  const codebaseSimplified = codebase.simplify([
    "id",
    "label",
    "type",
    "parent",
    "totalTokens",
    "inDegree",
    "outDegree",
    "code",
    "parent",
  ]); //.filter(c => !['file'].includes(c.type))
  const links = codebase.getLinks();

  // console.log(codebaseSimplified)
  await Promise.all([
    writeFile("nodes.json", JSON.stringify(codebaseSimplified, null, 2)),
    writeFile("links.json", JSON.stringify(links, null, 2)),
  ]);
  return c.text(JSON.stringify(codebaseSimplified, null, 2));

  // return c.text(JSON.stringify(codebase.getLinks(), null, 2))
});

app.route("/v1/repo", createGraph);
app.route("/v1/graphs", graphs);
app.route("v1/repo-test", createGraphTest);

const port = 8001;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
