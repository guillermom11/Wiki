// const C = require("tree-sitter-c");
// const Java = require("tree-sitter-java");
// const Ruby = require("tree-sitter-ruby");
// const Rust = require("tree-sitter-rust");
const JavaScript = require("tree-sitter-javascript");
const Python = require("tree-sitter-python");
const TypeScript  = require('tree-sitter-typescript').typescript;
const TSX = require("tree-sitter-typescript").tsx;

export type AllowedTypes = 'function' | 'class' | 'interface' | 'method' | 'enum' | 'struct' | 'namespace' | 'mod' | 'export' | 'type' | 'assignment' | 'file' | 'folder'; 

export const excludedFolders = ['.git', '.vscode', 'venv', 'node_modules', 'dist', '__pycache__']
export const excludedExtensions = ['min.js', 'min.css', 'min.css.map', 'min.js.map', 'd.ts']

export const languages = {
    JavaScript,
    Python,
    TypeScript,
    TSX,
}


export const languageExtensionMap: Record<string, string> = {
  'py': 'python',
  'ipynb': 'python',
  'js': 'javascript',
  'ts': 'typescript',
  'tsx': 'tsx',
}

export const newClassMethodsMap: Record<string, string> = {
    'python': '__init__',
    'javascript': 'constructor',
    'typescript': 'constructor',
    'tsx': 'constructor',
    'rust': 'new'
}

export const itselfClassMap: Record<string, string> = {
    'python': 'self',
    'javascript': 'this',
    'typescript': 'this',
    'tsx': 'this',
    'rust': 'self'
}

export const indexSuffixesMap: Record<string, string> = {
    'python': '/__init__',
    'javascript': '/index',
    'typescript': '/index',
    'tsx': '/index'
}

export const treeSitterCommentTypes = ['comment', 'line_comment', 'block_comment']