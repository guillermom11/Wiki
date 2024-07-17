// const Ruby = require("tree-sitter-ruby");
// const Rust = require("tree-sitter-rust");
const JavaScript = require('tree-sitter-javascript')
const Python = require('tree-sitter-python')
const TypeScript = require('tree-sitter-typescript').typescript
const TSX = require('tree-sitter-typescript').tsx
const Java = require('tree-sitter-java')
const C = require('tree-sitter-c')
const PHP = require('tree-sitter-php').php

// namespace, mod and header are equivalent:
// - a namespace define a scope that contains a set of declarations
// - a mod defined a module, which contains a set of declarations
// - a header is a file that contains a set of declarations
export type AllowedTypes =
  | 'function'
  | 'class'
  | 'interface'
  | 'method'
  | 'enum'
  | 'struct'
  | 'export'
  | 'type'
  | 'assignment'
  | 'file'
  | 'union'
  | 'namespace'
  | 'mod'
  | 'header'
  | 'package'

export const AllowedTypesArray: AllowedTypes[] = [
  'function',
  'class',
  'interface',
  'method',
  'enum',
  'struct',
  'export',
  'type',
  'assignment',
  'file',
  'union',
  'namespace',
  'mod',
  'header',
  'package'
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
  '__tests__',
  'tmp'
]
export const excludedExtensions = [
  'min.js',
  'min.css',
  'min.css.map',
  'min.js.map',
  'd.ts',
  '.config.js'
]

export const languages = {
  JavaScript,
  Python,
  TypeScript,
  TSX,
  Java,
  C,
  PHP
}

export const languageExtensionMap: Record<string, string> = {
  py: 'python',
  c: 'c',
  h: 'c',
  // 'ipynb': 'python',
  js: 'typescript',
  mjs: 'typescript',
  jsx: 'typescript',
  ts: 'typescript',
  tsx: 'tsx',
  java: 'java',
  php: 'php'
}

export const newClassMethodsMap: Record<string, string> = {
  python: '__init__',
  javascript: 'constructor',
  typescript: 'constructor',
  tsx: 'constructor',
  java: '', // java constructor has the same name as the class
  rust: 'new',
  php: '__construct'
}

export const itselfClassMap: Record<string, string> = {
  python: 'self',
  javascript: 'this',
  typescript: 'this',
  tsx: 'this',
  java: 'this',
  rust: 'self',
  php: '$this'
}

export const indexSuffixesMap: Record<string, string> = {
  python: '/__init__',
  javascript: '/index',
  typescript: '/index',
  tsx: '/index',
  java: '', // java has no index
  rust: '', // rust has no index
  php: '' // php has no index
}

export const treeSitterCommentTypes = ['comment', 'line_comment', 'block_comment']
