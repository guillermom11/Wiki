// const Ruby = require("tree-sitter-ruby");
// const Rust = require("tree-sitter-rust");
const JavaScript = require('tree-sitter-javascript')
const Python = require('tree-sitter-python')
const TypeScript = require('tree-sitter-typescript').typescript
const TSX = require('tree-sitter-typescript').tsx
const Java = require('tree-sitter-java')
const C = require('tree-sitter-c')

export type AllowedTypes =
  | 'function'
  | 'class'
  | 'interface'
  | 'method'
  | 'enum'
  | 'struct'
  | 'namespace'
  | 'mod'
  | 'export'
  | 'type'
  | 'assignment'
  | 'file'
  | 'union'

export const AllowedTypesArray: AllowedTypes[] = [
  'function',
  'class',
  'interface',
  'method',
  'enum',
  'struct',
  'namespace',
  'mod',
  'export',
  'type',
  'assignment',
  'file',
  'union'
]

export const excludedFolders = [
  '.git',
  '.vscode',
  'venv',
  'node_modules',
  'dist',
  '__pycache__',
  'tests',
  'build',
  '_static',
  'jest',
  '__tests__'
]
export const excludedExtensions = [
  'min.js',
  'min.css',
  'min.css.map',
  'min.js.map',
  'd.ts',
  '.config.js',
  '.h'
]

export const languages = {
  JavaScript,
  Python,
  TypeScript,
  TSX,
  Java,
  C
}

export const languageExtensionMap: Record<string, string> = {
  py: 'python',
  c: 'c',
  h: 'c', // may be we don't require the header file
  // 'ipynb': 'python',
  js: 'typescript',
  mjs: 'typescript',
  jsx: 'typescript',
  ts: 'typescript',
  tsx: 'tsx',
  java: 'java'
}

export const newClassMethodsMap: Record<string, string> = {
  python: '__init__',
  javascript: 'constructor',
  typescript: 'constructor',
  tsx: 'constructor',
  java: '', // java constructor has the same name as the class
  rust: 'new'
}

export const itselfClassMap: Record<string, string> = {
  python: 'self',
  javascript: 'this',
  typescript: 'this',
  tsx: 'this',
  java: 'this'
}

export const indexSuffixesMap: Record<string, string> = {
  python: '/__init__',
  javascript: '/index',
  typescript: '/index',
  tsx: '/index',
  java: '' // java has no index
}

export const treeSitterCommentTypes = ['comment', 'line_comment', 'block_comment']
